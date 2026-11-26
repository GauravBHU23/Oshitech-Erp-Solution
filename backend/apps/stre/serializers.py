from rest_framework import serializers

from apps.core.serializers import PdfAttachmentMixin

from apps.accounts.pii import decrypt_aadhaar, encrypt_aadhaar
from apps.accounts.serializers import validate_profile_photo_file
from apps.core.validators import normalize_mobile, validate_person_name

from .models import CLASS_LEVEL_CHOICES, StreEmailLog, StreExam, StreNotice, StreRegistration, StreSubject, StreSupportTicket

INTEREST_OPTIONS = [
    "Game Development", "App Development", "Web Development", "Artificial Intelligence", "Robotics",
    "Coding / Programming", "Science Experiments", "Mathematics Olympiad", "Drawing & Painting", "Music",
    "Dance", "Sports", "Reading & Writing", "Public Speaking / Debate", "Photography", "Quiz",
]


class StreExamSerializer(serializers.ModelSerializer):
    registration_count = serializers.IntegerField(source="registrations.count", read_only=True)
    is_accepting = serializers.BooleanField(read_only=True)

    class Meta:
        model = StreExam
        fields = "__all__"
        # Result ON/OFF sirf Results page se (wahan rank + email bhi hota hai)
        read_only_fields = ["id", "created_at", "updated_at", "results_published", "results_published_at"]

    def validate_code(self, value):
        value = value.strip().upper()
        if not value.isalnum():
            raise serializers.ValidationError("Use letters and numbers only, e.g. STRE26.")
        return value

    def validate(self, attrs):
        from django.utils import timezone

        today = timezone.localdate()
        errors = {}
        last = attrs.get("last_date", getattr(self.instance, "last_date", None))
        exam = attrs.get("exam_date", getattr(self.instance, "exam_date", None))
        is_open = attrs.get("registration_open", getattr(self.instance, "registration_open", True))
        if self.instance is None and exam and exam < today:
            errors["exam_date"] = "The exam date cannot be in the past."
        # Naya exam ya last date badli ho: past date par registration kabhi khulega hi nahi
        if is_open and "last_date" in attrs and last and last < today:
            errors["last_date"] = f"The last date has already passed (today is {today:%d %b %Y}). Choose today or a future date, otherwise registration stays closed."
        elif last and exam and last > exam:
            errors["last_date"] = "The last date to register must be on or before the exam date."
        fee = attrs.get("fee", getattr(self.instance, "fee", 0))
        if fee is not None and fee < 0:
            errors["fee"] = "Fee cannot be negative."
        if errors:
            raise serializers.ValidationError(errors)
        return attrs


