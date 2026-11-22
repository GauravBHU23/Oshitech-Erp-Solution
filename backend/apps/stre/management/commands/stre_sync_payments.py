"""Cron ke liye: pending Cashfree payments check karke confirm karo.
Production me har 5 minute: */5 * * * * python manage.py stre_sync_payments"""
from django.core.management.base import BaseCommand

from apps.stre import payments
from apps.stre.models import StreRegistration
from apps.stre.views import try_auto_confirm


class Command(BaseCommand):
    help = "Confirm STRE registrations that are paid on Cashfree but still pending here."

    def handle(self, *args, **options):
        if not payments.cashfree_enabled():
            self.stdout.write("Cashfree is not configured.")
            return
        pending = StreRegistration.objects.select_related("exam").filter(
            status=StreRegistration.Status.PAYMENT_PENDING, payment_method="cashfree"
        ).exclude(gateway_order_id="")
        confirmed = []
        for reg in pending:
            reg, _ = try_auto_confirm(reg, force=True)
            if reg.is_paid:
                confirmed.append(reg.registration_no)
        self.stdout.write(f"Checked {pending.count() + len(confirmed)} pending; confirmed {len(confirmed)}: {', '.join(confirmed) or '-'}")
