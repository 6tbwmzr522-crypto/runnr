from pathlib import Path

from fastapi.testclient import TestClient

from app.auth import create_access_token, hash_password
from app.config import settings
from app.db import get_db, init_db
from app.main import app
from app.routers import stats as stats_mod
from app.routers.stats import (
    STATS_VIEWER_EMAILS,
    email_can_view_stats,
    guest_hash,
    record_hit,
)

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


GUEST_A = "11111111-1111-4111-8111-111111111111"
GUEST_B = "22222222-2222-4222-8222-222222222222"


def _day_counts(day: str):
    with get_db() as conn:
        row = conn.execute(
            """
            SELECT pageviews, uniques, new_visitors, returning_visitors
            FROM site_stats_days WHERE day = ?
            """,
            (day,),
        ).fetchone()
    if not row:
        return {"pageviews": 0, "uniques": 0, "new_visitors": 0, "returning_visitors": 0}
    return {k: int(row[k]) for k in row.keys()}


def test_new_then_returning_uses_guest_id_not_ip(monkeypatch):
    init_db()
    monkeypatch.setattr(stats_mod, "utc_day", lambda now=None: "2026-04-01")
    record_hit("9.9.9.9", "ua-a", "secret", guest_id=GUEST_A)
    record_hit("9.9.9.9", "ua-a", "secret", guest_id=GUEST_A)
    record_hit("9.9.9.9", "ua-a", "secret", guest_id=GUEST_B)
    day1 = _day_counts("2026-04-01")
    assert day1["pageviews"] == 3
    assert day1["uniques"] == 1
    assert day1["new_visitors"] == 2
    assert day1["returning_visitors"] == 0

    monkeypatch.setattr(stats_mod, "utc_day", lambda now=None: "2026-04-02")
    record_hit("8.8.8.8", "ua-b", "secret", guest_id=GUEST_A)
    record_hit("8.8.8.8", "ua-b", "secret", guest_id=GUEST_A)
    record_hit("7.7.7.7", "ua-c", "secret")
    day2 = _day_counts("2026-04-02")
    assert day2["new_visitors"] == 0
    assert day2["returning_visitors"] == 1
    assert day2["uniques"] == 2
    assert day2["pageviews"] == 3

    digest = guest_hash(GUEST_A, "secret")
    with get_db() as conn:
        row = conn.execute(
            "SELECT first_seen_day, last_seen_day, guest_hash FROM site_stats_guests WHERE guest_hash = ?",
            (digest,),
        ).fetchone()
        raw = conn.execute(
            "SELECT 1 FROM site_stats_guests WHERE guest_hash = ?",
            (GUEST_A,),
        ).fetchone()
    assert row["first_seen_day"] == "2026-04-01"
    assert row["last_seen_day"] == "2026-04-02"
    assert row["guest_hash"] != GUEST_A
    assert raw is None


def test_invalid_guest_id_does_not_count_as_new():
    init_db()
    day = stats_mod.utc_day()
    before = _day_counts(day)
    with get_db() as conn:
        guests_before = conn.execute("SELECT COUNT(*) AS n FROM site_stats_guests").fetchone()["n"]
    record_hit("5.5.5.5", "ua-invalid", "secret", guest_id="not-a-uuid")
    record_hit("5.5.5.5", "ua-invalid", "secret", guest_id="x" * 80)
    after = _day_counts(day)
    with get_db() as conn:
        guests_after = conn.execute("SELECT COUNT(*) AS n FROM site_stats_guests").fetchone()["n"]
        stored_raw = conn.execute(
            "SELECT 1 FROM site_stats_guests WHERE guest_hash IN ('not-a-uuid', ?)",
            ("x" * 80,),
        ).fetchone()
    assert after["pageviews"] == before["pageviews"] + 2
    assert after["new_visitors"] == before["new_visitors"]
    assert after["returning_visitors"] == before["returning_visitors"]
    assert guests_after == guests_before
    assert stored_raw is None


