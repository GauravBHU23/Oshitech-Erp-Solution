from django.contrib import admin

from .models import AdmitCard, Exam, ExamSchedule, Result

for m in (Exam, ExamSchedule, AdmitCard, Result):
    admin.site.register(m)
