"""Server-side state for revocable, idle-expiring JWT sessions."""
import time

from django.conf import settings
from django.core.cache import cache


def _session_key(user_id, session_id):
    return f"auth:session:{user_id}:{session_id}"


def _user_sessions_key(user_id):
    return f"auth:user-sessions:{user_id}"


def _idle_timeout():
    return settings.SESSION_IDLE_MINUTES * 60


def _session_list_timeout():
    return settings.SESSION_MAX_HOURS * 3600 + _idle_timeout()


def create_session(user_id, session_id):
    """Register a stable session id carried by all rotated tokens."""
    uid = str(user_id)
    cache.set(_session_key(uid, session_id), time.time(), timeout=_idle_timeout())
    key = _user_sessions_key(uid)
    session_ids = cache.get(key, [])
    if session_id not in session_ids:
        session_ids.append(session_id)
    cache.set(key, session_ids, timeout=_session_list_timeout())


def touch_session(user_id, session_id):
    """Return false for revoked or idle-expired sessions; renew active ones."""
    if not user_id or not session_id:
        return False
    uid = str(user_id)
    key = _session_key(uid, session_id)
    if cache.get(key) is None:
        return False
    cache.set(key, time.time(), timeout=_idle_timeout())
    return True


def session_is_active(user_id, session_id):
    return bool(user_id and session_id and cache.get(_session_key(str(user_id), session_id)) is not None)


def revoke_session(user_id, session_id):
    if not user_id or not session_id:
        return
    uid = str(user_id)
    cache.delete(_session_key(uid, session_id))
    key = _user_sessions_key(uid)
    session_ids = cache.get(key, [])
    if session_id in session_ids:
        session_ids.remove(session_id)
        if session_ids:
            cache.set(key, session_ids, timeout=_session_list_timeout())
        else:
            cache.delete(key)


def revoke_user_sessions(user_id):
    uid = str(user_id)
    key = _user_sessions_key(uid)
    for session_id in cache.get(key, []):
        cache.delete(_session_key(uid, session_id))
    cache.delete(key)
