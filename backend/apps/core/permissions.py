from rest_framework.permissions import BasePermission

from .roles import Role


class AdminEmailPermission(BasePermission):
    """Only school and platform admins may use the direct email tool."""

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role in {Role.SUPER_ADMIN, Role.SCHOOL_ADMIN}
        )


class RoleAccess(BasePermission):
    """View ka get_allowed_roles() decide karta hai ki kaun access kar sakta hai.
    Super Admin hamesha allowed; baaki users ka school hona zaroori hai."""

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if user.role == Role.SUPER_ADMIN:
            return True
        if not user.school_id:
            return False
        return user.role in view.get_allowed_roles(request)
