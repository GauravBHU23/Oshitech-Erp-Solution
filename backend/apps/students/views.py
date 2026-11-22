from django.db.models import Q
from rest_framework.decorators import action, api_view, authentication_classes, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.response import Response
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework.throttling import AnonRateThrottle

from apps.core.audit import log_action
from apps.core.roles import ADMIN_ONLY, ALL_SCHOOL_ROLES, Role
from apps.core.viewsets import TenantModelViewSet
from apps.teachers.models import Teacher

from .models import IDCard, Student, issue_id_card
from .promotion import recent_batches, run_promotion, undo_batch
from . import bulk_import as bulk
from .models import StudentImportJob
from django.http import HttpResponse
from .serializers import StudentSerializer
from .serializers_idcards import IDCardSerializer


def teacher_student_filter(user):
    return Q(classroom__class_teacher__user=user) | Q(classroom__assignments__teacher__user=user)


class StudentViewSet(TenantModelViewSet):
    queryset = Student.objects.select_related("user", "classroom__course", "classroom__academic_year")
    serializer_class = StudentSerializer
    read_roles = ALL_SCHOOL_ROLES
    write_roles = ADMIN_ONLY
    search_fields = ["admission_no", "roll_no", "user__first_name", "user__last_name", "user__email"]
    filterset_fields = ["classroom", "is_active", "class_level", "gender"]
    action_roles = {
        "promote": ADMIN_ONLY, "promotions": ADMIN_ONLY, "undo_promotion": ADMIN_ONLY,
        "import_template": ADMIN_ONLY, "bulk_import": ADMIN_ONLY, "import_status": ADMIN_ONLY, "import_credentials": ADMIN_ONLY,
    }

    @action(detail=False, methods=["get"], url_path="import-template")
    def import_template(self, request):
        content, mime, name = bulk.template_file("csv" if request.query_params.get("type") == "csv" else "xlsx")
        response = HttpResponse(content, content_type=mime)
        response["Content-Disposition"] = f'attachment; filename="{name}"'
        return response

    @action(detail=False, methods=["post"], url_path="import")
    def bulk_import(self, request):
        """Excel/CSV upload. dry_run=true: sirf check. dry_run=false: sab sahi ho to background me accounts banao."""
        school = self._resolve_school()
        upload = request.FILES.get("file")
        if upload is None:
            raise ValidationError({"file": "Choose the Excel or CSV file to upload."})
        rows = bulk.read_rows(upload)
        valid, errors = bulk.validate_rows(request, school, rows)
        result = bulk.preview(valid, errors, len(rows))
        dry_run = str(request.data.get("dry_run", "true")).lower() in ("1", "true", "yes", "on")
        if dry_run:
            return Response(result)
        if errors:
            return Response({**result, "detail": f"{len(errors)} row(s) have problems. Fix them and upload again — nothing was saved."}, status=400)
        job = bulk.start_import(request, school, valid, upload.name)
        log_action(request, "students_bulk_import", school, {"job": str(job.pk), "rows": len(valid), "file": upload.name})
        return Response({**result, "job": bulk.job_payload(job)}, status=202)

    def _job(self, request):
        qs = StudentImportJob.objects.all()
        if request.user.role != Role.SUPER_ADMIN:
            qs = qs.filter(school_id=request.user.school_id)
        try:
            job = qs.filter(pk=request.query_params.get("job")).first()
        except (ValueError, DjangoValidationError):
            job = None
        if job is None:
            raise NotFound("Import not found.")
        return job

    @action(detail=False, methods=["get"], url_path="import-status")
    def import_status(self, request):
        return Response(bulk.job_payload(self._job(request)))

    @action(detail=False, methods=["get"], url_path="import-credentials")
    def import_credentials(self, request):
        job = self._job(request)
        if not bulk.job_payload(job)["credentials_available"]:
            raise NotFound("Login details are no longer available (they are kept for 24 hours).")
        log_action(request, "students_import_credentials_downloaded", job)
        response = HttpResponse(bulk.credentials_csv(job), content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = 'attachment; filename="student-logins.csv"'
        return response

    @action(detail=False, methods=["post"])
    def promote(self, request):
        """Session change: ek class ke students ko promote / detain / pass out karna."""
        school = self._resolve_school()
        result = run_promotion(request, school, request.data)
        log_action(request, "students_promoted", school, result)
        return Response(result)

    @action(detail=False, methods=["get"])
    def promotions(self, request):
        user = request.user
        if user.role == Role.SUPER_ADMIN:
            school = request.query_params.get("school")
            flt = {"school_id": school} if school else {}
        else:
            flt = {"school_id": user.school_id}
        return Response(recent_batches(flt))

    @action(detail=False, methods=["post"], url_path="undo-promotion")
    def undo_promotion(self, request):
        school = self._resolve_school()
        result = undo_batch(school, request.data.get("batch"))
        log_action(request, "students_promotion_undone", school, {"batch": str(request.data.get("batch")), **result})
        return Response(result)

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.user.role == Role.STUDENT:
            qs = qs.filter(user=self.request.user)  # student sirf apna profile dekhe
        elif self.request.user.role == Role.TEACHER:
            if not Teacher.objects.filter(user=self.request.user).exists():
                return qs.none()
            qs = qs.filter(teacher_student_filter(self.request.user)).distinct()
        return qs


class IDCardViewSet(TenantModelViewSet):
    queryset = IDCard.objects.select_related(
        "school", "student__user", "student__classroom__course", "student__classroom__academic_year", "teacher__user",
    )
    serializer_class = IDCardSerializer
    read_roles = ALL_SCHOOL_ROLES
    write_roles = []
    action_roles = {"reissue": ADMIN_ONLY, "revoke": ADMIN_ONLY, "issue_missing": ADMIN_ONLY}
    http_method_names = ["get", "post", "head", "options"]
    filterset_fields = ["holder_type", "is_revoked", "student", "teacher", "student__class_level", "student__classroom"]
    search_fields = [
        "code", "student__admission_no", "teacher__employee_id",
        "student__user__first_name", "student__user__last_name",
        "teacher__user__first_name", "teacher__user__last_name",
    ]

    def create(self, request, *args, **kwargs):
        return Response({"detail": "ID cards are issued automatically on admission."}, status=405)

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if user.role == Role.STUDENT:
            return qs.filter(student__user=user, is_revoked=False)
        if user.role == Role.TEACHER:
            own = Q(teacher__user=user)
            students = Q(student__in=Student.objects.filter(teacher_student_filter(user)))
            return qs.filter(own | students).distinct()
        if user.role == Role.EXAM_CONTROLLER:
            return qs.filter(holder_type=IDCard.Holder.STUDENT)
        return qs

    @action(detail=True, methods=["post"])
    def reissue(self, request, pk=None):
        card = self.get_object()
        card.reissue()
        log_action(request, "id_card_reissued", card)
        return Response(self.get_serializer(card).data)

    @action(detail=True, methods=["post"])
    def revoke(self, request, pk=None):
        card = self.get_object()
        card.is_revoked = True
        card.save(update_fields=["is_revoked", "updated_at"])
        log_action(request, "id_card_revoked", card)
        return Response({"detail": "ID card revoked."})

    @action(detail=False, methods=["post"], url_path="issue-missing")
    def issue_missing(self, request):
        user = request.user
        school_id = user.school_id if user.role != Role.SUPER_ADMIN else request.data.get("school")
        students = Student.objects.filter(id_card__isnull=True)
        teachers = Teacher.objects.filter(id_card__isnull=True)
        if school_id:
            students = students.filter(school_id=school_id)
            teachers = teachers.filter(school_id=school_id)
        issued = 0
        for student in students:
            issue_id_card(student=student)
            issued += 1
        for teacher in teachers:
            issue_id_card(teacher=teacher)
            issued += 1
        return Response({"issued": issued, "detail": f"{issued} ID cards issued."})


class IDVerifyThrottle(AnonRateThrottle):
    scope = "verify"


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([IDVerifyThrottle])
def verify_id_card(request, code):
    """Public QR verification: sirf minimum info, koi sensitive data nahi."""
    card = (
        IDCard.objects.select_related("school", "student__user", "student__classroom", "teacher__user")
        .filter(code=str(code).upper())
        .first()
    )
    if card is None or card.holder is None:
        return Response({"valid": False}, status=404)
    holder = card.holder
    data = {
        "valid": card.is_valid,
        "holder_name": holder.user.get_full_name(),
        "holder_type": card.get_holder_type_display(),
        "school": card.school.name,
        "valid_until": card.valid_until,
        "status": "revoked" if card.is_revoked else ("active" if card.is_valid else "inactive"),
    }
    if card.holder_type == IDCard.Holder.STUDENT and holder.class_level:
        data["class_level"] = f"Class {holder.class_level}"
    return Response(data)
