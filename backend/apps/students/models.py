import secrets
from datetime import timedelta

from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.core.models import TenantModel

BLOOD_GROUPS = [(g, g) for g in ("A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-")]


class Student(TenantModel):
    class Gender(models.TextChoices):
        MALE = "M", "Male"
        FEMALE = "F", "Female"
        OTHER = "O", "Other"

    class ClassLevel(models.TextChoices):
        CLASS_1 = "1", "Class 1"
        CLASS_2 = "2", "Class 2"
        CLASS_3 = "3", "Class 3"
        CLASS_4 = "4", "Class 4"
        CLASS_5 = "5", "Class 5"
        CLASS_6 = "6", "Class 6"
        CLASS_7 = "7", "Class 7"
        CLASS_8 = "8", "Class 8"
        CLASS_9 = "9", "Class 9"
        CLASS_10 = "10", "Class 10"
        CLASS_11 = "11", "Class 11"
        CLASS_12 = "12", "Class 12"

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="student_profile")
    admission_no = models.CharField(max_length=30)
    roll_no = models.CharField(max_length=20, blank=True)
    class_level = models.CharField(max_length=2, choices=ClassLevel.choices, blank=True)
    classroom = models.ForeignKey(
        "academics.ClassRoom", null=True, blank=True, on_delete=models.SET_NULL, related_name="students"
    )
    date_of_birth = models.DateField(null=True, blank=True)
    gender = models.CharField(max_length=1, choices=Gender.choices, blank=True)
    father_name = models.CharField(max_length=150, blank=True)
    mother_name = models.CharField(max_length=150, blank=True)
    guardian_phone = models.CharField(max_length=15, blank=True)  # parent / guardian contact number
    blood_group = models.CharField(max_length=3, choices=BLOOD_GROUPS, blank=True)
    address = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["school", "admission_no"], name="uniq_admission_per_school")]
        ordering = ["admission_no"]

    def __str__(self):
        return f"{self.admission_no} - {self.user.get_full_name()}"


def _new_card_code():
    return secrets.token_hex(6).upper()


def default_valid_until():
    return timezone.localdate() + timedelta(days=365)


def valid_until_for(school_id):
    """Current academic year ke end tak valid; warna aaj se 1 saal."""
    from apps.academics.models import AcademicYear

    year = (
        AcademicYear.objects.filter(school_id=school_id, is_current=True, end_date__gte=timezone.localdate())
        .order_by("-end_date")
        .first()
    )
    return year.end_date if year else default_valid_until()


class IDCard(TenantModel):
    """Identity card: admission (student) ya joining (teacher) par automatically issue hota hai."""

    class Holder(models.TextChoices):
        STUDENT = "student", "Student"
        TEACHER = "teacher", "Teacher"

    holder_type = models.CharField(max_length=10, choices=Holder.choices)
    student = models.OneToOneField(Student, null=True, blank=True, on_delete=models.CASCADE, related_name="id_card")
    teacher = models.OneToOneField(
        "teachers.Teacher", null=True, blank=True, on_delete=models.CASCADE, related_name="id_card"
    )
    code = models.CharField(max_length=16, unique=True, default=_new_card_code, editable=False)
    issued_on = models.DateField(default=timezone.localdate)
    valid_until = models.DateField(default=default_valid_until)
    is_revoked = models.BooleanField(default=False)

    class Meta:
        ordering = ["-issued_on", "-created_at"]

    @property
    def holder(self):
        return self.student if self.holder_type == self.Holder.STUDENT else self.teacher

    @property
    def is_valid(self):
        holder = self.holder
        return bool(
            not self.is_revoked
            and holder is not None
            and holder.is_active
            and holder.user.is_active
            and self.valid_until >= timezone.localdate()
        )

    def reissue(self):
        self.code = _new_card_code()
        self.issued_on = timezone.localdate()
        self.valid_until = valid_until_for(self.school_id)
        self.is_revoked = False
        self.save()

    def __str__(self):
        holder = self.holder
        return f"ID {self.code} - {holder.user.get_full_name() if holder else ''}".strip(" -")


def issue_id_card(*, student=None, teacher=None):
    """Idempotent: profile ke liye card na ho to naya issue karta hai."""
    holder = student or teacher
    lookup = {"student": student} if student else {"teacher": teacher}
    card, _ = IDCard.objects.get_or_create(
        **lookup,
        defaults={
            "school_id": holder.school_id,
            "holder_type": IDCard.Holder.STUDENT if student else IDCard.Holder.TEACHER,
            "valid_until": valid_until_for(holder.school_id),
        },
    )
    return card


class StudentPromotion(TenantModel):
    """Session change ka record: kaun kis class se kahan gaya (undo aur TC ke liye bhi kaam aata hai)."""

    class Action(models.TextChoices):
        PROMOTED = "promoted", "Promoted"
        DETAINED = "detained", "Detained (repeat class)"
        PASSED_OUT = "passed_out", "Passed out / Left"

    batch = models.UUIDField(db_index=True)
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name="promotions")
    action = models.CharField(max_length=12, choices=Action.choices)
    from_class_level = models.CharField(max_length=2, blank=True)
    to_class_level = models.CharField(max_length=2, blank=True)
    from_classroom = models.ForeignKey("academics.ClassRoom", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    to_classroom = models.ForeignKey("academics.ClassRoom", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    from_roll_no = models.CharField(max_length=20, blank=True)
    from_valid_until = models.DateField(null=True, blank=True)
    academic_year = models.ForeignKey("academics.AcademicYear", on_delete=models.CASCADE, related_name="promotions")
    performed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    undone = models.BooleanField(default=False)

    class Meta:
        ordering = ["-created_at"]


class StudentImportJob(TenantModel):
    """Excel/CSV se bulk admission: background me chalta hai (password hashing slow hai)."""

    class Status(models.TextChoices):
        RUNNING = "running", "Running"
        DONE = "done", "Done"
        FAILED = "failed", "Failed"

    file_name = models.CharField(max_length=200, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.RUNNING)
    total = models.PositiveIntegerField(default=0)
    done = models.PositiveIntegerField(default=0)
    error = models.TextField(blank=True)
    # Naye logins (email + temporary password) — sirf 24 ghante download ke liye, phir mita diye jaate hain
    credentials = models.JSONField(default=list, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")

    class Meta:
        ordering = ["-created_at"]
