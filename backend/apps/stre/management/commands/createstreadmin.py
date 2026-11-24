import getpass

from django.contrib.auth import get_user_model, password_validation
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError

from apps.core.roles import Role


class Command(BaseCommand):
    help = "Create (or reset) an Upcoming Exam (STRE) portal admin account."

    def add_arguments(self, parser):
        parser.add_argument("email")
        parser.add_argument("--first-name", default="Exam")
        parser.add_argument("--last-name", default="Admin")

    def handle(self, *args, **opts):
        User = get_user_model()
        email = opts["email"].strip().lower()
        user = User.objects.filter(email=email).first()
        if user and user.role != Role.STRE_ADMIN:
            raise CommandError("This email belongs to another type of account. Use a different email.")
        password = getpass.getpass("Password: ")
        if password != getpass.getpass("Password (again): "):
            raise CommandError("Passwords do not match.")
        try:
            password_validation.validate_password(password, user)
        except ValidationError as exc:
            raise CommandError(" ".join(exc.messages)) from exc
        if user is None:
            user = User(email=email, role=Role.STRE_ADMIN, first_name=opts["first_name"], last_name=opts["last_name"])
        user.is_active = True
        user.set_password(password)
        user.failed_login_attempts = 0
        user.locked_until = None
        user.save()
        self.stdout.write(self.style.SUCCESS(f"Exam portal admin ready: {email}  (login at /login/stre-admin)"))
