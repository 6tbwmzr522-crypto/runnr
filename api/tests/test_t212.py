"""Trading 212 mapping, missing-env, and idempotent fill ids — no live API calls."""

from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.auth import create_access_token, hash_password
from app.db import get_db
from app.main import app
from app.t212 import (
    fetch_history_orders,
    fetch_positions,
    map_t212_ticker,
    normalize_history_item,
    normalize_history_items,
    normalize_positions,
    t212_configured,
)

FIXTURES = Path(__file__).resolve().parent / "fixtures"


def _load(name: str):
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def token_for(email: str = "t212.tester@example.com") -> str:
    email = email.strip().lower()
    with get_db() as conn:
        row = conn.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
        if row:
            uid = row["id"]
        else:
            cur = conn.execute(
                "INSERT INTO users (email, password_hash, email_verified) VALUES (?, ?, 1)",
                (email, hash_password("test-pass-12")),
            )
            uid = cur.lastrowid
    return create_access_token(uid, email)


def test_map_ticker_strips_exchange_suffix():
    assert map_t212_ticker("AAPL_US_EQ") == "AAPL"
    assert map_t212_ticker("VUAG_EQ") == "VUAG"
    assert map_t212_ticker("BRK.B_US_EQ") == "BRK.B"
    assert map_t212_ticker("VOD_UK_EQ") == "VOD"


def test_nested_fills_map_without_broker_pnl():
    payload = _load("t212_history_nested.json")
    orders = normalize_history_items(payload["items"])
    by_id = {o["id"]: o for o in orders}
    assert "t212:fill:9001" in by_id
    assert "t212:fill:9002" in by_id
    assert "t212:fill:9004" in by_id
    assert "t212:fill:9003" not in by_id  # stock split skipped
    buy = by_id["t212:fill:9001"]
    assert buy["symbol"] == "AAPL"
    assert buy["side"] == "buy"
    assert buy["filled_qty"] == 10
    assert buy["filled_avg_price"] == 190.5
    assert buy["status"] == "filled"
    sell = by_id["t212:fill:9002"]
    assert sell["side"] == "sell"
    assert sell["filled_avg_price"] == 198.25
    assert "pnl" not in sell
    assert "realisedProfitLoss" not in sell
    assert "realised_profit_loss" not in sell
    etf = by_id["t212:fill:9004"]
    assert etf["symbol"] == "VUAG"


def test_mapping_is_idempotent():
    payload = _load("t212_history_nested.json")
    a = normalize_history_items(payload["items"])
    b = normalize_history_items(payload["items"])
    assert [o["id"] for o in a] == [o["id"] for o in b]
    assert len(a) == len({o["id"] for o in a})
    doubled = normalize_history_items(payload["items"] + payload["items"])
    assert [o["id"] for o in doubled] == [o["id"] for o in a]


def test_flat_history_uses_signed_quantity_for_side():
    payload = _load("t212_history_flat.json")
    orders = normalize_history_items(payload["items"])
    by_id = {o["id"]: o for o in orders}
    assert "t212:order:987654321" in by_id
    assert by_id["t212:order:987654321"]["side"] == "buy"
    assert by_id["t212:order:987654321"]["symbol"] == "MSFT"
    assert by_id["t212:order:987654320"]["side"] == "sell"
    assert all(o["id"] != "t212:order:111" for o in orders)  # cancelled skipped


def test_unfilled_and_zero_price_skipped():
    assert normalize_history_item({"id": 1, "ticker": "AAPL_US_EQ", "status": "NEW", "quantity": 1}) is None
    assert (
        normalize_history_item(
            {
                "fill": {"id": 2, "price": 0, "quantity": 1, "type": "TRADE"},
                "order": {"ticker": "AAPL_US_EQ", "side": "BUY", "status": "FILLED"},
            }
        )
        is None
    )


def test_positions_keep_broker_qty_not_invented_fills():
    rows = normalize_positions(_load("t212_positions.json"))
    by_sym = {p["symbol"]: p for p in rows}
    assert by_sym["AAPL"]["qty"] == 10
    assert by_sym["AAPL"]["avg_entry_price"] == 190.5
    assert by_sym["VUAG"]["qty"] == 25


