from django.contrib import admin

from .models import StreExam, StreRegistration, StreSubject

admin.site.register(StreExam)
admin.site.register(StreSubject)


@admin.register(StreRegistration)
class StreRegistrationAdmin(admin.ModelAdmin):
    list_display = ("registration_no", "first_name", "last_name", "email", "mobile", "status", "roll_no")
    list_filter = ("status", "exam")
    search_fields = ("registration_no", "email", "mobile", "first_name", "last_name")
    exclude = ("aadhaar_encrypted",)
