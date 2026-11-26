"""Registration report: har student/teacher registration (RegistrationRequest) ka
poora data CSV me export karta hai, saath me terminal par role-wise aur status-wise count.

Run: python manage.py registration_report
Optional: python manage.py registration_report --school <school-id>
"""
import csv
from collections import Counter
from datetime import datetime

from django.core.management.base import BaseCommand

from apps.accounts.models import RegistrationRequest


class Command(BaseCommand):
    help = "Export a CSV report of all registration requests (students/teachers), with role/status counts."

    def add_arguments(self, parser):
        parser.add_argument("--school", help="Only report registrations for this school ID", default=None)

    def handle(self, *args, **options):
        requests = RegistrationRequest.objects.select_related("school", "reviewed_by").order_by("-created_at")
        if options["school"]:
            requests = requests.filter(school_id=options["school"])
        requests = list(requests)

        total = len(requests)
        role_counts = Counter(r.role for r in requests)
        status_counts = Counter(r.status for r in requests)

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"registrations_report_{timestamp}.csv"

        with open(filename, "w", newline="", encoding="utf-8-sig") as f:
            writer = csv.writer(f)
            writer.writerow([
                "Registered on", "Role", "Status", "First name", "Last name", "Email", "Phone",
                "School", "Reviewed by", "Reviewed at",
            ])
            for r in requests:
                writer.writerow([
                    r.created_at.strftime("%Y-%m-%d %H:%M"),
                    r.get_role_display(),
                    r.get_status_display(),
                    r.first_name,
                    r.last_name,
                    r.email,
                    r.phone,
                    r.school.name if r.school_id else "",
                    r.reviewed_by.get_full_name() if r.reviewed_by_id else "",
                    r.reviewed_at.strftime("%Y-%m-%d %H:%M") if r.reviewed_at else "",
                ])

        self.stdout.write("=" * 50)
        self.stdout.write("REGISTRATION REPORT")
        self.stdout.write("=" * 50)
        self.stdout.write(f"Total registrations: {total}")
        self.stdout.write("")
        self.stdout.write("By role:")
        for role, count in role_counts.most_common():
            self.stdout.write(f"  {role}: {count}")
        self.stdout.write("")
        self.stdout.write("By status:")
        for status, count in status_counts.most_common():
            self.stdout.write(f"  {status}: {count}")
        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS(f"CSV saved: {filename}"))
        self.stdout.write("=" * 50)