class StreSubjectSerializer(serializers.ModelSerializer):
    class Meta:
        model = StreSubject
        fields = ["id", "name", "is_active"]

    def validate_name(self, value):
        value = " ".join(value.split())
        qs = StreSubject.objects.filter(name__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("This subject already exists.")
        return value


def _image(value, label, max_mb):
    if value.size > max_mb * 1024 * 1024:
        raise serializers.ValidationError(f"{label} must be {max_mb} MB or smaller.")
    return validate_profile_photo_file(value)


def _capitalize_initials(value):
    result = []
    capitalize_next = True
    for char in value:
        if capitalize_next and char.isalpha():
            result.append(char.upper())
            capitalize_next = False
        else:
            result.append(char)
        if char.isspace() or char in "-'\u2019":
            capitalize_next = True
    return "".join(result)


def _capitalize_registration_text(attrs):
    for field in (
        "first_name", "last_name", "father_name", "school_name", "address",
        "subject", "subject_interest", "aim_of_life",
    ):
        if field in attrs:
            attrs[field] = _capitalize_initials(attrs[field])
    if "interests" in attrs:
        attrs["interests"] = [_capitalize_initials(item) for item in attrs["interests"]]


class StreRegistrationCreateSerializer(serializers.Serializer):
    first_name = serializers.CharField(max_length=100)
    last_name = serializers.CharField(max_length=100)
    email = serializers.EmailField()
    mobile = serializers.CharField(max_length=16)
    father_name = serializers.CharField(max_length=150)
    school_name = serializers.CharField(max_length=200)
    class_level = serializers.ChoiceField(choices=CLASS_LEVEL_CHOICES, error_messages={"invalid_choice": "Select your class or qualification.", "required": "Select your class or qualification."})
    address = serializers.CharField(max_length=500)
    subject = serializers.CharField(max_length=100)
    subject_interest = serializers.CharField(max_length=1000, required=False, allow_blank=True, default="")
    interests = serializers.ListField(child=serializers.CharField(max_length=60), allow_empty=False, max_length=15)
    aim_of_life = serializers.CharField(max_length=1000)
    aadhaar_number = serializers.RegexField(r"^\d{12}$", error_messages={"invalid": "Aadhaar number must have exactly 12 digits."})
    photo = serializers.FileField()
    signature = serializers.FileField()
    email_token = serializers.CharField(write_only=True, required=False, allow_blank=True, default="")

    def validate_first_name(self, value):
        return validate_person_name(value)

    def validate_last_name(self, value):
        return validate_person_name(value)

    def validate_father_name(self, value):
        return validate_person_name(value)

    def validate_school_name(self, value):
        value = " ".join(value.split())
        if len(value) < 3:
            raise serializers.ValidationError("Enter your school's full name.")
        return value

    def validate_address(self, value):
        value = value.strip()
        if len(value) < 10:
            raise serializers.ValidationError("Enter your full address (house, area, city, PIN code).")
        return value

    def validate_mobile(self, value):
        value = normalize_mobile(value)
        if not value:
            raise serializers.ValidationError("This field is required.")
        return value

    def validate_email(self, value):
        return value.strip().lower()

    def validate_subject(self, value):
        value = " ".join(value.split())
        if len(value) < 2:
            raise serializers.ValidationError("Select or type a subject.")
        return value

    def validate_interests(self, value):
        cleaned = []
        for item in value:
            item = " ".join(item.split())
            if item and item.lower() not in [c.lower() for c in cleaned]:
                cleaned.append(item)
        if not cleaned:
            raise serializers.ValidationError("Choose at least one interest or skill.")
        return cleaned

    def validate_aim_of_life(self, value):
        value = value.strip()
        if len(value) < 5:
            raise serializers.ValidationError("Please write a few words about your aim in life.")
        return value

    def validate_photo(self, value):
        return _image(value, "Photo", 2)

    def validate_signature(self, value):
        return _image(value, "Signature", 1)

    def validate(self, attrs):
        from .security import check_email_token

        _capitalize_registration_text(attrs)
        exam = self.context["exam"]
        # Email OTP se verify hua ho tabhi registration
        check_email_token(attrs["email"], attrs.pop("email_token", ""))
        if StreRegistration.objects.filter(exam=exam, email=attrs["email"]).exists():
            raise serializers.ValidationError({"email": "This email is already registered for this exam. Use 'Check status' to see your registration."})
        if StreRegistration.objects.filter(exam=exam, mobile=attrs["mobile"]).exists():
            raise serializers.ValidationError({"mobile": "This mobile number is already registered for this exam."})
        return attrs

    def create(self, validated):
        exam = self.context["exam"]
        aadhaar = validated.pop("aadhaar_number")
        reg = StreRegistration(
            exam=exam,
            amount=exam.fee,
            aadhaar_encrypted=encrypt_aadhaar(aadhaar),
            aadhaar_last4=aadhaar[-4:],
            **validated,
        )
        if exam.fee <= 0:
            reg.status = StreRegistration.Status.PAID
            reg.payment_method = "free"
        reg.save()
        return reg


class StrePublicRegistrationSerializer(serializers.ModelSerializer):
    """Candidate ko dikhne wali jaankari (token ke saath)."""

    full_name = serializers.CharField(read_only=True)
    exam_title = serializers.CharField(source="exam.title", read_only=True)
    exam_date = serializers.DateField(source="exam.exam_date", read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    results_published = serializers.BooleanField(source="exam.results_published", read_only=True)

    class Meta:
        model = StreRegistration
        fields = [
            "results_published", "registration_no", "access_token", "full_name", "email", "mobile", "subject", "exam_title", "exam_date",
            "status", "status_label", "amount", "payment_method", "payment_reference", "paid_at", "roll_no",
            "admit_card_issued_at", "created_at", "payment_attempts", "last_payment_status", "last_payment_error",
        ]


class StreAdminRegistrationSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    exam_title = serializers.CharField(source="exam.title", read_only=True)
    aadhaar_number = serializers.SerializerMethodField()
    photo_url = serializers.SerializerMethodField()
    signature_url = serializers.SerializerMethodField()

    class Meta:
        model = StreRegistration
        exclude = ["aadhaar_encrypted", "access_token", "photo", "signature"]

    def get_aadhaar_number(self, obj):
        try:
            return decrypt_aadhaar(obj.aadhaar_encrypted) if obj.aadhaar_encrypted else ""
        except Exception:  # noqa: BLE001
            return f"XXXX XXXX {obj.aadhaar_last4}"

    def get_photo_url(self, obj):
        return f"/api/v1/stre/admin/registrations/{obj.pk}/file/photo/" if obj.photo else None

    def get_signature_url(self, obj):
        return f"/api/v1/stre/admin/registrations/{obj.pk}/file/signature/" if obj.signature else None


class StreEmailLogSerializer(serializers.ModelSerializer):
    registration_no = serializers.CharField(source="registration.registration_no", read_only=True)
    candidate = serializers.CharField(source="registration.full_name", read_only=True)
    kind_label = serializers.CharField(source="get_kind_display", read_only=True)

    class Meta:
        model = StreEmailLog
        fields = ["id", "registration", "registration_no", "candidate", "batch", "kind", "kind_label", "subject", "to_email", "status", "error", "attempts", "created_at", "sent_at"]
        read_only_fields = fields


class StreAdminRegistrationUpdateSerializer(serializers.Serializer):
    """Admin candidate ki galti theek kar sake. Registration jaisi hi validation."""

    first_name = serializers.CharField(max_length=100, required=False)
    last_name = serializers.CharField(max_length=100, required=False)
    email = serializers.EmailField(required=False)
    mobile = serializers.CharField(max_length=16, required=False)
    father_name = serializers.CharField(max_length=150, required=False)
    school_name = serializers.CharField(max_length=200, required=False)
    class_level = serializers.ChoiceField(choices=CLASS_LEVEL_CHOICES, required=False)
    address = serializers.CharField(max_length=500, required=False)
    subject = serializers.CharField(max_length=100, required=False)
    subject_interest = serializers.CharField(max_length=1000, required=False, allow_blank=True)
    interests = serializers.ListField(child=serializers.CharField(max_length=60), required=False, allow_empty=False, max_length=15)
    aim_of_life = serializers.CharField(max_length=1000, required=False)
    aadhaar_number = serializers.RegexField(r"^\d{12}$", required=False, error_messages={"invalid": "Aadhaar number must have exactly 12 digits."})
    photo = serializers.FileField(required=False)
    signature = serializers.FileField(required=False)
    admin_note = serializers.CharField(max_length=300, required=False, allow_blank=True)

    validate_first_name = StreRegistrationCreateSerializer.validate_first_name
    validate_last_name = StreRegistrationCreateSerializer.validate_last_name
    validate_father_name = StreRegistrationCreateSerializer.validate_father_name
    validate_school_name = StreRegistrationCreateSerializer.validate_school_name
    validate_address = StreRegistrationCreateSerializer.validate_address
    validate_mobile = StreRegistrationCreateSerializer.validate_mobile
    validate_email = StreRegistrationCreateSerializer.validate_email
    validate_subject = StreRegistrationCreateSerializer.validate_subject
    validate_interests = StreRegistrationCreateSerializer.validate_interests
    validate_aim_of_life = StreRegistrationCreateSerializer.validate_aim_of_life
    validate_photo = StreRegistrationCreateSerializer.validate_photo
    validate_signature = StreRegistrationCreateSerializer.validate_signature

    def validate(self, attrs):
        _capitalize_registration_text(attrs)
        reg = self.instance
        others = StreRegistration.objects.filter(exam=reg.exam).exclude(pk=reg.pk)
        if "email" in attrs and others.filter(email=attrs["email"]).exists():
            raise serializers.ValidationError({"email": "Another candidate is already registered with this email for this exam."})
        if "mobile" in attrs and others.filter(mobile=attrs["mobile"]).exists():
            raise serializers.ValidationError({"mobile": "Another candidate is already registered with this mobile number for this exam."})
        return attrs

    def update(self, reg, validated):
        changed = []
        aadhaar = validated.pop("aadhaar_number", None)
        if aadhaar:
            reg.aadhaar_encrypted = encrypt_aadhaar(aadhaar)
            reg.aadhaar_last4 = aadhaar[-4:]
            changed.append("aadhaar_number")
        old_files = []
        for field in ("photo", "signature"):
            if field in validated:
                old = getattr(reg, field)
                if old:
                    old_files.append(old)
                setattr(reg, field, validated.pop(field))
                changed.append(field)
        for field, value in validated.items():
            if getattr(reg, field) != value:
                setattr(reg, field, value)
                changed.append(field)
        reg.save()
        for old in old_files:
            try:
                old.delete(save=False)
            except Exception:  # noqa: BLE001 — purani file na mile to koi baat nahi
                pass
        self.changed_fields = changed
        return reg



class StreSupportCreateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    mobile = serializers.CharField(max_length=16)
    registration_no = serializers.CharField(max_length=30, required=False, allow_blank=True)
    category = serializers.ChoiceField(choices=StreSupportTicket.Category.choices)
    subject = serializers.CharField(max_length=160)
    message = serializers.CharField(max_length=3000)

    validate_name = StreRegistrationCreateSerializer.validate_first_name
    validate_mobile = StreRegistrationCreateSerializer.validate_mobile
    validate_email = StreRegistrationCreateSerializer.validate_email

    def validate_subject(self, value):
        value = " ".join(value.split())
        if len(value) < 3:
            raise serializers.ValidationError("Write a short subject (at least 3 letters).")
        return value

    def validate_message(self, value):
        value = value.strip()
        if len(value) < 10:
            raise serializers.ValidationError("Please describe the problem in at least 10 characters.")
        return value

    def validate_registration_no(self, value):
        return value.strip().upper()

    def create(self, validated):
        reg = None
        if validated.get("registration_no"):
            reg = StreRegistration.objects.filter(registration_no=validated["registration_no"], mobile=validated["mobile"]).first()
        return StreSupportTicket.objects.create(registration=reg, **validated)


class StreSupportTicketSerializer(serializers.ModelSerializer):
    category_label = serializers.CharField(source="get_category_display", read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    linked_registration_id = serializers.UUIDField(source="registration_id", read_only=True)
    linked_candidate = serializers.CharField(source="registration.full_name", read_only=True, default="")

    class Meta:
        model = StreSupportTicket
        fields = [
            "id", "ticket_no", "linked_registration_id", "linked_candidate", "registration_no", "name", "email", "mobile",
            "category", "category_label", "subject", "message", "status", "status_label", "admin_reply", "replied_at",
            "created_at", "updated_at",
        ]
        read_only_fields = [f for f in fields if f not in ("status", "admin_reply")]


class StreNoticeSerializer(PdfAttachmentMixin, serializers.ModelSerializer):
    attachment_path = "/api/v1/stre/notice-files/{id}/"

    class Meta:
        model = StreNotice
        fields = ["id", "title", "body", "is_pinned", "is_active", "publish_on", "expires_on", "created_at", "attachment", "attachment_url", "attachment_name", "remove_attachment"]
        extra_kwargs = {"is_active": {"default": True}}
        read_only_fields = ["id", "created_at"]

    def validate(self, attrs):
        start = attrs.get("publish_on", getattr(self.instance, "publish_on", None))
        end = attrs.get("expires_on", getattr(self.instance, "expires_on", None))
        if start and end and end < start:
            raise serializers.ValidationError({"expires_on": "The hide date must be on or after the publish date."})
        return attrs
