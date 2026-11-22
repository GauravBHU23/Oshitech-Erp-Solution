import re
from datetime import date

from rest_framework import serializers

MOBILE_MESSAGE = "Enter a valid 10-digit mobile number, e.g. 9876543210."
PHONE_MESSAGE = "Enter a valid phone number (mobile, or landline with STD code)."


def normalize_mobile(value):
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
        raise serializers.ValidationError(MOBILE_MESSAGE)
    return digits


def normalize_phone(value):
    """Mobile ya landline (school office). Blank allowed."""
    value = (value or "").strip()
    if not value:
        return ""
    digits = re.sub(r"[\s\-]", "", value)
    if digits.startswith("+91"):
        digits = digits[3:]
    if not re.fullmatch(r"\d{8,12}", digits):
        raise serializers.ValidationError(PHONE_MESSAGE)
    return digits


def validate_birth_date(value, min_age=2, max_age=100):
    if value is None:
        return value
    today = date.today()
    if value > today:
        raise serializers.ValidationError("Date of birth cannot be in the future.")
    age = (today - value).days / 365.25
    if age < min_age:
        raise serializers.ValidationError(f"The student must be at least {min_age} years old.")
    if age > max_age:
        raise serializers.ValidationError("Please check the year of birth.")
    return value


NAME_MESSAGE = "Use letters only (spaces, . ' - allowed), at least 2 letters."


def validate_person_name(value, required=True):
    """English/Hindi naam: sirf akshar (aur matras), space . ' - ; kam se kam 2 akshar."""
    import unicodedata

    value = " ".join((value or "").split())
    if not value:
        if required:
            raise serializers.ValidationError("This field is required.")
        return ""
    letters = 0
    for ch in value:
        cat = unicodedata.category(ch)
        if cat.startswith("L"):
            letters += 1
        elif cat.startswith("M") or ch in " .'-":
            continue
        else:
            raise serializers.ValidationError(NAME_MESSAGE)
    if letters < 2 or not unicodedata.category(value[0]).startswith("L"):
        raise serializers.ValidationError(NAME_MESSAGE)
    return value


PDF_MAX_MB = 10


def validate_pdf_file(value):
    """Notice attachment: sirf asli PDF (andar ke bytes check), max 10 MB."""
    if not value:
        return value
    if not str(getattr(value, "name", "")).lower().endswith(".pdf"):
        raise serializers.ValidationError("Upload a PDF file (.pdf).")
    if value.size > PDF_MAX_MB * 1024 * 1024:
        raise serializers.ValidationError(f"PDF must be {PDF_MAX_MB} MB or smaller.")
    head = value.read(5)
    value.seek(0)
    if head != b"%PDF-":
        raise serializers.ValidationError("This file is not a valid PDF.")
    return value
