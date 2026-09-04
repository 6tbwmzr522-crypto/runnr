"""In-memory TTL cache for quote and market-data proxies (single API process)."""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass
from typing import Any, Callable, TypeVar

T = TypeVar("T")


@dataclass
class _Entry:
    value: Any
    expires_at: float
    created_at: float


@dataclass
class _Inflight:
    done: threading.Event
    value: Any = None
    error: BaseException | None = None


class SingleFlight:
    """One in-flight callable per key; concurrent waiters share the result."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._inflight: dict[str, _Inflight] = {}

    @property
    def in_flight(self) -> int:
        with self._lock:
            return len(self._inflight)

    def is_in_flight(self, key: str) -> bool:
        with self._lock:
            return key in self._inflight

    def do(self, key: str, fn: Callable[[], T], timeout: float = 30.0) -> T:
        leader = False
        with self._lock:
            call = self._inflight.get(key)
            if call is None:
                call = _Inflight(done=threading.Event())
                self._inflight[key] = call
                leader = True

        if not leader:
            if not call.done.wait(timeout=timeout):
                raise TimeoutError(f"singleflight wait timed out for {key}")
            if call.error is not None:
                raise call.error
            return call.value  # type: ignore[return-value]

        try:
            call.value = fn()
            return call.value  # type: ignore[return-value]
        except BaseException as exc:
            call.error = exc
            raise
        finally:
            call.done.set()
            with self._lock:
                if self._inflight.get(key) is call:
                    del self._inflight[key]

    def start_background(self, key: str, fn: Callable[[], Any]) -> bool:
        """Run fn in a daemon thread via do(). No-op if key is already in flight."""
        with self._lock:
            if key in self._inflight:
                return False

        def runner() -> None:
            try:
                self.do(key, fn)
            except Exception:
                pass

        threading.Thread(target=runner, name=f"sf-{key[:48]}", daemon=True).start()
        return True

    def clear(self) -> None:
        with self._lock:
            pending = list(self._inflight.values())
            self._inflight.clear()
        for call in pending:
            if call.error is None:
                call.error = RuntimeError("singleflight reset")
            call.done.set()


class TTLCache:
    def __init__(self, name: str, max_entries: int = 800):
        self.name = name
        self.max_entries = max_entries
        self._store: dict[str, _Entry] = {}
        self._lock = threading.Lock()
        self.hits = 0
        self.misses = 0
        self.stale_serves = 0
        self.swr_serves = 0
        self.flight = SingleFlight()

    def lookup(self, key: str) -> tuple[Any | None, str, float | None]:
        """Return (value, status, age_seconds) without bumping counters.

        status: hit (fresh) | stale (expired but present) | miss.
        """
        now = time.time()
        with self._lock:
            entry = self._store.get(key)
            if not entry:
                return None, "miss", None
            age = now - entry.created_at
            if now < entry.expires_at:
                return entry.value, "hit", age
            return entry.value, "stale", age

    def get(self, key: str) -> tuple[Any | None, str, float | None]:
        """Return (value, status, age_seconds). status: hit | miss | stale."""
        value, status, age = self.lookup(key)
        if status == "hit":
            self.note_hit()
        elif status == "stale":
            self.note_stale()
        else:
            self.note_miss()
        return value, status, age

    def note_hit(self) -> None:
        with self._lock:
            self.hits += 1

    def note_miss(self) -> None:
        with self._lock:
            self.misses += 1

    def note_stale(self) -> None:
        with self._lock:
            self.stale_serves += 1

    def note_swr(self) -> None:
        with self._lock:
            self.swr_serves += 1
            self.stale_serves += 1

    def set(self, key: str, value: Any, ttl: float) -> None:
        now = time.time()
        with self._lock:
            self._store[key] = _Entry(value=value, expires_at=now + ttl, created_at=now)
            if len(self._store) > self.max_entries:
                oldest_key = min(self._store, key=lambda k: self._store[k].created_at)
                del self._store[oldest_key]

    def clear(self) -> None:
        with self._lock:
            self._store.clear()
            self.hits = 0
            self.misses = 0
            self.stale_serves = 0
            self.swr_serves = 0
        self.flight.clear()

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
                "swr_serves": self.swr_serves,
                "in_flight": self.flight.in_flight,
                "hit_rate_pct": hit_rate,
            }


quote_cache = TTLCache("quotes")
fear_greed_cache = TTLCache("fear_greed", max_entries=4)
