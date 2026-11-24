from django.conf import settings
from django.db import models

from apps.core.models import TenantModel


class Attendance(TenantModel):
    class Status(models.TextChoices):
        PRESENT = "present", "Present"
        ABSENT = "absent", "Absent"
        LATE = "late", "Late"
        LEAVE = "leave", "On leave"

    student = models.ForeignKey("students.Student", on_delete=models.CASCADE, related_name="attendance")
    classroom = models.ForeignKey("academics.ClassRoom", on_delete=models.CASCADE, related_name="attendance")
    date = models.DateField(db_index=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PRESENT)
    remarks = models.CharField(max_length=200, blank=True)
    marked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        constraints = [models.UniqueConstraint(fields=["student", "date"], name="uniq_attendance_per_day")]
        ordering = ["-date", "student__admission_no"]

    def __str__(self):
        return f"{self.student_id} {self.date} {self.status}"