BOSS_EMAIL = "t212.operator@example.com"
RETAIL_EMAIL = "t212.retail@example.com"


def _set_boss_emails(monkeypatch, emails: str = BOSS_EMAIL) -> None:
    monkeypatch.setattr("app.config.settings.runnr_boss_emails", emails)


def _assert_no_secret_leak(payload) -> None:
    dumped = json.dumps(payload).lower()
    assert "t212_api_key" not in dumped
    assert "t212_api_secret" not in dumped
    assert "basic " not in dumped
    assert "traceback" not in dumped
    assert "test-key" not in dumped
    assert "test-secret" not in dumped
    assert "recent_orders" not in dumped
    assert "filled_avg_price" not in dumped


def test_t212_unauthenticated_is_401():
    with TestClient(app) as client:
        st = client.get("/api/v1/brokers/t212/status")
        assert st.status_code == 401
        sync = client.get("/api/v1/brokers/t212/sync")
        assert sync.status_code == 401
        for body in (st.json(), sync.json()):
            _assert_no_secret_leak(body)
            assert body.get("recent_orders") is None


def test_t212_non_boss_is_403_without_leaking_global_key(monkeypatch):
    _set_boss_emails(monkeypatch)
    monkeypatch.setattr("app.config.settings.t212_api_key", "test-key-xxxx")
    monkeypatch.setattr("app.config.settings.t212_api_secret", "test-secret-yyyy")
    monkeypatch.setattr("app.routers.brokers.t212_configured", lambda: True)

    called = {"positions": 0, "orders": 0}

    def boom_positions(**_kwargs):
        called["positions"] += 1
        raise AssertionError("non-boss must not fetch T212 positions")

    def boom_orders(**_kwargs):
        called["orders"] += 1
        raise AssertionError("non-boss must not fetch T212 fills")

    monkeypatch.setattr("app.routers.brokers.fetch_positions", boom_positions)
    monkeypatch.setattr("app.routers.brokers.fetch_history_orders", boom_orders)

    with TestClient(app) as client:
        headers = {"Authorization": f"Bearer {token_for(RETAIL_EMAIL)}"}
        st = client.get("/api/v1/brokers/t212/status", headers=headers)
        assert st.status_code == 403
        sync = client.get("/api/v1/brokers/t212/sync", headers=headers)
        assert sync.status_code == 403
        for res in (st, sync):
            detail = res.json()["detail"]
            assert "not connected for this account" in detail.lower()
            _assert_no_secret_leak(res.json())
            assert res.json().get("recent_orders") is None
        assert called == {"positions": 0, "orders": 0}


def test_t212_boss_can_sync(monkeypatch):
    _set_boss_emails(monkeypatch)
    monkeypatch.setattr("app.config.settings.t212_api_key", "test-key-xxxx")
    monkeypatch.setattr("app.config.settings.t212_api_secret", "test-secret-yyyy")
    monkeypatch.setattr("app.routers.brokers.t212_configured", lambda: True)
    monkeypatch.setattr("app.routers.brokers.require_t212_configured", lambda: ("test-key-xxxx", "test-secret-yyyy"))

    fills = [
        {
            "id": "t212:fill:9001",
            "symbol": "AAPL",
            "side": "buy",
            "qty": 10,
            "filled_qty": 10,
            "filled_avg_price": 190.5,
            "status": "filled",
            "filled_at": "2026-03-12T14:32:01.000Z",
        }
    ]
    positions = [{"symbol": "AAPL", "qty": 10, "avg_entry_price": 190.5}]
    monkeypatch.setattr("app.routers.brokers.fetch_positions", lambda **_kw: positions)
    monkeypatch.setattr("app.routers.brokers.fetch_history_orders", lambda **_kw: fills)

    with TestClient(app) as client:
        headers = {"Authorization": f"Bearer {token_for(BOSS_EMAIL)}"}
        st = client.get("/api/v1/brokers/t212/status", headers=headers)
        assert st.status_code == 200
        assert st.json()["connected"] is True
        assert st.json()["broker"] == "t212"
        sync = client.get("/api/v1/brokers/t212/sync", headers=headers)
        assert sync.status_code == 200
        body = sync.json()
        assert body["broker"] == "t212"
        assert body["recent_orders"][0]["id"] == "t212:fill:9001"
        assert body["positions"][0]["symbol"] == "AAPL"
        blob = json.dumps(body)
        assert "test-key-xxxx" not in blob
        assert "test-secret-yyyy" not in blob


