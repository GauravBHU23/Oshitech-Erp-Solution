"""Atomic fixed-window DRF throttles backed by the configured shared cache."""
from rest_framework.throttling import AnonRateThrottle, ScopedRateThrottle, UserRateThrottle


class AtomicThrottleMixin:
    def allow_request(self, request, view):
        self.key = self.get_cache_key(request, view)
        if self.key is None:
            return True
        self.now = self.timer()
        if self.cache.add(self.key, 1, self.duration):
            return True
        try:
            count = self.cache.incr(self.key)
        except ValueError:
            if self.cache.add(self.key, 1, self.duration):
                return True
            count = self.cache.incr(self.key)
        return count <= self.num_requests

    def wait(self):
        return self.duration


class AtomicAnonRateThrottle(AtomicThrottleMixin, AnonRateThrottle):
    pass


class AtomicUserRateThrottle(AtomicThrottleMixin, UserRateThrottle):
    pass


class AtomicScopedRateThrottle(AtomicThrottleMixin, ScopedRateThrottle):
    """DRF's own ScopedRateThrottle.allow_request() ALWAYS allows the request unless the
    *view* declares a `throttle_scope` attribute — it never looks at a `scope` set on the
    throttle subclass itself. Every throttle in this codebase is written the other way
    (e.g. `class StreThrottle(AtomicScopedRateThrottle): scope = "stre"`), which silently
    disabled rate limiting on every endpoint using this base class. Falling back to the
    throttle's own `scope` class attribute here makes that existing pattern actually work,
    without having to add `throttle_scope = "..."` to every single view."""
    def allow_request(self, request, view):
        self.scope = getattr(view, self.scope_attr, None) or getattr(type(self), "scope", None)
        if not self.scope:
            return True
        self.rate = self.get_rate()
        self.num_requests, self.duration = self.parse_rate(self.rate)
        return super().allow_request(request, view)
