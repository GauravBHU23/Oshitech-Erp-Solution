"""Forgot password (ERP portals): email OTP se naya password."""
import hashlib
import hmac
import logging
import secrets
from datetime import timedelta
from html import escape

from django.conf import settings
from django.contrib.auth import get_user_model, password_validation
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.mail import EmailMultiAlternatives
from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.stre import security as captcha_security

from apps.core.audit import log_action
from apps.core.throttles import AtomicAnonRateThrottle

from .models import PasswordResetOtp

log = logging.getLogger(__name__)
User = get_user_model()

OTP_MINUTES = 10
RESEND_SECONDS = 60
MAX_PER_HOUR = 5
MAX_ATTEMPTS = 5
SENT = "If this email matches an account for this sign-in, a 6-digit code has been sent. Check your inbox (and Spam)."
NO_ACCOUNT = "No account found for this sign-in. Check the email and try again."
# Reset links stay scoped to the portal the user selected. Mismatches return
# the same generic response as unknown emails so they reveal no account role.
PORTAL_ROLES = {
    "student": "student", "teacher": "teacher", "school-admin": "school_admin", "admin": "school_admin",
    "super-admin": "super_admin", "exam-controller": "exam_controller", "stre-admin": "stre_admin",
}


class ResetThrottle(AtomicAnonRateThrottle):
    scope = "login"


def _hash(code):
    return hmac.new(settings.SECRET_KEY.encode(), f"pwreset:{code}".encode(), hashlib.sha256).hexdigest()


def _email_html(name, code, account_email, portal_label):
    font = "Segoe UI,Roboto,Arial,sans-serif"
    digits = "".join(
        f"<td style='padding:0 4px'><div style='width:42px;height:52px;border-radius:12px;background:#eef2ff;border:1px solid #c7d2fe;"
        f"font:800 26px/52px {font};color:#1e1b4b;text-align:center'>{d}</div></td>" for d in code
    )
    return f"""<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><style>@media (max-width:620px){{.c{{width:100%!important;border-radius:0!important}}.p{{padding-left:20px!important;padding-right:20px!important}}}}
@media (prefers-color-scheme:dark){{.bg{{background:#0b1220!important}}.c{{background:#111c30!important}}.t{{color:#f1f5f9!important}}.m{{color:#cbd5e1!important}}}}</style></head>
<body class="bg" style="margin:0;background:#eef1f8">
<div style="display:none;max-height:0;overflow:hidden">Your Oshitech ERP password reset code is {code}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="bg" style="background:#eef1f8"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" class="c" style="width:560px;max-width:560px;background:#fff;border-radius:22px;overflow:hidden;box-shadow:0 12px 40px rgba(15,23,42,.1)">
<tr><td bgcolor="#172238" class="p" style="background:#172238;background-image:linear-gradient(135deg,#172238,#26386e);padding:26px 32px">
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="42" height="42" align="center" bgcolor="#6366f1" style="border-radius:12px;font:800 20px/42px {font};color:#fff">O</td>
<td style="padding-left:12px"><div style="font:700 15px/20px {font};color:#fff">Oshitech</div><div style="font:500 10px/14px {font};letter-spacing:.18em;text-transform:uppercase;color:#94a3b8">Education ERP</div></td></tr></table></td></tr>
<tr><td class="p" style="padding:30px 32px 8px"><h1 class="t" style="margin:0;font:700 24px/30px {font};color:#0f172a">Reset your password</h1>
<p class="m" style="margin:14px 0 0;font:400 15px/24px {font};color:#334155">Hello {escape(name)},</p>
<p class="m" style="margin:8px 0 0;font:400 15px/24px {font};color:#334155">This is a password reset request for your {escape(portal_label)} account. It expires in {OTP_MINUTES} minutes.</p>
<p class="m" style="margin:8px 0 0;font:400 13px/20px {font};color:#64748b">Account: {escape(account_email)}<br>Action: Reset password</p></td></tr>
<tr><td align="center" style="padding:22px 16px"><table role="presentation" cellpadding="0" cellspacing="0"><tr>{digits}</tr></table></td></tr>
<tr><td class="p" style="padding:0 32px 28px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fffbeb;border:1px solid #fde68a;border-radius:14px">
<tr><td style="padding:14px 18px;font:400 13px/20px {font};color:#78350f">Never share this code with anyone. If you did not ask to reset your password, ignore this email — your password stays the same.</td></tr></table>
<p style="margin:22px 0 0;font:400 12px/18px {font};color:#94a3b8">— Oshitech Education ERP</p></td></tr>
</table></td></tr></table></body></html>"""


