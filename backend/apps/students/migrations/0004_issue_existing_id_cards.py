import secrets
from datetime import timedelta

from django.db import migrations
from django.utils import timezone


def issue_existing(apps, schema_editor):
    """Pehle se admitted students/teachers ke liye bhi ID card issue karo."""
    IDCard = apps.get_model("students", "IDCard")
    Student = apps.get_model("students", "Student")
    Teacher = apps.get_model("teachers", "Teacher")
    AcademicYear = apps.get_model("academics", "AcademicYear")
    today = timezone.localdate()
    valid_cache = {}

    def valid_until(school_id):
        if school_id not in valid_cache:
            year = (
                AcademicYear.objects.filter(school_id=school_id, is_current=True, end_date__gte=today)
                .order_by("-end_date")
                .first()
            )
            valid_cache[school_id] = year.end_date if year else today + timedelta(days=365)
        return valid_cache[school_id]

    def new_code():
        while True:
            code = secrets.token_hex(6).upper()
            if not IDCard.objects.filter(code=code).exists():
                return code

    for student in Student.objects.filter(id_card__isnull=True):
        IDCard.objects.create(
            school_id=student.school_id, holder_type="student", student=student,
            code=new_code(), issued_on=today, valid_until=valid_until(student.school_id),
        )
    for teacher in Teacher.objects.filter(id_card__isnull=True):
        IDCard.objects.create(
            school_id=teacher.school_id, holder_type="teacher", teacher=teacher,
            code=new_code(), issued_on=today, valid_until=valid_until(teacher.school_id),
        )


class Migration(migrations.Migration):
    dependencies = [
        ("students", "0003_student_blood_group_idcard"),
        ("teachers", "0003_teacherrating"),
        ("academics", "0002_initial"),
    ]

    operations = [migrations.RunPython(issue_existing, migrations.RunPython.noop)]
