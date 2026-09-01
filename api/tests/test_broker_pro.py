"""Broker connect/sync require Pro when Stripe billing is on."""

from fastapi.testclient import TestClient

from app.auth import create_access_token, hash_password
from app.config import settings
from app.db import get_db, init_db
from app.main import app
from app.routers.brokers import PRO_BROKER_DETAIL
KEY = "test-key-xxxx"
SECRET = "test-secret-yyyy"
IBKR_TOKEN = "flex-token"
IBKR_QID = "qid1"


def _enable_billing(monkeypatch):
    monkeypatch.setattr(settings, "stripe_secret_key", "sk_test_limit")
    monkeypatch.setattr(settings, "stripe_price_monthly", "price_monthly_test")


def _token(email: str, *, pro_plan: bool = False) -> str:
    init_db()
    email = email.strip().lower()
    with get_db() as conn:
        row = conn.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
        if row:
            uid = row["id"]
        else:
            cur = conn.execute(
                "INSERT INTO users (email, password_hash, email_verified, plan, subscription_status) VALUES (?, ?, 1, ?, ?)",
                (
                    email,
                    hash_password("test-pass-12"),
                    "monthly" if pro_plan else "free",
                    "active" if pro_plan else "free",
                ),
            )
            uid = cur.lastrowid
    return create_access_token(uid, email)


def _auth(email: str, *, pro_plan: bool = False) -> dict:
    return {"Authorization": f"Bearer {_token(email, pro_plan=pro_plan)}"}


def _mock_t212(monkeypatch):
    monkeypatch.setattr("app.routers.brokers.fetch_positions", lambda **_kw: [])
    monkeypatch.setattr("app.routers.brokers.fetch_history_orders", lambda **_kw: [])


def test_free_bearer_cannot_connect_or_sync_when_billing_on(monkeypatch):
    _enable_billing(monkeypatch)
    _mock_t212(monkeypatch)
    with TestClient(app) as client:
        headers = _auth("free.broker@example.com")
        connect = client.post(
            "/api/v1/brokers/t212/connect",
            headers=headers,
            json={"api_key": KEY, "api_secret": SECRET},
        )
        assert connect.status_code == 403, connect.text
        assert connect.json()["detail"] == PRO_BROKER_DETAIL
        sync = client.get("/api/v1/brokers/t212/sync", headers=headers)
        assert sync.status_code == 403
        alpaca = client.post(
            "/api/v1/brokers/alpaca/connect",
            headers=headers,
            json={"api_key": KEY, "api_secret": SECRET, "paper": True},
        )
        assert alpaca.status_code == 403
        ibkr = client.post(
            "/api/v1/brokers/ibkr/connect",
            headers=headers,
            json={"token": IBKR_TOKEN, "query_id": IBKR_QID},
        )
        assert ibkr.status_code == 403
        alpaca_sync = client.get("/api/v1/brokers/alpaca/sync", headers=headers)
        assert alpaca_sync.status_code == 403
        ibkr_sync = client.get("/api/v1/brokers/ibkr/sync", headers=headers)
        assert ibkr_sync.status_code == 403


def test_canceled_stale_plan_cannot_connect(monkeypatch):
    _enable_billing(monkeypatch)
    _mock_t212(monkeypatch)
    init_db()
    email = "canceled.broker@example.com"
    with get_db() as conn:
        cur = conn.execute(
            "INSERT INTO users (email, password_hash, email_verified, plan, subscription_status) VALUES (?, ?, 1, ?, ?)",
            (email, hash_password("test-pass-12"), "monthly", "canceled"),
        )
        uid = cur.lastrowid
    token = create_access_token(uid, email)
    with TestClient(app) as client:
        res = client.post(
            "/api/v1/brokers/t212/connect",
            headers={"Authorization": f"Bearer {token}"},
            json={"api_key": KEY, "api_secret": SECRET},
        )
        assert res.status_code == 403


def test_pro_user_can_connect_when_billing_on(monkeypatch):
    _enable_billing(monkeypatch)
    _mock_t212(monkeypatch)
    with TestClient(app) as client:
        headers = _auth("pro.broker@example.com", pro_plan=True)
        res = client.post(
            "/api/v1/brokers/t212/connect",
            headers=headers,
            json={"api_key": KEY, "api_secret": SECRET},
        )
        assert res.status_code == 200, res.text
        sync = client.get("/api/v1/brokers/t212/sync", headers=headers)
        assert sync.status_code == 200


def test_billing_disabled_connect_still_works(monkeypatch):
    _mock_t212(monkeypatch)
    with TestClient(app) as client:
        headers = _auth("dev.broker@example.com")
        res = client.post(
            "/api/v1/brokers/t212/connect",
            headers=headers,
            json={"api_key": KEY, "api_secret": SECRET},
        )
        assert res.status_code == 200, res.text
