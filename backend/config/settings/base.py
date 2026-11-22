import os
from datetime import timedelta
from pathlib import Path

import dj_database_url

BASE_DIR = Path(__file__).resolve().parent.parent.parent


def _load_dotenv(path):
    """backend/.env padho (local runserver ke liye). Pehle se set environment variables jeette hain."""
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

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "apps.core.middleware.NoStoreApiMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
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
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": "60/min",
        "user": "300/min",
        "login": "10/min",
        "verify": "30/min",
        "support": "10/hour",
        "stre": "150/hour",
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

# ---------- Account lockout ----------
MAX_FAILED_LOGINS = 5
LOCKOUT_MINUTES = 15

# Sirf tab True karein jab Nginx/Cloudflare ke peeche ho (audit log IP ke liye)
USE_X_FORWARDED_FOR = env("USE_X_FORWARDED_FOR", "False") == "True"

ADMIN_URL = env("ADMIN_URL", "admin/")

# ---------- Celery ----------
CELERY_BROKER_URL = env("CELERY_BROKER_URL", "redis://localhost:6379/0")
CELERY_RESULT_BACKEND = env("CELERY_RESULT_BACKEND", "redis://localhost:6379/1")


# ---------- Public site / email ----------
SITE_URL = env("SITE_URL", "http://localhost:3000")  # email links (STRE status / admit card)
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", "STRE Exam Cell <no-reply@localhost>")
EMAIL_BACKEND = env("EMAIL_BACKEND", "django.core.mail.backends.smtp.EmailBackend")
EMAIL_HOST = env("EMAIL_HOST", "localhost")
EMAIL_PORT = int(env("EMAIL_PORT", "587"))
EMAIL_HOST_USER = env("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = env("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = env("EMAIL_USE_TLS", "True") == "True"
EMAIL_TIMEOUT = 15

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
