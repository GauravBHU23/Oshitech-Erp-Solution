from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError
from rest_framework import viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated

from apps.schools.models import School

from .audit import log_action
from .permissions import RoleAccess
from .roles import ADMIN_ONLY, ALL_SCHOOL_ROLES, Role

SAFE = ("GET", "HEAD", "OPTIONS")


def _s(v):
    return None if v is None else str(v)


class TenantModelViewSet(viewsets.ModelViewSet):
    """
    - Queryset hamesha user ke school tak limited
    - Role-based read/write access
    - Create/update/delete ka audit log
    """

    permission_classes = [IsAuthenticated, RoleAccess]
    read_roles = ALL_SCHOOL_ROLES
    write_roles = ADMIN_ONLY
    action_roles = {}
    tenant_lookup = "school_id"

    def get_allowed_roles(self, request):
        if self.action in self.action_roles:
            return self.action_roles[self.action]
        return self.read_roles if request.method in SAFE else self.write_roles

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if user.role == Role.SUPER_ADMIN:
            return qs
        if not user.school_id:
            return qs.none()
        return qs.filter(**{self.tenant_lookup: user.school_id})

    def _resolve_school(self):
        user = self.request.user
        if user.role != Role.SUPER_ADMIN:
            return user.school
        try:
            school = School.objects.filter(pk=self.request.data.get("school")).first()
        except (ValueError, DjangoValidationError):
            school = None
        if school is None:
            raise ValidationError({"school": "A valid school ID is required for a Super Admin."})
        return school

    def get_create_extra(self):
        """Subclasses create ke waqt extra fields (jaise created_by) yahan se de sakte hain."""
        return {}

    def perform_create(self, serializer):
        school = self._resolve_school()
        try:
            instance = serializer.save(school=school, **self.get_create_extra())
        except IntegrityError:
            raise ValidationError({"detail": "A record with these details already exists."})
        log_action(self.request, "create", instance)

    def perform_update(self, serializer):
        inst = serializer.instance
        old = {f: _s(getattr(inst, f, None)) for f in serializer.validated_data if hasattr(inst, f)}
        try:
            instance = serializer.save()
        except IntegrityError:
            raise ValidationError({"detail": "A record with these details already exists."})
        new = {f: _s(getattr(instance, f, None)) for f in old}
        log_action(self.request, "update", instance, {"old": old, "new": new})

    def perform_destroy(self, instance):
        log_action(self.request, "delete", instance)
        instance.delete()
