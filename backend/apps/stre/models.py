"""STRE (Student Talent Recognition Exam) — school ERP se bilkul alag, apna registration aur admin portal."""
import secrets
import uuid
from decimal import Decimal

from django.db import models
from django.utils import timezone

from apps.core.demographics import CASTE_CATEGORY_CHOICES, STATE_CHOICES


def _upload(instance, filename, kind):
    ext = (filename.rsplit(".", 1)[-1] if "." in filename else "jpg").lower()[:5]
    return f"stre/{instance.exam_id}/{kind}/{uuid.uuid4().hex}.{ext}"


def photo_path(instance, filename):
    return _upload(instance, filename, "photo")


def signature_path(instance, filename):
    return _upload(instance, filename, "signature")


class StreExam(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=200, default="Student Talent Recognition Exam")
    code = models.CharField(max_length=20, unique=True, help_text="Short code used in registration numbers, e.g. STRE26")
    exam_date = models.DateField()
    reporting_time = models.TimeField(null=True, blank=True)
    exam_time = models.CharField(max_length=60, blank=True, help_text="e.g. 10:00 AM – 12:00 PM")
    venue = models.TextField(blank=True)
    fee = models.DecimalField(max_digits=8, decimal_places=2, default=Decimal("0"))
    last_date = models.DateField(help_text="Last date to register")
    registration_open = models.BooleanField(default=True)
    # Default band: admin khud tay karta hai kise admit card issue karna hai
    auto_admit_card = models.BooleanField(
        default=False, help_text="Issue the admit card and email it automatically as soon as the fee is paid"
    )
    instructions = models.TextField(blank=True)
    # Result
    total_marks = models.PositiveSmallIntegerField(default=100)
    merit_count = models.PositiveSmallIntegerField(default=10, help_text="Top ranks that get a Certificate of Merit")
    results_published = models.BooleanField(default=False)
    results_published_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-exam_date"]

    def __str__(self):
        return f"{self.title} ({self.code})"

    @property
    def is_accepting(self):
        return self.registration_open and self.last_date >= timezone.localdate()


