import uuid
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.db import models, transaction
from django.utils import timezone
from django.db.models import Q

from apps.core.roles import Role


def profile_photo_upload_path(instance, filename):
    uploaded = getattr(instance, "profile_photo", None)
    file_obj = getattr(uploaded, "file", None)
    header = file_obj.read(12) if file_obj else b""
    if file_obj:
        file_obj.seek(0)
    if header.startswith(b"\xff\xd8\xff"):
        extension = ".jpg"
    elif header.startswith(b"\x89PNG\r\n\x1a\n"):
        extension = ".png"
    elif header.startswith((b"GIF87a", b"GIF89a")):
        extension = ".gif"
    elif header.startswith(b"RIFF") and header[8:12] == b"WEBP":
        extension = ".webp"
    else:
        extension = ".jpg"
    return f"profile-photos/{instance.pk}/{uuid.uuid4().hex}{extension}"


class UserManager(BaseUserManager):
    use_in_migrations = True

    def _create(self, email, password, **extra):
        if not email:
            raise ValueError("Email is required.")
        user = self.model(email=self.normalize_email(email).lower(), **extra)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email, password=None, **extra):
        extra.setdefault("is_staff", False)
        extra.setdefault("is_superuser", False)
        return self._create(email, password, **extra)

    def create_superuser(self, email, password=None, **extra):
        extra.update(is_staff=True, is_superuser=True, role=Role.SUPER_ADMIN)
        return self._create(email, password, **extra)


class User(AbstractUser):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    username = None
    email = models.EmailField(unique=True)
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.STUDENT)
    school = models.ForeignKey(
        "schools.School", null=True, blank=True, on_delete=models.CASCADE, related_name="users"
    )
    phone = models.CharField(max_length=15, blank=True)
    profile_photo = models.FileField(upload_to=profile_photo_upload_path, blank=True)
    failed_login_attempts = models.PositiveSmallIntegerField(default=0)
    locked_until = models.DateTimeField(null=True, blank=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []
    objects = UserManager()

    @property
    def is_locked(self):
        return bool(self.locked_until and self.locked_until > timezone.now())

    def register_failed_login(self):
        # Serialize concurrent failed attempts so parallel requests cannot
        # lose increments and evade the account lockout threshold.
        with transaction.atomic():
            user = type(self).objects.select_for_update().get(pk=self.pk)
            user.failed_login_attempts += 1
            if user.failed_login_attempts >= settings.MAX_FAILED_LOGINS:
                user.locked_until = timezone.now() + timedelta(minutes=settings.LOCKOUT_MINUTES)
                user.failed_login_attempts = 0
            user.save(update_fields=["failed_login_attempts", "locked_until"])
        self.failed_login_attempts = user.failed_login_attempts
        self.locked_until = user.locked_until

    def reset_failed_logins(self):
        if self.failed_login_attempts or self.locked_until:
            self.failed_login_attempts = 0
            self.locked_until = None
            self.save(update_fields=["failed_login_attempts", "locked_until"])

    def __str__(self):
        return self.email


class RegistrationRequest(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending review"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    school = models.ForeignKey("schools.School", on_delete=models.CASCADE, related_name="registration_requests")
    role = models.CharField(max_length=20, choices=[(Role.STUDENT, "Student"), (Role.TEACHER, "Teacher")])
    email = models.EmailField()
    first_name = models.CharField(max_length=150)
    last_name = models.CharField(max_length=150, blank=True)
    phone = models.CharField(max_length=15, blank=True)
    profile_photo = models.FileField(upload_to=profile_photo_upload_path, blank=True)
    password_hash = models.CharField(max_length=128)
    details = models.JSONField(default=dict)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING, db_index=True)
    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="reviewed_registrations")
    reviewed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [models.UniqueConstraint(fields=["email"], condition=Q(status="pending"), name="uniq_pending_portal_registration_email")]

    def __str__(self):
        return f"{self.role} registration: {self.email}"


class PasswordResetOtp(models.Model):
    """Forgot password: email par OTP (hash me save)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="password_reset_otps")
    code_hash = models.CharField(max_length=64)
    attempts = models.PositiveSmallIntegerField(default=0)
    used = models.BooleanField(default=False)
    expires_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
