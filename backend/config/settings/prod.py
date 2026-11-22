from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa

DEBUG = False

if SECRET_KEY == "dev-insecure-change-me" or len(SECRET_KEY) < 50:  # noqa: F405
    raise ImproperlyConfigured("DJANGO_SECRET_KEY set karein (kam se kam 50 chars).")
if not AADHAAR_ENCRYPTION_KEY:  # noqa: F405
    raise ImproperlyConfigured("AADHAAR_ENCRYPTION_KEY set karein; Aadhaar numbers encrypted store hote hain.")

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
