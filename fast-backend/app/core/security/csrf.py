"""Double-submit-cookie CSRF check — replicates Django's CSRFCheck behavior for the
cookie-based auth path only (Bearer-token auth skips CSRF entirely, same as Django's
CookieJWTAuthentication). The frontend (frontend/src/lib/api.ts) calls GET /auth/csrf/
to receive a non-httpOnly `csrftoken` cookie, then echoes it back as the X-CSRFToken
header on every unsafe request — we just need to verify those two values match.

Unlike Django's CSRFCheck (which also validates the cookie's HMAC signature against
SECRET_KEY to prevent cookie forgery), we sign our own csrftoken value the same way so
a client can't simply invent an arbitrary matching pair of cookie+header."""
import hashlib
import hmac
import secrets

from fastapi import Request

from app.config import get_settings

CSRF_COOKIE_NAME = "csrftoken"
CSRF_HEADER_NAME = "X-CSRFToken"
_TOKEN_LENGTH = 32


def _signing_key() -> bytes:
    return get_settings().django_secret_key.encode()


def generate_csrf_token() -> str:
    raw = secrets.token_hex(_TOKEN_LENGTH)
    signature = hmac.new(_signing_key(), raw.encode(), hashlib.sha256).hexdigest()
    return f"{raw}.{signature}"


def _valid_token(token: str) -> bool:
    if not token or "." not in token:
        return False
    raw, _, signature = token.rpartition(".")
    expected = hmac.new(_signing_key(), raw.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


class CsrfError(Exception):
    pass


def enforce_csrf(request: Request) -> None:
    """Raise CsrfError unless the X-CSRFToken header matches a validly-signed
    csrftoken cookie. Call this ONLY for cookie-authenticated unsafe requests —
    mirrors Django's CookieJWTAuthentication, which never calls enforce_csrf for
    Bearer-token requests."""
    cookie_token = request.cookies.get(CSRF_COOKIE_NAME, "")
    header_token = request.headers.get(CSRF_HEADER_NAME, "")
    if not cookie_token or not header_token:
        raise CsrfError("CSRF cookie or header missing.")
    if not _valid_token(cookie_token):
        raise CsrfError("CSRF cookie is invalid.")
    if not hmac.compare_digest(cookie_token, header_token):
        raise CsrfError("CSRF token mismatch.")
