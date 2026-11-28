"""Settings — mirrors backend/config/settings/base.py 1:1 (same env var names,
same defaults) so both backends read the same .env files without surprises."""
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent
DJANGO_BACKEND_DIR = BASE_DIR.parent / "backend"


class Settings(BaseSettings):
    # fast-backend has no .env of its own — it reads the Django backend's real env files
    # directly, so both backends always share one source of truth for DATABASE_URL,
    # REDIS_CACHE_URL, secrets, etc. Later files override earlier ones, so .env.local
    # (if present) wins over .env, matching backend/config/settings' own precedence.
    model_config = SettingsConfigDict(
        env_file=(
            str(DJANGO_BACKEND_DIR / ".env"),
            str(DJANGO_BACKEND_DIR / ".env.local"),
        ),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ---------- Core ----------
    django_secret_key: str = "dev-insecure-change-me"
    aadhaar_encryption_key: str = ""
    debug: bool = False
    allowed_hosts: str = "localhost,127.0.0.1"

    database_url: str = f"postgresql://erp:erp_password@localhost:5432/erp"

    # ---------- Session / JWT ----------
    session_idle_minutes: int = 30
    session_max_hours: int = 12
    access_token_lifetime_minutes: int = 15

    # ---------- Cookie auth ----------
    auth_cookie_access: str = "access_token"
    auth_cookie_refresh: str = "refresh_token"
    auth_cookie_secure: bool = True
    auth_cookie_samesite: str = "lax"
    auth_cookie_domain: str | None = None
    auth_refresh_cookie_path: str = "/api/v1/auth/"

    # ---------- CORS / CSRF ----------
    cors_allowed_origins: str = "http://localhost:3000"
    csrf_trusted_origins: str = "http://localhost:3000"
    csrf_cookie_domain: str | None = None
    csrf_cookie_samesite: str = "lax"
    session_cookie_samesite: str = "lax"

    # ---------- Account lockout ----------
    max_failed_logins: int = 5
    lockout_minutes: int = 15

    admin_url: str = "admin/"

    # ---------- Redis ----------
    redis_cache_url: str = "redis://localhost:6379/2"
    sentry_dsn: str = ""

    # ---------- Public site / email ----------
    site_url: str = "https://oshitech.in"
    default_from_email: str = "Oshitech <admin@oshitech.in>"
    email_host: str = "smtpout.secureserver.net"
    email_port: int = 465
    email_host_user: str = ""
    email_host_password: str = ""
    email_use_tls: bool = False
    email_use_ssl: bool = True

    # ---------- STRE payments ----------
    razorpay_key_id: str = ""
    razorpay_key_secret: str = ""
    stre_upi_id: str = ""
    stre_payment_form_url: str = ""
    stre_payment_mode: str = ""
    cashfree_app_id: str = ""
    cashfree_secret_key: str = ""
    cashfree_env: str = ""
    cashfree_notify_url: str = ""
    stre_payee_name: str = "STRE Exam Cell"

    # ---------- Cloudflare Turnstile ----------
    # Defaults are Cloudflare's published always-pass test keys for local dev.
    # https://developers.cloudflare.com/turnstile/troubleshooting/testing/
    turnstile_site_key: str = "1x00000000000000000000AA"
    turnstile_secret_key: str = "1x0000000000000000000000000000000AA"

    @property
    def allowed_hosts_list(self) -> list[str]:
        return [h.strip() for h in self.allowed_hosts.split(",") if h.strip()]

    @property
    def cors_allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_allowed_origins.split(",") if o.strip()]

    @property
    def csrf_trusted_origins_list(self) -> list[str]:
        return [o.strip() for o in self.csrf_trusted_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
