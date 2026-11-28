"""Port of backend/apps/stre/security.py's Turnstile verification — same Cloudflare
siteverify call, same dummy test-token shortcut when the configured secret key is
Cloudflare's published "always passes" test key, so both backends behave identically
regardless of which one a request lands on."""
import httpx

from app.config import get_settings

TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
# Cloudflare's published always-pass test secret key and the dummy token it accepts —
# used by both backends' automated tests, never a live secret.
# https://developers.cloudflare.com/turnstile/troubleshooting/testing/
TURNSTILE_TEST_SECRET_KEY = "1x0000000000000000000000000000000AA"
TURNSTILE_TEST_TOKEN = "XXXX.DUMMY.TOKEN.XXXX"


class CaptchaError(Exception):
    pass


async def check_turnstile(token: str | None, remote_ip: str | None = None) -> None:
    """Verify a Cloudflare Turnstile token ('I'm not a robot' check)."""
    if not token:
        raise CaptchaError("Please complete the ‘I'm not a robot’ check.")
    secret = get_settings().turnstile_secret_key
    if secret == TURNSTILE_TEST_SECRET_KEY:
        # Test secret key configured (local/dev/test) — accept only the matching dummy
        # token without a network call, matching Cloudflare's documented test behavior.
        if token != TURNSTILE_TEST_TOKEN:
            raise CaptchaError("Verification failed. Please try the check again.")
        return
    payload = {"secret": secret, "response": token}
    if remote_ip:
        payload["remoteip"] = remote_ip
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(TURNSTILE_VERIFY_URL, data=payload)
            result = resp.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise CaptchaError("Could not verify the check right now. Please try again.") from exc
    if not result.get("success"):
        raise CaptchaError("Verification failed. Please try the check again.")
