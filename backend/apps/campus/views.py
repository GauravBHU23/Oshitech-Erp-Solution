from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Q, Sum
from django.utils import timezone
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from apps.accounts.authentication import OptionalCookieJWTAuthentication

from apps.academics.models import ClassRoom
from apps.core.audit import log_action
from apps.core.roles import ADMIN_ONLY, ALL_SCHOOL_ROLES, Role
from apps.core.viewsets import TenantModelViewSet
from apps.students.models import Student

from .models import FeeInvoice, FeePayment, FeeStructure, Homework, LeaveRequest, Notice, TimetableEntry
from .serializers import (
    FeeInvoiceSerializer,
    FeePaymentSerializer,
    FeeStructureSerializer,
    HomeworkSerializer,
    LeaveRequestSerializer,
    NoticeSerializer,
    TimetableEntrySerializer,
)

ADMIN_STUDENT = [Role.SCHOOL_ADMIN, Role.STUDENT]
TEACHING = [Role.SCHOOL_ADMIN, Role.TEACHER]
ADMINS = (Role.SUPER_ADMIN, Role.SCHOOL_ADMIN)


def teacher_classrooms(user):
    return ClassRoom.objects.filter(Q(class_teacher__user=user) | Q(assignments__teacher__user=user)).distinct()


def student_of(user):
    return Student.objects.filter(user=user).select_related("classroom").first()


class NoticeViewSet(TenantModelViewSet):
    queryset = Notice.objects.select_related("published_by")
    serializer_class = NoticeSerializer
    read_roles = ALL_SCHOOL_ROLES
    write_roles = [Role.SCHOOL_ADMIN, Role.EXAM_CONTROLLER]
    filterset_fields = ["category", "audience", "is_pinned"]
    search_fields = ["title", "body"]

    def get_create_extra(self):
        return {"published_by": self.request.user}

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if user.role in ADMINS:
            return qs
        today = timezone.localdate()
        qs = qs.filter(publish_on__lte=today).filter(Q(expires_on__isnull=True) | Q(expires_on__gte=today))
        if user.role == Role.STUDENT:
            student = student_of(user)
            level = student.class_level if student else ""
            return qs.filter(audience__in=["all", "students"]).filter(Q(class_level="") | Q(class_level=level))
        if user.role == Role.TEACHER:
            return qs.filter(audience__in=["all", "teachers", "staff"])
        return qs.filter(audience__in=["all", "staff"])

    def perform_update(self, serializer):
        user = self.request.user
        if user.role == Role.EXAM_CONTROLLER and serializer.instance.published_by_id != user.pk:
            raise PermissionDenied("You can only edit notices you published.")
        super().perform_update(serializer)

    def perform_destroy(self, instance):
        user = self.request.user
        if user.role == Role.EXAM_CONTROLLER and instance.published_by_id != user.pk:
            raise PermissionDenied("You can only delete notices you published.")
        super().perform_destroy(instance)


class TimetableViewSet(TenantModelViewSet):
    queryset = TimetableEntry.objects.select_related("classroom__course", "classroom__academic_year", "subject", "teacher__user")
    serializer_class = TimetableEntrySerializer
    read_roles = ALL_SCHOOL_ROLES
    write_roles = ADMIN_ONLY
    filterset_fields = ["classroom", "teacher", "day"]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if user.role == Role.STUDENT:
            student = student_of(user)
            return qs.filter(classroom_id=student.classroom_id) if student and student.classroom_id else qs.none()
        if user.role == Role.TEACHER:
            if self.request.query_params.get("mine"):
                return qs.filter(teacher__user=user)
            if self.request.query_params.get("classroom"):
                return qs.filter(classroom__in=teacher_classrooms(user))
            return qs.filter(Q(teacher__user=user) | Q(classroom__in=teacher_classrooms(user))).distinct()
        return qs


class HomeworkViewSet(TenantModelViewSet):
    queryset = Homework.objects.select_related("classroom__course", "classroom__academic_year", "subject", "assigned_by")
    serializer_class = HomeworkSerializer
    read_roles = [Role.SCHOOL_ADMIN, Role.TEACHER, Role.STUDENT]
    write_roles = TEACHING
    filterset_fields = ["classroom", "subject", "due_date"]
    search_fields = ["title", "description"]

    def get_create_extra(self):
        return {"assigned_by": self.request.user}

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if user.role == Role.STUDENT:
            student = student_of(user)
            return qs.filter(classroom_id=student.classroom_id) if student and student.classroom_id else qs.none()
        if user.role == Role.TEACHER:
            return qs.filter(classroom__in=teacher_classrooms(user))
        return qs

    def _own_check(self, instance):
        user = self.request.user
        if user.role == Role.TEACHER and instance.assigned_by_id != user.pk:
            raise PermissionDenied("You can only change homework you assigned.")

    def perform_update(self, serializer):
        self._own_check(serializer.instance)
        super().perform_update(serializer)

    def perform_destroy(self, instance):
        self._own_check(instance)
        super().perform_destroy(instance)


