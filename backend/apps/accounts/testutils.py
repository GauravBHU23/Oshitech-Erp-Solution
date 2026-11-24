from datetime import timedelta

from django.utils import timezone


def login_payload(email, password):
    """Issue the same one-use login challenge that the browser must submit."""
    from apps.stre.models import StreCaptcha
    from apps.stre.security import _hash

    captcha = StreCaptcha.objects.create(
        answer_hash=_hash("ABCDE"),
        expires_at=timezone.now() + timedelta(minutes=5),
    )
    return {"email": email, "password": password, "captcha_id": str(captcha.pk), "captcha": "ABCDE"}
