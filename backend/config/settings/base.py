import os
from datetime import timedelta
from pathlib import Path

import dj_database_url

BASE_DIR = Path(__file__).resolve().parent.parent.parent


def _load_dotenv(path):
    """Load environment values without overwriting already-set process variables."""
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key, value = key.strip(), value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        if key:
            os.environ.setdefault(key, value)


# Local overrides win over the shared .env defaults; real process environment
# values still win over both because _load_dotenv uses setdefault.
_load_dotenv(BASE_DIR / ".env.local")
_load_dotenv(BASE_DIR / ".env")


def env(key, default=None):
    return os.environ.get(key, default)


def env_list(key, default=""):
    return [v.strip() for v in env(key, default).split(",") if v.strip()]


SECRET_KEY = env("DJANGO_SECRET_KEY", "dev-insecure-change-me")
AADHAAR_ENCRYPTION_KEY = env("AADHAAR_ENCRYPTION_KEY", "")
DEBUG = False
ALLOWED_HOSTS = env_list("ALLOWED_HOSTS", "localhost,127.0.0.1")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # third party
    "rest_framework",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "django_filters",
    "drf_spectacular",
    "silk",
    # local
    "apps.core",
    "apps.accounts",
    "apps.schools",
    "apps.academics",
    "apps.teachers",
    "apps.students",
    "apps.exams",
    "apps.attendance",
    "apps.campus",
    "apps.stre",
]

# Slow-query / N+1 investigation tool (django-silk). Off by default — turn it on
# temporarily (ENABLE_SILK=True) only while actively profiling, since recording every
# request's queries adds real overhead; never leave it on in normal production traffic.
ENABLE_SILK = env("ENABLE_SILK", "False") == "True"

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "apps.core.middleware.NoStoreApiMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "apps.core.middleware.AdminSessionTimeoutMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "apps.core.middleware.AdminSecurityHeadersMiddleware",
]
if ENABLE_SILK:
    MIDDLEWARE.insert(1, "silk.middleware.SilkyMiddleware")

# /silk/ shows every captured request's SQL queries, including duplicate/N+1 counts and
# timings — admin-only, and only reachable at all when ENABLE_SILK is on.
SILKY_AUTHENTICATION = True
SILKY_AUTHORISATION = True
SILKY_PERMISSIONS = lambda user: user.is_staff  # noqa: E731
SILKY_MAX_RECORDED_REQUESTS = 2000
SILKY_INTERCEPT_PERCENT = 100

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ]
        },
    }
]

DATABASES = {
    "default": dj_database_url.config(
        default=f"sqlite:///{BASE_DIR / 'db.sqlite3'}", conn_max_age=600
    )
}

AUTH_USER_MODEL = "accounts.User"

# Argon2 pehle: sabse strong hasher
PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.Argon2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",
]
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {"min_length": 10},
    },
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "Asia/Kolkata"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_ROOT = BASE_DIR / "media"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ---------- DRF ----------
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["apps.accounts.authentication.CookieJWTAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ],
    "DEFAULT_PAGINATION_CLASS": "apps.core.pagination.StandardPagination",
    "PAGE_SIZE": 25,
    "DEFAULT_THROTTLE_CLASSES": [
        "apps.core.throttles.AtomicAnonRateThrottle",
        "apps.core.throttles.AtomicUserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": "60/min",
        "user": "300/min",
        "login": "10/min",
        "verify": "30/min",
        "support": "10/hour",
        "live_chat_message": "30/min",
        "admin_email": "10/hour",
        "stre": "150/hour",
        "stre_webhook": "600/hour",
        # OTP endpoints are a classic bot/abuse target (email bombing, code brute-forcing)
        # and get their own tight budgets, separate from general STRE browsing traffic.
        "stre_otp_send": "5/hour",
        "stre_otp_verify": "10/min",
    },
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
}

SPECTACULAR_SETTINGS = {
    "TITLE": "Oshitech Education ERP API",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
}

# ---------- Session timeout ----------
# Itne minute kuch na karne par apne aap logout; aur login ke itne ghante baad dobara login zaroori
SESSION_IDLE_MINUTES = int(env("SESSION_IDLE_MINUTES", "30"))
SESSION_MAX_HOURS = int(env("SESSION_MAX_HOURS", "12"))

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),
    # Rotation ke saath har refresh par aage badhta hai = sliding idle timeout
    "REFRESH_TOKEN_LIFETIME": timedelta(minutes=SESSION_IDLE_MINUTES),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": True,
}

# ---------- Cookie auth ----------
AUTH_COOKIE_ACCESS = "access_token"
AUTH_COOKIE_REFRESH = "refresh_token"
AUTH_COOKIE_SECURE = True
AUTH_COOKIE_SAMESITE = "Lax"
AUTH_COOKIE_DOMAIN = env("AUTH_COOKIE_DOMAIN") or None
AUTH_REFRESH_COOKIE_PATH = "/api/v1/auth/"

# ---------- CORS / CSRF ----------
CORS_ALLOWED_ORIGINS = env_list("CORS_ALLOWED_ORIGINS", "http://localhost:3000")
CORS_ALLOW_CREDENTIALS = True
CSRF_TRUSTED_ORIGINS = env_list("CSRF_TRUSTED_ORIGINS", "http://localhost:3000")
CSRF_COOKIE_DOMAIN = env("CSRF_COOKIE_DOMAIN") or None
# Django's own session/CSRF cookies aren't used for API auth (that's the AUTH_COOKIE_* JWT
# cookies above) but admin login still relies on them — keep SameSite explicit rather than
# relying on Django's implicit default.
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_HTTPONLY = False  # frontend JS reads this to send X-CSRFToken (see frontend/src/lib/api.ts)

