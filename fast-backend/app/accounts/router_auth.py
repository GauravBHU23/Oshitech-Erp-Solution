"""Ports backend/apps/accounts/views.py's CsrfView/LoginCaptchaView/LoginView/
RefreshView/LogoutView/MeView/PasswordChangeView — response shapes, cookie
attributes, and error messages all verified against the Django source directly."""
from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts import service
from app.accounts.schemas import CaptchaOut, LoginIn, LoginOut, MeOut, PasswordChangeIn, SessionInfoOut, UserOut
from app.config import Settings, get_settings
from app.core.deps import AuthenticatedUser, get_current_user, get_db_session
from app.core.errors import ApiError
from app.core.security import csrf
from app.core.security.captcha import CaptchaError, check_captcha, new_captcha
from app.core.security.jwt import TokenError, auth_time_expired, decode_token
from app.core.security.password_validation import validate_password_strength
from app.core.security.passwords import hash_password, verify_password
from app.core.security.sessions import revoke_session, session_is_active, touch_session

router = APIRouter()


def _set_cookies(response: Response, settings: Settings, access: str, refresh: str | None = None) -> None:
    common = dict(httponly=True, secure=settings.auth_cookie_secure, samesite=settings.auth_cookie_samesite, domain=settings.auth_cookie_domain)
    response.set_cookie(settings.auth_cookie_access, access, max_age=settings.access_token_lifetime_minutes * 60, path="/", **common)
    if refresh:
        response.set_cookie(settings.auth_cookie_refresh, refresh, max_age=settings.session_idle_minutes * 60, path=settings.auth_refresh_cookie_path, **common)


def _clear_cookies(response: Response, settings: Settings) -> None:
    response.delete_cookie(settings.auth_cookie_access, path="/", domain=settings.auth_cookie_domain)
    response.delete_cookie(settings.auth_cookie_refresh, path=settings.auth_refresh_cookie_path, domain=settings.auth_cookie_domain)


def _enforce_csrf_or_raise(request: Request) -> None:
    try:
        csrf.enforce_csrf(request)
    except csrf.CsrfError as exc:
        raise ApiError(status.HTTP_403_FORBIDDEN, f"CSRF check failed: {exc}")


@router.get("/csrf/")
async def csrf_cookie(response: Response, settings: Settings = Depends(get_settings)):
    """Matches Django's @ensure_csrf_cookie CsrfView — issues the non-httpOnly
    csrftoken cookie the frontend reads via JS to send as X-CSRFToken."""
    token = csrf.generate_csrf_token()
    response.set_cookie(
        csrf.CSRF_COOKIE_NAME, token, httponly=False,
        secure=settings.auth_cookie_secure, samesite=settings.csrf_cookie_samesite, domain=settings.csrf_cookie_domain,
    )
    return {"detail": "CSRF cookie set."}


@router.get("/captcha/", response_model=CaptchaOut)
async def login_captcha(db: AsyncSession = Depends(get_db_session)):
    captcha_id, svg = await new_captcha(db)
    return CaptchaOut(id=str(captcha_id), svg=svg)


@router.post("/login/", response_model=LoginOut)
async def login(
    payload: LoginIn,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
):
    _enforce_csrf_or_raise(request)
    # CAPTCHA before any account lookup — every attempt faces the same challenge,
    # matching Django's LoginView ordering exactly.
    try:
        await check_captcha(db, payload.captcha_id, payload.captcha)
    except CaptchaError as exc:
        raise ApiError(status.HTTP_400_BAD_REQUEST, {"captcha": [str(exc)]})

    email = payload.email.lower()
    user = await service.get_user_by_email(db, email)
    invalid_credentials = ApiError(status.HTTP_401_UNAUTHORIZED, "Invalid email or password.")

    if user is None:
        raise invalid_credentials
    if service.is_locked(user):
        raise ApiError(status.HTTP_423_LOCKED, "This account is temporarily locked. Please try again later.")
    if not user.is_active or not verify_password(user.password, payload.password):
        if user.is_active:
            await service.register_failed_login(db, user, settings)
        raise invalid_credentials

    await service.reset_failed_logins(db, user)
    access, refresh, refresh_payload = await service.issue_session(db, user)
    _set_cookies(response, settings, access, refresh)
    return LoginOut(user=UserOut.model_validate(user), session=SessionInfoOut(**service.session_info(settings, refresh_payload)))