class StreExamSlot(models.Model):
    """Ek exam ke multiple time-slots (e.g. Slot 1: 10 AM, Slot 2: 2 PM). Candidate registration
    ke time ek slot choose karta hai."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    exam = models.ForeignKey(StreExam, on_delete=models.CASCADE, related_name="slots")
    label = models.CharField(max_length=60, help_text="e.g. Slot 1")
    reporting_time = models.TimeField(null=True, blank=True)
    slot_time = models.CharField(max_length=60, blank=True, help_text="e.g. 10:00 AM – 12:00 PM")
    venue = models.TextField(blank=True, help_text="Leave blank to use the exam's main venue")
    is_active = models.BooleanField(default=True, help_text="Show this slot to candidates during registration")

    class Meta:
        ordering = ["label"]

    def __str__(self):
        return f"{self.exam.code} — {self.label}"


class StreSubject(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100, unique=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


def _token():
    return secrets.token_urlsafe(24)


# Class 1-12 ke baad college-level candidates: value "grad"/"pg" DB me, label UI/PDF me
CLASS_LEVEL_CHOICES = [(str(n), f"Class {n}") for n in range(1, 13)] + [
    ("grad", "Graduation"),
    ("pg", "Post-Graduation"),
]
COLLEGE_LEVELS = {"11", "12", "grad", "pg"}
GENDER_CHOICES = [
    ("male", "Male"),
    ("female", "Female"),
    ("other", "Other"),
]
def class_level_label(value):
    return dict(CLASS_LEVEL_CHOICES).get(value, "")


class StreRegistration(models.Model):
    class Status(models.TextChoices):
        PAYMENT_PENDING = "payment_pending", "Payment pending"
        PAYMENT_SUBMITTED = "payment_submitted", "Payment submitted (verify)"
        PAID = "paid", "Paid"
        ADMIT_CARD_ISSUED = "admit_card_issued", "Admit card issued"
        CANCELLED = "cancelled", "Cancelled"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    exam = models.ForeignKey(StreExam, on_delete=models.PROTECT, related_name="registrations")
    slot = models.ForeignKey(StreExamSlot, on_delete=models.SET_NULL, null=True, blank=True, related_name="registrations")
    registration_no = models.CharField(max_length=30, unique=True, editable=False)
    access_token = models.CharField(max_length=64, unique=True, default=_token, editable=False)

    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    email = models.EmailField()
    mobile = models.CharField(max_length=10)
    father_name = models.CharField(max_length=150)
    gender = models.CharField(max_length=10, choices=GENDER_CHOICES, blank=True, default="")
    caste_category = models.CharField(max_length=10, choices=CASTE_CATEGORY_CHOICES, blank=True, default="")
    state_code = models.CharField(max_length=2, choices=STATE_CHOICES, blank=True, default="")
    school_name = models.CharField(max_length=200, blank=True, help_text="School, or college/university for Class 11+ candidates")
    class_level = models.CharField(max_length=4, blank=True, choices=CLASS_LEVEL_CHOICES)
    address = models.TextField(max_length=500, blank=True)
    subject = models.CharField(max_length=100)
    subject_interest = models.TextField(max_length=1000, blank=True)
    interests = models.JSONField(default=list, blank=True)
    aim_of_life = models.TextField(max_length=1000)
    aadhaar_encrypted = models.TextField(blank=True)
    aadhaar_last4 = models.CharField(max_length=4, blank=True)
    photo = models.FileField(upload_to=photo_path)
    signature = models.FileField(upload_to=signature_path)

    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PAYMENT_PENDING, db_index=True)
    amount = models.DecimalField(max_digits=8, decimal_places=2, default=Decimal("0"))
    payment_method = models.CharField(max_length=20, blank=True)  # razorpay / upi / free / offline
    payment_reference = models.CharField(max_length=100, blank=True)
    razorpay_order_id = models.CharField(max_length=60, blank=True)
    razorpay_payment_id = models.CharField(max_length=60, blank=True)
    gateway_order_id = models.CharField(max_length=60, blank=True, db_index=True)  # Cashfree order id
    gateway_payment_id = models.CharField(max_length=60, blank=True)
    payment_attempts = models.PositiveSmallIntegerField(default=0)
    last_payment_status = models.CharField(max_length=20, blank=True)  # started / failed / pending / cancelled
    last_payment_error = models.CharField(max_length=300, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)

    roll_no = models.CharField(max_length=30, blank=True, db_index=True)
    admit_card_issued_at = models.DateTimeField(null=True, blank=True)
    admit_card_sent_at = models.DateTimeField(null=True, blank=True)
    admin_note = models.CharField(max_length=300, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["exam", "email"], name="stre_one_registration_per_email"),
            models.UniqueConstraint(fields=["exam", "mobile"], name="stre_one_registration_per_mobile"),
        ]

    def __str__(self):
        return f"{self.registration_no} {self.full_name}"

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}".strip()

    @property
    def is_paid(self):
        return self.status in (self.Status.PAID, self.Status.ADMIT_CARD_ISSUED)

    def save(self, *args, **kwargs):
        if not self.registration_no:
            # STRE26-000123 (exam code + sequence)
            last = StreRegistration.objects.filter(exam=self.exam).order_by("-created_at").values_list("registration_no", flat=True).first()
            seq = int(last.rsplit("-", 1)[-1]) + 1 if last else 1
            while StreRegistration.objects.filter(registration_no=f"{self.exam.code}-{seq:06d}").exists():
                seq += 1
            self.registration_no = f"{self.exam.code}-{seq:06d}"
        super().save(*args, **kwargs)

    def mark_paid(self, method, reference=""):
        # Roll number ab payment par hi ban jaata hai; admit card tabhi 'issued' jab admin (ya auto setting) issue kare
        self.status = self.Status.ADMIT_CARD_ISSUED if self.admit_card_issued_at else self.Status.PAID
        self.payment_method = method
        if reference:
            self.payment_reference = reference
        self.paid_at = timezone.now()
        self.save()



class StreEmailLog(models.Model):
    """Har STRE email ka record: fail ho to admin dobara bhej sake."""

    class Kind(models.TextChoices):
        REGISTRATION = "registration", "Registration received"
        PAYMENT = "payment", "Payment confirmed"
        ADMIT_CARD = "admit_card", "Admit card"
        RESULT = "result", "Result"
        ANNOUNCEMENT = "announcement", "Announcement"

    class Status(models.TextChoices):
        QUEUED = "queued", "Queued"
        SENT = "sent", "Sent"
        FAILED = "failed", "Failed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    registration = models.ForeignKey(StreRegistration, on_delete=models.CASCADE, related_name="email_logs")
    batch = models.UUIDField(null=True, blank=True, db_index=True)
    kind = models.CharField(max_length=20, choices=Kind.choices)
    subject = models.CharField(max_length=200, blank=True)
    message = models.TextField(blank=True, max_length=5000)  # announcement ka text
    to_email = models.EmailField()
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.QUEUED, db_index=True)
    error = models.CharField(max_length=500, blank=True)
    attempts = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.kind} -> {self.to_email} ({self.status})"


class StreSupportTicket(models.Model):
    """Candidate ki samasya (support request) — STRE admin solve karta hai."""

    class Category(models.TextChoices):
        CORRECTION = "correction", "Correction in my registration"
        PAYMENT = "payment", "Payment problem"
        ADMIT_CARD = "admit_card", "Admit card problem"
        OTHER = "other", "Other question"

    class Status(models.TextChoices):
        OPEN = "open", "Open"
        IN_PROGRESS = "in_progress", "In progress"
        RESOLVED = "resolved", "Resolved"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    ticket_no = models.CharField(max_length=20, unique=True, editable=False)
    registration = models.ForeignKey(StreRegistration, null=True, blank=True, on_delete=models.SET_NULL, related_name="support_tickets")
    registration_no = models.CharField(max_length=30, blank=True)
    name = models.CharField(max_length=150)
    email = models.EmailField()
    mobile = models.CharField(max_length=10)
    category = models.CharField(max_length=20, choices=Category.choices, default=Category.OTHER)
    subject = models.CharField(max_length=160)
    message = models.TextField(max_length=3000)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.OPEN, db_index=True)
    admin_reply = models.TextField(max_length=3000, blank=True)
    replied_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def save(self, *args, **kwargs):
        if not self.ticket_no:
            n = StreSupportTicket.objects.count() + 1
            while StreSupportTicket.objects.filter(ticket_no=f"STRE-T{n:05d}").exists():
                n += 1
            self.ticket_no = f"STRE-T{n:05d}"
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.ticket_no} {self.subject}"


class StreNotice(models.Model):
    """STRE notices: registration / status page aur home page par dikhte hain."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=200)
    body = models.TextField(max_length=3000, blank=True)
    attachment = models.FileField(upload_to="stre/notices/%Y/%m/", blank=True)  # PDF (syllabus, notice waghera)
    is_pinned = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    publish_on = models.DateField(default=timezone.localdate)
    expires_on = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-is_pinned", "-publish_on", "-created_at"]

    def __str__(self):
        return self.title


