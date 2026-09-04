from pathlib import Path

from fastapi.testclient import TestClient

from app.auth import create_access_token, hash_password
from app.db import get_db, init_db
from app.main import app
from app.routers import stats as stats_mod
from app.routers.stats import STATS_VIEWER_EMAILS, email_can_view_stats, record_hit

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


def test_visitor_cleanup_not_on_every_hit():
    init_db()
    stats_mod._last_visitor_cleanup = None
    record_hit("1.1.1.1", "ua", "secret")
    assert stats_mod._last_visitor_cleanup is not None
    first_cleanup = stats_mod._last_visitor_cleanup
    with get_db() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO site_stats_visitors (day, visitor_hash) VALUES (?, ?)",
            ("2000-01-01", "old-hash"),
        )
    record_hit("2.2.2.2", "ua", "secret")
    assert stats_mod._last_visitor_cleanup == first_cleanup
    with get_db() as conn:
        leftover = conn.execute(
            "SELECT 1 FROM site_stats_visitors WHERE day = '2000-01-01'"
        ).fetchone()
    assert leftover is not None

    stats_mod._last_visitor_cleanup = None
    record_hit("4.4.4.4", "ua", "secret")
    with get_db() as conn:
        leftover = conn.execute(
            "SELECT 1 FROM site_stats_visitors WHERE day = '2000-01-01'"
        ).fetchone()
    assert leftover is None


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
    assert "/api/v1/stats" in (ROOT / "js/sync.js").read_text(encoding="utf-8")
    stats_py = (ROOT / "api/app/routers/stats.py").read_text(encoding="utf-8")
    assert "from app.billing_util import" not in stats_py
    assert "email_is_boss(" not in stats_py
    login = (ROOT / "login.html").read_text(encoding="utf-8")
    assert "safeNextPath" in login
    assert 'get("next")' in login


PERSONAL_EMAILS = (
    "janis@thinicedigital.com",
    "berzins.j@inbox.lv",
    "janis.berzins.liepins@gmail.com",
)


def test_public_js_omits_personal_house_emails():
    for rel in ("js/sync.js", "login.html", "js/desk.js"):
        text = (ROOT / rel).read_text(encoding="utf-8").lower()
        for email in PERSONAL_EMAILS:
            assert email not in text, f"{rel} still publishes {email}"
        assert "info@thinicedigital.com" not in text, rel


def test_me_exposes_house_and_stats_flags_not_emails():
    with TestClient(app) as client:
        res = client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {token_for('someone@example.com')}"},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["house"] is False
        assert data["can_view_stats"] is False

        res = client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {token_for('janis@thinicedigital.com')}"},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["house"] is True
        assert data["can_view_stats"] is True

        res = client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {token_for('info@thinicedigital.com')}"},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["house"] is True
        assert data["can_view_stats"] is False


def test_login_html_uses_emailed_token_reset():
    html = (ROOT / "login.html").read_text(encoding="utf-8")
    assert "/api/v1/auth/forgot-password" in html
    assert "/api/v1/auth/reset-password" in html
    assert "token: resetToken" in html
    assert "new_password: fields.password" in html
    assert "email: fields.email,\n          new_password" not in html
    assert "Continue to Runnr" in html
    assert "goHome();" in html


def test_operator_sync_controls_are_house_gated():
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    assert "RunnrSync.isHouse" in html
    assert 'onclick="forcePullWatchlist()">Pull from cloud' not in html
    assert "dismissVerifyBanner" in html
    assert 'href="icons/icon-192.png"' in html


def test_pwa_png_icons_exist():
    for name, size in (("icon-192.png", 192), ("icon-512.png", 512)):
        path = ROOT / "icons" / name
        raw = path.read_bytes()
        assert raw[:8] == b"\x89PNG\r\n\x1a\n", name
        manifest = (ROOT / "manifest.webmanifest").read_text(encoding="utf-8")
        assert f"icons/{name}" in manifest
        assert str(size) in manifest


def test_privacy_says_broker_secrets_stay_off_device():
    html = (ROOT / "privacy/index.html").read_text(encoding="utf-8")
    md = (ROOT / "legal/runnr-privacy-policy.md").read_text(encoding="utf-8")
    for text in (html, md):
        assert "do not keep raw broker secrets in your browser" in text.lower()
    sync = (ROOT / "js/sync.js").read_text(encoding="utf-8")
    assert "Do not persist raw Alpaca secrets" in sync
    assert "wipeAlpacaLocalSecrets" in sync
    assert "JSON.stringify({ key: apiKey, secret: apiSecret" not in sync

