"""OAuth callback linking — same email stays one Runnr user."""

from fastapi.testclient import TestClient

from app.auth import create_access_token, verify_password
from app.db import get_db
from app.main import app
from app.oauth import OAUTH_PASSWORD_SENTINEL, is_oauth_sentinel, upsert_oauth_user


def _insert_user(email: str, password: str = "hunter22", first_name: str = "Pat"):
    from app.auth import hash_password
    from app.db import init_db

    init_db()
    with get_db() as conn:
        cur = conn.execute(
            "INSERT INTO users (email, password_hash, email_verified, first_name) VALUES (?, ?, 1, ?)",
            (email, hash_password(password), first_name),
        )
        return cur.lastrowid


def _user_by_email(email: str):
    with get_db() as conn:
        return conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()


def _identities(user_id: int):
    with get_db() as conn:
        return conn.execute(
            "SELECT provider, provider_sub, email FROM oauth_identities WHERE user_id = ?",
            (user_id,),
        ).fetchall()


def test_oauth_links_to_existing_password_user():
    with TestClient(app) as client:
        uid = _insert_user("link.me@example.com", "hunter22", "Pat")

        linked = upsert_oauth_user(
            provider="google",
            provider_sub="google-sub-link-1",
            email="link.me@example.com",
            first_name="Patricia",
            avatar_url="https://example.com/a.png",
        )
        assert linked["id"] == uid
        assert linked["email"] == "link.me@example.com"

        row = _user_by_email("link.me@example.com")
        assert row["first_name"] == "Pat"
        assert not is_oauth_sentinel(row["password_hash"])
        assert verify_password("hunter22", row["password_hash"])

        login = client.post(
            "/api/v1/auth/login",
            json={"email": "link.me@example.com", "password": "hunter22"},
        )
        assert login.status_code == 200
        assert login.json()["email"] == "link.me@example.com"

        idents = _identities(uid)
        assert len(idents) == 1
        assert idents[0]["provider"] == "google"
        assert idents[0]["provider_sub"] == "google-sub-link-1"


def test_oauth_same_sub_reuses_user():
    with TestClient(app):
        first = upsert_oauth_user(
            provider="google",
            provider_sub="google-sub-repeat",
            email="newbie@example.com",
            first_name="Sam",
        )
        again = upsert_oauth_user(
            provider="google",
            provider_sub="google-sub-repeat",
            email="newbie@example.com",
        )
        assert first["id"] == again["id"]
        row = _user_by_email("newbie@example.com")
        assert is_oauth_sentinel(row["password_hash"])
        assert row["first_name"] == "Sam"
        assert len(_identities(first["id"])) == 1


def test_apple_and_google_same_email_share_one_user():
    with TestClient(app):
        g = upsert_oauth_user(
            provider="google",
            provider_sub="g-dual",
            email="dual@example.com",
        )
        a = upsert_oauth_user(
            provider="apple",
            provider_sub="a-dual",
            email="dual@example.com",
        )
        assert g["id"] == a["id"]
        providers = {row["provider"] for row in _identities(g["id"])}
        assert providers == {"google", "apple"}


def test_oauth_only_user_can_set_password_via_register():
    with TestClient(app) as client:
        created = upsert_oauth_user(
            provider="google",
            provider_sub="g-set-pass",
            email="setpass@example.com",
        )
        res = client.post(
            "/api/v1/auth/register",
            json={"email": "setpass@example.com", "password": "newpass99"},
        )
        assert res.status_code == 200
        login = client.post(
            "/api/v1/auth/login",
            json={"email": "setpass@example.com", "password": "newpass99"},
        )
        assert login.status_code == 200
        row = _user_by_email("setpass@example.com")
        assert row["id"] == created["id"]
        assert verify_password("newpass99", row["password_hash"])


def test_google_callback_links_existing_email(monkeypatch):
    with TestClient(app) as client:
        uid = _insert_user("cb@example.com", "cbpass123")

        from app.oauth import encode_oauth_state

        monkeypatch.setattr(
            "app.routers.auth.exchange_google_code",
            lambda code: {
                "provider": "google",
                "provider_sub": "cb-google-sub",
                "email": "cb@example.com",
                "email_verified": True,
                "first_name": "Cb",
                "avatar_url": None,
            },
        )
        state = encode_oauth_state("google", "/")
        res = client.get(
            "/api/v1/auth/oauth/google/callback",
            params={"code": "fake-code", "state": state},
            follow_redirects=False,
        )
        assert res.status_code == 302
        loc = res.headers["location"]
        assert "oauth=" in loc
        assert "runnr.fyi" in loc
        assert _identities(uid)[0]["provider_sub"] == "cb-google-sub"

        code = loc.split("oauth=")[1].split("&")[0]
        exchanged = client.post("/api/v1/auth/oauth/exchange", json={"code": code})
        assert exchanged.status_code == 200
        assert exchanged.json()["email"] == "cb@example.com"

        again = client.post("/api/v1/auth/oauth/exchange", json={"code": code})
        assert again.status_code == 400


def test_apple_callback_scaffolded(monkeypatch):
    with TestClient(app) as client:
        from app.oauth import encode_oauth_state

        monkeypatch.setattr(
            "app.routers.auth.exchange_apple_code",
            lambda code, id_token="", user_json="": {
                "provider": "apple",
                "provider_sub": "apple-sub-1",
                "email": "apple.user@example.com",
                "email_verified": True,
                "first_name": "Alex",
                "avatar_url": None,
            },
        )
        state = encode_oauth_state("apple", "/?signedin=1")
        res = client.post(
            "/api/v1/auth/oauth/apple/callback",
            data={"code": "apple-code", "state": state, "id_token": "x", "user": ""},
            follow_redirects=False,
        )
        assert res.status_code == 302
        row = _user_by_email("apple.user@example.com")
        assert row is not None
        assert row["password_hash"] == OAUTH_PASSWORD_SENTINEL


def test_oauth_start_without_secrets_explains_setup():
    with TestClient(app) as client:
        g = client.get("/api/v1/auth/oauth/google/start", follow_redirects=False)
        assert g.status_code == 503
        assert "GOOGLE_OAUTH_CLIENT_ID" in g.text
        a = client.get("/api/v1/auth/oauth/apple/start", follow_redirects=False)
        assert a.status_code == 503
        assert "Apple Developer" in a.text
        status = client.get("/api/v1/auth/oauth/providers")
        assert status.status_code == 200
        assert status.json() == {"google": False, "apple": False}


def test_intro_seen_persists_on_user():
    with TestClient(app) as client:
        uid = _insert_user("intro@example.com", "intropass1")
        token = create_access_token(uid, "intro@example.com")
        headers = {"Authorization": f"Bearer {token}"}
        me = client.get("/api/v1/auth/me", headers=headers)
        assert me.status_code == 200
        assert me.json()["intro_seen"] is False
        assert me.json().get("created_at")
        patched = client.patch("/api/v1/auth/me", json={"intro_seen": True}, headers=headers)
        assert patched.status_code == 200
        assert patched.json()["intro_seen"] is True
        me2 = client.get("/api/v1/auth/me", headers=headers)
        assert me2.json()["intro_seen"] is True


def test_sentinel_password_never_verifies():
    assert is_oauth_sentinel(OAUTH_PASSWORD_SENTINEL)
    assert is_oauth_sentinel("")
    assert not verify_password("anything1", OAUTH_PASSWORD_SENTINEL)