def test_dnt_and_gpc_skip_recording_even_with_guest_id():
    init_db()
    gid = "33333333-3333-4333-8333-333333333333"
    with get_db() as conn:
        before_pv = conn.execute(
            "SELECT COALESCE(SUM(pageviews), 0) AS n FROM site_stats_days"
        ).fetchone()["n"]
        before_guests = conn.execute("SELECT COUNT(*) AS n FROM site_stats_guests").fetchone()["n"]
        before_events = conn.execute(
            "SELECT COALESCE(SUM(count), 0) AS n FROM site_funnel_events"
        ).fetchone()["n"]
    with TestClient(app) as client:
        res = client.post(f"/api/v1/stats/hit?e=demo_view&g={gid}", headers={"DNT": "1"})
        assert res.status_code == 204
        res = client.post(f"/api/v1/stats/hit?e=demo_aha&g={gid}", headers={"Sec-GPC": "1"})
        assert res.status_code == 204
    with get_db() as conn:
        after_pv = conn.execute(
            "SELECT COALESCE(SUM(pageviews), 0) AS n FROM site_stats_days"
        ).fetchone()["n"]
        after_guests = conn.execute("SELECT COUNT(*) AS n FROM site_stats_guests").fetchone()["n"]
        after_events = conn.execute(
            "SELECT COALESCE(SUM(count), 0) AS n FROM site_funnel_events"
        ).fetchone()["n"]
        stored = conn.execute(
            "SELECT 1 FROM site_stats_guests WHERE guest_hash = ?",
            (guest_hash(gid, settings.runnr_secret_key),),
        ).fetchone()
    assert after_pv == before_pv
    assert after_guests == before_guests
    assert after_events == before_events
    assert stored is None


def test_guest_id_still_records_funnel_events():
    init_db()
    gid = "44444444-4444-4444-8444-444444444444"
    with get_db() as conn:
        before = conn.execute(
            "SELECT COALESCE(SUM(count), 0) AS n FROM site_funnel_events WHERE event = 'demo_view'"
        ).fetchone()["n"]
    with TestClient(app) as client:
        res = client.post(f"/api/v1/stats/hit?e=demo_view&g={gid}")
        assert res.status_code == 204
        res = client.post(f"/api/v1/stats/hit?e=demo_view&g={gid}")
        assert res.status_code == 204
    with get_db() as conn:
        after = conn.execute(
            "SELECT COALESCE(SUM(count), 0) AS n FROM site_funnel_events WHERE event = 'demo_view'"
        ).fetchone()["n"]
    assert after == before + 2
    day = stats_mod.utc_day()
    counts = _day_counts(day)
    assert counts["new_visitors"] >= 1


def test_stats_payload_includes_new_and_returning(monkeypatch):
    init_db()
    gid = "55555555-5555-4555-8555-555555555555"
    monkeypatch.setattr(stats_mod, "utc_day", lambda now=None: "2026-05-02")
    record_hit("1.2.3.4", "ua", "secret", guest_id=gid)
    monkeypatch.setattr(stats_mod, "utc_day", lambda now=None: "2026-05-03")
    record_hit("1.2.3.9", "ua-other", "secret", guest_id=gid)
    monkeypatch.setattr(stats_mod, "utc_day", lambda now=None: "2026-05-03")
    with TestClient(app) as client:
        res = client.get(
            "/api/v1/stats",
            headers={"Authorization": f"Bearer {token_for('janis@thinicedigital.com')}"},
        )
    assert res.status_code == 200
    data = res.json()
    assert data["today"]["day"] == "2026-05-03"
    assert data["today"]["new_visitors"] == 0
    assert data["today"]["returning_visitors"] == 1
    may2 = next(row for row in data["days"] if row["day"] == "2026-05-02")
    assert may2["new_visitors"] == 1
    assert may2["returning_visitors"] == 0
    assert "identified browsers" in data["note"]
    assert "new_visitors" in data["days"][-1]