class LeaveRequestViewSet(TenantModelViewSet):
    queryset = LeaveRequest.objects.select_related("applicant", "student__classroom__course", "student__classroom__academic_year", "reviewed_by")
    serializer_class = LeaveRequestSerializer
    read_roles = ALL_SCHOOL_ROLES
    write_roles = [Role.TEACHER, Role.STUDENT, Role.EXAM_CONTROLLER, Role.SCHOOL_ADMIN]
    action_roles = {"approve": TEACHING, "reject": TEACHING}
    filterset_fields = ["status", "applicant_role"]

    def get_create_extra(self):
        user = self.request.user
        if user.role == Role.SUPER_ADMIN:
            raise PermissionDenied("Platform administrators do not apply for leave.")
        return {"applicant": user, "applicant_role": user.role, "student": student_of(user) if user.role == Role.STUDENT else None}

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if user.role in ADMINS:
            return qs
        if user.role == Role.TEACHER:
            return qs.filter(Q(applicant=user) | Q(student__classroom__class_teacher__user=user)).distinct()
        return qs.filter(applicant=user)

    def _editable(self, instance):
        if instance.applicant_id != self.request.user.pk:
            raise PermissionDenied("You can only change your own leave request.")
        if instance.status != LeaveRequest.Status.PENDING:
            raise ValidationError("A reviewed leave request cannot be changed.")

    def perform_update(self, serializer):
        self._editable(serializer.instance)
        super().perform_update(serializer)

    def perform_destroy(self, instance):
        self._editable(instance)
        super().perform_destroy(instance)

    def _review(self, request, status):
        leave = self.get_object()
        user = request.user
        if leave.applicant_id == user.pk:
            raise PermissionDenied("You cannot review your own leave request.")
        if user.role == Role.TEACHER and not (leave.student_id and leave.student.classroom and leave.student.classroom.class_teacher and leave.student.classroom.class_teacher.user_id == user.pk):
            raise PermissionDenied("Only the class teacher or an administrator can review this request.")
        if leave.status != LeaveRequest.Status.PENDING:
            raise ValidationError("This leave request has already been reviewed.")
        leave.status = status
        leave.reviewed_by = user
        leave.reviewed_at = timezone.now()
        leave.review_note = str(request.data.get("review_note", ""))[:300]
        leave.save(update_fields=["status", "reviewed_by", "reviewed_at", "review_note", "updated_at"])
        log_action(request, f"leave_{status}", leave)
        return Response(self.get_serializer(leave).data)

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        return self._review(request, LeaveRequest.Status.APPROVED)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        return self._review(request, LeaveRequest.Status.REJECTED)


class FeeStructureViewSet(TenantModelViewSet):
    queryset = FeeStructure.objects.select_related("academic_year")
    serializer_class = FeeStructureSerializer
    read_roles = ADMIN_ONLY
    write_roles = ADMIN_ONLY
    action_roles = {"generate_invoices": ADMIN_ONLY}
    filterset_fields = ["class_level", "academic_year", "is_active"]
    search_fields = ["name"]

    @action(detail=True, methods=["post"], url_path="generate-invoices")
    def generate_invoices(self, request, pk=None):
        structure = self.get_object()
        if not structure.is_active:
            raise ValidationError("Activate this fee before generating invoices.")
        students = Student.objects.filter(school=structure.school, is_active=True)
        if structure.class_level:
            students = students.filter(class_level=structure.class_level)
        created = 0
        with transaction.atomic():
            for student in students:
                _, new = FeeInvoice.objects.get_or_create(
                    student=student, fee_structure=structure,
                    defaults={"school": structure.school, "title": structure.name, "amount": structure.amount, "due_date": structure.due_date},
                )
                created += int(new)
        log_action(request, "fee_invoices_generated", structure, {"created": created})
        return Response({"created": created, "detail": f"{created} invoices created for {students.count()} students."})


class FeeInvoiceViewSet(TenantModelViewSet):
    queryset = FeeInvoice.objects.select_related("student__user").prefetch_related("payments")
    serializer_class = FeeInvoiceSerializer
    read_roles = ADMIN_STUDENT
    write_roles = ADMIN_ONLY
    action_roles = {"summary": ADMIN_STUDENT}
    filterset_fields = ["student", "fee_structure", "student__class_level"]
    search_fields = ["invoice_no", "title", "student__admission_no", "student__user__first_name", "student__user__last_name"]

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.user.role == Role.STUDENT:
            return qs.filter(student__user=self.request.user)
        status = self.request.query_params.get("status")
        if status in ("paid", "partial", "unpaid", "overdue"):
            ids = [inv.pk for inv in qs if inv.status == status]
            return qs.filter(pk__in=ids)
        return qs

    def perform_destroy(self, instance):
        if instance.payments.exists():
            raise ValidationError("This invoice has payments. Delete the payments first.")
        super().perform_destroy(instance)

    @action(detail=False, methods=["get"])
    def summary(self, request):
        invoices = list(self.get_queryset())
        total = sum((inv.total for inv in invoices), 0)
        paid = sum((inv.paid for inv in invoices), 0)
        return Response({
            "invoices": len(invoices),
            "total": total,
            "collected": paid,
            "due": total - paid,
            "overdue": sum(1 for inv in invoices if inv.status == "overdue"),
        })


