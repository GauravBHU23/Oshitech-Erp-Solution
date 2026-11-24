from django.db.models import Q
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.core.audit import log_action
from apps.core.roles import ADMIN_ONLY, ALL_SCHOOL_ROLES, Role
from apps.core.viewsets import TenantModelViewSet
from apps.students.models import Student

from . import serializers as s
from .models import AcademicYear, ClassRoom, Course, Subject, TeachingAssignment

# School ke liye standard Class 1-12 course list (aur common subjects)
SCHOOL_CLASSES = [(str(n), f"Class {n}") for n in range(1, 13)]
DEFAULT_SUBJECTS = {
    "primary": [("English", "ENG"), ("Hindi", "HIN"), ("Mathematics", "MAT"), ("Environmental Studies", "EVS")],
    "middle": [("English", "ENG"), ("Hindi", "HIN"), ("Mathematics", "MAT"), ("Science", "SCI"), ("Social Science", "SST"), ("Sanskrit", "SAN"), ("Computer", "CMP")],
    "secondary": [("English", "ENG"), ("Hindi", "HIN"), ("Mathematics", "MAT"), ("Science", "SCI"), ("Social Science", "SST"), ("Computer", "CMP")],
    "senior": [("English", "ENG"), ("Physics", "PHY"), ("Chemistry", "CHE"), ("Mathematics", "MAT"), ("Biology", "BIO"), ("Computer Science", "CS"), ("Physical Education", "PE")],
}


def _subjects_for(level):
    n = int(level)
    if n <= 5:
        return DEFAULT_SUBJECTS["primary"]
    if n <= 8:
        return DEFAULT_SUBJECTS["middle"]
    if n <= 10:
        return DEFAULT_SUBJECTS["secondary"]
    return DEFAULT_SUBJECTS["senior"]


def _active_student(user):
    return Student.objects.filter(user=user, is_active=True).first()


class _Base(TenantModelViewSet):
    read_roles = ALL_SCHOOL_ROLES
    write_roles = ADMIN_ONLY


class AcademicYearViewSet(_Base):
    queryset = AcademicYear.objects.all()
    serializer_class = s.AcademicYearSerializer
    filterset_fields = ["is_current"]

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.user.role == Role.STUDENT:
            student = _active_student(self.request.user)
            return qs.filter(classrooms__students=student).distinct() if student else qs.none()
        return qs


class CourseViewSet(_Base):
    queryset = Course.objects.prefetch_related("subjects")
    serializer_class = s.CourseSerializer
    search_fields = ["name", "code"]
    filterset_fields = ["is_active"]
    action_roles = {"seed_classes": ADMIN_ONLY}

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.user.role == Role.STUDENT:
            student = _active_student(self.request.user)
            return qs.filter(classrooms__students=student).distinct() if student else qs.none()
        return qs

    @action(detail=False, methods=["post"], url_path="seed-classes")
    def seed_classes(self, request):
        """Class 1 se 12 tak courses (aur unke default subjects) ek click me bana deta hai."""
        school = self._resolve_school()
        with_subjects = str(request.data.get("with_subjects", "true")).lower() in ("1", "true", "yes", "on")
        created_courses = created_subjects = 0
        for level, name in SCHOOL_CLASSES:
            course = Course.objects.filter(school=school, name__iexact=name).first()
            created = False
            if course is None:
                course, created = Course.objects.get_or_create(
                    school=school, code=f"CLS{level}", defaults={"name": name, "description": f"School {name}"}
                )
            created_courses += int(created)
            if with_subjects:
                for subject_name, code in _subjects_for(level):
                    _, new = Subject.objects.get_or_create(
                        school=school, code=f"{code}{level}", defaults={"course": course, "name": subject_name}
                    )
                    created_subjects += int(new)
        log_action(request, "seed_classes", school, {"courses": created_courses, "subjects": created_subjects})
        return Response({
            "courses": created_courses,
            "subjects": created_subjects,
            "detail": f"{created_courses} classes and {created_subjects} subjects created (existing ones were kept).",
        })


class SubjectViewSet(_Base):
    queryset = Subject.objects.select_related("course")
    serializer_class = s.SubjectSerializer
    search_fields = ["name", "code"]
    filterset_fields = ["course"]

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.user.role == Role.STUDENT:
            student = _active_student(self.request.user)
            return qs.filter(course__classrooms__students=student).distinct() if student else qs.none()
        return qs


class ClassRoomViewSet(_Base):
    queryset = ClassRoom.objects.select_related("course", "academic_year", "class_teacher__user")
    serializer_class = s.ClassRoomSerializer
    filterset_fields = ["course", "academic_year", "class_teacher"]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if user.role == Role.STUDENT:
            student = _active_student(user)
            return qs.filter(students=student) if student else qs.none()
        if user.role == Role.TEACHER:
            return qs.filter(Q(class_teacher__user=user) | Q(assignments__teacher__user=user)).distinct()
        return qs


class TeachingAssignmentViewSet(_Base):
    queryset = TeachingAssignment.objects.select_related(
        "classroom__course", "classroom__academic_year", "subject", "teacher__user"
    )
    serializer_class = s.TeachingAssignmentSerializer
    filterset_fields = ["classroom", "teacher", "subject"]

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.user.role == Role.STUDENT:
            return qs.none()
        if self.request.user.role == Role.TEACHER:
            return qs.filter(teacher__user=self.request.user)
        return qs
