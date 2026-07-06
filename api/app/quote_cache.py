"""In-memory TTL cache for quote and market-data proxies (single API process)."""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass
from typing import Any


@dataclass
class _Entry:
    value: Any
    expires_at: float
    created_at: float


class TTLCache:
    def __init__(self, name: str, max_entries: int = 800):
        self.name = name
        self.max_entries = max_entries
        self._store: dict[str, _Entry] = {}
        self._lock = threading.Lock()
        self.hits = 0
        self.misses = 0
        self.stale_serves = 0

    def get(self, key: str) -> tuple[Any | None, str, float | None]:
        """Return (value, status, age_seconds). status: hit | miss | stale."""
        now = time.time()
        with self._lock:
            entry = self._store.get(key)
            if not entry:
                self.misses += 1
                return None, "miss", None
            age = now - entry.created_at
            if now < entry.expires_at:
                self.hits += 1
                return entry.value, "hit", age
            self.stale_serves += 1
            return entry.value, "stale", age

    def set(self, key: str, value: Any, ttl: float) -> None:
        now = time.time()
        with self._lock:
            self._store[key] = _Entry(value=value, expires_at=now + ttl, created_at=now)
            if len(self._store) > self.max_entries:
                oldest_key = min(self._store, key=lambda k: self._store[k].created_at)
                del self._store[oldest_key]

    def stats(self) -> dict:
        with self._lock:
            total = self.hits + self.misses + self.stale_serves
            hit_rate = round(100 * self.hits / total, 1) if total else 0.0
            return {
                "name": self.name,
                "size": len(self._store),
                "hits": self.hits,
                "misses": self.misses,
                "stale_serves": self.stale_serves,
                "hit_rate_pct": hit_rate,
            }


quote_cache = TTLCache("quotes")
fear_greed_cache = TTLCache("fear_greed", max_entries=4)
