"""STRE: email OTP verification aur self-hosted captcha (koi bahari service nahi)."""
import hashlib
import hmac
import math
import random
import secrets
from datetime import timedelta

from django.conf import settings
from django.core import signing
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from .models import StreCaptcha, StreEmailOtp

OTP_VALID_MINUTES = 10
OTP_RESEND_SECONDS = 60
OTP_MAX_PER_HOUR = 5
OTP_MAX_ATTEMPTS = 5
EMAIL_TOKEN_SALT = "stre-email-verified"
EMAIL_TOKEN_MAX_AGE = 60 * 60  # verify ke baad 1 ghante me form submit karna hai


def _hash(value):
    return hmac.new(settings.SECRET_KEY.encode(), str(value).strip().upper().encode(), hashlib.sha256).hexdigest()


# ---------------------------------------------------------------- email OTP


def create_otp(email):
    """Naya 6 digit OTP banao (rate limit ke saath). Returns code (email bhejne ke liye)."""
    now = timezone.now()
    recent = StreEmailOtp.objects.filter(email=email, created_at__gte=now - timedelta(hours=1))
    last = recent.order_by("-created_at").first()
    if last and (now - last.created_at).total_seconds() < OTP_RESEND_SECONDS:
        wait = OTP_RESEND_SECONDS - int((now - last.created_at).total_seconds())
        raise ValidationError({"email": f"Please wait {wait} seconds before requesting another OTP."})
    if recent.count() >= OTP_MAX_PER_HOUR:
        raise ValidationError({"email": "Too many OTP requests for this email. Please try again after an hour."})
    code = f"{secrets.randbelow(1_000_000):06d}"
    StreEmailOtp.objects.create(email=email, code_hash=_hash(code), expires_at=now + timedelta(minutes=OTP_VALID_MINUTES))
    return code


def verify_otp(email, code):
    """OTP sahi ho to signed email token do (registration ke saath bhejna hota hai)."""
    otp = StreEmailOtp.objects.filter(email=email, verified=False).order_by("-created_at").first()
    if otp is None:
        raise ValidationError({"code": "Please request an OTP first."})
    if otp.expires_at < timezone.now():
        raise ValidationError({"code": "This OTP has expired. Request a new one."})
    if otp.attempts >= OTP_MAX_ATTEMPTS:
        raise ValidationError({"code": "Too many wrong attempts. Request a new OTP."})
    if not hmac.compare_digest(otp.code_hash, _hash(code)):
        otp.attempts += 1
        otp.save(update_fields=["attempts"])
        left = OTP_MAX_ATTEMPTS - otp.attempts
        raise ValidationError({"code": f"Wrong OTP. {left} attempt{'s' if left != 1 else ''} left." if left else "Too many wrong attempts. Request a new OTP."})
    otp.verified = True
    otp.save(update_fields=["verified"])
    return make_email_token(email)


def make_email_token(email):
    return signing.dumps({"e": email.lower()}, salt=EMAIL_TOKEN_SALT)


def check_email_token(email, token):
    try:
        data = signing.loads(token or "", salt=EMAIL_TOKEN_SALT, max_age=EMAIL_TOKEN_MAX_AGE)
    except signing.SignatureExpired as exc:
        raise ValidationError({"email": "Email verification expired. Please verify your email again."}) from exc
    except signing.BadSignature as exc:
        raise ValidationError({"email": "Please verify your email with the OTP before submitting."}) from exc
    if data.get("e") != (email or "").lower():
        raise ValidationError({"email": "The email was changed after verification. Please verify the new email."})


# ---------------------------------------------------------------- captcha

# Har akshar lakeeron (strokes) se — 0..10 x 0..16 grid. SVG me koi <text> nahi hota.
GLYPHS = {
    "2": [[(1, 4), (3, 1), (7, 1), (9, 4), (8, 7), (1, 15), (9, 15)]],
    "3": [[(1, 2), (8, 1), (9, 4), (5, 7), (9, 10), (8, 14), (1, 15)]],
    "4": [[(7, 15), (7, 1), (1, 10), (9, 10)]],
    "5": [[(9, 1), (2, 1), (1, 7), (7, 6), (9, 10), (8, 14), (1, 15)]],
    "6": [[(8, 1), (3, 3), (1, 9), (2, 14), (7, 15), (9, 11), (6, 8), (1, 10)]],
    "7": [[(1, 1), (9, 1), (4, 15)], [(3, 8), (8, 8)]],
    "8": [[(5, 8), (1, 4), (5, 1), (9, 4), (5, 8), (1, 12), (5, 15), (9, 12), (5, 8)]],
    "9": [[(9, 6), (4, 8), (1, 5), (4, 1), (8, 2), (9, 8), (6, 15), (2, 14)]],
    "A": [[(1, 15), (5, 1), (9, 15)], [(3, 10), (7, 10)]],
    "C": [[(9, 3), (6, 1), (2, 3), (1, 8), (2, 13), (6, 15), (9, 13)]],
    "E": [[(9, 1), (1, 1), (1, 15), (9, 15)], [(1, 8), (7, 8)]],
    "H": [[(1, 1), (1, 15)], [(9, 1), (9, 15)], [(1, 8), (9, 8)]],
    "K": [[(1, 1), (1, 15)], [(9, 1), (1, 9), (9, 15)]],
    "M": [[(1, 15), (1, 1), (5, 9), (9, 1), (9, 15)]],
    "N": [[(1, 15), (1, 1), (9, 15), (9, 1)]],
    "P": [[(1, 15), (1, 1), (7, 1), (9, 4), (7, 8), (1, 8)]],
    "R": [[(1, 15), (1, 1), (7, 1), (9, 4), (7, 8), (1, 8), (9, 15)]],
    "T": [[(1, 1), (9, 1)], [(5, 1), (5, 15)]],
    "W": [[(1, 1), (3, 15), (5, 7), (7, 15), (9, 1)]],
    "X": [[(1, 1), (9, 15)], [(9, 1), (1, 15)]],
    "Y": [[(1, 1), (5, 8), (9, 1)], [(5, 8), (5, 15)]],
}
CAPTCHA_LENGTH = 5
CAPTCHA_VALID_MINUTES = 5


