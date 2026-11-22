from django.db import models

from apps.core.models import BaseModel


class Plan(models.TextChoices):
    STANDARD = "standard", "Standard"
    PREMIUM = "premium", "Premium"


class School(BaseModel):
    name = models.CharField(max_length=200)
    code = models.CharField(max_length=20, unique=True)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=15, blank=True)
    address = models.TextField(blank=True)
    city = models.CharField(max_length=100, blank=True)
    state = models.CharField(max_length=100, blank=True)
    pincode = models.CharField(max_length=10, blank=True)
    plan = models.CharField(max_length=20, choices=Plan.choices, default=Plan.STANDARD)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.code})"
