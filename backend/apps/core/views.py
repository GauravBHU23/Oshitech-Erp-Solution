import hashlib
import hmac
import logging
import secrets
import uuid

from django.conf import settings
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.mail import EmailMessage
from django.core.validators import validate_email
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from django.shortcuts import get_object_or_404

from apps.academics.models import AcademicYear, ClassRoom, Course
from apps.accounts.models import RegistrationRequest, User
from apps.exams.models import AdmitCard, Exam, Result
from apps.schools.models import School
from apps.students.models import Student
from apps.teachers.models import Teacher

from .audit import get_client_ip
from .pagination import StandardPagination
from .models import AuditLog, SiteVisitor, SupportMessage, SupportRequest
from .permissions import AdminEmailPermission, RoleAccess
from .roles import ADMIN_ONLY, Role
from .throttles import AtomicAnonRateThrottle, AtomicScopedRateThrottle
from .serializers_audit import AuditLogSerializer
from .serializers_support import (
    LiveChatStartSerializer,
    SupportMessageCreateSerializer,
    SupportMessageSerializer,
    SupportRequestCreateSerializer,
    SupportRequestSerializer,
    SupportRequestStatusSerializer,
)
from .viewsets import TenantModelViewSet

log = logging.getLogger(__name__)


class SiteVisitorView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [AtomicAnonRateThrottle]

    def post(self, request):
        key = serializers.UUIDField().run_validation(request.data.get("visitor_key"))
        visitor_hash = hashlib.sha256(key.bytes).hexdigest()
        SiteVisitor.objects.get_or_create(visitor_hash=visitor_hash)
        return Response({"total_visitors": SiteVisitor.objects.count()})


class PublicSiteOverviewView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [AtomicAnonRateThrottle]

    def get(self, request):
        from apps.stre.models import StreRegistration

        return Response({
            "schools": School.objects.filter(is_active=True).count(),
            "students": Student.objects.filter(
                is_active=True, user__is_active=True, school__is_active=True
            ).count(),
            "teachers": Teacher.objects.filter(
                is_active=True, user__is_active=True, school__is_active=True
            ).count(),
            "stre_registrations": StreRegistration.objects.exclude(
                status=StreRegistration.Status.CANCELLED
            ).count(),
        })


class SupportRequestRateThrottle(AtomicScopedRateThrottle):
    scope = "support"


class LiveChatMessageRateThrottle(AtomicScopedRateThrottle):
    scope = "live_chat_message"


class AdminEmailThrottle(AtomicScopedRateThrottle):
    scope = "admin_email"


class AdminEmailView(APIView):
    """Send one plain-text email within the sender's permitted scope."""

    throttle_scope = "admin_email"
    permission_classes = [AdminEmailPermission]
    throttle_classes = [AdminEmailThrottle]

    def post(self, request):
        recipient_email = str(request.data.get("recipient_email", "")).strip().lower()
        subject = str(request.data.get("subject", "")).strip()
        body = str(request.data.get("message", "")).strip()
        try:
            validate_email(recipient_email)
        except DjangoValidationError as exc:
            raise ValidationError({"recipient_email": "Enter a valid recipient email."}) from exc
        if not subject or len(subject) > 200 or "\r" in subject or "\n" in subject:
            raise ValidationError({"subject": "Enter a subject of up to 200 characters."})
        if len(body) < 3 or len(body) > 5000:
            raise ValidationError({"message": "Write a message between 3 and 5000 characters."})

        if request.user.role == Role.SCHOOL_ADMIN:
            allowed_roles = [Role.SCHOOL_ADMIN, Role.TEACHER, Role.STUDENT, Role.EXAM_CONTROLLER]
            belongs_to_school = bool(request.user.school_id) and User.objects.filter(
                email__iexact=recipient_email,
                school_id=request.user.school_id,
                is_active=True,
                role__in=allowed_roles,
            ).exists()
            if not belongs_to_school:
                raise ValidationError({"recipient_email": "No active account found in your school for this address."})

        sender_name = request.user.get_full_name() or request.user.email
        sender_role = request.user.get_role_display() if hasattr(request.user, "get_role_display") else "Administrator"
        email_subject = f"Oshitech ERP | {subject}"
        email_body = (
            f"Message from: {sender_name} ({request.user.email})\n"
            f"Portal: {sender_role}\n"
            f"Recipient account: {recipient_email}\n"
            "Action: Administrative message sent from Oshitech ERP\n\n"
            f"{body}\n\n— Oshitech Education ERP"
        )
        email = EmailMessage(email_subject, email_body, settings.DEFAULT_FROM_EMAIL, [recipient_email])
        try:
            sent = email.send(fail_silently=False)
        except Exception:  # noqa: BLE001
            log.exception("Admin email delivery failed")
            raise ValidationError({"detail": "Email could not be sent. Check the SMTP settings and try again."})
        if not sent:
            raise ValidationError({"detail": "Email could not be sent. Check the SMTP settings and try again."})

        AuditLog.objects.create(
            user=request.user,
            school_id=request.user.school_id,
            action="admin_email_sent",
            model="Email",
            object_id=uuid.uuid4().hex,
            changes={"to": recipient_email, "subject": subject},
            ip_address=get_client_ip(request),
        )
        return Response({"detail": "Email sent successfully."})


