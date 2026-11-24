from django.core.validators import MaxValueValidator, MinValueValidator
from django.conf import settings
from django.db import models

from apps.core.models import TenantModel


class Teacher(TenantModel):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="teacher_profile")
    employee_id = models.CharField(max_length=30)
    phone = models.CharField(max_length=15, blank=True)
    qualification = models.CharField(max_length=200, blank=True)
    is_public = models.BooleanField(default=True)
    joining_date = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["school", "employee_id"], name="uniq_teacher_emp_per_school")]
        ordering = ["employee_id"]

    def __str__(self):
        return f"{self.employee_id} - {self.user.get_full_name()}"


class TeacherRating(TenantModel):
    teacher = models.ForeignKey(Teacher, on_delete=models.CASCADE, related_name="ratings")
    student = models.ForeignKey(
        "students.Student", on_delete=models.CASCADE, related_name="teacher_ratings"
    )
    rating = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(5)]
    )
    feedback = models.TextField(blank=True, max_length=2000)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["student", "teacher"], name="uniq_student_teacher_rating")
        ]
        ordering = ["-updated_at"]

    def __str__(self):
        return f"{self.student_id} rated {self.teacher_id}: {self.rating}"
