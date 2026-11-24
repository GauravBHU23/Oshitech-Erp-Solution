from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.teachers.models import Teacher

from .models import Student, issue_id_card


@receiver(post_save, sender=Student, dispatch_uid="student_auto_id_card")
def student_admitted(sender, instance, created, raw=False, **kwargs):
    """Admission hote hi student ka identity card issue ho jata hai (same transaction)."""
    if created and not raw:
        issue_id_card(student=instance)


@receiver(post_save, sender=Teacher, dispatch_uid="teacher_auto_id_card")
def teacher_joined(sender, instance, created, raw=False, **kwargs):
    if created and not raw:
        issue_id_card(teacher=instance)