class SupportRequestCollectionView(APIView):
    throttle_scope = "support"

    def get_permissions(self):
        if self.request.method == "POST":
            return [AllowAny()]
        return [IsAuthenticated(), RoleAccess()]

    def get_throttles(self):
        if self.request.method == "POST":
            return [SupportRequestRateThrottle()]
        return super().get_throttles()

    def get_allowed_roles(self, request):
        return ADMIN_ONLY

    def get(self, request):
        requests = SupportRequest.objects.select_related(
            "school", "reporter"
        ).order_by("-updated_at")
        if request.user.role != Role.SUPER_ADMIN:
            requests = requests.filter(school_id=request.user.school_id)
        paginator = StandardPagination()
        page = paginator.paginate_queryset(requests, request, view=self)
        response = paginator.get_paginated_response(
            SupportRequestSerializer(page, many=True).data
        )
        response.data["open_count"] = requests.filter(
            status=SupportRequest.Status.OPEN
        ).count()
        return response

    def post(self, request):
        if not request.user.is_authenticated:
            from apps.stre import security as captcha_security

            captcha_security.check_captcha_and_turnstile(
                request.data.get("captcha_id"), request.data.get("captcha"),
                request.data.get("turnstile_token"), request.META.get("REMOTE_ADDR"),
            )
        serializer = SupportRequestCreateSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        ticket = serializer.save()
        return Response(
            {"id": str(ticket.pk), "status": ticket.status},
            status=201,
        )


def _support_thread(ticket):
    messages = [{
        "id": f"initial-{ticket.pk}",
        "sender_type": SupportMessage.SenderType.VISITOR,
        "sender_name": ticket.name or "Visitor",
        "body": ticket.message,
        "created_at": ticket.created_at,
    }]
    messages.extend(SupportMessageSerializer(ticket.messages.all(), many=True).data)
    return messages


class WebsiteLiveChatStartView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [SupportRequestRateThrottle]

    def post(self, request):
        from apps.stre import security as captcha_security

        captcha_security.check_captcha_and_turnstile(
            request.data.get("captcha_id"),
            request.data.get("captcha"),
            request.data.get("turnstile_token"),
            request.META.get("REMOTE_ADDR"),
        )
        serializer = LiveChatStartSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        details = serializer.validated_data
        access_token = secrets.token_urlsafe(32)
        ticket = SupportRequest.objects.create(
            name=details["name"],
            email=details["email"],
            phone=details.get("phone", ""),
            role="guest",
            category=SupportRequest.Category.CONTACT,
            subject="Website live chat",
            message=details["message"],
            chat_token_hash=hashlib.sha256(access_token.encode("utf-8")).hexdigest(),
        )
        return Response(
            {
                "id": str(ticket.pk),
                "access_token": access_token,
                "messages": _support_thread(ticket),
            },
            status=201,
        )


class WebsiteLiveChatMessagesView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get_throttles(self):
        if self.request.method == "POST":
            return [LiveChatMessageRateThrottle()]
        return super().get_throttles()

    def get_conversation(self, request, request_id):
        ticket = get_object_or_404(SupportRequest, pk=request_id)
        access_token = request.META.get("HTTP_X_CHAT_TOKEN", "")
        token_hash = hashlib.sha256(access_token.encode("utf-8")).hexdigest()
        if not ticket.chat_token_hash or not hmac.compare_digest(
            ticket.chat_token_hash, token_hash
        ):
            raise PermissionDenied("A valid chat access token is required.")
        return ticket

    def get(self, request, request_id):
        ticket = self.get_conversation(request, request_id)
        return Response(_support_thread(ticket))

    def post(self, request, request_id):
        ticket = self.get_conversation(request, request_id)
        serializer = SupportMessageCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        message = SupportMessage.objects.create(
            conversation=ticket,
            sender_type=SupportMessage.SenderType.VISITOR,
            sender_name=ticket.name or "Visitor",
            body=serializer.validated_data["body"],
        )
        ticket.status = SupportRequest.Status.OPEN
        ticket.save(update_fields=["status", "updated_at"])
        return Response(SupportMessageSerializer(message).data, status=201)


