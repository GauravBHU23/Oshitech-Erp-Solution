"""JWT issuance/validation compatible with Django's SimpleJWT usage in this project.

Verified directly against backend/apps/accounts/views.py and authentication.py:
  - Access token lifetime: 15 minutes (hardcoded in Django's SIMPLE_JWT setting).
  - Refresh token lifetime: SESSION_IDLE_MINUTES (sliding — extended on every rotation).
  - Both tokens carry custom claims `auth_time` (unix timestamp at login — an ABSOLUTE
    session ceiling checked against SESSION_MAX_HOURS, independent of rotation) and
    `sid` (a stable session id, a random uuid4 hex, carried unchanged through every
    rotated token so Redis session tracking keys stay valid across refreshes).
  - SimpleJWT's standard claims this project relies on: `token_type` ("access"/"refresh"),
    `exp`, `iat`, `jti` (unique per token, used as the blacklist table's unique key),
    `user_id` (the subject — NOT the default "sub").
  - Refresh tokens are additionally tracked in token_blacklist_outstandingtoken /
    token_blacklist_blacklistedtoken (see accounts/models.py) so blacklisting a token
    fast-backend issued is visible to Django and vice versa.
"""
import time
import uuid
from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt as jose_jwt

from app.config import get_settings

ALGORITHM = "HS256"


class TokenError(Exception):
    pass


def _settings():
    return get_settings()


def _signing_key() -> str:
    return _settings().django_secret_key


def _new_jti() -> str:
    return uuid.uuid4().hex


def issue_access_token(*, user_id: str, auth_time: int, sid: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "token_type": "access",
        "exp": now + timedelta(minutes=_settings().access_token_lifetime_minutes),
        "iat": now,
        "jti": _new_jti(),
        "user_id": str(user_id),
        "auth_time": auth_time,
        "sid": sid,
    }
    return jose_jwt.encode(payload, _signing_key(), algorithm=ALGORITHM)


def issue_refresh_token(*, user_id: str, auth_time: int | None = None, sid: str | None = None) -> tuple[str, dict]:
    """New refresh token. On first login, auth_time/sid are freshly generated; on
    rotation, the CALLER passes the existing auth_time/sid through unchanged (the
    absolute ceiling and the Redis session key must survive rotation)."""
    now = datetime.now(timezone.utc)
    auth_time = auth_time if auth_time is not None else int(time.time())
    sid = sid or uuid.uuid4().hex
    jti = _new_jti()
    payload = {
        "token_type": "refresh",
        "exp": now + timedelta(minutes=_settings().session_idle_minutes),
        "iat": now,
        "jti": jti,
        "user_id": str(user_id),
        "auth_time": auth_time,
        "sid": sid,
    }
    token = jose_jwt.encode(payload, _signing_key(), algorithm=ALGORITHM)
    return token, payload


def decode_token(token: str, *, expected_type: str | None = None) -> dict:
    """Raises TokenError on any invalid/expired/wrong-type token — callers don't need
    to know about python-jose's own exception types."""
    try:
        payload = jose_jwt.decode(token, _signing_key(), algorithms=[ALGORITHM])
    except JWTError as exc:
        raise TokenError(str(exc)) from exc
    if expected_type and payload.get("token_type") != expected_type:
        raise TokenError(f"Expected a {expected_type} token.")
    return payload


def auth_time_expired(payload: dict, *, session_max_hours: int) -> bool:
    """The absolute session ceiling — independent of idle/refresh activity."""
    auth_time = payload.get("auth_time")
    if not auth_time:
        return True
    return time.time() - int(auth_time) > session_max_hours * 3600