class FeePaymentViewSet(TenantModelViewSet):
    queryset = FeePayment.objects.select_related("invoice__student__user", "received_by", "school")
    serializer_class = FeePaymentSerializer
    read_roles = ADMIN_STUDENT
    write_roles = ADMIN_ONLY
    action_roles = {"collection": ADMIN_ONLY}
    http_method_names = ["get", "post", "delete", "head", "options"]
    filterset_fields = ["invoice", "mode", "paid_on"]
    search_fields = ["receipt_no", "reference", "invoice__invoice_no", "invoice__student__admission_no", "invoice__student__user__first_name"]

    def get_create_extra(self):
        return {"received_by": self.request.user}

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.user.role == Role.STUDENT:
            return qs.filter(invoice__student__user=self.request.user)
        return qs

    @action(detail=False, methods=["get"], url_path="collection")
    def collection(self, request):
        qs = self.get_queryset()
        today = timezone.localdate()
        return Response({
            "today": qs.filter(paid_on=today).aggregate(t=Sum("amount"))["t"] or 0,
            "this_month": qs.filter(paid_on__year=today.year, paid_on__month=today.month).aggregate(t=Sum("amount"))["t"] or 0,
        })



class PublicNoticesView(APIView):
    """Website homepage ke liye: sirf woh notices jinhe admin ne 'public' kiya hai + STRE ki khabar."""

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [AnonRateThrottle]

    def get(self, request):
        today = timezone.localdate()
        notices = (
            Notice.objects.select_related("school")
            .filter(is_public=True, school__is_active=True, publish_on__lte=today)
            .filter(Q(expires_on__isnull=True) | Q(expires_on__gte=today))
            .order_by("-is_pinned", "-publish_on", "-created_at")[:12]
        )
        data = [
            {
                "id": str(n.pk), "title": n.title, "body": n.body[:400], "category": n.category,
                "event_date": n.event_date, "end_date": n.end_date, "publish_on": n.publish_on,
                "is_pinned": n.is_pinned, "school": n.school.name,
                "attachment_url": f"/api/v1/notice-files/{n.pk}/" if n.attachment else None,
            }
            for n in notices
        ]
        stre = None
        stre_result = None
        try:
            from apps.stre.views import current_exam

            from apps.stre.models import StreExam

            exam = current_exam()
            if exam:
                stre = {"title": exam.title, "code": exam.code, "exam_date": exam.exam_date, "last_date": exam.last_date, "fee": exam.fee}
            declared = StreExam.objects.filter(results_published=True).order_by("-results_published_at").first()
            stre_result = declared.title if declared else None
        except Exception:  # noqa: BLE001 — STRE module optional
            stre = stre_result = None
        stre_notices = []
        try:
            from apps.stre.views import active_stre_notices

            stre_notices = [
                {"id": str(n.pk), "title": n.title, "body": n.body[:400], "is_pinned": n.is_pinned, "publish_on": n.publish_on,
                 "attachment_url": f"/api/v1/stre/notice-files/{n.pk}/" if n.attachment else None}
                for n in active_stre_notices()[:8]
            ]
        except Exception:  # noqa: BLE001
            stre_notices = []
        return Response({"notices": data, "stre": stre, "stre_result": stre_result, "stre_notices": stre_notices})


class NoticeFileView(APIView):
    """Notice ki PDF: website (public) notice ho to koi bhi dekhe; warna usi school ke logged-in log."""

    authentication_classes = [OptionalCookieJWTAuthentication]
    permission_classes = [AllowAny]
    throttle_classes = [AnonRateThrottle]

    def get(self, request, notice_id):
        from django.http import FileResponse, Http404

        try:
            notice = Notice.objects.filter(pk=notice_id).first()
        except (ValueError, DjangoValidationError):
            notice = None
        if notice is None or not notice.attachment:
            raise Http404
        user = request.user
        allowed = notice.is_public or (
            user.is_authenticated and (user.role == Role.SUPER_ADMIN or user.school_id == notice.school_id)
        )
        if not allowed:
            raise Http404
        try:
            handle = notice.attachment.open("rb")
        except FileNotFoundError as exc:
            raise Http404 from exc
        name = notice.attachment.name.rsplit("/", 1)[-1]
        response = FileResponse(handle, content_type="application/pdf", as_attachment=request.query_params.get("download") == "1", filename=name)
        response["Cache-Control"] = "private, max-age=300"
        return response
