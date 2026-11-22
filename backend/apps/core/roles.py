from django.db import models


class Role(models.TextChoices):
    SUPER_ADMIN = "super_admin", "Super Admin"
    SCHOOL_ADMIN = "school_admin", "School Admin"
    TEACHER = "teacher", "Teacher"
    STUDENT = "student", "Student"
    EXAM_CONTROLLER = "exam_controller", "Exam Controller"
    STRE_ADMIN = "stre_admin", "Exam Portal Admin"  # STRE (talent exam) portal; school data se alag


ALL_SCHOOL_ROLES = [Role.SCHOOL_ADMIN, Role.TEACHER, Role.STUDENT, Role.EXAM_CONTROLLER]
STAFF_ROLES = [Role.SCHOOL_ADMIN, Role.TEACHER, Role.EXAM_CONTROLLER]
ADMIN_ONLY = [Role.SCHOOL_ADMIN]
EXAM_STAFF = [Role.SCHOOL_ADMIN, Role.EXAM_CONTROLLER]
