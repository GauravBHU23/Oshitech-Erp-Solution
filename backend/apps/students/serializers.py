from rest_framework import serializers

from apps.core.roles import Role
from apps.core.serializers import UserBackedSerializer
from apps.core.validators import normalize_mobile, validate_birth_date, validate_person_name

from .models import Student


class StudentSerializer(UserBackedSerializer):
    user_role = Role.STUDENT
    class_level = serializers.ChoiceField(choices=Student.ClassLevel.choices)
    classroom_name = serializers.SerializerMethodField()

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.instance is not None:
            self.fields["class_level"].required = False
            self.fields["class_level"].allow_blank = True
            self.fields["class_level"].allow_null = True

    def get_classroom_name(self, obj):
        return str(obj.classroom) if obj.classroom_id else ""

    def validate_father_name(self, value):
        return validate_person_name(value, required=False)

    def validate_mother_name(self, value):
        return validate_person_name(value, required=False)

    def validate_guardian_phone(self, value):
        return normalize_mobile(value)

    def validate_date_of_birth(self, value):
        return validate_birth_date(value)

    def validate_class_level(self, value):
        return "" if value is None else value

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if self.instance is None:
            # Naye admission par father aur mother dono ka naam zaroori hai
            missing = {f: "This field is required." for f in ("father_name", "mother_name") if not str(attrs.get(f, "")).strip()}
            if missing:
                raise serializers.ValidationError(missing)
        else:
            for f in ("father_name", "mother_name"):
                if f in attrs and not str(attrs[f]).strip() and getattr(self.instance, f):
                    raise serializers.ValidationError({f: "This field cannot be cleared."})
        classroom = attrs.get("classroom", getattr(self.instance, "classroom", None))
        if classroom is not None and "classroom" in attrs:
            limit = classroom.capacity or 0
            taken = classroom.students.exclude(pk=getattr(self.instance, "pk", None)).count()
            if limit and taken >= limit:
                raise serializers.ValidationError({"classroom": f"This classroom is full ({limit} students)."})
        return attrs

    class Meta:
        model = Student
        fields = "__all__"
        read_only_fields = ["id", "school", "created_at", "updated_at"]
