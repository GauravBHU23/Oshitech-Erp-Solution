"""Direct port of backend/apps/stre/security.py's captcha half (new_captcha/check_captcha)
— same self-hosted stroke-based SVG renderer, same stre_strecaptcha table, same
HMAC-SHA256(SECRET_KEY) answer hashing, so a captcha issued by one backend can be
answered against the other during the coexistence window."""
import hmac
import hashlib
import math
import random
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.models import StreCaptcha

CAPTCHA_LENGTH = 5
CAPTCHA_VALID_MINUTES = 5

# Verbatim copy of backend/apps/stre/security.py's GLYPHS table — any drift here would
# make captchas rendered differently between backends, which is harmless (purely visual)
# but kept identical for consistency.
GLYPHS: dict[str, list[list[tuple[int, int]]]] = {
    "2": [[(1, 4), (3, 1), (7, 1), (9, 4), (8, 7), (1, 15), (9, 15)]],
    "3": [[(1, 2), (8, 1), (9, 4), (5, 7), (9, 10), (8, 14), (1, 15)]],
    "4": [[(7, 15), (7, 1), (1, 10), (9, 10)]],
    "5": [[(9, 1), (2, 1), (1, 7), (7, 6), (9, 10), (8, 14), (1, 15)]],
    "6": [[(8, 1), (3, 3), (1, 9), (2, 14), (7, 15), (9, 11), (6, 8), (1, 10)]],
    "7": [[(1, 1), (9, 1), (4, 15)], [(3, 8), (8, 8)]],
    "8": [[(5, 8), (1, 4), (5, 1), (9, 4), (5, 8), (1, 12), (5, 15), (9, 12), (5, 8)]],
    "9": [[(9, 6), (4, 8), (1, 5), (4, 1), (8, 2), (9, 8), (6, 15), (2, 14)]],
    "A": [[(1, 15), (5, 1), (9, 15)], [(3, 10), (7, 10)]],
    "C": [[(9, 3), (6, 1), (2, 3), (1, 8), (2, 13), (6, 15), (9, 13)]],
    "E": [[(9, 1), (1, 1), (1, 15), (9, 15)], [(1, 8), (7, 8)]],
    "H": [[(1, 1), (1, 15)], [(9, 1), (9, 15)], [(1, 8), (9, 8)]],
    "K": [[(1, 1), (1, 15)], [(9, 1), (1, 9), (9, 15)]],
    "M": [[(1, 15), (1, 1), (5, 9), (9, 1), (9, 15)]],
    "N": [[(1, 15), (1, 1), (9, 15), (9, 1)]],
    "P": [[(1, 15), (1, 1), (7, 1), (9, 4), (7, 8), (1, 8)]],
    "R": [[(1, 15), (1, 1), (7, 1), (9, 4), (7, 8), (1, 8), (9, 15)]],
    "T": [[(1, 1), (9, 1)], [(5, 1), (5, 15)]],
    "W": [[(1, 1), (3, 15), (5, 7), (7, 15), (9, 1)]],
    "X": [[(1, 1), (9, 15)], [(9, 1), (1, 15)]],
    "Y": [[(1, 1), (5, 8), (9, 1)], [(5, 8), (5, 15)]],
}


class CaptchaError(Exception):
    pass


def _hash(value: str) -> str:
    key = get_settings().django_secret_key.encode()
    return hmac.new(key, str(value).strip().upper().encode(), hashlib.sha256).hexdigest()


def _captcha_svg(text: str) -> str:
    rnd = random.SystemRandom()
    width, height = 190, 60
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
        f'<rect width="{width}" height="{height}" rx="10" fill="#f5f3ff"/>',
    ]
    for _ in range(6):
        pts = " ".join(f"{rnd.randint(0, width)},{rnd.randint(0, height)}" for _ in range(3))
        parts.append(f'<polyline points="{pts}" fill="none" stroke="hsl({rnd.randint(200, 300)},55%,75%)" stroke-width="{rnd.uniform(1, 2):.1f}"/>')
    x = 14
    for ch in text:
        scale = rnd.uniform(1.9, 2.4)
        angle = math.radians(rnd.uniform(-22, 22))
        ox, oy = x + rnd.uniform(-2, 2), rnd.uniform(6, 14)
        color = f"hsl({rnd.randint(220, 290)},60%,{rnd.randint(28, 42)}%)"
        for stroke in GLYPHS[ch]:
            pts = []
            for gx, gy in stroke:
                gx, gy = (gx - 5) * scale + rnd.uniform(-1.1, 1.1), (gy - 8) * scale * 0.95 + rnd.uniform(-1.1, 1.1)
                rx, ry = gx * math.cos(angle) - gy * math.sin(angle), gx * math.sin(angle) + gy * math.cos(angle)
                pts.append(f"{ox + 11 + rx:.1f},{oy + 18 + ry:.1f}")
            parts.append(f'<polyline points="{" ".join(pts)}" fill="none" stroke="{color}" stroke-width="{rnd.uniform(2.4, 3.2):.1f}" stroke-linecap="round" stroke-linejoin="round"/>')
        x += rnd.randint(31, 36)
    for _ in range(3):
        y1, y2 = rnd.randint(10, height - 10), rnd.randint(10, height - 10)
        parts.append(f'<path d="M0 {y1} Q {width / 2} {rnd.randint(0, height)} {width} {y2}" fill="none" stroke="hsl({rnd.randint(220, 290)},45%,55%)" stroke-width="1.4" opacity=".7"/>')
    for _ in range(25):
        parts.append(f'<circle cx="{rnd.randint(0, width)}" cy="{rnd.randint(0, height)}" r="{rnd.uniform(.6, 1.6):.1f}" fill="hsl({rnd.randint(200, 300)},50%,60%)"/>')
    parts.append("</svg>")
    return "".join(parts)


async def new_captcha(db: AsyncSession) -> tuple[uuid.UUID, str]:
    now = datetime.now(timezone.utc)
    await db.execute(delete(StreCaptcha).where(StreCaptcha.expires_at < now))
    alphabet = list(GLYPHS)
    text = "".join(random.SystemRandom().choice(alphabet) for _ in range(CAPTCHA_LENGTH))
    captcha = StreCaptcha(
        id=uuid.uuid4(),
        answer_hash=_hash(text),
        expires_at=now + timedelta(minutes=CAPTCHA_VALID_MINUTES),
        created_at=now,
    )
    db.add(captcha)
    await db.commit()
    return captcha.id, _captcha_svg(text)


async def check_captcha(db: AsyncSession, captcha_id, answer: str) -> None:
    """A captcha is single-use regardless of outcome — matches Django's behavior of
    deleting it whether the answer was right or wrong."""
    captcha = None
    if captcha_id:
        try:
            captcha = (await db.execute(select(StreCaptcha).where(StreCaptcha.id == captcha_id))).scalar_one_or_none()
        except Exception:  # noqa: BLE001 — malformed UUID string, etc.
            captcha = None
    if captcha is None:
        raise CaptchaError("Please complete the captcha.")
    valid = captcha.expires_at >= datetime.now(timezone.utc) and hmac.compare_digest(captcha.answer_hash, _hash(answer or ""))
    await db.delete(captcha)
    await db.commit()
    if not valid:
        raise CaptchaError("Captcha did not match. Please try the new one.")
