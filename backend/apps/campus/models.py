import secrets
from decimal import Decimal

from django.conf import settings
from django.db import models
from django.db.models import Sum
from django.utils import timezone

from apps.core.models import TenantModel


class Notice(TenantModel):
    """Notice board / circular / holiday / event."""

    class Category(models.TextChoices):
        NOTICE = "notice", "Notice"
        CIRCULAR = "circular", "Circular"
        HOLIDAY = "holiday", "Holiday"
        EVENT = "event", "Event"
        EXAM = "exam", "Exam"

    class Audience(models.TextChoices):
        ALL = "all", "Everyone"
        STUDENTS = "students", "Students"
        TEACHERS = "teachers", "Teachers"
        STAFF = "staff", "All staff"

    title = models.CharField(max_length=200)
    body = models.TextField(max_length=5000, blank=True)
    category = models.CharField(max_length=10, choices=Category.choices, default=Category.NOTICE)
    audience = models.CharField(max_length=10, choices=Audience.choices, default=Audience.ALL)
    class_level = models.CharField(max_length=2, blank=True, help_text="Blank = all classes")
    event_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    attachment = models.FileField(upload_to="notices/%Y/%m/", blank=True)  # PDF circular / notice
    publish_on = models.DateField(default=timezone.localdate)
    expires_on = models.DateField(null=True, blank=True)
    is_pinned = models.BooleanField(default=False)
    is_public = models.BooleanField(default=False, help_text="Show on the public website homepage")
    published_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")

    class Meta:
        ordering = ["-is_pinned", "-publish_on", "-created_at"]

    def __str__(self):
        return self.title


class TimetableEntry(TenantModel):
    class Day(models.IntegerChoices):
        MONDAY = 1, "Monday"
        TUESDAY = 2, "Tuesday"
        WEDNESDAY = 3, "Wednesday"
        THURSDAY = 4, "Thursday"
        FRIDAY = 5, "Friday"
        SATURDAY = 6, "Saturday"

    classroom = models.ForeignKey("academics.ClassRoom", on_delete=models.CASCADE, related_name="timetable")
    day = models.PositiveSmallIntegerField(choices=Day.choices)
    period = models.PositiveSmallIntegerField()
    start_time = models.TimeField()
    end_time = models.TimeField()
    subject = models.ForeignKey("academics.Subject", on_delete=models.CASCADE, related_name="+")
    teacher = models.ForeignKey("teachers.Teacher", null=True, blank=True, on_delete=models.SET_NULL, related_name="timetable")
    room = models.CharField(max_length=50, blank=True)

    class Meta:
        ordering = ["day", "period"]
        constraints = [models.UniqueConstraint(fields=["classroom", "day", "period"], name="uniq_timetable_slot")]

    def __str__(self):
        return f"{self.get_day_display()} P{self.period} {self.subject}"


class Homework(TenantModel):
    classroom = models.ForeignKey("academics.ClassRoom", on_delete=models.CASCADE, related_name="homework")
    subject = models.ForeignKey("academics.Subject", on_delete=models.CASCADE, related_name="+")
    title = models.CharField(max_length=200)
    description = models.TextField(max_length=5000, blank=True)
    assigned_on = models.DateField(default=timezone.localdate)
    due_date = models.DateField()
    assigned_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")

    class Meta:
        ordering = ["-assigned_on", "-created_at"]

    def __str__(self):
        return self.title


class LeaveRequest(TenantModel):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    applicant = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="leave_requests")
    applicant_role = models.CharField(max_length=20, editable=False)
    student = models.ForeignKey("students.Student", null=True, blank=True, on_delete=models.CASCADE, related_name="leave_requests")
    from_date = models.DateField()
    to_date = models.DateField()
    reason = models.TextField(max_length=2000)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    reviewed_at = models.DateTimeField(null=True, blank=True)
    review_note = models.CharField(max_length=300, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Leave {self.applicant_id} {self.from_date}"


class FeeStructure(TenantModel):
    name = models.CharField(max_length=150)
    academic_year = models.ForeignKey("academics.AcademicYear", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    class_level = models.CharField(max_length=2, blank=True, help_text="Blank = all classes")
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    due_date = models.DateField()
    description = models.CharField(max_length=300, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["due_date", "name"]

    def __str__(self):
        return self.name


def _invoice_no():
    return "INV-" + secrets.token_hex(4).upper()


def _receipt_no():
    return "RCT-" + secrets.token_hex(4).upper()


class FeeInvoice(TenantModel):
    student = models.ForeignKey("students.Student", on_delete=models.CASCADE, related_name="fee_invoices")
    fee_structure = models.ForeignKey(FeeStructure, null=True, blank=True, on_delete=models.SET_NULL, related_name="invoices")
    invoice_no = models.CharField(max_length=20, unique=True, default=_invoice_no, editable=False)
    title = models.CharField(max_length=150)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    discount = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0"))
    fine = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0"))
    due_date = models.DateField()
    notes = models.CharField(max_length=300, blank=True)

    class Meta:
        ordering = ["-due_date", "-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["student", "fee_structure"], condition=models.Q(fee_structure__isnull=False), name="uniq_invoice_per_structure")
        ]

    @property
    def total(self):
        return (self.amount or 0) - (self.discount or 0) + (self.fine or 0)

    @property
    def paid(self):
        if "_paid_total" in self.__dict__:
            return self._paid_total or Decimal("0")
        return self.payments.aggregate(total=Sum("amount"))["total"] or Decimal("0")

    @property
    def balance(self):
        return self.total - self.paid

    @property
    def status(self):
        paid = self.paid
        if paid >= self.total:
            return "paid"
        if paid > 0:
            return "partial"
        if self.due_date < timezone.localdate():
            return "overdue"
        return "unpaid"

    def __str__(self):
        return f"{self.invoice_no} {self.title}"


class FeePayment(TenantModel):
    class Mode(models.TextChoices):
        CASH = "cash", "Cash"
        UPI = "upi", "UPI"
        CARD = "card", "Card"
        BANK = "bank", "Bank transfer"
        CHEQUE = "cheque", "Cheque"
        ONLINE = "online", "Online"

    invoice = models.ForeignKey(FeeInvoice, on_delete=models.CASCADE, related_name="payments")
    receipt_no = models.CharField(max_length=20, unique=True, default=_receipt_no, editable=False)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    paid_on = models.DateField(default=timezone.localdate)
    mode = models.CharField(max_length=10, choices=Mode.choices, default=Mode.CASH)
    reference = models.CharField(max_length=100, blank=True)
    received_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")

    class Meta:
        ordering = ["-paid_on", "-created_at"]

    def __str__(self):
        return self.receipt_no
