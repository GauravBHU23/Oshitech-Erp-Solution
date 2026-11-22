from django.contrib.auth import get_user_model
from django.contrib.auth import password_validation
from django.db import models, transaction
from rest_framework import serializers

from apps.core.validators import validate_pdf_file

from apps.accounts.serializers import UserSerializer, validate_profile_photo_file

from .roles import Role

User = get_user_model()


class TenantSerializer(serializers.ModelSerializer):
    """Doosre school ki ID (FK) bhej kar cross-tenant data access ko rokta hai."""

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["label"] = str(instance)  # frontend dropdowns ke liye
        return data

    def validate(self, attrs):
        attrs = super().validate(attrs)
        user = self.context["request"].user
        if user.role == Role.SUPER_ADMIN:
            return attrs
        for name, value in attrs.items():
            values = value if isinstance(value, (list, tuple)) else [value]
            for v in values:
                if isinstance(v, models.Model):
                    sid = getattr(v, "school_id", None)
                    if sid is not None and sid != user.school_id:
                        raise serializers.ValidationError({name: "Invalid reference."})
        return attrs


USER_FIELDS = ("email", "first_name", "last_name", "password", "profile_photo")


class UserBackedSerializer(TenantSerializer):
    """Teacher/Student create hote waqt unka login User bhi banata hai."""

    user_role = None
    email = serializers.EmailField(write_only=True, required=False)
    first_name = serializers.CharField(write_only=True, required=False)
    last_name = serializers.CharField(write_only=True, required=False, allow_blank=True)
    password = serializers.CharField(write_only=True, required=False, style={"input_type": "password"})
    profile_photo = serializers.FileField(write_only=True, required=False)
    user = UserSerializer(read_only=True)

    def validate_email(self, value):
        qs = User.objects.filter(email__iexact=value)
        if self.instance is not None and self.instance.user_id:
            qs = qs.exclude(pk=self.instance.user_id)
        if qs.exists():
            raise serializers.ValidationError("An account with this email already exists.")
        return value.lower()

    def validate_password(self, value):
        password_validation.validate_password(value)
        return value

    def validate_profile_photo(self, value):
        return validate_profile_photo_file(value)

    @transaction.atomic
    def create(self, validated_data):
        data = {k: validated_data.pop(k, None) for k in USER_FIELDS}
        profile_photo = data.pop("profile_photo", None)
        missing = {k: "Required." for k in ("email", "first_name", "password") if not data[k]}
        if missing:
            raise serializers.ValidationError(missing)
        user = User.objects.create_user(
            email=data["email"],
            password=data["password"],
            first_name=data["first_name"],
            last_name=data["last_name"] or "",
            role=self.user_role,
            school=validated_data["school"],
        )
        if profile_photo:
            user.profile_photo = profile_photo
            user.save(update_fields=["profile_photo"])
        return super().create({**validated_data, "user": user})

    @transaction.atomic
    def update(self, instance, validated_data):
        data = {k: validated_data.pop(k) for k in USER_FIELDS if k in validated_data}
        user = instance.user
        old_photo = user.profile_photo if data.get("profile_photo") else None
        for k in ("email", "first_name", "last_name"):
            if k in data:
                setattr(user, k, data[k])
        if data.get("profile_photo"):
            user.profile_photo = data["profile_photo"]
        if data.get("password"):
            user.set_password(data["password"])
        if data:
            user.save()
        updated = super().update(instance, validated_data)
        if "is_active" in validated_data:
            updated.user.is_active = validated_data["is_active"]
            updated.user.save(update_fields=["is_active"])
        if old_photo:
            old_photo.delete(save=False)
        return updated


class PdfAttachmentMixin(serializers.Serializer):
    """attachment (PDF upload) + attachment_url (dekhne ka link) + remove_attachment."""

    attachment = serializers.FileField(required=False, allow_null=True, write_only=True, validators=[validate_pdf_file])
    attachment_url = serializers.SerializerMethodField()
    attachment_name = serializers.SerializerMethodField()
    remove_attachment = serializers.BooleanField(required=False, write_only=True, default=False)
    attachment_path = ""

    def get_attachment_url(self, obj):
        return self.attachment_path.format(id=obj.pk) if obj.attachment else None

    def get_attachment_name(self, obj):
        return obj.attachment.name.rsplit("/", 1)[-1] if obj.attachment else ""

    def _apply_attachment(self, validated_data, instance=None):
        remove = validated_data.pop("remove_attachment", False)
        new = validated_data.pop("attachment", None)
        old = instance.attachment if instance is not None and instance.attachment else None
        if new:
            validated_data["attachment"] = new
        elif remove:
            validated_data["attachment"] = ""
        return old if (new or remove) else None

    def create(self, validated_data):
        self._apply_attachment(validated_data)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        old = self._apply_attachment(validated_data, instance)
        obj = super().update(instance, validated_data)
        if old:
            old.storage.delete(old.name)
        return obj
