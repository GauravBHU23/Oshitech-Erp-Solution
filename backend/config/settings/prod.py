from django.core.exceptions import ImproperlyConfigured
from cryptography.fernet import Fernet, InvalidToken
from urllib.parse import urlsplit

from .base import *  # noqa

DEBUG = False

if EMAIL_BACKEND != "django.core.mail.backends.smtp.EmailBackend":  # noqa: F405
    raise ImproperlyConfigured("Production email backend SMTP hona chahiye.")
if not EMAIL_HOST_USER or not EMAIL_HOST_PASSWORD:  # noqa: F405
    raise ImproperlyConfigured("Production SMTP ke liye EMAIL_HOST_USER aur EMAIL_HOST_PASSWORD set karein.")
if EMAIL_USE_TLS and EMAIL_USE_SSL:  # noqa: F405
    raise ImproperlyConfigured("SMTP mein EMAIL_USE_TLS aur EMAIL_USE_SSL dono ek saath enable nahi ho sakte.")

if SECRET_KEY == "dev-insecure-change-me" or len(SECRET_KEY) < 50 or SECRET_KEY.startswith("change-me"):  # noqa: F405
    raise ImproperlyConfigured("DJANGO_SECRET_KEY set karein (kam se kam 50 chars).")
try:
    Fernet(AADHAAR_ENCRYPTION_KEY.encode())  # noqa: F405
except (AttributeError, ValueError, InvalidToken) as exc:
    raise ImproperlyConfigured("AADHAAR_ENCRYPTION_KEY ek valid Fernet key hona chahiye.") from exc

if not ALLOWED_HOSTS or "*" in ALLOWED_HOSTS or all(host in {"localhost", "127.0.0.1"} for host in ALLOWED_HOSTS):  # noqa: F405
    raise ImproperlyConfigured("Production ALLOWED_HOSTS mein apna public domain set karein.")
if DATABASES["default"]["ENGINE"] != "django.db.backends.postgresql":
    raise ImproperlyConfigured("Production ke liye PostgreSQL DATABASE_URL set karein.")
db_password = DATABASES["default"].get("PASSWORD", "")
if len(db_password) < 24 or db_password in {"erp_password", "replace-with-a-long-random-alphanumeric-password"}:
    raise ImproperlyConfigured("PostgreSQL password kam se kam 24 characters ka unique secret hona chahiye.")
if ADMIN_URL.rstrip("/") == "admin" or len(ADMIN_URL.strip("/")) < 20 or "change-me" in ADMIN_URL.lower():  # noqa: F405
    raise ImproperlyConfigured("Production ADMIN_URL ko ek unique secret path se replace karein.")
if not ADMIN_URL.endswith("/") or ADMIN_URL.startswith("/"):  # noqa: F405
    raise ImproperlyConfigured("ADMIN_URL relative path ho aur trailing slash ke saath khatam ho.")
site = urlsplit(SITE_URL)  # noqa: F405
if site.scheme != "https" or not site.netloc or site.netloc in {"your-domain.com", "localhost:3000"}:
    raise ImproperlyConfigured("Production SITE_URL ko apne public HTTPS domain par set karein.")
if TURNSTILE_SECRET_KEY == "1x0000000000000000000000000000000AA":  # noqa: F405
    raise ImproperlyConfigured("Production TURNSTILE_SECRET_KEY ko apni real Cloudflare secret key se set karein.")

SECURE_SSL_REDIRECT = True
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SESSION_COOKIE_HTTPONLY = True
X_FRAME_OPTIONS = "DENY"
AUTH_COOKIE_SECURE = True

# DRF throttles and app-wide cache locks must be shared by every Gunicorn worker
# and backend replica. Redis is already a required service for the worker queue.
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.redis.RedisCache",
        "LOCATION": env("REDIS_CACHE_URL", "redis://redis:6379/2"),  # noqa: F405
        "KEY_PREFIX": "oshitech",
        "TIMEOUT": 300,
    }
}

# Behind the public edge proxy and the internal Nginx load balancer. Set this
# to the exact number of trusted proxy hops represented in X-Forwarded-For.
REST_FRAMEWORK["NUM_PROXIES"] = int(env("DRF_NUM_PROXIES", "1"))  # noqa: F405
