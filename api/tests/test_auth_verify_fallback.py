"""Confirm-email fallback when Resend is configured but outbound send fails."""

from urllib.parse import parse_qs, urlparse
from uuid import uuid4

from fastapi.testclient import TestClient

from app.auth import create_access_token, hash_password
from app.db import get_db
from app.main import app


def _email() -> str:
    return f"tester-{uuid4().hex[:12]}@example.com"


def _insert_user(email: str, *, verified: bool) -> int:
    with get_db() as conn:
        cur = conn.execute(
            "INSERT INTO users (email, password_hash, email_verified) VALUES (?, ?, ?)",
            (email, hash_password("test-pass-12"), 1 if verified else 0),
        )
        return int(cur.lastrowid)


def _auth_header(user_id: int, email: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user_id, email)}"}


def _patch_mail(monkeypatch, *, configured: bool, sent: bool):
    monkeypatch.setattr("app.routers.auth.email_configured", lambda: configured)
    monkeypatch.setattr("app.routers.auth.send_verify_email", lambda to, url: sent)


def _assert_fallback_url(url: str | None):
    assert url
    parsed = urlparse(url)
    assert parsed.scheme == "https"
    assert parsed.netloc == "runnr.fyi"
    token = (parse_qs(parsed.query).get("verify") or [""])[0]
    assert len(token) >= 10
    return token


def test_resend_verification_send_fail_returns_200_and_verify_url(monkeypatch):
    email = _email()
    uid = _insert_user(email, verified=False)
    _patch_mail(monkeypatch, configured=True, sent=False)

    with TestClient(app) as client:
        res = client.post(
            "/api/v1/auth/resend-verification",
            headers=_auth_header(uid, email),
            json={},
        )

    assert res.status_code == 200, res.text
    data = res.json()
    assert data["ok"] is True
    assert data["verification_sent"] is False
    assert data["email_configured"] is True
    _assert_fallback_url(data["verify_url"])


def test_resend_verification_send_ok_does_not_leak_verify_url(monkeypatch):
    email = _email()
    uid = _insert_user(email, verified=False)
    _patch_mail(monkeypatch, configured=True, sent=True)

    with TestClient(app) as client:
        res = client.post(
            "/api/v1/auth/resend-verification",
            headers=_auth_header(uid, email),
            json={},
        )

    assert res.status_code == 200, res.text
    data = res.json()
    assert data["verification_sent"] is True
    assert data["email_configured"] is True
    assert data.get("verify_url") is None


def test_register_send_fail_returns_200_and_verify_url(monkeypatch):
    email = _email()
    _patch_mail(monkeypatch, configured=True, sent=False)

    with TestClient(app) as client:
        res = client.post(
            "/api/v1/auth/register",
            json={"email": email, "password": "test-pass-12"},
        )

    assert res.status_code == 200, res.text
    data = res.json()
    assert data["email_verified"] is False
    assert data["verification_sent"] is False
    assert data["email_configured"] is True
    _assert_fallback_url(data["verify_url"])


def test_login_send_fail_returns_200_and_verify_url(monkeypatch):
    email = _email()
    _insert_user(email, verified=False)
    _patch_mail(monkeypatch, configured=True, sent=False)

    with TestClient(app) as client:
        res = client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": "test-pass-12"},
        )

    assert res.status_code == 200, res.text
    data = res.json()
    assert data["email_verified"] is False
    assert data["verification_sent"] is False
    assert data["email_configured"] is True
    _assert_fallback_url(data["verify_url"])


def test_failed_send_verify_url_confirms_account(monkeypatch):
    email = _email()
    uid = _insert_user(email, verified=False)
    _patch_mail(monkeypatch, configured=True, sent=False)

    with TestClient(app) as client:
        res = client.post(
            "/api/v1/auth/resend-verification",
            headers=_auth_header(uid, email),
            json={},
        )
        assert res.status_code == 200, res.text
        token = _assert_fallback_url(res.json()["verify_url"])

        verified = client.post("/api/v1/auth/verify-email", json={"token": token})
        assert verified.status_code == 200, verified.text

        me = client.get("/api/v1/auth/me", headers=_auth_header(uid, email))
        assert me.status_code == 200
        assert me.json()["email_verified"] is True