@router.post("/refresh/")
async def refresh(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
):
    _enforce_csrf_or_raise(request)
    token = request.cookies.get(settings.auth_cookie_refresh)
    if not token:
        raise ApiError(status.HTTP_401_UNAUTHORIZED, "No refresh token.")

    try:
        payload = decode_token(token, expected_type="refresh")
    except TokenError:
        _clear_cookies(response, settings)
        raise ApiError(status.HTTP_401_UNAUTHORIZED, "Your session has expired. Please sign in again.")

    if await service.is_jti_blacklisted(db, payload.get("jti")):
        _clear_cookies(response, settings)
        raise ApiError(status.HTTP_401_UNAUTHORIZED, "Your session has expired. Please sign in again.")

    if auth_time_expired(payload, session_max_hours=settings.session_max_hours):
        await service.blacklist_jti(db, payload.get("jti"))
        await db.commit()
        _clear_cookies(response, settings)
        raise ApiError(status.HTTP_401_UNAUTHORIZED, "Your session has ended. Please sign in again.")

    if not await session_is_active(payload.get("user_id"), payload.get("sid")):
        _clear_cookies(response, settings)
        raise ApiError(status.HTTP_401_UNAUTHORIZED, "Your session has expired. Please sign in again.")

    new_access, new_refresh, new_payload = await service.rotate_session(db, payload)
    await touch_session(payload.get("user_id"), payload.get("sid"))
    _set_cookies(response, settings, new_access, new_refresh)
    return {"detail": "refreshed", "session": service.session_info(settings, payload)}


@router.post("/logout/")
async def logout(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
):
    _enforce_csrf_or_raise(request)
    refresh_cookie = request.cookies.get(settings.auth_cookie_refresh)
    if refresh_cookie:
        try:
            payload = decode_token(refresh_cookie, expected_type="refresh")
            await service.blacklist_jti(db, payload.get("jti"))
            await db.commit()
            await revoke_session(payload.get("user_id"), payload.get("sid"))
        except TokenError:
            pass
    access_cookie = request.cookies.get(settings.auth_cookie_access)
    if access_cookie:
        try:
            access_payload = decode_token(access_cookie, expected_type="access")
            await revoke_session(access_payload.get("user_id"), access_payload.get("sid"))
        except TokenError:
            pass
    _clear_cookies(response, settings)
    return {"detail": "Logged out."}


@router.get("/me/", response_model=MeOut)
async def me(current: AuthenticatedUser = Depends(get_current_user), settings: Settings = Depends(get_settings)):
    data = UserOut.model_validate(current.user).model_dump()
    data["session"] = service.session_info(settings)
    return data


@router.post("/change-password/")
async def change_password(
    payload: PasswordChangeIn,
    response: Response,
    db: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
    current: AuthenticatedUser = Depends(get_current_user),
):
    user = current.user
    if not verify_password(user.password, payload.current_password):
        raise ApiError(status.HTTP_400_BAD_REQUEST, {"current_password": ["Current password is incorrect."]})
    if verify_password(user.password, payload.new_password):
        raise ApiError(status.HTTP_400_BAD_REQUEST, {"new_password": ["Choose a password different from your current password."]})
    strength_errors = validate_password_strength(payload.new_password)
    if strength_errors:
        raise ApiError(status.HTTP_400_BAD_REQUEST, {"new_password": strength_errors})

    user.password = hash_password(payload.new_password)
    await db.commit()
    await service.revoke_all_user_tokens(db, user)
    access, refresh_token, refresh_payload = await service.issue_session(db, user)
    _set_cookies(response, settings, access, refresh_token)
    return {"detail": "Password updated. Other signed-in sessions have been revoked.", "session": service.session_info(settings, refresh_payload)}
