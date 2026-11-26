import sys

from .base import *  # noqa

DEBUG = True

# `manage.py test` deliberately triggers error-handling code paths (e.g. tests that mock
# a service as offline to confirm the app logs and recovers instead of crashing) — those
# expected errors were being written to logs/backend-errors.log, making it look like a
# real production error happened. Drop the file handler during test runs only; the
# console handler (and the test runner's own pass/fail output) still show everything.
if "test" in sys.argv:
    LOGGING["root"]["handlers"] = [h for h in LOGGING["root"]["handlers"] if h != "error_file"]  # noqa: F405
ALLOWED_HOSTS = ["*"]
AUTH_COOKIE_SECURE = False
# SMTP credentials missing hon to dev me email terminal par print karo;
# production always requires authenticated SMTP.
_configured_email_backend = env("EMAIL_BACKEND")  # noqa: F405
if _configured_email_backend and _configured_email_backend != "django.core.mail.backends.smtp.EmailBackend":
    EMAIL_BACKEND = _configured_email_backend
elif EMAIL_HOST_USER and EMAIL_HOST_PASSWORD:  # noqa: F405
    EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
else:
    EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"

# ---------- CSRF "Origin checking failed" fix (development) ----------
# Browser frontend (Next.js :3000) se baat karta hai; Next proxy request ko Django tak le jata hai
# aur asli address X-Forwarded-Host me bhejta hai. Isse localhost, 127.0.0.1, LAN IP (phone se
# testing) sab par approve/save kaam karta hai.
USE_X_FORWARDED_HOST = True
CSRF_TRUSTED_ORIGINS = list(dict.fromkeys(CSRF_TRUSTED_ORIGINS + [  # noqa: F405
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    # ngrok HTTPS tunnels
    "https://*.ngrok-free.app",
    "https://*.ngrok-free.dev",
    "https://*.ngrok.app",
    "https://*.ngrok.io",
]))
