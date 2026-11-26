"""FastAPI dependencies replicating backend/apps/accounts/authentication.py's
CookieJWTAuthentication exactly:
  1. Authorization: Bearer header checked FIRST (mobile-app path) — if present, CSRF
     is skipped entirely, matching Django's `if header is None and method not in
     SAFE_METHODS: enforce_csrf(request)`.
  2. Otherwise falls back to the access_token cookie.
  3. auth_time absolute ceiling checked against SESSION_MAX_HOURS, regardless of path.
  4. touch_session() gates every request — a cryptographically valid JWT is still
     rejected with 401 if its Redis session key has expired or been revoked.
"""
from collections.abc import AsyncGenerator

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models import User
from app.config import Settings, get_settings
from app.core.roles import Role
from app.core.security import csrf
from app.core.security.jwt import TokenError, auth_time_expired, decode_token
from app.core.security.sessions import touch_session
from app.db.base import get_db

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


class AuthenticatedUser:
    """Wraps the ORM User plus the decoded token payload — view code sometimes needs
    `sid`/`auth_time` (e.g. to extend the session), not just the user row."""

    def __init__(self, user: User, payload: dict):
        self.user = user
        self.payload = payload

    def __getattr__(self, item):
        return getattr(self.user, item)


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    async for session in get_db():
        yield session


async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> AuthenticatedUser:
    auth_header = request.headers.get("authorization", "")
    via_header = auth_header.lower().startswith("bearer ")
    if via_header:
        raw = auth_header[7:].strip()
    else:
        raw = request.cookies.get(settings.auth_cookie_access)

    if not raw:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, {"detail": "Authentication credentials were not provided."})

    try:
        payload = decode_token(raw, expected_type="access")
    except TokenError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, {"detail": "Invalid or expired token."})

    if auth_time_expired(payload, session_max_hours=settings.session_max_hours):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, {"detail": "Your session has expired. Please sign in again."})

    if not via_header and request.method not in SAFE_METHODS:
        try:
            csrf.enforce_csrf(request)
        except csrf.CsrfError as exc:
            raise HTTPException(status.HTTP_403_FORBIDDEN, {"detail": f"CSRF check failed: {exc}"})

    if not await touch_session(payload.get("user_id"), payload.get("sid")):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, {"detail": "Your session has expired. Please sign in again."})

    user_id = payload.get("user_id")
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, {"detail": "Your session has expired. Please sign in again."})

    return AuthenticatedUser(user, payload)


async def get_current_user_optional(
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> AuthenticatedUser | None:
    """Matches Django's OptionalCookieJWTAuthentication — swallows every auth error
    and returns None (anonymous) instead of raising, for endpoints that serve
    different content to logged-in vs. anonymous visitors (e.g. notice attachments)."""
    try:
        return await get_current_user(request, db, settings)
    except HTTPException:
        return None


def require_roles(*roles: Role):
    """Role-gate dependency — matches apps/core/permissions.py's RoleAccess exactly:
    super_admin always passes; every other role additionally needs a school assigned
    (not just a matching role) before the role check itself is even consulted."""

    async def _check(current: AuthenticatedUser = Depends(get_current_user)) -> AuthenticatedUser:
        if current.user.role == Role.SUPER_ADMIN.value:
            return current
        if not current.user.school_id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, {"detail": "You do not have permission to perform this action."})
        if current.user.role not in {r.value for r in roles}:
            raise HTTPException(status.HTTP_403_FORBIDDEN, {"detail": "You do not have permission to perform this action."})
        return current

    return _check


def get_tenant_school_id(current: AuthenticatedUser = Depends(get_current_user)):
    """None for super_admin (sees everything); otherwise the user's own school —
    matches TenantModelViewSet.get_queryset's scoping rule."""
    if current.user.role == Role.SUPER_ADMIN.value:
        return None
    return current.user.school_id
