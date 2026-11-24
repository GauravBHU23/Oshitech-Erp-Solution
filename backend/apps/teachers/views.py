from django.db.models import Avg, Count
from apps.core.roles import ADMIN_ONLY, STAFF_ROLES
from apps.core.pagination import StandardPagination
from apps.core.permissions import RoleAccess
from apps.core.roles import Role
from apps.core.viewsets import TenantModelViewSet
from apps.academics.models import TeachingAssignment
from apps.students.models import Student
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.pagination import PageNumberPagination
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from .models import Teacher, TeacherRating
from apps.core.throttles import AtomicAnonRateThrottle
from .serializers import TeacherSerializer
from .serializers_ratings import TeacherRatingSubmissionSerializer


class TeacherDirectoryPagination(PageNumberPagination):
    page_size = 12
    page_size_query_param = "page_size"
    max_page_size = 48


class PublicTeacherDirectoryView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [AtomicAnonRateThrottle]

    def get(self, request):
        teachers = Teacher.objects.filter(
            is_active=True,
            is_public=True,
            user__is_active=True,
            school__is_active=True,
        ).annotate(
            rating_average=Avg("ratings__rating"),
            rating_count=Count("ratings", distinct=True),
        ).select_related("user", "school").prefetch_related("assignments__subject__course").distinct().order_by("user__first_name", "user__last_name")
        paginator = TeacherDirectoryPagination()
        page = paginator.paginate_queryset(teachers, request, view=self)
        results = []
        for teacher in page:
            subjects = {
                (assignment.subject.course.name, assignment.subject.name)
                for assignment in teacher.assignments.all()
            }
            results.append({
                "id": str(teacher.pk),
                "name": teacher.user.get_full_name() or "Teacher",
                "school_name": teacher.school.name,
                "photo_url": f"/api/v1/teachers/directory/{teacher.pk}/photo/" if teacher.user.profile_photo else None,
                "teaching": [{"course": course, "subject": subject} for course, subject in sorted(subjects)],
                "rating_average": round(float(teacher.rating_average), 1) if teacher.rating_average is not None else None,
                "rating_count": teacher.rating_count,
            })
        return paginator.get_paginated_response(results)


class PublicTeacherPhotoView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, teacher_id):
        teacher = get_object_or_404(
            Teacher.objects.select_related("user", "school"),
            pk=teacher_id,
            is_active=True,
            is_public=True,
            user__is_active=True,
            school__is_active=True,
        )
        if not teacher.user.profile_photo:
            return Response(status=404)
        extension = teacher.user.profile_photo.name.rsplit(".", 1)[-1].lower()
        content_type = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "gif": "image/gif", "webp": "image/webp"}.get(extension, "application/octet-stream")
        return FileResponse(teacher.user.profile_photo.open("rb"), content_type=content_type)


class TeacherViewSet(TenantModelViewSet):
    queryset = Teacher.objects.select_related("user")
    serializer_class = TeacherSerializer
    read_roles = STAFF_ROLES
    write_roles = ADMIN_ONLY
    search_fields = ["employee_id", "user__first_name", "user__last_name", "user__email"]
    filterset_fields = ["is_active"]

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.user.role == "teacher":
            return qs.filter(user=self.request.user)
        return qs


class MyTeacherRatingsView(APIView):
    permission_classes = [IsAuthenticated]

    def _student(self, request):
        if request.user.role != Role.STUDENT:
            raise PermissionDenied("Only students can rate teachers.")
        try:
            return request.user.student_profile
        except Student.DoesNotExist as exc:
            raise PermissionDenied("An active student profile is required.") from exc

    def _assigned_teachers(self, student):
        if not student.is_active or not student.classroom_id:
            return []
        assignments = TeachingAssignment.objects.filter(
            school_id=student.school_id,
            classroom_id=student.classroom_id,
            teacher__is_active=True,
            teacher__user__is_active=True,
            teacher__school__is_active=True,
        ).select_related("teacher__user", "teacher__school", "subject__course")
        by_teacher = {}
        for assignment in assignments:
            teacher = assignment.teacher
            entry = by_teacher.setdefault(teacher.pk, {"teacher": teacher, "subjects": set()})
            entry["subjects"].add((assignment.subject.course.name, assignment.subject.name))
        return list(by_teacher.values())

    def get(self, request):
        student = self._student(request)
        teachers = self._assigned_teachers(student)
        ratings = {
            rating.teacher_id: rating
            for rating in TeacherRating.objects.filter(
                student=student, teacher_id__in=[entry["teacher"].pk for entry in teachers]
            )
        }
        return Response([
            {
                "id": str(entry["teacher"].pk),
                "name": entry["teacher"].user.get_full_name() or "Teacher",
                "photo_url": (
                    f"/api/v1/teachers/directory/{entry['teacher'].pk}/photo/"
                    if entry["teacher"].is_public and entry["teacher"].user.profile_photo else None
                ),
                "subjects": [
                    {"course": course, "subject": subject}
                    for course, subject in sorted(entry["subjects"])
                ],
                "rating": ratings[entry["teacher"].pk].rating if entry["teacher"].pk in ratings else None,
                "feedback": ratings[entry["teacher"].pk].feedback if entry["teacher"].pk in ratings else "",
            }
            for entry in teachers
        ])

    def post(self, request):
        student = self._student(request)
        if not student.is_active or not student.classroom_id:
            raise PermissionDenied("An active classroom placement is required to rate a teacher.")
        serializer = TeacherRatingSubmissionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        teacher_id = serializer.validated_data["teacher_id"]
        teacher = get_object_or_404(
            Teacher.objects.filter(
                school_id=student.school_id,
                is_active=True,
                user__is_active=True,
                school__is_active=True,
                assignments__classroom_id=student.classroom_id,
            ).distinct(),
            pk=teacher_id,
        )
        rating, created = TeacherRating.objects.update_or_create(
            student=student,
            teacher=teacher,
            defaults={
                "school_id": student.school_id,
                "rating": serializer.validated_data["rating"],
                "feedback": serializer.validated_data.get("feedback", ""),
            },
        )
        return Response(
            {"id": str(rating.pk), "rating": rating.rating, "feedback": rating.feedback},
            status=201 if created else 200,
        )


class AdminTeacherRatingsView(APIView):
    permission_classes = [IsAuthenticated, RoleAccess]

    def get_allowed_roles(self, request):
        return ADMIN_ONLY

    def get(self, request):
        ratings = TeacherRating.objects.select_related(
            "teacher__user", "student__user", "school"
        )
        if request.user.role != Role.SUPER_ADMIN:
            ratings = ratings.filter(school_id=request.user.school_id)
        paginator = StandardPagination()
        page = paginator.paginate_queryset(ratings, request, view=self)
        results = [
            {
                "id": str(rating.pk),
                "teacher_name": rating.teacher.user.get_full_name() or "Teacher",
                "student_name": rating.student.user.get_full_name() or "Student",
                "school_name": rating.school.name,
                "rating": rating.rating,
                "feedback": rating.feedback,
                "updated_at": rating.updated_at,
            }
            for rating in page
        ]
        return paginator.get_paginated_response(results)
