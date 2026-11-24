from django.apps import AppConfig


class StudentsConfig(AppConfig):
    name = "apps.students"

    def ready(self):
        from . import signals  # noqa: F401
