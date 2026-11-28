from django.contrib.auth import get_user_model
from PIL import Image
from rest_framework import serializers
from django.contrib.auth.hashers import make_password

from apps.academics.models import AcademicYear, Course
from apps.schools.models import School
from apps.teachers.models import Teacher
from apps.core.roles import Role
from .models import RegistrationRequest
from .pii import encrypt_aadhaar, decrypt_aadhaar
from apps.core.validators import normalize_mobile, validate_birth_date, validate_person_name
from apps.core.demographics import CASTE_CATEGORY_CHOICES, STATE_CHOICES

MAX_IMAGE_DIMENSION = 4000  # pixels, either side

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    profile_photo = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "email", "first_name", "last_name", "role", "school", "phone", "profile_photo"]
        read_only_fields = fields

    def get_profile_photo(self, obj):
        return f"/api/v1/auth/profile-photos/{obj.pk}/" if obj.profile_photo else None


def validate_profile_photo_file(value):
    if value.size > 5 * 1024 * 1024:
        raise serializers.ValidationError("Image must be 5 MB or smaller.")
    header = value.read(12)
    value.seek(0)
    valid = (
        header.startswith(b"\xff\xd8\xff")
        or header.startswith(b"\x89PNG\r\n\x1a\n")
        or header.startswith((b"GIF87a", b"GIF89a"))
        or (header.startswith(b"RIFF") and header[8:12] == b"WEBP")
    )
    if not valid:
        raise serializers.ValidationError("Upload a JPG, PNG, GIF, or WebP image.")
    # Decode it: rejects corrupt files and decompression-bomb-style images whose
    # magic bytes are valid but whose declared pixel dimensions are absurd.
    try:
        with Image.open(value) as img:
            img.verify()
        value.seek(0)
        with Image.open(value) as img:
            width, height = img.size
    except Exception as exc:  # noqa: BLE001 — any decode failure means a bad/unsafe image
        raise serializers.ValidationError("This image file is corrupted or unsupported.") from exc
    finally:
        value.seek(0)
    if width > MAX_IMAGE_DIMENSION or height > MAX_IMAGE_DIMENSION:
        raise serializers.ValidationError(f"Image dimensions must be {MAX_IMAGE_DIMENSION}×{MAX_IMAGE_DIMENSION} pixels or smaller.")
    return value


class AccountDirectorySerializer(serializers.ModelSerializer):
    profile_photo = serializers.SerializerMethodField()
    school_name = serializers.SerializerMethodField()
    profile_reference = serializers.SerializerMethodField()
    profile_active = serializers.SerializerMethodField()
    classroom_name = serializers.SerializerMethodField()
    teacher_assignments = serializers.SerializerMethodField()
    profile_id = serializers.SerializerMethodField()
    profile_details = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "email", "first_name", "last_name", "phone", "profile_photo", "role", "school", "school_name", "is_active", "last_login", "date_joined", "profile_reference", "profile_active", "classroom_name", "teacher_assignments", "profile_id", "profile_details"]
        read_only_fields = fields

    def get_school_name(self, obj):
        return obj.school.name if obj.school_id else "Platform"

    def get_profile_photo(self, obj):
        return f"/api/v1/auth/profile-photos/{obj.pk}/" if obj.profile_photo else None

    def get_profile_reference(self, obj):
        if obj.role == Role.STUDENT:
            profile = getattr(obj, "student_profile", None)
            return profile.admission_no if profile else ""
        if obj.role == Role.TEACHER:
            profile = getattr(obj, "teacher_profile", None)
            return profile.employee_id if profile else ""
        return ""

    def get_profile_active(self, obj):
        if obj.role == Role.STUDENT:
            profile = getattr(obj, "student_profile", None)
            return profile.is_active if profile else False
        if obj.role == Role.TEACHER:
            profile = getattr(obj, "teacher_profile", None)
            return profile.is_active if profile else False
        return obj.is_active

    def get_classroom_name(self, obj):
        if obj.role != Role.STUDENT:
            return ""
        profile = getattr(obj, "student_profile", None)
        return str(profile.classroom) if profile and profile.classroom_id else ""

    def get_teacher_assignments(self, obj):
        if obj.role != Role.TEACHER:
            return []
        profile = getattr(obj, "teacher_profile", None)
        if not profile:
            return []
        return [f"{assignment.classroom.course.name} · {assignment.classroom} · {assignment.subject.name}" for assignment in profile.assignments.all()]

    def get_profile_id(self, obj):
        if obj.role == Role.STUDENT:
            profile = getattr(obj, "student_profile", None)
        elif obj.role == Role.TEACHER:
            profile = getattr(obj, "teacher_profile", None)
        else:
            profile = None
        return str(profile.pk) if profile else ""

    def get_profile_details(self, obj):
        if obj.role == Role.STUDENT:
            profile = getattr(obj, "student_profile", None)
            if not profile:
                return {}
            return {
                "admission_no": profile.admission_no,
                "roll_no": profile.roll_no,
                "class_level": profile.class_level,
                "classroom": str(profile.classroom) if profile.classroom_id else "",
                "date_of_birth": profile.date_of_birth,
                "gender": profile.get_gender_display() if profile.gender else "",
                "caste_category": profile.get_caste_category_display() if profile.caste_category else "",
                "state": profile.get_state_code_display() if profile.state_code else "",
                "father_name": profile.father_name,
                "mother_name": profile.mother_name,
                "guardian_phone": profile.guardian_phone,
                "address": profile.address,
                "profile_active": profile.is_active,
            }
        if obj.role == Role.TEACHER:
            profile = getattr(obj, "teacher_profile", None)
            if not profile:
                return {}
            return {
                "employee_id": profile.employee_id,
                "qualification": profile.qualification,
                "joining_date": profile.joining_date,
                "public_profile": profile.is_public,
                "profile_active": profile.is_active,
            }
        return {}


