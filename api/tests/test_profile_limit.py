"""Profile PUT: trial/Pro unlimited; expired trial cannot grow the journal."""

from fastapi.testclient import TestClient

from app.auth import create_access_token, hash_password
from app.config import settings
from app.db import get_db, init_db
from app.main import app
from app.trial import TRIAL_EXPIRED_DETAIL

PAST = "2000-01-01T00:00:00Z"
FUTURE = "2099-12-31T00:00:00Z"


def _enable_billing(monkeypatch):
    monkeypatch.setattr(settings, "stripe_secret_key", "sk_test_limit")
    monkeypatch.setattr(settings, "stripe_price_monthly", "price_monthly_test")


def _token(email: str, *, pro_plan: bool = False, trial_ends_at: str | None = PAST) -> str:
    init_db()
    email = email.strip().lower()
    with get_db() as conn:
        row = conn.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
        if row:
            uid = row["id"]
        else:
            cur = conn.execute(
                """
                INSERT INTO users (email, password_hash, email_verified, plan, subscription_status, trial_ends_at)
                VALUES (?, ?, 1, ?, ?, ?)
                """,
                (
                    email,
                    hash_password("test-pass-12"),
                    "monthly" if pro_plan else "free",
                    "active" if pro_plan else "free",
                    None if pro_plan else trial_ends_at,
                ),
            )
            uid = cur.lastrowid
    return create_access_token(uid, email)


def _auth(email: str, *, pro_plan: bool = False, trial_ends_at: str | None = PAST) -> dict:
    return {"Authorization": f"Bearer {_token(email, pro_plan=pro_plan, trial_ends_at=trial_ends_at)}"}


def _state(n: int, source: str = "t212") -> dict:
    trades = [
        {"id": 1000 + i, "instr": "AAPL", "source": source, "externalId": f"{source}:{i}"}
        for i in range(n)
    ]
    return {"trades": trades, "bal": 10000}


def test_expired_trial_cannot_put_new_trades(monkeypatch):
    _enable_billing(monkeypatch)
    with TestClient(app) as client:
        headers = _auth("free.cap@example.com", trial_ends_at=PAST)
        blocked = client.put("/api/v1/profile/state", json={"state": _state(1)}, headers=headers)
        assert blocked.status_code == 403
        assert blocked.json()["detail"] == TRIAL_EXPIRED_DETAIL
        stay = client.get("/api/v1/profile/state", headers=headers)
        assert stay.status_code == 200
        assert stay.json()["state"] is None


def test_crafted_ids_without_flag_blocked_after_trial(monkeypatch):
    _enable_billing(monkeypatch)
    crafted = {
        "trades": [{"id": i, "instr": "X"} for i in range(1, 12)],
        "bal": 10000,
    }
    with TestClient(app) as client:
        headers = _auth("free.crafted@example.com", trial_ends_at=PAST)
        blocked = client.put("/api/v1/profile/state", json={"state": crafted}, headers=headers)
        assert blocked.status_code == 403
        assert blocked.json()["detail"] == TRIAL_EXPIRED_DETAIL


def test_trial_user_unlimited(monkeypatch):
    _enable_billing(monkeypatch)
    demo_plus = {
        "trades": [
            {"id": 1, "isDemo": True, "instr": "RACE"},
            {"id": 2, "isDemo": True, "instr": "BE"},
            {"id": 3, "isDemo": True, "instr": "USDJPY"},
            {"id": 4, "isDemo": True, "instr": "AAPL CFD"},
        ]
        + [
            {"id": 500 + i, "instr": "MSFT", "source": "csv", "externalId": f"csv:{i}"}
            for i in range(25)
        ],
        "bal": 10000,
    }
    with TestClient(app) as client:
        headers = _auth("trial.demo@example.com", trial_ends_at=FUTURE)
        res = client.put("/api/v1/profile/state", json={"state": demo_plus}, headers=headers)
        assert res.status_code == 200, res.text


def test_legacy_over_limit_snapshot_may_stay(monkeypatch):
    _enable_billing(monkeypatch)
    with TestClient(app) as client:
        headers = _auth("free.legacy@example.com", trial_ends_at=PAST)
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
        headers = _auth("dev.unlimited@example.com", trial_ends_at=PAST)
        res = client.put("/api/v1/profile/state", json={"state": _state(25)}, headers=headers)
        assert res.status_code == 200, res.text


def test_me_exposes_trial_fields(monkeypatch):
    _enable_billing(monkeypatch)
    with TestClient(app) as client:
        live = client.get(
            "/api/v1/auth/me",
            headers=_auth("trial.me@example.com", trial_ends_at=FUTURE),
        )
        assert live.status_code == 200
        data = live.json()
        assert data["pro"] is True
        assert data["trial_active"] is True
        assert data["trial_days_left"] >= 1
        assert data["trial_ends_at"]

        dead = client.get(
            "/api/v1/auth/me",
            headers=_auth("expired.me@example.com", trial_ends_at=PAST),
        )
        assert dead.status_code == 200
        ended = dead.json()
        assert ended["pro"] is False
        assert ended["trial_active"] is False
        assert ended["trial_days_left"] == 0
