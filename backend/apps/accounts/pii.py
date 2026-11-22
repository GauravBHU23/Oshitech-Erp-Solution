import base64
import hashlib

from cryptography.fernet import Fernet
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured


def _fernet():
    key = settings.AADHAAR_ENCRYPTION_KEY
    if not key and settings.DEBUG:
        # Local development convenience only. Production must supply a dedicated key.
        key = base64.urlsafe_b64encode(hashlib.sha256(settings.SECRET_KEY.encode("utf-8")).digest()).decode("ascii")
    if not key:
        raise ImproperlyConfigured("Production requires AADHAAR_ENCRYPTION_KEY.")
    try:
        return Fernet(key.encode("ascii"))
    except (ValueError, UnicodeEncodeError) as exc:
        raise ImproperlyConfigured("AADHAAR_ENCRYPTION_KEY must be a valid Fernet key.") from exc


def encrypt_aadhaar(value: str) -> str:
    return _fernet().encrypt(value.encode("ascii")).decode("ascii")


def decrypt_aadhaar(value: str) -> str:
    return _fernet().decrypt(value.encode("ascii")).decode("ascii")
