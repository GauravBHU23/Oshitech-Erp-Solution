from datetime import timedelta

from django.utils import timezone


def login_payload(email, password):
    """Issue the same one-use login challenge that the browser must submit, plus the
    Turnstile test token tests are allowed to submit."""
    from apps.stre.models import StreCaptcha
    from apps.stre.security import TURNSTILE_TEST_TOKEN, _hash

    captcha = StreCaptcha.objects.create(
        answer_hash=_hash("ABCDE"),
        expires_at=timezone.now() + timedelta(minutes=5),
    )
    return {
        "email": email, "password": password,
        "captcha_id": str(captcha.pk), "captcha": "ABCDE",
        "turnstile_token": TURNSTILE_TEST_TOKEN,
    }
