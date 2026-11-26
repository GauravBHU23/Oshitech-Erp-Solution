"""Direct port of apps/core/validators.py's normalize_mobile — the only validator
fast-backend's ported apps need so far."""
import re

MOBILE_MESSAGE = "Enter a valid 10-digit mobile number, e.g. 9876543210."


def normalize_mobile(value: str) -> str:
    """'+91 98765-43210' / '09876543210' -> '9876543210'. Blank allowed."""
    value = (value or "").strip()
    if not value:
        return ""
    digits = re.sub(r"[\s\-]", "", value)
    if digits.startswith("+91"):
        digits = digits[3:]
    elif len(digits) == 11 and digits.startswith("0"):
        digits = digits[1:]
    if not re.fullmatch(r"[6-9]\d{9}", digits):
        raise ValueError(MOBILE_MESSAGE)
    return digits
