"""Direct port of backend/apps/accounts/sessions.py — compatible with Django's
django.core.cache Redis wire format so sessions created by one backend are visible
(touchable/revocable) to the other during the coexistence window.

Verified directly against Django's cache backend source
(django.core.cache.backends.redis.RedisCache / RedisSerializer):
  - Key format is "{KEY_PREFIX}:{version}:{key}" (default_key_func) — this project's
    prod.py sets KEY_PREFIX="oshitech", version defaults to 1.
  - Values are pickled (pickle.dumps/loads) EXCEPT plain `int`s, which Django's
    RedisSerializer stores as plain ints. Django's sessions.py stores floats
    (time.time()) and lists (session id lists) — both of those ARE pickled; only an
    actual Python int bypasses pickling, which never happens here.

Original (unprefixed) key scheme, now wrapped by _django_cache_key():
  auth:session:{user_id}:{session_id}      -> last-touched unix timestamp (float), sliding TTL
  auth:user-sessions:{user_id}             -> list[str] of active session ids
"""
import pickle
import time

import redis.asyncio as redis

from app.config import get_settings

_settings = get_settings()
_redis: redis.Redis | None = None

_CACHE_KEY_PREFIX = "oshitech"  # must match Django prod.py CACHES["default"]["KEY_PREFIX"]
_CACHE_VERSION = 1


def get_redis() -> redis.Redis:
    """Raw bytes (decode_responses=False) — pickle needs the exact bytes Django wrote."""
    global _redis
    if _redis is None:
        _redis = redis.from_url(_settings.redis_cache_url, decode_responses=False)
    return _redis


def _django_cache_key(key: str) -> str:
    return f"{_CACHE_KEY_PREFIX}:{_CACHE_VERSION}:{key}"


def _dumps(value) -> bytes:
    if type(value) is int:
        return str(value).encode()
    return pickle.dumps(value, pickle.HIGHEST_PROTOCOL)


def _loads(raw: bytes | None):
    if raw is None:
        return None
    try:
        return int(raw)
    except ValueError:
        return pickle.loads(raw)


def _session_key(user_id: str, session_id: str) -> str:
    return _django_cache_key(f"auth:session:{user_id}:{session_id}")


def _user_sessions_key(user_id: str) -> str:
    return _django_cache_key(f"auth:user-sessions:{user_id}")


def _idle_timeout() -> int:
    return _settings.session_idle_minutes * 60


def _session_list_timeout() -> int:
    return _settings.session_max_hours * 3600 + _idle_timeout()


async def create_session(user_id: str, session_id: str) -> None:
    uid = str(user_id)
    r = get_redis()
    await r.set(_session_key(uid, session_id), _dumps(time.time()), ex=_idle_timeout())
    key = _user_sessions_key(uid)
    session_ids: list[str] = _loads(await r.get(key)) or []
    if session_id not in session_ids:
        session_ids.append(session_id)
    await r.set(key, _dumps(session_ids), ex=_session_list_timeout())


async def touch_session(user_id: str | None, session_id: str | None) -> bool:
    """False for revoked/idle-expired sessions; renews active ones (sliding window)."""
    if not user_id or not session_id:
        return False
    uid = str(user_id)
    r = get_redis()
    key = _session_key(uid, session_id)
    if await r.get(key) is None:
        return False
    await r.set(key, _dumps(time.time()), ex=_idle_timeout())
    return True


async def session_is_active(user_id: str | None, session_id: str | None) -> bool:
    """Read-only liveness check — does NOT renew the TTL (mirrors Django's
    session_is_active, used by refresh-token validation before touch_session renews it)."""
    if not user_id or not session_id:
        return False
    r = get_redis()
    return await r.get(_session_key(str(user_id), session_id)) is not None


async def revoke_session(user_id: str | None, session_id: str | None) -> None:
    if not user_id or not session_id:
        return
    uid = str(user_id)
    r = get_redis()
    await r.delete(_session_key(uid, session_id))
    key = _user_sessions_key(uid)
    session_ids: list[str] = _loads(await r.get(key)) or []
    if session_id in session_ids:
        session_ids.remove(session_id)
        if session_ids:
            await r.set(key, _dumps(session_ids), ex=_session_list_timeout())
        else:
            await r.delete(key)


async def revoke_user_sessions(user_id: str) -> None:
    uid = str(user_id)
    r = get_redis()
    key = _user_sessions_key(uid)
    session_ids: list[str] = _loads(await r.get(key)) or []
    for session_id in session_ids:
        await r.delete(_session_key(uid, session_id))
    await r.delete(key)
