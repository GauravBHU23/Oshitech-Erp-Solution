from apps.core.roles import Role
from apps.core.serializers import UserBackedSerializer
from apps.core.validators import normalize_mobile

from .models import Teacher


class TeacherSerializer(UserBackedSerializer):
    user_role = Role.TEACHER

    class Meta:
        model = Teacher
        fields = "__all__"
        read_only_fields = ["id", "school", "created_at", "updated_at"]

    def validate_phone(self, value):
        return normalize_mobile(value)