class CreateTeacherProfileSerializer(serializers.Serializer):
    employee_id = serializers.CharField(max_length=30)
    qualification = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")
    joining_date = serializers.DateField(required=False, allow_null=True, default=None)

    def validate_employee_id(self, value):
        employee_id = value.strip()
        school_id = self.context["school_id"]
        if Teacher.objects.filter(school_id=school_id, employee_id=employee_id).exists():
            raise serializers.ValidationError("This employee ID is already in use at this school.")
        return employee_id


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, style={"input_type": "password"})
    portal_role = serializers.ChoiceField(choices=Role.choices, required=False)
    captcha_id = serializers.UUIDField()
    captcha = serializers.CharField(max_length=10, trim_whitespace=True)
    turnstile_token = serializers.CharField(max_length=2048, trim_whitespace=True)


class PasswordChangeSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True, trim_whitespace=False)
    new_password = serializers.CharField(write_only=True, trim_whitespace=False)


class SelfProfileUpdateSerializer(serializers.Serializer):
    first_name = serializers.CharField(max_length=150, required=False)
    last_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    phone = serializers.CharField(max_length=15, required=False, allow_blank=True)
    profile_photo = serializers.FileField(required=False)
    qualification = serializers.CharField(max_length=200, required=False, allow_blank=True)
    is_public = serializers.BooleanField(required=False)

    def validate_profile_photo(self, value):
        return validate_profile_photo_file(value)

    def validate_phone(self, value):
        return normalize_mobile(value)


