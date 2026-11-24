from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework.decorators import action, api_view, authentication_classes, permission_classes, throttle_classes
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from apps.core.throttles import AtomicAnonRateThrottle

from apps.core.audit import log_action
from apps.academics.models import TeachingAssignment
from apps.core.roles import ADMIN_ONLY, ALL_SCHOOL_ROLES, EXAM_STAFF, STAFF_ROLES, Role
from apps.core.viewsets import TenantModelViewSet
from apps.students.models import Student

from .models import AdmitCard, Exam, ExamSchedule, Result
from .serializers import (
    AdmitCardSerializer,
    BulkResultSerializer,
    ExamScheduleSerializer,
    ExamSerializer,
    ResultSerializer,
)


class ExamViewSet(TenantModelViewSet):
    queryset = Exam.objects.select_related("course", "academic_year")
    serializer_class = ExamSerializer
    read_roles = ALL_SCHOOL_ROLES
    write_roles = EXAM_STAFF
    action_roles = {
        "generate_admit_cards": EXAM_STAFF,
        "publish_results": EXAM_STAFF,
        "unlock_results": ADMIN_ONLY,
    }
    filterset_fields = ["status", "course", "academic_year", "results_published"]
    search_fields = ["name"]

    def get_allowed_roles(self, request):
        if self.action == "destroy":
            return ADMIN_ONLY
        return super().get_allowed_roles(request)

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.user.role == Role.STUDENT:
            student = Student.objects.filter(user=self.request.user, is_active=True).select_related("classroom").first()
            if not student or not student.classroom_id:
                return qs.none()
            qs = qs.exclude(status=Exam.Status.DRAFT).filter(
                course=student.classroom.course,
                academic_year=student.classroom.academic_year,
            )
        elif self.request.user.role == Role.TEACHER:
            qs = qs.filter(course__classrooms__assignments__teacher__user=self.request.user).distinct()
        return qs

    @action(detail=True, methods=["post"], url_path="generate-admit-cards")
    def generate_admit_cards(self, request, pk=None):
        exam = self.get_object()
        students = Student.objects.filter(
            school=exam.school,
            is_active=True,
            classroom__course=exam.course,
            classroom__academic_year=exam.academic_year,
        )
        created = 0
        for st in students:
            _, new = AdmitCard.objects.get_or_create(exam=exam, student=st, defaults={"school": exam.school})
            created += int(new)
        log_action(request, "generate_admit_cards", exam, {"created": created})
        return Response({"created": created, "total_students": students.count()})

    @action(detail=True, methods=["post"], url_path="publish-results")
    def publish_results(self, request, pk=None):
        exam = self.get_object()
        if exam.results_published:
            raise ValidationError("Results have already been published.")
        exam.results_published = True
        exam.results_locked = True  # publish = lock
        exam.save(update_fields=["results_published", "results_locked", "updated_at"])
        log_action(request, "publish_results", exam)
        return Response({"detail": "Results published and locked."})

    @action(detail=True, methods=["post"], url_path="unlock-results")
    def unlock_results(self, request, pk=None):
        exam = self.get_object()
        exam.results_published = False
        exam.results_locked = False
        exam.save(update_fields=["results_published", "results_locked", "updated_at"])
        log_action(request, "unlock_results", exam)
        return Response({"detail": "Results unpublished and unlocked."})


class ExamScheduleViewSet(TenantModelViewSet):
    queryset = ExamSchedule.objects.select_related("exam", "subject")
    serializer_class = ExamScheduleSerializer
    read_roles = ALL_SCHOOL_ROLES
    write_roles = EXAM_STAFF
    filterset_fields = ["exam", "subject", "date"]

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.user.role == Role.STUDENT:
            student = Student.objects.filter(user=self.request.user, is_active=True).select_related("classroom").first()
            if not student or not student.classroom_id:
                return qs.none()
            qs = qs.filter(
                exam__course=student.classroom.course,
                exam__academic_year=student.classroom.academic_year,
            ).exclude(exam__status=Exam.Status.DRAFT)
        elif self.request.user.role == Role.TEACHER:
            qs = qs.filter(exam__course__classrooms__assignments__teacher__user=self.request.user).distinct()
        return qs

    def get_allowed_roles(self, request):
        if self.action == "destroy":
            return ADMIN_ONLY
        return super().get_allowed_roles(request)


