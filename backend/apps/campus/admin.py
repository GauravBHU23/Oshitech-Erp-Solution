from django.contrib import admin

from .models import FeeInvoice, FeePayment, FeeStructure, Homework, LeaveRequest, Notice, TimetableEntry

for model in (Notice, TimetableEntry, Homework, LeaveRequest, FeeStructure, FeeInvoice, FeePayment):
    admin.site.register(model)
