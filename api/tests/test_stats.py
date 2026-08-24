"""GET /api/v1/stats is Janis-only; POST /api/v1/stats/hit stays public."""

from __future__ import annotations

import os
import tempfile
import uuid

_db = os.path.join(tempfile.gettempdir(), f"runnr-stats-{uuid.uuid4().hex}.db")
os.environ["DATABASE_PATH"] = _db
os.environ["RUNNR_SECRET_KEY"] = "stats-test-secret"

from fastapi.testclient import TestClient  # noqa: E402

from app.auth import create_access_token, hash_password  # noqa: E402
from app.billing_util import email_is_boss  # noqa: E402
from app.db import get_db, init_db  # noqa: E402
from app.main import app  # noqa: E402
from app.routers.stats import email_can_view_stats  # noqa: E402


def _add_user(email: str) -> int:
    with get_db() as conn:
        cur = conn.execute(
            "INSERT INTO users (email, password_hash, email_verified) VALUES (?, ?, 1)",
            (email, hash_password("password12")),
        )
        return int(cur.lastrowid)


def _auth(email: str) -> dict[str, str]:
    user_id = _add_user(email)
    token = create_access_token(user_id, email)
    return {"Authorization": f"Bearer {token}"}


def setup_module(_mod) -> None:
    init_db()


def test_email_can_view_stats_is_not_boss_list() -> None:
    assert email_can_view_stats("janis@thinicedigital.com")
    assert email_can_view_stats("berzins.j@inbox.lv")
    assert email_can_view_stats("janis.berzins.liepins@gmail.com")
    assert email_can_view_stats("JANIS@thinicedigital.com")
    assert not email_can_view_stats("info@thinicedigital.com")
    assert not email_can_view_stats("someone@example.com")
    assert not email_can_view_stats(None)
    assert email_is_boss("info@thinicedigital.com")
    assert not email_can_view_stats("info@thinicedigital.com")


def test_hit_is_public() -> None:
    with TestClient(app) as client:
        res = client.post("/api/v1/stats/hit")
        assert res.status_code == 204


def test_get_stats_requires_auth() -> None:
    with TestClient(app) as client:
        res = client.get("/api/v1/stats")
        assert res.status_code == 401


def test_get_stats_rejects_other_signed_in_users() -> None:
    with TestClient(app) as client:
        res = client.get("/api/v1/stats", headers=_auth("trader@example.com"))
        assert res.status_code == 403


def test_get_stats_rejects_boss_email_not_on_janis_list() -> None:
    with TestClient(app) as client:
        res = client.get("/api/v1/stats", headers=_auth("info@thinicedigital.com"))
        assert res.status_code == 403


def test_get_stats_allows_janis_emails() -> None:
    with TestClient(app) as client:
        for email in (
            "janis@thinicedigital.com",
            "berzins.j@inbox.lv",
            "janis.berzins.liepins@gmail.com",
        ):
            res = client.get("/api/v1/stats", headers=_auth(email))
            assert res.status_code == 200, email
            body = res.json()
            assert "today" in body
            assert "totals" in body
            assert "days" in body
            assert body["totals"]["pageviews"] >= 0
