import time

from django.conf import settings
from django.contrib.auth import logout
from django.shortcuts import redirect


class NoStoreApiMiddleware:
    """Prevent browsers and intermediaries from caching API payloads."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if request.path.startswith("/api/v1/"):
            response["Cache-Control"] = "no-store, private"
            response["Pragma"] = "no-cache"
        return response


class AdminSessionTimeoutMiddleware:
    """Enforce idle and absolute expiry for Django's separate admin session."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        is_admin_path = request.path.startswith(f"/{settings.ADMIN_URL}")
        now = time.time()
        if is_admin_path and request.user.is_authenticated:
            started = request.session.get("admin_session_started_at")
            last_activity = request.session.get("admin_last_activity_at")
            idle_limit = settings.SESSION_IDLE_MINUTES * 60
            max_lifetime = settings.SESSION_MAX_HOURS * 3600
            if (
                not started
                or not last_activity
                or now - last_activity >= idle_limit
                or now - started >= max_lifetime
            ):
                logout(request)
                return redirect(f"/{settings.ADMIN_URL}?reason=expired")
            request.session["admin_last_activity_at"] = now
            request.session.set_expiry(idle_limit)

        response = self.get_response(request)
        if is_admin_path and request.user.is_authenticated and not request.session.get("admin_session_started_at"):
            request.session["admin_session_started_at"] = now
            request.session["admin_last_activity_at"] = now
            request.session.set_expiry(settings.SESSION_IDLE_MINUTES * 60)
        return response
