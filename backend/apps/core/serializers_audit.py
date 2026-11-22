from rest_framework import serializers

from .models import AuditLog


class AuditLogSerializer(serializers.ModelSerializer):
    user_email = serializers.CharField(source="user.email", read_only=True, default=None)
    user_name = serializers.SerializerMethodField()
    user_role = serializers.CharField(source="user.role", read_only=True, default="")
    school_name = serializers.CharField(source="school.name", read_only=True, default="")

    class Meta:
        model = AuditLog
        fields = [
            "id", "created_at", "user_email", "user_name", "user_role", "school_name",
            "action", "model", "object_id", "changes", "ip_address",
        ]

    def get_user_name(self, obj):
        return obj.user.get_full_name() if obj.user_id else ""
