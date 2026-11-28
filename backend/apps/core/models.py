import uuid

from django.conf import settings
from django.db import models


class BaseModel(models.Model):
    """UUID primary key: ID guess/enumeration attack se bachata hai."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class TenantModel(BaseModel):
    """Har school ka data alag: har tenant model me school FK."""

    school = models.ForeignKey(
        "schools.School", on_delete=models.CASCADE, related_name="%(app_label)s_%(class)s_set"
    )

    class Meta:
        abstract = True


class AuditLog(models.Model):
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    school = models.ForeignKey(
        "schools.School", null=True, blank=True, on_delete=models.SET_NULL, related_name="audit_logs"
    )
    action = models.CharField(max_length=50)
    model = models.CharField(max_length=100)
    object_id = models.CharField(max_length=64)
    changes = models.JSONField(default=dict, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.action} {self.model} {self.object_id}"


class SiteVisitor(models.Model):
    """Anonymous unique website visitors; only a one-way browser key hash is stored."""

    visitor_hash = models.CharField(max_length=64, unique=True)
    first_seen = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["first_seen"]


class SupportRequest(BaseModel):
    class Category(models.TextChoices):
        LOGIN = "login", "Login problem"
        BUG = "bug", "Website issue"
        ACCOUNT = "account", "Account help"
        QUESTION = "question", "Question"
        ADMISSION = "admission", "Admission enquiry"
        CONTACT = "contact", "Contact / general enquiry"
        FEES = "fees", "Fees enquiry"
        OTHER = "other", "Other"

    class Status(models.TextChoices):
        OPEN = "open", "Open"
        IN_PROGRESS = "in_progress", "In progress"
        RESOLVED = "resolved", "Resolved"

    reporter = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="support_requests",
    )
    school = models.ForeignKey(
        "schools.School",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="support_requests",
    )
    name = models.CharField(max_length=150, blank=True)
    phone = models.CharField(max_length=20, blank=True)
    email = models.EmailField()
    role = models.CharField(max_length=20, blank=True)
    category = models.CharField(max_length=20, choices=Category.choices)
    subject = models.CharField(max_length=160)
    message = models.TextField(max_length=4000)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.OPEN)
    chat_token_hash = models.CharField(max_length=64, blank=True, default="", db_index=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.get_category_display()}: {self.subject}"


class SupportMessage(BaseModel):
    class SenderType(models.TextChoices):
        VISITOR = "visitor", "Visitor"
        STAFF = "staff", "Staff"

    conversation = models.ForeignKey(
        SupportRequest, on_delete=models.CASCADE, related_name="messages"
    )
    sender_type = models.CharField(max_length=10, choices=SenderType.choices)
    sender_name = models.CharField(max_length=150)
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="support_messages",
    )
    body = models.TextField(max_length=4000)

    class Meta:
        ordering = ["created_at", "id"]