def _send_code(user, code):
    name = user.first_name or user.email
    portal_label = user.get_role_display() if hasattr(user, "get_role_display") else "Oshitech ERP"
    message = EmailMultiAlternatives(
        f"Oshitech ERP | {portal_label} password reset verification code",
        f"Hello {name},\n\nA password reset was requested for your {portal_label} account.\nAccount: {user.email}\nAction: Reset password\nVerification code: {code}\nIt expires in {OTP_MINUTES} minutes.\n\nNever share this code. If you did not request this, ignore this email; your password has not changed.\n\n— Oshitech Education ERP",
        getattr(settings, "DEFAULT_FROM_EMAIL", None),
        [user.email],
    )
    message.attach_alternative(_email_html(name, code, user.email, portal_label), "text/html")
    try:
        message.send(fail_silently=False)
        return True
    except Exception:  # noqa: BLE001 — user ko retry ka message dikhega
        log.exception("Password reset email delivery failed")
        return False


class PasswordResetRequestView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ResetThrottle]

    def post(self, request):
        captcha_security.check_captcha_and_turnstile(
            request.data.get("captcha_id"), request.data.get("captcha"),
            request.data.get("turnstile_token"), request.META.get("REMOTE_ADDR"),
        )
        email = str(request.data.get("email", "")).strip().lower()
        if "@" not in email or len(email) > 254:
            raise ValidationError({"email": "Enter a valid email address."})
        user = User.objects.filter(email__iexact=email).first()
        role = PORTAL_ROLES.get(str(request.data.get("portal", "")).strip())
        # A different-role account is treated exactly like an unknown address;
        # never identify which other portal owns that email.
        def accepted():
            return Response({"detail": SENT, "resend_after": RESEND_SECONDS})

        if user is None or not user.is_active or role is None or user.role != role:
            raise ValidationError({"email": NO_ACCOUNT})
        now = timezone.now()
        recent = PasswordResetOtp.objects.filter(user=user, created_at__gte=now - timedelta(hours=1))
        last = recent.first()
        if (last and (now - last.created_at).total_seconds() < RESEND_SECONDS) or recent.count() >= MAX_PER_HOUR:
            return accepted()
        code = f"{secrets.randbelow(1_000_000):06d}"
        otp = PasswordResetOtp.objects.create(user=user, code_hash=_hash(code), expires_at=now + timedelta(minutes=OTP_MINUTES))
        if not _send_code(user, code):
            otp.delete()
        return accepted()


class PasswordResetConfirmView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ResetThrottle]

    def post(self, request):
        from .views import _revoke_user_refresh_tokens

        email = str(request.data.get("email", "")).strip().lower()
        code = "".join(ch for ch in str(request.data.get("code", "")) if ch.isdigit())
        password = str(request.data.get("new_password", ""))
        if len(code) != 6:
            raise ValidationError({"code": "Enter the 6-digit code from your email."})
        invalid = ValidationError({"code": "The code is wrong or has expired. Request a new code."})
        role = PORTAL_ROLES.get(str(request.data.get("portal", "")).strip())
        user = User.objects.filter(email__iexact=email, is_active=True).first()
        if user is None or role is None or user.role != role:
            raise invalid
        otp = PasswordResetOtp.objects.filter(user=user, used=False).first()
        if otp is None or otp.expires_at < timezone.now() or otp.attempts >= MAX_ATTEMPTS:
            raise invalid
        if not hmac.compare_digest(otp.code_hash, _hash(code)):
            otp.attempts += 1
            otp.save(update_fields=["attempts"])
            left = MAX_ATTEMPTS - otp.attempts
            raise ValidationError({"code": f"Wrong code. {left} attempt{'s' if left != 1 else ''} left." if left else "Too many wrong attempts. Request a new code."})
        try:
            password_validation.validate_password(password, user)
        except DjangoValidationError as exc:
            raise ValidationError({"new_password": exc.messages}) from exc
        with transaction.atomic():
            user.set_password(password)
            user.failed_login_attempts = 0
            user.locked_until = None
            user.save(update_fields=["password", "failed_login_attempts", "locked_until"])
            PasswordResetOtp.objects.filter(user=user, used=False).update(used=True)
            _revoke_user_refresh_tokens(user)  # baaki sab devices se logout
            log_action(request, "account_password_reset_self", user, {"role": user.role})
        return Response({"detail": "Your password has been changed. Sign in with your new password."}, status=status.HTTP_200_OK)
