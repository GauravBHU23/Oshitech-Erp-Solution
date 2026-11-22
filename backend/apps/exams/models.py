import secrets

from django.conf import settings
from django.db import models

from apps.core.models import TenantModel


class Exam(TenantModel):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        SCHEDULED = "scheduled", "Scheduled"
        ONGOING = "ongoing", "Ongoing"
        COMPLETED = "completed", "Completed"

    name = models.CharField(max_length=200)
    course = models.ForeignKey("academics.Course", on_delete=models.CASCADE, related_name="exams")
    academic_year = models.ForeignKey("academics.AcademicYear", on_delete=models.CASCADE, related_name="exams")
    start_date = models.DateField()
    end_date = models.DateField()
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    results_published = models.BooleanField(default=False)
    results_locked = models.BooleanField(default=False)

    class Meta:
        ordering = ["-start_date"]

    def __str__(self):
        return self.name


class ExamSchedule(TenantModel):
    exam = models.ForeignKey(Exam, on_delete=models.CASCADE, related_name="schedules")
    subject = models.ForeignKey("academics.Subject", on_delete=models.CASCADE, related_name="+")
    date = models.DateField()
    start_time = models.TimeField()
    end_time = models.TimeField()
    max_marks = models.PositiveSmallIntegerField(default=100)
    pass_marks = models.PositiveSmallIntegerField(default=33)
    venue = models.CharField(max_length=100, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["exam", "subject"], name="uniq_schedule_subject")]
        ordering = ["date", "start_time"]


def _new_code():
    return secrets.token_hex(6).upper()  # 12 chars, QR me use hoga


class AdmitCard(TenantModel):
    exam = models.ForeignKey(Exam, on_delete=models.CASCADE, related_name="admit_cards")
    student = models.ForeignKey("students.Student", on_delete=models.CASCADE, related_name="admit_cards")
    code = models.CharField(max_length=16, unique=True, default=_new_code, editable=False)
    is_revoked = models.BooleanField(default=False)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["exam", "student"], name="uniq_admit_card")]
        ordering = ["-created_at"]


class Result(TenantModel):
    exam = models.ForeignKey(Exam, on_delete=models.CASCADE, related_name="results")
    student = models.ForeignKey("students.Student", on_delete=models.CASCADE, related_name="results")
    subject = models.ForeignKey("academics.Subject", on_delete=models.CASCADE, related_name="+")
    marks_obtained = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    is_absent = models.BooleanField(default=False)
    remarks = models.CharField(max_length=200, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["exam", "student", "subject"], name="uniq_result")]
        ordering = ["-created_at"]
