import threading
import time

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.main import app
from app.quote_cache import SingleFlight, fear_greed_cache, quote_cache
from app.routers import quotes as quotes_mod


@pytest.fixture(autouse=True)
def _reset_caches():
    quote_cache.clear()
    fear_greed_cache.clear()
    quotes_mod._fail_until.clear()
    yield
    quote_cache.clear()
    fear_greed_cache.clear()
    quotes_mod._fail_until.clear()


def _chart(price: float, symbol: str = "AAPL") -> dict:
    return {
        "chart": {
            "result": [{"meta": {"symbol": symbol, "regularMarketPrice": price}}],
            "error": None,
        }
    }


def test_singleflight_two_waiters_one_call():
    flight = SingleFlight()
    calls = {"n": 0}
    entered = threading.Event()
    release = threading.Event()

    def fn():
        calls["n"] += 1
        entered.set()
        assert release.wait(timeout=3)
        return "ok"

    out = [None, None]

    def worker(i):
        out[i] = flight.do("k", fn)

    threads = [threading.Thread(target=worker, args=(i,)) for i in range(2)]
    for t in threads:
        t.start()
    assert entered.wait(timeout=3)
    time.sleep(0.05)
    assert calls["n"] == 1
    assert flight.in_flight == 1
    release.set()
    for t in threads:
        t.join(timeout=3)
    assert out == ["ok", "ok"]
    assert calls["n"] == 1
    assert flight.in_flight == 0


def test_concurrent_quote_singleflight(monkeypatch):
    calls = {"n": 0}
    entered = threading.Event()
    release = threading.Event()

    def fake(symbol, interval, range_):
        calls["n"] += 1
        entered.set()
        assert release.wait(timeout=3)
        return _chart(11, symbol)

    monkeypatch.setattr(quotes_mod, "_fetch_chart", fake)
    results = [None, None]
    errors = [None, None]

    def worker(i):
        try:
            results[i] = quotes_mod.resolve_quote("AAPL", "1m", "1d")
        except Exception as exc:
            errors[i] = exc

    threads = [threading.Thread(target=worker, args=(i,)) for i in range(2)]
    for t in threads:
        t.start()
    assert entered.wait(timeout=3)
    time.sleep(0.05)
    assert calls["n"] == 1
    release.set()
    for t in threads:
        t.join(timeout=3)
    assert errors == [None, None]
    assert calls["n"] == 1
    for payload, status, _age, source in results:
        assert status == "miss"
        assert source == "yahoo"
        assert payload["chart"]["result"][0]["meta"]["regularMarketPrice"] == 11
        assert payload["_runnr"]["cache"] == "miss"


def test_stale_while_revalidate_within_stale_ttl(monkeypatch):
    quote_cache.set("AAPL|1m|1d", _chart(1), ttl=0.05)
    time.sleep(0.12)
    calls = {"n": 0}
    started = threading.Event()
    release = threading.Event()
    finished = threading.Event()

    def fake(symbol, interval, range_):
        calls["n"] += 1
        started.set()
        assert release.wait(timeout=3)
        finished.set()
        return _chart(2, symbol)

    monkeypatch.setattr(quotes_mod, "_fetch_chart", fake)
    monkeypatch.setattr(quotes_mod.settings, "quote_stale_ttl", 300)

    t0 = time.monotonic()
    payload, status, age, source = quotes_mod.resolve_quote("AAPL", "1m", "1d")
    elapsed = time.monotonic() - t0

    assert status == "swr"
    assert elapsed < 0.25
    assert payload["_runnr"]["cache"] == "swr"
    assert payload["chart"]["result"][0]["meta"]["regularMarketPrice"] == 1
    assert age is not None and age >= 0.05
    assert started.wait(timeout=3)
    assert calls["n"] == 1
    release.set()
    assert finished.wait(timeout=3)
    cached, cache_status, _ = quote_cache.lookup("AAPL|1m|1d")
    assert cache_status == "hit"
    assert cached["chart"]["result"][0]["meta"]["regularMarketPrice"] == 2


def test_upstream_failure_prefers_stale(monkeypatch):
    quote_cache.set("AAPL|1m|1d", _chart(9), ttl=0.01)
    time.sleep(0.05)
    monkeypatch.setattr(quotes_mod.settings, "quote_stale_ttl", 0)

    def fake(symbol, interval, range_):
        raise RuntimeError("yahoo down")

    monkeypatch.setattr(quotes_mod, "_fetch_chart", fake)
    payload, status, _age, _source = quotes_mod.resolve_quote("AAPL", "1m", "1d")
    assert status == "stale"
    assert payload["chart"]["result"][0]["meta"]["regularMarketPrice"] == 9
    assert payload["_runnr"]["cache"] == "stale"


def test_upstream_failure_without_cache_is_502(monkeypatch):
    def fake(symbol, interval, range_):
        raise RuntimeError("yahoo down")

    monkeypatch.setattr(quotes_mod, "_fetch_chart", fake)
    with pytest.raises(HTTPException) as ei:
        quotes_mod.resolve_quote("AAPL", "1m", "1d")
    assert ei.value.status_code == 502


def test_swr_skips_refresh_during_failure_cooldown(monkeypatch):
    quote_cache.set("AAPL|1m|1d", _chart(9), ttl=0.01)
    time.sleep(0.05)
    calls = {"n": 0}

    def fake(symbol, interval, range_):
        calls["n"] += 1
        raise RuntimeError("yahoo down")

    monkeypatch.setattr(quotes_mod, "_fetch_chart", fake)
    monkeypatch.setattr(quotes_mod.settings, "quote_stale_ttl", 0)
    payload, status, _age, _source = quotes_mod.resolve_quote("AAPL", "1m", "1d")
    assert status == "stale"
    assert calls["n"] == 1

    monkeypatch.setattr(quotes_mod.settings, "quote_stale_ttl", 300)
    payload, status, _age, _source = quotes_mod.resolve_quote("AAPL", "1m", "1d")
    assert status == "swr"
    assert payload["chart"]["result"][0]["meta"]["regularMarketPrice"] == 9
    time.sleep(0.05)
    assert calls["n"] == 1


def test_fresh_hit_skips_upstream(monkeypatch):
    quote_cache.set("AAPL|1m|1d", {**_chart(5), "_runnr_source": "yahoo"}, ttl=60)

    def fake(*_a, **_k):
        raise AssertionError("should not fetch")

    monkeypatch.setattr(quotes_mod, "_fetch_chart", fake)
    payload, status, _age, source = quotes_mod.resolve_quote("AAPL", "1m", "1d")
    assert status == "hit"
    assert source == "yahoo"
    assert payload["_runnr"]["cache"] == "hit"


def test_health_reports_quote_cache_and_inflight():
    with TestClient(app) as client:
        res = client.get("/health")
        assert res.status_code == 200
        data = res.json()
        assert "quote_stale_ttl_s" in data
        quotes = data["caches"]["quotes"]
        assert "hits" in quotes
        assert "misses" in quotes
        assert "stale_serves" in quotes
        assert "in_flight" in quotes
        assert "swr_serves" in quotes
        assert quotes["in_flight"] == 0
