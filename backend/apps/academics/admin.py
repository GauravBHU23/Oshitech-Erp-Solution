from django.contrib import admin

from .models import AcademicYear, ClassRoom, Course, Subject, TeachingAssignment

for m in (AcademicYear, Course, Subject, ClassRoom, TeachingAssignment):
    admin.site.register(m)