class SupportRequestMessagesView(APIView):
    permission_classes = [IsAuthenticated, RoleAccess]

    def get_allowed_roles(self, request):
        return ADMIN_ONLY

    def get_conversation(self, request, request_id):
        queryset = SupportRequest.objects.all()
        if request.user.role != Role.SUPER_ADMIN:
            queryset = queryset.filter(school_id=request.user.school_id)
        return get_object_or_404(queryset, pk=request_id)

    def get(self, request, request_id):
        ticket = self.get_conversation(request, request_id)
        return Response(_support_thread(ticket))

    def post(self, request, request_id):
        ticket = self.get_conversation(request, request_id)
        serializer = SupportMessageCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        message = SupportMessage.objects.create(
            conversation=ticket,
            sender_type=SupportMessage.SenderType.STAFF,
            sender_name="Oshitech Support",
            sender=request.user,
            body=serializer.validated_data["body"],
        )
        ticket.status = SupportRequest.Status.IN_PROGRESS
        ticket.save(update_fields=["status", "updated_at"])
        return Response(SupportMessageSerializer(message).data, status=201)


class SupportRequestDetailView(APIView):
    permission_classes = [IsAuthenticated, RoleAccess]

    def get_allowed_roles(self, request):
        return ADMIN_ONLY

    def patch(self, request, request_id):
        queryset = SupportRequest.objects.all()
        if request.user.role != Role.SUPER_ADMIN:
            queryset = queryset.filter(school_id=request.user.school_id)
        ticket = get_object_or_404(queryset, pk=request_id)
        serializer = SupportRequestStatusSerializer(
            ticket, data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(SupportRequestSerializer(ticket).data)


class AdminOverviewView(APIView):
    permission_classes = [IsAuthenticated, RoleAccess]

    def get_allowed_roles(self, request):
        return ADMIN_ONLY

    def get(self, request):
        school_id = request.user.school_id
        if request.user.role == Role.SUPER_ADMIN:
            school_id = request.query_params.get("school_id")

        students = Student.objects.all()
        teachers = Teacher.objects.all()
        courses = Course.objects.all()
        classrooms = ClassRoom.objects.all()
        exams = Exam.objects.all()
        admit_cards = AdmitCard.objects.all()
        results = Result.objects.all()
        registrations = RegistrationRequest.objects.filter(status=RegistrationRequest.Status.PENDING)
        school_count = 0
        if school_id:
            students = students.filter(school_id=school_id)
            teachers = teachers.filter(school_id=school_id)
            courses = courses.filter(school_id=school_id)
            classrooms = classrooms.filter(school_id=school_id)
            exams = exams.filter(school_id=school_id)
            admit_cards = admit_cards.filter(school_id=school_id)
            results = results.filter(school_id=school_id)
            registrations = registrations.filter(school_id=school_id)
            school_count = 1
        else:
            from apps.schools.models import School
            school_count = School.objects.filter(is_active=True).count()

        return Response({
            "school_count": school_count,
            "students": {
                "total": students.count(),
                "active": students.filter(is_active=True).count(),
                "inactive": students.filter(is_active=False).count(),
                "boys": students.filter(gender=Student.Gender.MALE).count(),
                "girls": students.filter(gender=Student.Gender.FEMALE).count(),
                "other": students.filter(gender=Student.Gender.OTHER).count(),
                "unspecified": students.filter(gender="").count(),
            },
            "teachers": {
                "total": teachers.count(),
                "active": teachers.filter(is_active=True).count(),
                "inactive": teachers.filter(is_active=False).count(),
            },
            "pending_registrations": {
                "students": registrations.filter(role="student").count(),
                "teachers": registrations.filter(role="teacher").count(),
                "total": registrations.count(),
            },
            "academics": {
                "academic_years": AcademicYear.objects.filter(school_id=school_id).count() if school_id else AcademicYear.objects.count(),
                "courses": courses.count(),
                "classrooms": classrooms.count(),
                "exams": exams.count(),
                "admit_cards": admit_cards.filter(is_revoked=False).count(),
                "published_results": results.filter(exam__results_published=True).count(),
            },
        })


class AuditLogViewSet(TenantModelViewSet):
    """Read-only audit trail (kisne kab kya badla)."""

    queryset = AuditLog.objects.select_related("user", "school")
    serializer_class = AuditLogSerializer
    read_roles = ADMIN_ONLY
    http_method_names = ["get", "head", "options"]
    filterset_fields = ["action", "model", "object_id", "school"]
    search_fields = ["user__email", "user__first_name", "user__last_name", "model", "action", "ip_address"]

    def get_queryset(self):
        from django.utils.dateparse import parse_date

        qs = super().get_queryset()
        start = parse_date(self.request.query_params.get("from", "") or "")
        end = parse_date(self.request.query_params.get("to", "") or "")
        if start:
            qs = qs.filter(created_at__date__gte=start)
        if end:
            qs = qs.filter(created_at__date__lte=end)
        return qs
