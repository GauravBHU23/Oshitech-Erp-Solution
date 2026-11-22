from django.db import transaction
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.core.audit import log_action
from apps.core.permissions import RoleAccess
from apps.core.roles import ADMIN_ONLY, ALL_SCHOOL_ROLES, Role
from apps.core.viewsets import TenantModelViewSet
from django.contrib.auth import get_user_model

from .models import School
from .serializers import CreateSchoolAdminSerializer, SchoolProfileSerializer, SchoolSerializer

User = get_user_model()


class BootstrapSchoolAccess(RoleAccess):
    def has_permission(self, request, view):
        user = request.user
        if (
            user
            and user.is_authenticated
            and user.role == Role.SCHOOL_ADMIN
            and not user.school_id
            and view.action in {"list", "create"}
            and not School.objects.exists()
        ):
            return True
        return super().has_permission(request, view)


class SchoolViewSet(TenantModelViewSet):
    """Super Admin manages schools; school users have scoped read access."""

    queryset = School.objects.all()
    serializer_class = SchoolSerializer
    tenant_lookup = "id"
    permission_classes = [IsAuthenticated, BootstrapSchoolAccess]
    read_roles = ALL_SCHOOL_ROLES
    write_roles = []
    action_roles = {
        "create_admin": [],
        "create_exam_controller": ADMIN_ONLY,
        "update": ADMIN_ONLY,
        "partial_update": ADMIN_ONLY,
    }
    search_fields = ["name", "code", "city"]

    def get_serializer_class(self):
        user = self.request.user
        if user.is_authenticated and user.role == Role.SCHOOL_ADMIN and self.action in ("update", "partial_update"):
            return SchoolProfileSerializer
        return SchoolSerializer

    def perform_create(self, serializer):
        user = self.request.user
        if user.role == Role.SCHOOL_ADMIN:
            with transaction.atomic():
                if user.school_id or School.objects.exists():
                    raise PermissionDenied("Only an unassigned School Admin can create the first school.")
                instance = serializer.save()
                User.objects.filter(
                    school__isnull=True,
                    role__in=[Role.SCHOOL_ADMIN, Role.TEACHER, Role.EXAM_CONTROLLER],
                ).update(school=instance)
        else:
            instance = serializer.save()
        log_action(self.request, "create", instance)

    @action(detail=True, methods=["post"], url_path="create-admin")
    def create_admin(self, request, pk=None):
        school = self.get_object()
        s = CreateSchoolAdminSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        user = User.objects.create_user(role=Role.SCHOOL_ADMIN, school=school, **s.validated_data)
        log_action(request, "create_school_admin", user)
        return Response({"id": str(user.pk), "email": user.email}, status=201)

    @action(detail=True, methods=["post"], url_path="create-exam-controller")
    def create_exam_controller(self, request, pk=None):
        school = self.get_object()
        s = CreateSchoolAdminSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        user = User.objects.create_user(role=Role.EXAM_CONTROLLER, school=school, **s.validated_data)
        log_action(request, "create_exam_controller", user)
        return Response({"id": str(user.pk), "email": user.email}, status=201)