class StreEmailOtp(models.Model):
    """Registration se pehle email verify karne ka OTP (hash me save hota hai)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(db_index=True)
    code_hash = models.CharField(max_length=64)
    attempts = models.PositiveSmallIntegerField(default=0)
    verified = models.BooleanField(default=False)
    expires_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]


class StreCaptcha(models.Model):
    """Status / admit card ke liye captcha (ek baar use)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    answer_hash = models.CharField(max_length=64)
    expires_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)



def _certificate_code():
    return secrets.token_hex(5).upper()


class StreResult(models.Model):
    """Ek candidate ka result. Rank publish par (aur baad me har badlav par) apne aap nikalti hai."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    registration = models.OneToOneField(StreRegistration, on_delete=models.CASCADE, related_name="result")
    exam = models.ForeignKey(StreExam, on_delete=models.CASCADE, related_name="results")
    marks = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    is_absent = models.BooleanField(default=False)
    rank = models.PositiveIntegerField(null=True, blank=True)
    certificate_code = models.CharField(max_length=12, unique=True, default=_certificate_code, editable=False)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["rank", "-marks"]

    @property
    def percentage(self):
        if self.marks is None or not self.exam.total_marks:
            return None
        return round(float(self.marks) * 100 / self.exam.total_marks, 2)

    @property
    def award(self):
        if self.is_absent or self.marks is None:
            return ""
        if self.rank and self.rank <= self.exam.merit_count:
            return "Certificate of Merit"
        return "Certificate of Participation"
