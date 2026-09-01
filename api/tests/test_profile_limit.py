"""Profile PUT enforces the free-plan journal cap when Stripe billing is on."""

from fastapi.testclient import TestClient

from app.auth import create_access_token, hash_password
from app.config import settings
from app.db import get_db, init_db
from app.main import app
from app.trade_limit import FREE_LIMIT_DETAIL, FREE_TRADE_LIMIT


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


def _state(n: int, source: str = "t212") -> dict:
    trades = [
        {"id": 1000 + i, "instr": "AAPL", "source": source, "externalId": f"{source}:{i}"}
        for i in range(n)
    ]
    return {"trades": trades, "bal": 10000}


def test_free_user_cannot_put_11_imported_trades(monkeypatch):
    _enable_billing(monkeypatch)
    with TestClient(app) as client:
        headers = _auth("free.cap@example.com")
        ok = client.put("/api/v1/profile/state", json={"state": _state(FREE_TRADE_LIMIT)}, headers=headers)
        assert ok.status_code == 200, ok.text
        blocked = client.put("/api/v1/profile/state", json={"state": _state(11)}, headers=headers)
        assert blocked.status_code == 403
        assert blocked.json()["detail"] == FREE_LIMIT_DETAIL
        stay = client.get("/api/v1/profile/state", headers=headers)
        assert stay.status_code == 200
        assert len(stay.json()["state"]["trades"]) == FREE_TRADE_LIMIT


def test_free_user_demo_only_can_put_10(monkeypatch):
    _enable_billing(monkeypatch)
    demo_plus = {
        "trades": [
            {"id": 1, "instr": "RACE"},
            {"id": 2, "instr": "BE"},
            {"id": 3, "instr": "USDJPY"},
            {"id": 4, "instr": "AAPL CFD"},
        ]
        + [
            {"id": 500 + i, "instr": "MSFT", "source": "csv", "externalId": f"csv:{i}"}
            for i in range(10)
        ],
        "bal": 10000,
    }
    with TestClient(app) as client:
        headers = _auth("free.demo@example.com")
        res = client.put("/api/v1/profile/state", json={"state": demo_plus}, headers=headers)
        assert res.status_code == 200, res.text


def test_legacy_over_limit_snapshot_may_stay(monkeypatch):
    _enable_billing(monkeypatch)
    with TestClient(app) as client:
        headers = _auth("free.legacy@example.com")
        # Seed 15 while treating the user as already stored (direct db insert).
        from app.db import get_db as gdb
        import json

        with gdb() as conn:
            row = conn.execute(
                "SELECT id FROM users WHERE email = ?", ("free.legacy@example.com",)
            ).fetchone()
            conn.execute(
                """
                INSERT INTO user_state (user_id, state_json, updated_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(user_id) DO UPDATE SET state_json = excluded.state_json
                """,
                (row["id"], json.dumps(_state(15))),
            )
        stay = client.put("/api/v1/profile/state", json={"state": _state(15)}, headers=headers)
        assert stay.status_code == 200, stay.text
        grow = client.put("/api/v1/profile/state", json={"state": _state(16)}, headers=headers)
        assert grow.status_code == 403


def test_pro_user_unlimited(monkeypatch):
    _enable_billing(monkeypatch)
    with TestClient(app) as client:
        headers = _auth("pro.cap@example.com", pro_plan=True)
        res = client.put("/api/v1/profile/state", json={"state": _state(25)}, headers=headers)
        assert res.status_code == 200, res.text


def test_billing_disabled_unlimited():
    with TestClient(app) as client:
        headers = _auth("dev.unlimited@example.com")
        res = client.put("/api/v1/profile/state", json={"state": _state(25)}, headers=headers)
        assert res.status_code == 200, res.text