def test_old_guest_rows_prune_with_visitor_cleanup():
    init_db()
    stats_mod._last_visitor_cleanup = None
    with get_db() as conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO site_stats_guests (guest_hash, first_seen_day, last_seen_day)
            VALUES ('old-guest', '2000-01-01', '2000-01-02')
            """
        )
        conn.execute(
            """
            INSERT OR REPLACE INTO site_stats_guests (guest_hash, first_seen_day, last_seen_day)
            VALUES ('fresh-guest', '2099-01-01', '2099-01-02')
            """
        )
    record_hit("6.6.6.6", "ua", "secret")
    with get_db() as conn:
        old = conn.execute(
            "SELECT 1 FROM site_stats_guests WHERE guest_hash = 'old-guest'"
        ).fetchone()
        fresh = conn.execute(
            "SELECT 1 FROM site_stats_guests WHERE guest_hash = 'fresh-guest'"
        ).fetchone()
    assert old is None
    assert fresh is not None


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


def test_hit_records_allowlisted_funnel_event():
    init_db()
    with get_db() as conn:
        before_pv = conn.execute(
            "SELECT COALESCE(SUM(pageviews), 0) AS n FROM site_stats_days"
        ).fetchone()["n"]
        before_ev = conn.execute(
            "SELECT COALESCE(SUM(count), 0) AS n FROM site_funnel_events WHERE event = 'demo_view'"
        ).fetchone()["n"]
    with TestClient(app) as client:
        res = client.post("/api/v1/stats/hit?e=demo_view")
        assert res.status_code == 204
    with get_db() as conn:
        after_pv = conn.execute(
            "SELECT COALESCE(SUM(pageviews), 0) AS n FROM site_stats_days"
        ).fetchone()["n"]
        after_ev = conn.execute(
            "SELECT COALESCE(SUM(count), 0) AS n FROM site_funnel_events WHERE event = 'demo_view'"
        ).fetchone()["n"]
    assert after_pv == before_pv + 1
    assert after_ev == before_ev + 1


def test_hit_ignores_unknown_event_but_counts_pageview():
    init_db()
    with get_db() as conn:
        before_pv = conn.execute(
            "SELECT COALESCE(SUM(pageviews), 0) AS n FROM site_stats_days"
        ).fetchone()["n"]
        before_rows = conn.execute(
            "SELECT COALESCE(SUM(count), 0) AS n FROM site_funnel_events"
        ).fetchone()["n"]
    with TestClient(app) as client:
        res = client.post("/api/v1/stats/hit?e=not_a_real_event")
        assert res.status_code == 204
        res = client.post("/api/v1/stats/hit?e=" + ("x" * 200))
        assert res.status_code == 204
    with get_db() as conn:
        after_pv = conn.execute(
            "SELECT COALESCE(SUM(pageviews), 0) AS n FROM site_stats_days"
        ).fetchone()["n"]
        after_rows = conn.execute(
            "SELECT COALESCE(SUM(count), 0) AS n FROM site_funnel_events"
        ).fetchone()["n"]
        bad = conn.execute(
            "SELECT 1 FROM site_funnel_events WHERE event = 'not_a_real_event'"
        ).fetchone()
    assert after_pv == before_pv + 2
    assert after_rows == before_rows
    assert bad is None



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
    assert "/sign-in?next=/stats.html" in html
    assert "runnr_api_token" in html
    assert "Bearer" in html
    assert "/api/v1/admin/funnel" in html
    assert "Signed-in funnel" in html
    assert "Guest SAMPLE funnel" in html
    assert "email_wall" in html
    assert "email_wall oauth" in html
    assert "email_wall_converted" in html
    assert "demo_ig_land" in html
    assert "Instagram A/B" in html
    assert 'id="ig-ab"' in html
    assert 'id="ig-ad-url"' in html
    assert "ig=1" in html
    assert "Signed-in accounts (not visits)" in html
    assert "never sign in" in html
    assert 'id="today-new"' in html
    assert 'id="today-returning"' in html
    assert "identified browsers" in html
    assert ">New<" in html
    assert ">Returning<" in html


def test_funnel_requires_auth():
    with TestClient(app) as client:
        res = client.get("/api/v1/admin/funnel")
        assert res.status_code == 401
        res = client.get("/api/v1/stats/funnel")
        assert res.status_code == 401


def test_funnel_forbidden_for_other_signed_in_users():
    with TestClient(app) as client:
        res = client.get(
            "/api/v1/admin/funnel",
            headers={"Authorization": f"Bearer {token_for('someone@example.com')}"},
        )
        assert res.status_code == 403


def test_funnel_counts_signed_in_journals():
    import json

    init_db()
    with get_db() as conn:
        cur = conn.execute(
            """
            INSERT INTO users (email, password_hash, email_verified, plan, subscription_status, trial_ends_at)
            VALUES (?, ?, 1, 'free', 'free', ?)
            """,
            ("funnel.trader@example.com", hash_password("test-pass-12"), "2099-12-31T00:00:00Z"),
        )
        uid = cur.lastrowid
        conn.execute(
            """
            INSERT INTO user_state (user_id, state_json, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
            """,
            (
                uid,
                json.dumps(
                    {
                        "trades": [
                            {"id": 1, "isDemo": True, "instr": "RACE"},
                            {"id": 10, "instr": "AAPL", "source": "t212"},
                            {"id": 11, "instr": "MSFT", "source": "csv"},
                            {"id": 12, "instr": "NVDA"},
                            {"id": 13, "source": "t212", "mergedAway": True},
                        ]
                    }
                ),
            ),
        )
        conn.execute(
            """
            INSERT INTO users (email, password_hash, email_verified, plan, subscription_status, trial_ends_at)
            VALUES (?, ?, 1, 'free', 'free', ?)
            """,
            ("funnel.empty@example.com", hash_password("test-pass-12"), "2000-01-01T00:00:00Z"),
        )
        conn.execute(
            """
            INSERT INTO users (email, password_hash, email_verified, plan, subscription_status, trial_ends_at)
            VALUES (?, ?, 1, 'monthly', 'active', ?)
            """,
            ("funnel.pro@example.com", hash_password("test-pass-12"), "2000-01-01T00:00:00Z"),
        )

    with TestClient(app) as client:
        res = client.get(
            "/api/v1/admin/funnel",
            headers={"Authorization": f"Bearer {token_for('janis@thinicedigital.com')}"},
        )
        assert res.status_code == 200, res.text
        data = res.json()
        assert data["users_total"] >= 3
        assert data["users_with_state"] >= 1
        assert data["users_with_trades_ge_1"] >= 1
        assert data["users_with_trades_ge_3"] >= 1
        assert data["users_with_trades_ge_10"] >= 0
        assert data["users_pro"] >= 1
        assert data["users_in_local_trial"] >= 1
        assert data["users_trial_expired"] >= 1
        assert "never sign in" in data["note"]
        assert "guest events are SAMPLE beacons" in data["note"]
        assert "guest_events_today" in data
        assert "guest_events_totals" in data
        assert "users_created_today" in data
        assert "demo_view" in data["guest_events_today"]
        assert "demo_ig_land" in data["guest_events_today"]
        assert data["ig_ab"]["start"] == "2026-09-24"
        assert set(data["ig_ab"]["variants"]) == {"prefill", "empty"}
        assert "demo_ig_land" in data["ig_ab"]["today"]["prefill"]
        assert "users_created" in data["ig_ab"]["since"]["empty"]
        assert "email_wall_shown" in data["guest_events_today"]
        assert "email_wall_locked" in data["guest_events_today"]
        assert "email_wall_oauth_start" in data["guest_events_today"]
        assert "email_wall_converted" in data["guest_events_today"]
        assert isinstance(data["users_created_today"], int)
        assert "0" in data["trade_count_histogram"]
        assert res.headers.get("cache-control") == "no-store"

        alias = client.get(
            "/api/v1/stats/funnel",
            headers={"Authorization": f"Bearer {token_for('berzins.j@inbox.lv')}"},
        )
        assert alias.status_code == 200
        assert alias.json()["users_total"] == data["users_total"]


def test_public_legal_and_login_footers_omit_stats():
    for rel in ("login.html", "sign-in/index.html", "privacy/index.html", "terms/index.html", "refund/index.html"):
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
    assert "/admin/funnel" in stats_py
    login = (ROOT / "sign-in/index.html").read_text(encoding="utf-8")
    assert "safeNextPath" in login
    assert 'get("next")' in login


PERSONAL_EMAILS = (
    "janis@thinicedigital.com",
    "berzins.j@inbox.lv",
    "janis.berzins.liepins@gmail.com",
)


def test_public_js_omits_personal_house_emails():
    for rel in ("js/sync.js", "sign-in/index.html", "login.html", "js/desk.js"):
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
    html = (ROOT / "sign-in/index.html").read_text(encoding="utf-8")
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


def _variant_total(event: str, variant: str) -> int:
    with get_db() as conn:
        row = conn.execute(
            """
            SELECT COALESCE(SUM(count), 0) AS n
            FROM site_funnel_variants
            WHERE event = ? AND variant = ?
            """,
            (event, variant),
        ).fetchone()
    return int(row["n"] or 0)


def _event_total(event: str) -> int:
    with get_db() as conn:
        row = conn.execute(
            "SELECT COALESCE(SUM(count), 0) AS n FROM site_funnel_events WHERE event = ?",
            (event,),
        ).fetchone()
    return int(row["n"] or 0)


def test_ig_variant_hit_splits_without_changing_combined_totals():
    init_db()
    before_land = _event_total("demo_ig_land")
    before_prefill = _variant_total("demo_ig_land", "prefill")
    before_empty = _variant_total("demo_ig_land", "empty")
    before_score = _variant_total("demo_score_trade", "empty")
    with TestClient(app) as client:
        assert client.post("/api/v1/stats/hit?e=demo_ig_land&v=prefill").status_code == 204
        assert client.post("/api/v1/stats/hit?e=demo_ig_land&v=empty").status_code == 204
        assert client.post("/api/v1/stats/hit?e=demo_ig_land&v=nope").status_code == 204
        assert client.post("/api/v1/stats/hit?e=demo_score_trade&v=empty").status_code == 204
        assert client.post("/api/v1/stats/hit?e=demo_view&v=prefill").status_code == 204
        res = client.get(
            "/api/v1/admin/funnel",
            headers={"Authorization": f"Bearer {token_for('janis@thinicedigital.com')}"},
        )
    assert res.status_code == 200, res.text
    data = res.json()
    assert _event_total("demo_ig_land") == before_land + 3
    assert _variant_total("demo_ig_land", "prefill") == before_prefill + 1
    assert _variant_total("demo_ig_land", "empty") == before_empty + 1
    assert _variant_total("demo_score_trade", "empty") == before_score + 1
    assert data["ig_ab"]["today"]["prefill"]["demo_ig_land"] >= before_prefill + 1
    assert data["ig_ab"]["today"]["empty"]["demo_score_trade"] >= before_score + 1
    assert data["ig_ab"]["since"]["empty"]["demo_ig_land"] >= data["ig_ab"]["today"]["empty"]["demo_ig_land"]
    assert "demo_view" not in data["ig_ab"]["events"] or data["ig_ab"]["today"]["prefill"].get("demo_view", 0) == 0


def test_register_attributes_new_ig_account(monkeypatch):
    from uuid import uuid4

    init_db()
    monkeypatch.setattr("app.routers.auth.email_configured", lambda: True)
    monkeypatch.setattr("app.routers.auth.send_verify_email", lambda to, url: False)
    email = f"ig-empty-{uuid4().hex[:10]}@example.com"
    other = f"ig-none-{uuid4().hex[:10]}@example.com"
    before = _variant_total("users_created", "empty")
    before_prefill = _variant_total("users_created", "prefill")
    before_events = _event_total("demo_ig_land")
    with TestClient(app) as client:
        created = client.post(
            "/api/v1/auth/register",
            json={"email": email, "password": "test-pass-12", "ig_variant": "empty"},
        )
        assert created.status_code == 200, created.text
        again = client.post(
            "/api/v1/auth/register",
            json={"email": email, "password": "test-pass-12", "ig_variant": "prefill"},
        )
        assert again.status_code == 200, again.text
        ignored = client.post(
            "/api/v1/auth/register",
            json={"email": other, "password": "test-pass-12", "ig_variant": "nope"},
        )
        assert ignored.status_code == 200, ignored.text
    assert _variant_total("users_created", "empty") == before + 1
    assert _variant_total("users_created", "prefill") == before_prefill
    assert _event_total("demo_ig_land") == before_events
    with get_db() as conn:
        row = conn.execute("SELECT ig_variant FROM users WHERE email = ?", (email,)).fetchone()
        plain = conn.execute("SELECT ig_variant FROM users WHERE email = ?", (other,)).fetchone()
    assert row["ig_variant"] == "empty"
    assert plain["ig_variant"] in (None, "")


def _wall_total(event: str, wall: str) -> int:
    with get_db() as conn:
        row = conn.execute(
            """
            SELECT COALESCE(SUM(count), 0) AS n
            FROM site_funnel_walls
            WHERE event = ? AND wall = ?
            """,
            (event, wall),
        ).fetchone()
    return int(row["n"] or 0)


def test_wall_version_hit_is_tagged_without_changing_ig_totals():
    init_db()
    before_shown = _event_total("email_wall_shown")
    before_lite = _wall_total("email_wall_shown", "lite")
    before_locked = _wall_total("email_wall_locked", "lite")
    before_full = _wall_total("email_wall_oauth_start", "full")
    before_converted_lite = _wall_total("email_wall_converted", "lite")
    before_converted_full = _wall_total("email_wall_converted", "full")
    before_view_wall = _wall_total("demo_view", "lite")
    before_empty = _variant_total("email_wall_shown", "empty")
    before_view = _event_total("demo_view")
    with TestClient(app) as client:
        assert client.post("/api/v1/stats/hit?e=email_wall_shown&v=empty&w=lite").status_code == 204
        assert client.post("/api/v1/stats/hit?e=email_wall_locked&w=lite").status_code == 204
        assert client.post("/api/v1/stats/hit?e=email_wall_oauth_start&w=full").status_code == 204
        assert client.post("/api/v1/stats/hit?e=email_wall_converted&w=nope").status_code == 204
        assert client.post("/api/v1/stats/hit?e=demo_view&w=lite").status_code == 204
        res = client.get(
            "/api/v1/admin/funnel",
            headers={"Authorization": f"Bearer {token_for('janis@thinicedigital.com')}"},
        )
    assert res.status_code == 200, res.text
    data = res.json()
    assert _event_total("email_wall_shown") == before_shown + 1
    assert _event_total("demo_view") == before_view + 1
    assert _wall_total("email_wall_shown", "lite") == before_lite + 1
    assert _wall_total("email_wall_locked", "lite") == before_locked + 1
    assert _wall_total("email_wall_oauth_start", "full") == before_full + 1
    assert _wall_total("email_wall_converted", "lite") == before_converted_lite
    assert _wall_total("email_wall_converted", "full") == before_converted_full
    assert _wall_total("demo_view", "lite") == before_view_wall
    assert _variant_total("email_wall_shown", "empty") == before_empty + 1
    assert data["ig_ab"]["today"]["empty"]["email_wall_shown"] >= before_empty + 1
    assert data["wall"]["today"]["lite"]["email_wall_shown"] >= before_lite + 1
    assert data["wall"]["today"]["full"]["email_wall_oauth_start"] >= before_full + 1
    assert "demo_view" not in data["wall"]["events"]

