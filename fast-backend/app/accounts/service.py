"""Login/lockout/session-issuance business logic — kept out of router_auth.py so the
routes stay thin. Ports backend/apps/accounts/views.py's _new_session/_issue_session/
register_failed_login/reset_failed_logins/_revoke_user_refresh_tokens exactly."""
import time
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models import BlacklistedToken, OutstandingToken, User
from app.config import Settings
from app.core.security.jwt import decode_token, issue_access_token, issue_refresh_token
from app.core.security.sessions import create_session, revoke_user_sessions


class LockedAccountError(Exception):
    pass


async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
    return (await db.execute(select(User).where(User.email == email.lower()))).scalar_one_or_none()


def is_locked(user: User) -> bool:
    return bool(user.locked_until and user.locked_until > datetime.now(timezone.utc))


async def register_failed_login(db: AsyncSession, user: User, settings: Settings) -> None:
    """Row-lock the user so concurrent failed attempts can't both read the same
    pre-increment count and evade the lockout threshold (mirrors Django's
    select_for_update + atomic transaction)."""
    locked_row = (await db.execute(select(User).where(User.id == user.id).with_for_update())).scalar_one()
    locked_row.failed_login_attempts += 1
    if locked_row.failed_login_attempts >= settings.max_failed_logins:
        locked_row.locked_until = datetime.now(timezone.utc) + timedelta(minutes=settings.lockout_minutes)
        locked_row.failed_login_attempts = 0
    await db.commit()


async def reset_failed_logins(db: AsyncSession, user: User) -> None:
    if user.failed_login_attempts or user.locked_until:
        user.failed_login_attempts = 0
        user.locked_until = None
        await db.commit()


async def issue_session(db: AsyncSession, user: User) -> tuple[str, str, dict]:
    """Returns (access_token, refresh_token, refresh_payload) and records the new
    refresh token in token_blacklist_outstandingtoken, exactly like SimpleJWT's
    RefreshToken.for_user() does under the hood — so Django's own blacklist checks
    (and admin tooling that lists OutstandingToken rows) see fast-backend's tokens too."""
    refresh_token, payload = issue_refresh_token(user_id=str(user.id))
    await create_session(str(user.id), payload["sid"])
    db.add(OutstandingToken(
        token=refresh_token,
        created_at=datetime.now(timezone.utc),
        expires_at=datetime.fromtimestamp(payload["exp"], timezone.utc),
        user_id=user.id,
        jti=payload["jti"],
    ))
    await db.commit()
    access_token = issue_access_token(user_id=str(user.id), auth_time=payload["auth_time"], sid=payload["sid"])
    return access_token, refresh_token, payload


async def rotate_session(db: AsyncSession, old_payload: dict) -> tuple[str, str, dict]:
    """Refresh-token rotation: new access+refresh, auth_time/sid carried through
    unchanged, old refresh token blacklisted (ROTATE_REFRESH_TOKENS +
    BLACKLIST_AFTER_ROTATION, both True in Django's SIMPLE_JWT setting)."""
    user_id = old_payload["user_id"]
    refresh_token, payload = issue_refresh_token(user_id=user_id, auth_time=old_payload["auth_time"], sid=old_payload["sid"])
    db.add(OutstandingToken(
        token=refresh_token,
        created_at=datetime.now(timezone.utc),
        expires_at=datetime.fromtimestamp(payload["exp"], timezone.utc),
        user_id=uuid.UUID(user_id),
        jti=payload["jti"],
    ))
    await blacklist_jti(db, old_payload.get("jti"))
    await db.commit()
    access_token = issue_access_token(user_id=user_id, auth_time=payload["auth_time"], sid=payload["sid"])
    return access_token, refresh_token, payload


async def blacklist_jti(db: AsyncSession, jti: str | None) -> None:
    if not jti:
        return
    outstanding = (await db.execute(select(OutstandingToken).where(OutstandingToken.jti == jti))).scalar_one_or_none()
    if outstanding is None:
        return
    already = (await db.execute(select(BlacklistedToken).where(BlacklistedToken.token_id == outstanding.id))).scalar_one_or_none()
    if already is None:
        db.add(BlacklistedToken(blacklisted_at=datetime.now(timezone.utc), token_id=outstanding.id))


async def is_jti_blacklisted(db: AsyncSession, jti: str) -> bool:
    outstanding = (await db.execute(select(OutstandingToken).where(OutstandingToken.jti == jti))).scalar_one_or_none()
    if outstanding is None:
        return False
    row = (await db.execute(select(BlacklistedToken).where(BlacklistedToken.token_id == outstanding.id))).scalar_one_or_none()
    return row is not None


async def revoke_all_user_tokens(db: AsyncSession, user: User) -> None:
    """Password change/reset: revoke every session AND blacklist every outstanding
    refresh token for this user (mirrors _revoke_user_refresh_tokens)."""
    await revoke_user_sessions(str(user.id))
    outstanding_ids = (await db.execute(select(OutstandingToken.id).where(OutstandingToken.user_id == user.id))).scalars().all()
    existing_blacklisted = set(
        (await db.execute(select(BlacklistedToken.token_id).where(BlacklistedToken.token_id.in_(outstanding_ids)))).scalars().all()
    )
    for token_id in outstanding_ids:
        if token_id not in existing_blacklisted:
            db.add(BlacklistedToken(blacklisted_at=datetime.now(timezone.utc), token_id=token_id))
    await db.commit()


def session_info(settings: Settings, payload: dict | None = None) -> dict:
    info = {"idle_minutes": settings.session_idle_minutes, "max_hours": settings.session_max_hours}
    if payload and payload.get("auth_time"):
        info["expires_at"] = int(payload["auth_time"]) + settings.session_max_hours * 3600
    return info
