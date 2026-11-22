from django.conf import settings

from .models import AuditLog


def get_client_ip(request):
    if settings.USE_X_FORWARDED_FOR:
        fwd = request.META.get("HTTP_X_FORWARDED_FOR")
        if fwd:
            return fwd.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def log_action(request, action, instance, changes=None):
    user = request.user if request.user.is_authenticated else None
    AuditLog.objects.create(
        user=user,
        # School par hua action bhi usi school ke audit log me dikhe
        school_id=getattr(instance, "school_id", None) or (instance.pk if instance.__class__.__name__ == "School" else None),
        action=action,
        model=instance.__class__.__name__,
        object_id=str(instance.pk),
        changes=changes or {},
        ip_address=get_client_ip(request),
    )
