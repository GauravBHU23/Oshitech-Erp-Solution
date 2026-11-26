"""Direct port of backend/apps/accounts/pii.py — same Fernet key/derivation so either
backend can decrypt Aadhaar numbers the other encrypted."""
import base64
import hashlib

from cryptography.fernet import Fernet

from app.config import get_settings


class ConfigurationError(Exception):
    pass


def _fernet() -> Fernet:
    settings = get_settings()
    key = settings.aadhaar_encryption_key
    if not key and settings.debug:
        key = base64.urlsafe_b64encode(hashlib.sha256(settings.django_secret_key.encode("utf-8")).digest()).decode("ascii")
    if not key:
        raise ConfigurationError("Production requires AADHAAR_ENCRYPTION_KEY.")
    try:
        return Fernet(key.encode("ascii"))
    except (ValueError, UnicodeEncodeError) as exc:
        raise ConfigurationError("AADHAAR_ENCRYPTION_KEY must be a valid Fernet key.") from exc


def encrypt_aadhaar(value: str) -> str:
    return _fernet().encrypt(value.encode("ascii")).decode("ascii")


def decrypt_aadhaar(value: str) -> str:
    return _fernet().decrypt(value.encode("ascii")).decode("ascii")
