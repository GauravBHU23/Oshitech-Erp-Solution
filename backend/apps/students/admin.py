from django.contrib import admin

from .models import IDCard, Student

admin.site.register(Student)


@admin.register(IDCard)
class IDCardAdmin(admin.ModelAdmin):
    list_display = ("code", "holder_type", "school", "issued_on", "valid_until", "is_revoked")
    list_filter = ("holder_type", "is_revoked")
    search_fields = ("code",)
