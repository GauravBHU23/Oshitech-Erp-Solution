import os
import sys
import threading
import time

from django.apps import AppConfig

SYNC_EVERY_SECONDS = 120


def _payment_sync_loop():
    """Server chalte hi background me: har 2 minute pending Cashfree payments check karke confirm (roll no + admit card bhi)."""
    time.sleep(20)  # server ko pehle poora start hone do
    while True:
        try:
            from django.core.cache import cache
            from django.db import close_old_connections

            from . import payments
            from .views import _auto_sync_worker

            # Kai workers / processes ho to bhi ek hi baar chale
            if payments.cashfree_enabled() and cache.add("stre-auto-sync", 1, SYNC_EVERY_SECONDS - 5):
                _auto_sync_worker(background=True)
            close_old_connections()
        except Exception:  # noqa: BLE001 — loop kabhi band na ho
            pass
        time.sleep(SYNC_EVERY_SECONDS)


class StreConfig(AppConfig):
    name = "apps.stre"
    verbose_name = "STRE - Student Talent Recognition Exam"

    def ready(self):
        argv = " ".join(sys.argv).lower()
        # Tests, migrate, shell jaise commands me nahi; sirf asli server (runserver / gunicorn) me
        is_server = "runserver" in argv or "gunicorn" in argv or "uvicorn" in argv or "daphne" in argv
        if not is_server or os.environ.get("STRE_DISABLE_AUTO_SYNC") == "1":
            return
        if "runserver" in argv and os.environ.get("RUN_MAIN") != "true":
            return  # runserver ka reloader process nahi, sirf asli wala
        threading.Thread(target=_payment_sync_loop, name="stre-payment-sync", daemon=True).start()