class RegistrationRequestCreateSerializer(serializers.Serializer):
    school_code = serializers.CharField(max_length=20)
    role = serializers.ChoiceField(choices=[Role.STUDENT, Role.TEACHER])
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)
    first_name = serializers.CharField(max_length=150)
    last_name = serializers.CharField(max_length=150, required=False, allow_blank=True, default="")
    phone = serializers.CharField(max_length=15, required=False, allow_blank=True, default="")
    profile_photo = serializers.FileField(required=False)
    class_level = serializers.ChoiceField(choices=[(str(number), f"Class {number}") for number in range(1, 13)], required=False)
    date_of_birth = serializers.DateField(required=False)
    gender = serializers.ChoiceField(choices=["M", "F", "O"], required=False, allow_blank=True, default="")
    caste_category = serializers.ChoiceField(choices=CASTE_CATEGORY_CHOICES, required=False, allow_blank=True, default="")
    state_code = serializers.ChoiceField(choices=STATE_CHOICES, required=False, allow_blank=True, default="")
    father_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    mother_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    guardian_phone = serializers.CharField(max_length=15, required=False, allow_blank=True)
    address = serializers.CharField(required=False, allow_blank=True)
    aadhaar_number = serializers.RegexField(regex=r"^\d{12}$", required=False, allow_blank=True, write_only=True)
    course_id = serializers.UUIDField(required=False)
    academic_year_id = serializers.UUIDField(required=False)
    qualification = serializers.CharField(max_length=200, required=False, allow_blank=True)
    course_ids = serializers.ListField(child=serializers.UUIDField(), required=False, allow_empty=True)

    def validate_profile_photo(self, value):
        return validate_profile_photo_file(value)

    def validate_phone(self, value):
        return normalize_mobile(value)

    def validate_guardian_phone(self, value):
        return normalize_mobile(value)

    def validate_date_of_birth(self, value):
        return validate_birth_date(value)

    def validate_first_name(self, value):
        return validate_person_name(value)

    def validate_last_name(self, value):
        return validate_person_name(value, required=False)

    def validate_father_name(self, value):
        return validate_person_name(value)

    def validate_mother_name(self, value):
        return validate_person_name(value)

    def validate_password(self, value):
        from django.contrib.auth import password_validation
        password_validation.validate_password(value)
        return value

    def validate(self, attrs):
        attrs["email"] = attrs["email"].lower()
        school = School.objects.filter(code__iexact=attrs["school_code"], is_active=True).first()
        if not school:
            raise serializers.ValidationError({"school_code": "Enter a valid code for an active school."})
        if User.objects.filter(email__iexact=attrs["email"]).exists():
            raise serializers.ValidationError({"email": "An account with this email already exists."})
        if RegistrationRequest.objects.filter(email=attrs["email"], status=RegistrationRequest.Status.PENDING).exists():
            raise serializers.ValidationError({"email": "A registration request for this email is already pending review."})
        details = {}
        if attrs["role"] == Role.STUDENT:
            required = ["last_name", "date_of_birth", "class_level", "gender", "caste_category", "state_code", "father_name", "mother_name", "guardian_phone", "address"]
            # Course / academic year tabhi zaroori jab school ne unhe set kiya ho
            if Course.objects.filter(school=school, is_active=True).exists():
                required.append("course_id")
            if AcademicYear.objects.filter(school=school).exists():
                required.append("academic_year_id")
            missing = [name for name in required if not str(attrs.get(name) or "").strip()]
            if missing:
                raise serializers.ValidationError({name: "This field is required." for name in missing})
            course = Course.objects.filter(pk=attrs["course_id"], school=school, is_active=True).first() if attrs.get("course_id") else None
            year = AcademicYear.objects.filter(pk=attrs["academic_year_id"], school=school).first() if attrs.get("academic_year_id") else None
            if attrs.get("course_id") and not course:
                raise serializers.ValidationError({"course_id": "Select an active course from this school."})
            if attrs.get("academic_year_id") and not year:
                raise serializers.ValidationError({"academic_year_id": "Select an academic year from this school."})
            details = {"date_of_birth": attrs["date_of_birth"].isoformat(), "class_level": attrs["class_level"], "gender": attrs.get("gender", ""), "caste_category": attrs["caste_category"], "state_code": attrs["state_code"], "father_name": attrs["father_name"].strip(), "mother_name": attrs["mother_name"].strip(), "guardian_phone": attrs["guardian_phone"], "address": attrs["address"]}
            if course:
                details.update({"course_id": str(course.pk), "course_name": course.name})
            if year:
                details.update({"academic_year_id": str(year.pk), "academic_year_name": year.name})
            if attrs.get("aadhaar_number"):
                details["aadhaar_encrypted"] = encrypt_aadhaar(attrs["aadhaar_number"])
        else:
            missing = [name for name in ("phone", "qualification") if not attrs.get(name)]
            if missing:
                raise serializers.ValidationError({name: "This field is required." for name in missing})
            courses = Course.objects.filter(pk__in=attrs.get("course_ids", []), school=school, is_active=True)
            if not attrs.get("course_ids") or courses.count() != len(set(attrs["course_ids"])):
                raise serializers.ValidationError({"course_ids": "Select at least one active course from this school."})
            details = {"qualification": attrs["qualification"], "course_ids": [str(course.pk) for course in courses], "course_names": [course.name for course in courses]}
        attrs["school"] = school
        attrs["details"] = details
        return attrs

    def create(self, validated_data):
        return RegistrationRequest.objects.create(
            school=validated_data["school"], role=validated_data["role"], email=validated_data["email"],
            first_name=validated_data["first_name"], last_name=validated_data.get("last_name", ""),
            phone=validated_data.get("phone", ""), password_hash=make_password(validated_data["password"]),
            details=validated_data["details"], profile_photo=validated_data.get("profile_photo"),
        )


class RegistrationRequestReadSerializer(serializers.ModelSerializer):
    school_name = serializers.CharField(source="school.name", read_only=True)
    profile_photo = serializers.SerializerMethodField()

    class Meta:
        model = RegistrationRequest
        fields = ["id", "school", "school_name", "role", "email", "first_name", "last_name", "phone", "profile_photo", "details", "status", "created_at", "reviewed_at"]
        read_only_fields = fields

    def get_profile_photo(self, obj):
        return f"/api/v1/auth/registration-photos/{obj.pk}/" if obj.profile_photo else None

    def to_representation(self, instance):
        data = super().to_representation(instance)
        details = data.get("details") or {}
        encrypted = details.pop("aadhaar_encrypted", None)
        if encrypted:
            details["aadhaar_number"] = decrypt_aadhaar(encrypted)
        data["details"] = details
        return data
