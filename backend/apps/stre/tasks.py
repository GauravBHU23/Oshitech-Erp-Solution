import uuid

from celery import shared_task
from django.core.cache import cache

from . import payments


@shared_task(ignore_result=True, acks_late=True, reject_on_worker_lost=True)
def process_stre_email_logs(log_ids):
    from .views import _process_email_logs

    _process_email_logs(log_ids, background=True)


@shared_task(ignore_result=True, acks_late=True, reject_on_worker_lost=True)
def sync_stre_payments():
    if not payments.cashfree_enabled():
        return

    lock_key = "stre-auto-sync"
    lock_token = uuid.uuid4().hex
    if not cache.add(lock_key, lock_token, 600):
        return

    try:
        from .views import _auto_sync_worker

        _auto_sync_worker(background=True)
    finally:
        if cache.get(lock_key) == lock_token:
            cache.delete(lock_key)
