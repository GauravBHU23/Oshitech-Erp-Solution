from django.contrib import admin

from .models import School


@admin.register(School)
class SchoolAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "city", "plan", "is_active")
    list_filter = ("plan", "is_active")
    search_fields = ("name", "code")
