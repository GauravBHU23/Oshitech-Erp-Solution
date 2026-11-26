"""Password hashing compatible with Django's PASSWORD_HASHERS (Argon2 first, PBKDF2
fallback) — verified directly against Django's own Argon2PasswordHasher.encode()/
verify() source (django.contrib.auth.hashers), not guessed from the output format.

Django's Argon2PasswordHasher.encode() does: `self.algorithm + data.decode()` where
self.algorithm == "argon2" and `data` is argon2-cffi's raw `$argon2id$v=19$...` hash
(note: raw argon2-cffi hashes always start with "$", so the result is
"argon2$argon2id$v=19$..." with no "$" between "argon2" and "argon2id").
Its verify() does the inverse: split on the FIRST "$", re-prepend "$" to the remainder,
hand that to argon2-cffi's own PasswordHasher().verify(). We replicate exactly that.
"""
import hashlib
import base64

from argon2 import PasswordHasher
from argon2.exceptions import VerificationError, InvalidHashError

_argon2_hasher = PasswordHasher()

ARGON2_ALGORITHM = "argon2"
PBKDF2_ALGORITHM = "pbkdf2_sha256"
PBKDF2_ITERATIONS = 600_000  # Django's current default; only used for hashing NEW
# pbkdf2 fallback hashes, which should never actually happen since Argon2 is first
# in PASSWORD_HASHERS — kept only to verify any pre-existing legacy hash correctly.


def hash_password(raw_password: str) -> str:
    """New password hash, in the SAME argon2$... format Django stores, so the Django
    backend (if it ever reads a row fast-backend created) can verify it unchanged."""
    return ARGON2_ALGORITHM + _argon2_hasher.hash(raw_password)


def verify_password(encoded: str, raw_password: str) -> bool:
    """Verify a password against any hash in backend/accounts_user.password, whichever
    of Django's two configured hashers produced it."""
    if "$" not in encoded:
        return False
    algorithm, rest = encoded.split("$", 1)
    if algorithm == ARGON2_ALGORITHM:
        try:
            return _argon2_hasher.verify("$" + rest, raw_password)
        except (VerificationError, InvalidHashError):
            return False
    if algorithm == PBKDF2_ALGORITHM:
        return _verify_pbkdf2(encoded, raw_password)
    return False


def _verify_pbkdf2(encoded: str, raw_password: str) -> bool:
    """Django's PBKDF2PasswordHasher format: pbkdf2_sha256$<iterations>$<salt>$<hash_b64>."""
    try:
        algorithm, iterations, salt, hash_b64 = encoded.split("$", 3)
    except ValueError:
        return False
    if algorithm != PBKDF2_ALGORITHM:
        return False
    derived = hashlib.pbkdf2_hmac("sha256", raw_password.encode(), salt.encode(), int(iterations))
    derived_b64 = base64.b64encode(derived).decode("ascii").strip()
    # Django strips trailing '=' padding from the base64 in some versions' comparisons;
    # compare without padding to be safe against either form.
    return derived_b64.rstrip("=") == hash_b64.rstrip("=")
