from django.contrib.auth import password_validation
from django.contrib.auth import get_user_model
from rest_framework import serializers

from apps.accounts.serializers import validate_profile_photo_file
from apps.core.validators import normalize_mobile, normalize_phone

from .models import School

User = get_user_model()


class SchoolSerializer(serializers.ModelSerializer):
    class Meta:
        model = School
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_phone(self, value):
        return normalize_phone(value)

    def validate_pincode(self, value):
        value = (value or "").strip()
        if value and not (value.isdigit() and len(value) == 6):
            raise serializers.ValidationError("Enter a valid 6-digit PIN code.")
        return value


class SchoolProfileSerializer(SchoolSerializer):
    """School Admin apna profile edit kar sakta hai, lekin code/plan/status sirf Super Admin badle."""

    class Meta(SchoolSerializer.Meta):
        read_only_fields = ["id", "created_at", "updated_at", "code", "plan", "is_active"]


class CreateSchoolAdminSerializer(serializers.Serializer):
    email = serializers.EmailField()
    first_name = serializers.CharField()
    last_name = serializers.CharField(required=False, allow_blank=True, default="")
    phone = serializers.CharField(max_length=15, required=False, allow_blank=True, default="")
    password = serializers.CharField(write_only=True)
    profile_photo = serializers.FileField(required=False)

    def validate_phone(self, value):
        return normalize_mobile(value)

    def validate_profile_photo(self, value):
        return validate_profile_photo_file(value)

    def validate_email(self, v):
        if User.objects.filter(email__iexact=v).exists():
            raise serializers.ValidationError("An account with this email already exists.")
        return v.lower()

    def validate_password(self, v):
        password_validation.validate_password(v)
        return v
