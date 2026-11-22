from rest_framework.permissions import BasePermission

from .roles import Role


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
