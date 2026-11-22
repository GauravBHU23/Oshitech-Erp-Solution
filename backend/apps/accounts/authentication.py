from django.conf import settings
from rest_framework import exceptions
from rest_framework.authentication import CSRFCheck
from rest_framework_simplejwt.authentication import JWTAuthentication

SAFE_METHODS = ("GET", "HEAD", "OPTIONS")


def enforce_csrf(request):
    check = CSRFCheck(lambda r: None)
    check.process_request(request)
    reason = check.process_view(request, None, (), {})
    if reason:
        raise exceptions.PermissionDenied(f"CSRF check failed: {reason}")


class CookieJWTAuthentication(JWTAuthentication):
    """httpOnly cookie se JWT padhta hai (localStorage use nahi hota).
    Cookie auth me unsafe methods par CSRF token zaroori hai.
    Header (Bearer) bhi chalega: mobile app ke liye."""

    def authenticate(self, request):
        header = self.get_header(request)
        if header is not None:
            raw = self.get_raw_token(header)
        else:
            raw = request.COOKIES.get(settings.AUTH_COOKIE_ACCESS)
        if raw is None:
            return None
        validated = self.get_validated_token(raw)
        user = self.get_user(validated)
        if header is None and request.method not in SAFE_METHODS:
            enforce_csrf(request)
        return user, validated



class OptionalCookieJWTAuthentication(CookieJWTAuthentication):
    """Public files ke liye: purana/expired cookie ho to error nahi, bas anonymous maan lo."""

    def authenticate(self, request):
        try:
            return super().authenticate(request)
        except Exception:  # noqa: BLE001 — InvalidToken / AuthenticationFailed
            return None