# ---------- Account lockout ----------
MAX_FAILED_LOGINS = 5
LOCKOUT_MINUTES = 15

# Sirf tab True karein jab Nginx/Cloudflare ke peeche ho (audit log IP ke liye)
USE_X_FORWARDED_FOR = env("USE_X_FORWARDED_FOR", "False") == "True"

ADMIN_URL = env("ADMIN_URL", "admin/")

# ---------- Celery ----------
CELERY_BROKER_URL = env("CELERY_BROKER_URL", "redis://localhost:6379/0")
CELERY_RESULT_BACKEND = env("CELERY_RESULT_BACKEND", "redis://localhost:6379/1")
CELERY_BEAT_SCHEDULE = {
    "stre-payment-sync-every-two-minutes": {
        "task": "apps.stre.tasks.sync_stre_payments",
        "schedule": 120.0,
    },
}

SENTRY_DSN = (env("SENTRY_DSN", "") or "").strip()
if SENTRY_DSN:
    import sentry_sdk
    from sentry_sdk.integrations.django import DjangoIntegration

    def _sanitize_sentry_event(event, hint):
        request = event.get("request")
        if isinstance(request, dict):
            for key in ("cookies", "data", "query_string"):
                request.pop(key, None)
            url = request.get("url")
            if isinstance(url, str):
                request["url"] = url.split("?", 1)[0]
            headers = request.get("headers")
            if isinstance(headers, dict):
                request["headers"] = {
                    key: value for key, value in headers.items()
                    if key.lower() not in {"authorization", "cookie", "set-cookie", "x-csrftoken"}
                }
        return event

    sentry_sdk.init(
        dsn=SENTRY_DSN,
        integrations=[DjangoIntegration()],
        send_default_pii=False,
        before_send=_sanitize_sentry_event,
    )


# ---------- Public site / email ----------
SITE_URL = env("SITE_URL", "https://oshitech.in")  # public links in emails
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", "Oshitech <admin@oshitech.in>")
EMAIL_BACKEND = env("EMAIL_BACKEND", "django.core.mail.backends.smtp.EmailBackend")
EMAIL_HOST = env("EMAIL_HOST", "smtpout.secureserver.net")
EMAIL_PORT = int(env("EMAIL_PORT", "465"))
EMAIL_HOST_USER = env("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = env("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = env("EMAIL_USE_TLS", "False").strip().lower() in {"1", "true", "yes", "on"}
EMAIL_USE_SSL = env("EMAIL_USE_SSL", "True").strip().lower() in {"1", "true", "yes", "on"}
EMAIL_TIMEOUT = 15

# Keep application errors on disk as well as in the hosting console.
# Set BACKEND_LOG_DIR to a persistent mounted directory on hosted deployments.
from pathlib import Path
import logging

LOG_DIR = Path(env("BACKEND_LOG_DIR", str(Path(BASE_DIR) / "logs")))
LOG_DIR.mkdir(parents=True, exist_ok=True)

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "backend": {
            "format": "%(asctime)s %(levelname)s [%(name)s] %(message)s",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "level": "INFO",
            "formatter": "backend",
        },
        "error_file": {
            "class": "logging.handlers.RotatingFileHandler",
            "filename": str(LOG_DIR / "backend-errors.log"),
            "maxBytes": 5 * 1024 * 1024,
            "backupCount": 5,
            "encoding": "utf-8",
            "level": "ERROR",
            "formatter": "backend",
        },
    },
    "root": {
        "handlers": ["console", "error_file"],
        "level": "INFO",
    },
}

# ---------- STRE exam fee payment ----------
# Razorpay keys set hon to online payment; warna UPI ID par pay karke transaction ID submit hota hai.
RAZORPAY_KEY_ID = env("RAZORPAY_KEY_ID", "")
RAZORPAY_KEY_SECRET = env("RAZORPAY_KEY_SECRET", "")
STRE_UPI_ID = env("STRE_UPI_ID", "")
# Cashfree Payment Form link (backup: candidate form se pay karke Payment ID submit kare, admin verify kare)
STRE_PAYMENT_FORM_URL = env("STRE_PAYMENT_FORM_URL", "")
# link = sirf Cashfree payment link (form) dikhe; online = sirf site par checkout; both = dono.
# Khali chhodo to: payment link set hai to "link", warna "online".
STRE_PAYMENT_MODE = env("STRE_PAYMENT_MODE", "").strip().lower()
# Cashfree Payment Gateway (priority: Cashfree > Razorpay > UPI manual)
CASHFREE_APP_ID = env("CASHFREE_APP_ID", "")
CASHFREE_SECRET_KEY = env("CASHFREE_SECRET_KEY", "")
CASHFREE_ENV = env("CASHFREE_ENV", "")  # production / sandbox (khali = secret key se pata lagao)
CASHFREE_NOTIFY_URL = env("CASHFREE_NOTIFY_URL", "")  # https://<backend-domain>/api/v1/stre/pay/cashfree-webhook/
STRE_PAYEE_NAME = env("STRE_PAYEE_NAME", "STRE Exam Cell")

# Cloudflare Turnstile ("I'm not a robot" check). Default values are Cloudflare's
# published always-pass test keys for local dev; set real keys in .env for production.
# https://developers.cloudflare.com/turnstile/troubleshooting/testing/
TURNSTILE_SITE_KEY = env("TURNSTILE_SITE_KEY", "1x00000000000000000000AA")
TURNSTILE_SECRET_KEY = env("TURNSTILE_SECRET_KEY", "1x0000000000000000000000000000000AA")