class AdmitCardViewSet(TenantModelViewSet):
    queryset = AdmitCard.objects.select_related(
        "exam__course", "exam__academic_year", "student__user", "school",
    )
    serializer_class = AdmitCardSerializer
    read_roles = ALL_SCHOOL_ROLES
    write_roles = []
    action_roles = {"revoke": EXAM_STAFF}
    http_method_names = ["get", "post", "head", "options"]  # create exam action se hota hai
    filterset_fields = ["exam", "student", "is_revoked"]

    def create(self, request, *args, **kwargs):
        raise ValidationError("Generate admit cards using the exam's generate-admit-cards action.")

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.user.role == Role.STUDENT:
            qs = qs.filter(student__user=self.request.user, is_revoked=False)
        elif self.request.user.role == Role.TEACHER:
            from apps.students.views import teacher_student_filter
            qs = qs.filter(student__in=Student.objects.filter(teacher_student_filter(self.request.user))).distinct()
        return qs

    @action(detail=True, methods=["post"])
    def revoke(self, request, pk=None):
        card = self.get_object()
        card.is_revoked = True
        card.save(update_fields=["is_revoked", "updated_at"])
        log_action(request, "revoke_admit_card", card)
        return Response({"detail": "Revoked."})


class ResultViewSet(TenantModelViewSet):
    queryset = Result.objects.select_related("exam", "student__user", "student__classroom", "subject")
    serializer_class = ResultSerializer
    read_roles = ALL_SCHOOL_ROLES
    write_roles = STAFF_ROLES
    action_roles = {"bulk": STAFF_ROLES}
    filterset_fields = ["exam", "student", "subject", "student__classroom"]
    search_fields = ["student__admission_no", "student__user__first_name", "student__user__last_name"]

    def get_allowed_roles(self, request):
        if self.action == "destroy":
            return ADMIN_ONLY
        return super().get_allowed_roles(request)

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.user.role == Role.STUDENT:
            qs = qs.filter(student__user=self.request.user, exam__results_published=True)
        elif self.request.user.role == Role.TEACHER:
            qs = qs.filter(
                exam__course__classrooms__assignments__teacher__user=self.request.user,
                subject_id__in=TeachingAssignment.objects.filter(
                    teacher__user=self.request.user
                ).values("subject_id"),
            ).distinct()
        return qs

    def perform_destroy(self, instance):
        if instance.exam.results_locked:
            raise ValidationError("Results are locked.")
        super().perform_destroy(instance)

    @action(detail=False, methods=["post"])
    def bulk(self, request):
        """Ek exam + subject ke liye poori class ke marks ek saath save karta hai."""
        payload = BulkResultSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data
        exam_qs = Exam.objects.all()
        if request.user.role != Role.SUPER_ADMIN:
            exam_qs = exam_qs.filter(school_id=request.user.school_id)
        exam = get_object_or_404(exam_qs, pk=data["exam"])
        errors = {}
        saved = 0
        with transaction.atomic():
            for entry in data["entries"]:
                existing = Result.objects.filter(exam=exam, student_id=entry["student"], subject_id=data["subject"]).first()
                body = {
                    "exam": str(exam.pk),
                    "student": str(entry["student"]),
                    "subject": str(data["subject"]),
                    "is_absent": entry.get("is_absent", False),
                    "marks_obtained": entry.get("marks_obtained"),
                    "remarks": entry.get("remarks", ""),
                }
                serializer = ResultSerializer(existing, data=body, context={"request": request})
                if not serializer.is_valid():
                    errors[str(entry["student"])] = serializer.errors
                    continue
                instance = serializer.save(school=exam.school) if existing is None else serializer.save()
                saved += 1
                log_action(request, "update" if existing else "create", instance)
            if errors:
                transaction.set_rollback(True)
        if errors:
            raise ValidationError({"entries": errors, "detail": "Some marks could not be saved. Nothing was saved."})
        return Response({"saved": saved, "detail": f"Marks saved for {saved} students."})


class VerifyThrottle(AtomicAnonRateThrottle):
    scope = "verify"


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([VerifyThrottle])
def verify_admit_card(request, code):
    """Public QR verification: sirf minimum info, koi sensitive data nahi."""
    card = (
        AdmitCard.objects.select_related("exam", "student__user", "school")
        .filter(code=code.upper(), is_revoked=False)
        .first()
    )
    if card is None:
        return Response({"valid": False}, status=404)
    return Response(
        {
            "valid": True,
            "student_name": card.student.user.get_full_name(),
            "exam": card.exam.name,
            "school": card.school.name,
        }
    )
