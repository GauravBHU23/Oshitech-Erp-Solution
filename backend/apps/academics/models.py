from django.db import models

from apps.core.models import TenantModel


class AcademicYear(TenantModel):
    name = models.CharField(max_length=20)  # e.g. 2026-27
    start_date = models.DateField()
    end_date = models.DateField()
    is_current = models.BooleanField(default=False)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["school", "name"], name="uniq_year_per_school")]
        ordering = ["-start_date"]

    def __str__(self):
        return self.name


class Course(TenantModel):
    name = models.CharField(max_length=150)
    code = models.CharField(max_length=20)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["school", "code"], name="uniq_course_per_school")]
        ordering = ["name"]

    def __str__(self):
        return self.name


class Subject(TenantModel):
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name="subjects")
    name = models.CharField(max_length=150)
    code = models.CharField(max_length=20)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["school", "code"], name="uniq_subject_per_school")]
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.code})"


class ClassRoom(TenantModel):
    """Ek class/section, e.g. Class 10 - A (2026-27)."""

    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name="classrooms")
    academic_year = models.ForeignKey(AcademicYear, on_delete=models.CASCADE, related_name="classrooms")
    section = models.CharField(max_length=10, blank=True)
    capacity = models.PositiveSmallIntegerField(default=40)
    class_teacher = models.ForeignKey(
        "teachers.Teacher", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["school", "course", "academic_year", "section"], name="uniq_classroom")
        ]

    def __str__(self):
        return f"{self.course.name} {self.section} ({self.academic_year})"


class TeachingAssignment(TenantModel):
    classroom = models.ForeignKey(ClassRoom, on_delete=models.CASCADE, related_name="assignments")
    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, related_name="+")
    teacher = models.ForeignKey("teachers.Teacher", on_delete=models.CASCADE, related_name="assignments")

    class Meta:
        constraints = [models.UniqueConstraint(fields=["classroom", "subject"], name="uniq_assignment")]
