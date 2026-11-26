"""Direct port of backend/apps/core/roles.py — values must stay byte-for-byte identical
since they're stored in the shared accounts_user.role column."""
from enum import Enum


class Role(str, Enum):
    SUPER_ADMIN = "super_admin"
    SCHOOL_ADMIN = "school_admin"
    TEACHER = "teacher"
    STUDENT = "student"
    EXAM_CONTROLLER = "exam_controller"
    STRE_ADMIN = "stre_admin"


ALL_SCHOOL_ROLES = [Role.SCHOOL_ADMIN, Role.TEACHER, Role.STUDENT, Role.EXAM_CONTROLLER]
STAFF_ROLES = [Role.SCHOOL_ADMIN, Role.TEACHER, Role.EXAM_CONTROLLER]
ADMIN_ONLY = [Role.SCHOOL_ADMIN]
EXAM_STAFF = [Role.SCHOOL_ADMIN, Role.EXAM_CONTROLLER]
