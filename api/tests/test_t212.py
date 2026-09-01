"""Trading 212 mapping, per-user connect, and idempotent fill ids — no live API calls."""

from __future__ import annotations

import json
from pathlib import Path

from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.auth import create_access_token, hash_password
from app.crypto_util import decrypt
from app.db import get_db
from app.main import app
from app.t212 import (
    fetch_history_orders,
    fetch_positions,
    map_t212_ticker,
    normalize_history_item,
    normalize_history_items,
    normalize_positions,
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


ALICE_KEY = "user-key-alice-aaaa"
ALICE_SECRET = "user-secret-alice-bbbb"
BOB_KEY = "user-key-bob-cccccc"
BOB_SECRET = "user-secret-bob-dddddd"
HOUSE_KEY = "house-env-key-xxxx"
HOUSE_SECRET = "house-env-secret-yyyy"

SAMPLE_FILLS = [
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
SAMPLE_POSITIONS = [{"symbol": "AAPL", "qty": 10, "avg_entry_price": 190.5}]


def _user_id(email: str) -> int:
    with get_db() as conn:
        row = conn.execute("SELECT id FROM users WHERE email = ?", (email.strip().lower(),)).fetchone()
    assert row is not None
    return int(row["id"])


def _t212_row(user_id: int):
    with get_db() as conn:
        return conn.execute(
            "SELECT api_key_enc, api_secret_enc FROM broker_connections WHERE user_id = ? AND broker = 't212'",
            (user_id,),
        ).fetchone()


def _assert_no_secret_leak(payload, extra=()) -> None:
    dumped = json.dumps(payload).lower()
    assert "t212_api_key" not in dumped
    assert "t212_api_secret" not in dumped
    assert "basic " not in dumped
    assert "traceback" not in dumped
    for needle in (ALICE_KEY, ALICE_SECRET, BOB_KEY, BOB_SECRET, HOUSE_KEY, HOUSE_SECRET, "test-key", "test-secret", *extra):
        assert needle.lower() not in dumped


def _mock_t212(monkeypatch, *, positions=None, fills=None, seen=None, reject=None):
    seen = seen if seen is not None else []

    def fake_positions(*, key, secret, **_kw):
        seen.append(("positions", key, secret))
        if reject:
            raise HTTPException(status_code=400, detail="Trading 212 rejected the API credentials. Use a read-only key (account, history, portfolio).")
        return list(positions if positions is not None else SAMPLE_POSITIONS)

    def fake_orders(*, key, secret, **_kw):
        seen.append(("orders", key, secret))
        if reject:
            raise HTTPException(status_code=400, detail="Trading 212 rejected the API credentials. Use a read-only key (account, history, portfolio).")
        return list(fills if fills is not None else SAMPLE_FILLS)

    monkeypatch.setattr("app.routers.brokers.fetch_positions", fake_positions)
    monkeypatch.setattr("app.routers.brokers.fetch_history_orders", fake_orders)
    return seen


def test_t212_unauthenticated_is_401():
    with TestClient(app) as client:
        st = client.get("/api/v1/brokers/t212/status")
        assert st.status_code == 401
        sync = client.get("/api/v1/brokers/t212/sync")
        assert sync.status_code == 401
        connect = client.post(
            "/api/v1/brokers/t212/connect",
            json={"api_key": ALICE_KEY, "api_secret": ALICE_SECRET},
        )
        assert connect.status_code == 401
        for body in (st.json(), sync.json(), connect.json()):
            _assert_no_secret_leak(body)
            assert body.get("recent_orders") is None


def test_t212_not_connected_is_404_not_403_even_if_env_set(monkeypatch):
    monkeypatch.setattr("app.config.settings.t212_api_key", HOUSE_KEY)
    monkeypatch.setattr("app.config.settings.t212_api_secret", HOUSE_SECRET)
    seen = _mock_t212(monkeypatch)

    with TestClient(app) as client:
        headers = {"Authorization": f"Bearer {token_for('t212.none@example.com')}"}
        st = client.get("/api/v1/brokers/t212/status", headers=headers)
        assert st.status_code == 404
        sync = client.get("/api/v1/brokers/t212/sync", headers=headers)
        assert sync.status_code == 404
        for res in (st, sync):
            assert res.status_code != 403
            detail = res.json()["detail"]
            assert "not connected for this account" in detail.lower()
            assert "T212_API_KEY" not in detail
            assert "T212_API_SECRET" not in detail
            _assert_no_secret_leak(res.json())
            assert res.json().get("recent_orders") is None
        assert seen == []


def test_connect_stores_encrypted_and_does_not_log_secrets(monkeypatch):
    seen = _mock_t212(monkeypatch)
    monkeypatch.setattr("app.config.settings.t212_api_key", HOUSE_KEY)
    monkeypatch.setattr("app.config.settings.t212_api_secret", HOUSE_SECRET)

    with TestClient(app) as client:
        headers = {"Authorization": f"Bearer {token_for('t212.store@example.com')}"}
        res = client.post(
            "/api/v1/brokers/t212/connect",
            headers=headers,
            json={"api_key": ALICE_KEY, "api_secret": ALICE_SECRET},
        )
        assert res.status_code == 200
        body = res.json()
        assert body["connected"] is True
        assert body["broker"] == "t212"
        assert body["position_count"] == 1
        _assert_no_secret_leak(body)
        assert "api_key" not in body
        assert "api_secret" not in body

    uid = _user_id("t212.store@example.com")
    row = _t212_row(uid)
    assert row is not None
    assert ALICE_KEY not in row["api_key_enc"]
    assert ALICE_SECRET not in row["api_secret_enc"]
    assert decrypt(row["api_key_enc"]) == ALICE_KEY
    assert decrypt(row["api_secret_enc"]) == ALICE_SECRET
    assert seen == [("positions", ALICE_KEY, ALICE_SECRET)]


def test_sync_uses_per_user_creds_not_env(monkeypatch):
    seen = _mock_t212(monkeypatch)
    monkeypatch.setattr("app.config.settings.t212_api_key", HOUSE_KEY)
    monkeypatch.setattr("app.config.settings.t212_api_secret", HOUSE_SECRET)

    with TestClient(app) as client:
        headers = {"Authorization": f"Bearer {token_for('t212.syncenv@example.com')}"}
        connect = client.post(
            "/api/v1/brokers/t212/connect",
            headers=headers,
            json={"api_key": ALICE_KEY, "api_secret": ALICE_SECRET},
        )
        assert connect.status_code == 200
        st = client.get("/api/v1/brokers/t212/status", headers=headers)
        assert st.status_code == 200
        assert st.json()["connected"] is True
        sync = client.get("/api/v1/brokers/t212/sync", headers=headers)
        assert sync.status_code == 200
        body = sync.json()
        assert body["recent_orders"][0]["id"] == "t212:fill:9001"
        assert body["positions"][0]["symbol"] == "AAPL"
        _assert_no_secret_leak(body)

    used = {(k, s) for _kind, k, s in seen}
    assert (ALICE_KEY, ALICE_SECRET) in used
    assert (HOUSE_KEY, HOUSE_SECRET) not in used


def test_other_users_creds_are_isolated(monkeypatch):
    seen = _mock_t212(monkeypatch)

    with TestClient(app) as client:
        alice_h = {"Authorization": f"Bearer {token_for('t212.iso.a@example.com')}"}
        bob_h = {"Authorization": f"Bearer {token_for('t212.iso.b@example.com')}"}
        assert client.post(
            "/api/v1/brokers/t212/connect",
            headers=alice_h,
            json={"api_key": ALICE_KEY, "api_secret": ALICE_SECRET},
        ).status_code == 200

        st = client.get("/api/v1/brokers/t212/status", headers=bob_h)
        assert st.status_code == 404
        sync = client.get("/api/v1/brokers/t212/sync", headers=bob_h)
        assert sync.status_code == 404
        _assert_no_secret_leak(st.json())
        _assert_no_secret_leak(sync.json())

        assert client.post(
            "/api/v1/brokers/t212/connect",
            headers=bob_h,
            json={"api_key": BOB_KEY, "api_secret": BOB_SECRET},
        ).status_code == 200

        alice_sync = client.get("/api/v1/brokers/t212/sync", headers=alice_h)
        bob_sync = client.get("/api/v1/brokers/t212/sync", headers=bob_h)
        assert alice_sync.status_code == 200
        assert bob_sync.status_code == 200

    alice_id = _user_id("t212.iso.a@example.com")
    bob_id = _user_id("t212.iso.b@example.com")
    assert decrypt(_t212_row(alice_id)["api_key_enc"]) == ALICE_KEY
    assert decrypt(_t212_row(bob_id)["api_key_enc"]) == BOB_KEY
    assert decrypt(_t212_row(alice_id)["api_secret_enc"]) == ALICE_SECRET
    assert decrypt(_t212_row(bob_id)["api_secret_enc"]) == BOB_SECRET
    used = {(k, s) for _kind, k, s in seen}
    assert (ALICE_KEY, ALICE_SECRET) in used
    assert (BOB_KEY, BOB_SECRET) in used


def test_connect_t212_reject_is_400_and_does_not_store(monkeypatch):
    _mock_t212(monkeypatch, reject=True)
    with TestClient(app) as client:
        headers = {"Authorization": f"Bearer {token_for('t212.reject@example.com')}"}
        res = client.post(
            "/api/v1/brokers/t212/connect",
            headers=headers,
            json={"api_key": ALICE_KEY, "api_secret": ALICE_SECRET},
        )
        assert res.status_code == 400
        detail = res.json()["detail"]
        assert "rejected" in detail.lower()
        assert "T212_API_KEY" not in detail
        _assert_no_secret_leak(res.json())
        assert _t212_row(_user_id("t212.reject@example.com")) is None


def test_sync_t212_reject_is_400(monkeypatch):
    seen = []

    def ok_then_reject(*, key, secret, **_kw):
        seen.append(("positions", key, secret))
        if len([s for s in seen if s[0] == "positions"]) == 1:
            return list(SAMPLE_POSITIONS)
        raise HTTPException(
            status_code=400,
            detail="Trading 212 rejected the API credentials. Use a read-only key (account, history, portfolio).",
        )

    monkeypatch.setattr("app.routers.brokers.fetch_positions", ok_then_reject)
    monkeypatch.setattr("app.routers.brokers.fetch_history_orders", lambda **_kw: SAMPLE_FILLS)

    with TestClient(app) as client:
        headers = {"Authorization": f"Bearer {token_for('t212.syncreject@example.com')}"}
        assert client.post(
            "/api/v1/brokers/t212/connect",
            headers=headers,
            json={"api_key": ALICE_KEY, "api_secret": ALICE_SECRET},
        ).status_code == 200
        sync = client.get("/api/v1/brokers/t212/sync", headers=headers)
        assert sync.status_code == 400
        _assert_no_secret_leak(sync.json())


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


def test_t212_http_403_maps_to_400_without_leaking_secrets():
    def fake_get(url, headers, timeout):
        _ = url, headers, timeout
        return 403, b'{"message":"scope missing"}', {}

    try:
        fetch_positions(key=ALICE_KEY, secret=ALICE_SECRET, http_get=fake_get)
        raise AssertionError("expected HTTPException")
    except HTTPException as exc:
        assert exc.status_code == 400
        assert "rejected" in str(exc.detail).lower()
        assert "T212_API_KEY" not in str(exc.detail)
        assert ALICE_KEY not in str(exc.detail)
        assert ALICE_SECRET not in str(exc.detail)


def test_health_does_not_advertise_house_t212_env(monkeypatch):
    monkeypatch.setattr("app.config.settings.t212_api_key", HOUSE_KEY)
    monkeypatch.setattr("app.config.settings.t212_api_secret", HOUSE_SECRET)
    with TestClient(app) as client:
        res = client.get("/health")
        assert res.status_code == 200
        data = res.json()
        assert "t212_configured" not in data
        blob = json.dumps(data)
        assert HOUSE_KEY not in blob
        assert HOUSE_SECRET not in blob
        assert "T212_API_SECRET=" not in blob
        assert "t212_api_key" not in blob.lower()
