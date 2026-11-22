from .base import *  # noqa

DEBUG = True
ALLOWED_HOSTS = ["*"]
AUTH_COOKIE_SECURE = False
# Gmail/SMTP user + password backend/.env me bhare hon to asli email jayegi, warna terminal me print hogi
EMAIL_BACKEND = env("EMAIL_BACKEND") or (  # noqa: F405
    "django.core.mail.backends.smtp.EmailBackend"
    if EMAIL_HOST_USER and EMAIL_HOST_PASSWORD  # noqa: F405
    else "django.core.mail.backends.console.EmailBackend"
)

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