def test_missing_env_status_and_sync(monkeypatch):
    _set_boss_emails(monkeypatch)
    monkeypatch.setattr("app.routers.brokers.t212_configured", lambda: False)
    monkeypatch.setattr("app.t212.t212_configured", lambda: False)
    monkeypatch.setattr("app.config.settings.t212_api_key", "")
    monkeypatch.setattr("app.config.settings.t212_api_secret", "")
    with TestClient(app) as client:
        headers = {"Authorization": f"Bearer {token_for(BOSS_EMAIL)}"}
        st = client.get("/api/v1/brokers/t212/status", headers=headers)
        assert st.status_code == 200
        body = st.json()
        assert body["connected"] is False
        assert "T212_API_KEY" in body["error"]
        assert "T212_API_SECRET" in body["error"]
        sync = client.get("/api/v1/brokers/t212/sync", headers=headers)
        assert sync.status_code == 503
        detail = sync.json()["detail"]
        assert "T212_API_KEY" in detail
        assert "not configured" in detail.lower()
        dumped = json.dumps(sync.json()).lower()
        assert "basic " not in dumped
        assert "traceback" not in dumped


def test_sync_uses_fixtures_not_live(monkeypatch):
    nested = _load("t212_history_nested.json")
    page2 = _load("t212_history_flat.json")
    positions = _load("t212_positions.json")
    calls = []

    def fake_get(url, headers, timeout):
        calls.append(url)
        assert headers["Authorization"].startswith("Basic ")
        assert "live.trading212.com" in url
        if "/equity/positions" in url:
            return 200, json.dumps(positions).encode(), {"x-ratelimit-remaining": "1"}
        if "cursor=" in url:
            return 200, json.dumps(page2).encode(), {"x-ratelimit-remaining": "4"}
        return 200, json.dumps(nested).encode(), {"x-ratelimit-remaining": "5", "x-ratelimit-reset": "0"}

    monkeypatch.setattr("app.config.settings.t212_api_key", "test-key-xxxx")
    monkeypatch.setattr("app.config.settings.t212_api_secret", "test-secret-yyyy")

    orders = fetch_history_orders(
        key="test-key-xxxx",
        secret="test-secret-yyyy",
        http_get=fake_get,
        sleeper=lambda _s: None,
    )
    pos = fetch_positions(key="test-key-xxxx", secret="test-secret-yyyy", http_get=fake_get)
    ids = [o["id"] for o in orders]
    assert "t212:fill:9001" in ids
    assert "t212:order:987654321" in ids
    assert len(ids) == len(set(ids))
    assert any(p["symbol"] == "AAPL" for p in pos)
    assert all("history/orders" in u or "positions" in u for u in calls)
    assert not any("/orders/market" in u or "/orders/limit" in u for u in calls)


def test_health_reports_t212_flag_without_secrets(monkeypatch):
    monkeypatch.setattr("app.config.settings.t212_api_key", "")
    monkeypatch.setattr("app.config.settings.t212_api_secret", "")
    with TestClient(app) as client:
        res = client.get("/health")
        assert res.status_code == 200
        data = res.json()
        assert "t212_configured" in data
        assert data["t212_configured"] is False
        blob = json.dumps(data)
        assert "test-secret" not in blob
        assert "T212_API_SECRET=" not in blob


def test_t212_configured_reads_settings(monkeypatch):
    monkeypatch.setattr("app.config.settings.t212_api_key", "abc")
    monkeypatch.setattr("app.config.settings.t212_api_secret", "")
    assert t212_configured() is False
    monkeypatch.setattr("app.config.settings.t212_api_secret", "def")
    assert t212_configured() is True