def _captcha_svg(text):
    rnd = random.SystemRandom()
    width, height = 190, 60
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
             f'<rect width="{width}" height="{height}" rx="10" fill="#f5f3ff"/>']
    for _ in range(6):  # pichhe ki noise lines
        pts = " ".join(f"{rnd.randint(0, width)},{rnd.randint(0, height)}" for _ in range(3))
        parts.append(f'<polyline points="{pts}" fill="none" stroke="hsl({rnd.randint(200, 300)},55%,75%)" stroke-width="{rnd.uniform(1, 2):.1f}"/>')
    x = 14
    for ch in text:
        scale = rnd.uniform(1.9, 2.4)
        angle = math.radians(rnd.uniform(-22, 22))
        ox, oy = x + rnd.uniform(-2, 2), rnd.uniform(6, 14)
        color = f"hsl({rnd.randint(220, 290)},60%,{rnd.randint(28, 42)}%)"
        for stroke in GLYPHS[ch]:
            pts = []
            for gx, gy in stroke:
                gx, gy = (gx - 5) * scale + rnd.uniform(-1.1, 1.1), (gy - 8) * scale * 0.95 + rnd.uniform(-1.1, 1.1)
                rx, ry = gx * math.cos(angle) - gy * math.sin(angle), gx * math.sin(angle) + gy * math.cos(angle)
                pts.append(f"{ox + 11 + rx:.1f},{oy + 18 + ry:.1f}")
            parts.append(f'<polyline points="{" ".join(pts)}" fill="none" stroke="{color}" stroke-width="{rnd.uniform(2.4, 3.2):.1f}" stroke-linecap="round" stroke-linejoin="round"/>')
        x += rnd.randint(31, 36)
    for _ in range(3):  # upar ki kat-peet lines
        y1, y2 = rnd.randint(10, height - 10), rnd.randint(10, height - 10)
        parts.append(f'<path d="M0 {y1} Q {width / 2} {rnd.randint(0, height)} {width} {y2}" fill="none" stroke="hsl({rnd.randint(220, 290)},45%,55%)" stroke-width="1.4" opacity=".7"/>')
    for _ in range(25):
        parts.append(f'<circle cx="{rnd.randint(0, width)}" cy="{rnd.randint(0, height)}" r="{rnd.uniform(.6, 1.6):.1f}" fill="hsl({rnd.randint(200, 300)},50%,60%)"/>')
    parts.append("</svg>")
    return "".join(parts)


def new_captcha():
    StreCaptcha.objects.filter(expires_at__lt=timezone.now()).delete()  # purane saaf
    alphabet = list(GLYPHS)
    text = "".join(random.SystemRandom().choice(alphabet) for _ in range(CAPTCHA_LENGTH))
    captcha = StreCaptcha.objects.create(answer_hash=_hash(text), expires_at=timezone.now() + timedelta(minutes=CAPTCHA_VALID_MINUTES))
    return captcha, _captcha_svg(text)


def check_captcha(captcha_id, answer):
    """Captcha ek hi baar chalta hai; galat ho ya expire ho to naya lena padega."""
    try:
        captcha = StreCaptcha.objects.filter(pk=captcha_id).first() if captcha_id else None
    except (ValueError, Exception):  # noqa: BLE001 — galat UUID
        captcha = None
    if captcha is None:
        raise ValidationError({"captcha": "Please complete the captcha."})
    valid = captcha.expires_at >= timezone.now() and hmac.compare_digest(captcha.answer_hash, _hash(answer or ""))
    captcha.delete()
    if not valid:
        raise ValidationError({"captcha": "Captcha did not match. Please try the new one."})
