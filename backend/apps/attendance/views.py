from collections import defaultdict

from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from apps.academics.models import ClassRoom
from apps.core.audit import log_action
from apps.core.roles import ADMIN_ONLY, Role
from apps.core.viewsets import TenantModelViewSet
from apps.students.models import Student

from .models import Attendance
from .serializers import AttendanceMarkSerializer, AttendanceSerializer

READ_ROLES = [Role.SCHOOL_ADMIN, Role.TEACHER, Role.STUDENT]
MARK_ROLES = [Role.SCHOOL_ADMIN, Role.TEACHER]


def teacher_classrooms(user):
    return ClassRoom.objects.filter(
        Q(class_teacher__user=user) | Q(assignments__teacher__user=user)
    ).distinct()


class AttendanceViewSet(TenantModelViewSet):
    queryset = Attendance.objects.select_related("student__user", "classroom__course", "classroom__academic_year")
    serializer_class = AttendanceSerializer
    read_roles = READ_ROLES
    write_roles = ADMIN_ONLY
    action_roles = {"mark": MARK_ROLES, "summary": READ_ROLES}
    http_method_names = ["get", "post", "delete", "head", "options"]
    filterset_fields = ["classroom", "student", "date", "status"]

    def create(self, request, *args, **kwargs):
        raise ValidationError("Use the mark action to record attendance for a class.")

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if user.role == Role.STUDENT:
            qs = qs.filter(student__user=user)
        elif user.role == Role.TEACHER:
            qs = qs.filter(classroom__in=teacher_classrooms(user))
        start = parse_date(self.request.query_params.get("from", "") or "")
        end = parse_date(self.request.query_params.get("to", "") or "")
        if start:
            qs = qs.filter(date__gte=start)
        if end:
            qs = qs.filter(date__lte=end)
        return qs

    def _classroom_for(self, request, classroom_id):
        user = request.user
        qs = ClassRoom.objects.all()
        if user.role != Role.SUPER_ADMIN:
            qs = qs.filter(school_id=user.school_id)
        if user.role == Role.TEACHER:
            qs = teacher_classrooms(user).filter(school_id=user.school_id)
        return get_object_or_404(qs, pk=classroom_id)

    @action(detail=False, methods=["post"])
    def mark(self, request):
        serializer = AttendanceMarkSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        if data["date"] > timezone.localdate():
            raise ValidationError({"date": "Attendance cannot be marked for a future date."})
        classroom = self._classroom_for(request, data["classroom"])
        students = {
            s.pk: s for s in Student.objects.filter(classroom=classroom, pk__in=[e["student"] for e in data["entries"]])
        }
        invalid = [str(e["student"]) for e in data["entries"] if e["student"] not in students]
        if invalid:
            raise ValidationError({"entries": "Some students are not placed in this classroom."})
        saved = 0
        with transaction.atomic():
            for entry in data["entries"]:
                Attendance.objects.update_or_create(
                    student=students[entry["student"]],
                    date=data["date"],
                    defaults={
                        "school_id": classroom.school_id,
                        "classroom": classroom,
                        "status": entry["status"],
                        "remarks": entry.get("remarks", ""),
                        "marked_by": request.user,
                    },
                )
                saved += 1
        log_action(request, "attendance_marked", classroom, {"date": data["date"].isoformat(), "count": saved})
        return Response({"saved": saved, "detail": f"Attendance saved for {saved} students."})

    @action(detail=False, methods=["get"])
    def summary(self, request):
        user = request.user
        qs = self.get_queryset()
        classroom_id = request.query_params.get("classroom")
        if user.role != Role.STUDENT:
            if not classroom_id:
                raise ValidationError({"classroom": "Select a classroom."})
            classroom = self._classroom_for(request, classroom_id)
            qs = qs.filter(classroom=classroom)
            students = Student.objects.filter(classroom=classroom).select_related("user")
        else:
            students = Student.objects.filter(user=user).select_related("user")
        counts = defaultdict(lambda: defaultdict(int))
        for row in qs.values("student_id", "status"):
            counts[row["student_id"]][row["status"]] += 1
        results = []
        for student in students:
            c = counts.get(student.pk, {})
            total = sum(c.values())
            attended = c.get("present", 0) + c.get("late", 0)
            results.append({
                "student": str(student.pk),
                "student_name": student.user.get_full_name(),
                "admission_no": student.admission_no,
                "roll_no": student.roll_no,
                "present": c.get("present", 0),
                "absent": c.get("absent", 0),
                "late": c.get("late", 0),
                "leave": c.get("leave", 0),
                "total": total,
                "percentage": round(attended * 100 / total, 1) if total else None,
            })
        return Response(results)

    def perform_destroy(self, instance):
        if self.request.user.role not in (Role.SUPER_ADMIN, Role.SCHOOL_ADMIN):
            raise PermissionDenied("Only an administrator can delete attendance records.")
        super().perform_destroy(instance)
