"""Self-hosted text captcha + Cloudflare Turnstile and shared rate limiting for Django's
separate admin login."""
import base64
import hmac

from django import forms
from django.conf import settings
from django.contrib.admin.forms import AdminAuthenticationForm
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.http import HttpResponse
from django.utils.translation import gettext_lazy as _
from django.views.decorators.cache import never_cache
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.request import Request

from apps.core.throttles import AtomicAnonRateThrottle
from apps.stre import security as captcha_security

CAPTCHA_ID_SESSION_KEY = "admin_login_captcha_id"
CAPTCHA_IMAGE_SESSION_KEY = "admin_login_captcha_image"


def _issue_captcha(request):
    captcha, svg = captcha_security.new_captcha()
    request.session[CAPTCHA_ID_SESSION_KEY] = str(captcha.pk)
    request.session[CAPTCHA_IMAGE_SESSION_KEY] = base64.b64encode(svg.encode("utf-8")).decode("ascii")


class AdminCaptchaAuthenticationForm(AdminAuthenticationForm):
    captcha = forms.CharField(label=_("Type the letters shown"), max_length=5)

    def clean(self):
        expected_id = self.request.session.get(CAPTCHA_ID_SESSION_KEY)
        submitted_id = self.data.get("captcha_id", "")
        answer = self.cleaned_data.get("captcha", "")
        if not expected_id or not hmac.compare_digest(str(expected_id), str(submitted_id)):
            _issue_captcha(self.request)
            raise ValidationError(_("Complete the new CAPTCHA and try again."))
        try:
            captcha_security.check_captcha(expected_id, answer)
        except DRFValidationError as exc:
            _issue_captcha(self.request)
            raise ValidationError(_("The CAPTCHA did not match. Try the new image.")) from exc

        token = self.data.get("cf-turnstile-response", "")
        try:
            captcha_security.check_turnstile(token, self.request.META.get("REMOTE_ADDR"))
        except DRFValidationError as exc:
            _issue_captcha(self.request)
            raise ValidationError(_("Complete the ‘I'm not a robot’ check and try again.")) from exc

        # Prepare a new one before password validation so failed credentials
        # are rendered with a fresh single-use challenge.
        _issue_captcha(self.request)
        username = self.cleaned_data.get("username", "")
        user = get_user_model().objects.filter(email__iexact=username).first() if username else None
        if user and user.is_locked:
            raise ValidationError(_("Invalid username or password."))
        try:
            cleaned = super().clean()
        except ValidationError:
            if user:
                user.register_failed_login()
            raise
        if user:
            user.reset_failed_logins()
        return cleaned


def secure_admin_login(admin_site):
    original_login = admin_site.login

    @never_cache
    def protected_login(request, extra_context=None):
        if request.method == "GET" and admin_site.has_permission(request):
            return original_login(request, extra_context=extra_context)

        throttle = AtomicAnonRateThrottle()
        throttle.scope = "login"
        throttle.rate = throttle.get_rate()
        throttle.num_requests, throttle.duration = throttle.parse_rate(throttle.rate)
        if not throttle.allow_request(Request(request), None):
            return HttpResponse("Too many login attempts. Please wait before trying again.", status=429)

        if request.method == "GET":
            _issue_captcha(request)
        extra_context = {**(extra_context or {}), "turnstile_site_key": settings.TURNSTILE_SITE_KEY}
        return original_login(request, extra_context=extra_context)

    admin_site.login_form = AdminCaptchaAuthenticationForm
    admin_site.login = protected_login
