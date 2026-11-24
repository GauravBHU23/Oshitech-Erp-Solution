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
    def allow_request(self, request, view):
        self.scope = getattr(view, self.scope_attr, None)
        if not self.scope:
            return True
        self.rate = self.get_rate()
        self.num_requests, self.duration = self.parse_rate(self.rate)
        return super().allow_request(request, view)
