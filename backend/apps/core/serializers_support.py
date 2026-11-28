from rest_framework import serializers

from .models import SupportMessage, SupportRequest


class LiveChatStartSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    phone = serializers.CharField(max_length=20, required=False, allow_blank=True, default="")
    message = serializers.CharField(min_length=1, max_length=4000, trim_whitespace=True)

    def validate_phone(self, value):
        from .validators import normalize_phone
        return normalize_phone(value)


class SupportMessageCreateSerializer(serializers.Serializer):
    body = serializers.CharField(min_length=1, max_length=4000, trim_whitespace=True)


class SupportMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = SupportMessage
        fields = ["id", "sender_type", "sender_name", "body", "created_at"]
        read_only_fields = fields


class SupportRequestCreateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=150, required=False, allow_blank=True, default="")
    phone = serializers.CharField(max_length=20, required=False, allow_blank=True, default="")
    school_code = serializers.CharField(max_length=20, required=False, allow_blank=True, write_only=True)
    email = serializers.EmailField(required=False, allow_blank=True)
    category = serializers.ChoiceField(choices=SupportRequest.Category.choices)
    subject = serializers.CharField(max_length=160)
    message = serializers.CharField(min_length=10, max_length=4000, trim_whitespace=True)

    def validate_phone(self, value):
        from .validators import normalize_phone
        return normalize_phone(value)

    def validate(self, attrs):
        from apps.schools.models import School

        code = attrs.pop("school_code", "").strip()
        user = self.context["request"].user
        if user.is_authenticated:
            attrs["email"] = user.email
            attrs["reporter"] = user
            attrs["role"] = user.role
            attrs["school"] = user.school
        else:
            if not attrs.get("email"):
                raise serializers.ValidationError({"email": "Email is required so the admin can reply."})
            attrs["role"] = "guest"
            if code:
                # Contact form school ke inbox me jaye (school admin dekh sake)
                school = School.objects.filter(code__iexact=code, is_active=True).first()
                if school is None:
                    raise serializers.ValidationError({"school_code": "Enter a valid school code or leave it blank."})
                attrs["school"] = school
        return attrs

    def create(self, validated_data):
        return SupportRequest.objects.create(**validated_data)


class SupportRequestSerializer(serializers.ModelSerializer):
    school_name = serializers.CharField(source="school.name", read_only=True, allow_null=True)

    class Meta:
        model = SupportRequest
        fields = [
            "id", "name", "phone", "email", "role", "school_name", "category", "subject",
            "message", "status", "created_at", "updated_at",
        ]
        read_only_fields = fields


class SupportRequestStatusSerializer(serializers.ModelSerializer):
    class Meta:
        model = SupportRequest
        fields = ["status"]
