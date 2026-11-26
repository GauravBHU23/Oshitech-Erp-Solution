"""Partial port of Django's AUTH_PASSWORD_VALIDATORS. Only MinimumLengthValidator and
NumericPasswordValidator are implemented for now — UserAttributeSimilarityValidator and
CommonPasswordValidator (which needs Django's bundled ~20k-word common-passwords list)
are deliberately deferred to a follow-up task, per explicit user decision. Passwords
fast-backend accepts are therefore a STRICT SUBSET check of what Django would accept —
never weaker, just missing two of the four checks for now."""
MIN_LENGTH = 10


def validate_password_strength(password: str) -> list[str]:
    errors = []
    if len(password) < MIN_LENGTH:
        errors.append(f"This password is too short. It must contain at least {MIN_LENGTH} characters.")
    if password.isdigit():
        errors.append("This password is entirely numeric.")
    return errors
