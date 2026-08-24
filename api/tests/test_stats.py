from pathlib import Path

from fastapi.testclient import TestClient

from app.auth import create_access_token, hash_password
from app.db import get_db
from app.main import app
from app.routers.stats import STATS_VIEWER_EMAILS, email_can_view_stats

JANIS_EMAILS = (
    "janis@thinicedigital.com",
    "berzins.j@inbox.lv",
    "janis.berzins.liepins@gmail.com",
)


def token_for(email: str) -> str:
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


def test_stats_viewer_list_is_not_boss_list():
    assert email_can_view_stats("janis@thinicedigital.com")
    assert email_can_view_stats("berzins.j@inbox.lv")
    assert email_can_view_stats("janis.berzins.liepins@gmail.com")
    assert email_can_view_stats("JANIS@thinicedigital.com")
    assert not email_can_view_stats("info@thinicedigital.com")
    assert not email_can_view_stats("someone@example.com")
    assert not email_can_view_stats(None)
    assert STATS_VIEWER_EMAILS == frozenset(JANIS_EMAILS)


def test_hit_stays_public():
    with TestClient(app) as client:
        res = client.post("/api/v1/stats/hit")
        assert res.status_code == 204
        res = client.post("/api/v1/stats/hit", headers={"DNT": "1"})
        assert res.status_code == 204
        res = client.post("/api/v1/stats/hit", headers={"Sec-GPC": "1"})
        assert res.status_code == 204


def test_get_stats_requires_auth():
    with TestClient(app) as client:
        res = client.get("/api/v1/stats")
        assert res.status_code == 401
        res = client.get("/api/v1/stats", headers={"Authorization": "Bearer not-a-jwt"})
        assert res.status_code == 401


def test_get_stats_forbidden_for_other_signed_in_users():
    with TestClient(app) as client:
        for email in ("someone@example.com", "info@thinicedigital.com"):
            res = client.get(
                "/api/v1/stats",
                headers={"Authorization": f"Bearer {token_for(email)}"},
            )
            assert res.status_code == 403, email


def test_get_stats_ok_for_janis_emails():
    with TestClient(app) as client:
        client.post("/api/v1/stats/hit")
        for email in JANIS_EMAILS:
            res = client.get(
                "/api/v1/stats",
                headers={"Authorization": f"Bearer {token_for(email)}"},
            )
            assert res.status_code == 200, email
            data = res.json()
            assert "today" in data
            assert "totals" in data
            assert "days" in data
            assert data["timezone"] == "UTC"
            assert data["totals"]["pageviews"] >= 1
            assert res.headers.get("cache-control") == "no-store"


ROOT = Path(__file__).resolve().parents[2]


def test_stats_html_is_gated():
    html = (ROOT / "stats.html").read_text(encoding="utf-8")
    assert 'name="robots" content="noindex' in html
    assert "This page is only for Janis" in html
    assert "/login.html?next=/stats.html" in html
    assert "runnr_api_token" in html
    assert "Bearer" in html


def test_public_legal_and_login_footers_omit_stats():
    for rel in ("login.html", "privacy/index.html", "terms/index.html", "refund/index.html"):
        html = (ROOT / rel).read_text(encoding="utf-8")
        assert 'href="/stats.html"' not in html, rel


def test_privacy_does_not_publish_totals():
    html = (ROOT / "privacy/index.html").read_text(encoding="utf-8")
    md = (ROOT / "legal/runnr-privacy-policy.md").read_text(encoding="utf-8")
    for text in (html, md):
        assert "internal and are not published" in text
        assert "Public totals" not in text
        assert "public counters" not in text


def test_app_hides_stats_link_until_janis():
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    assert "js-stats-link" in html
    assert "canViewStats" in (ROOT / "js/sync.js").read_text(encoding="utf-8")
    stats_py = (ROOT / "api/app/routers/stats.py").read_text(encoding="utf-8")
    assert "from app.billing_util import" not in stats_py
    assert "email_is_boss(" not in stats_py
    login = (ROOT / "login.html").read_text(encoding="utf-8")
    assert "safeNextPath" in login
    assert 'get("next")' in login
