import time

from fastapi.security import HTTPAuthorizationCredentials

from app.auth import (
    USER_CACHE_TTL_S,
    _load_user_row,
    create_access_token,
    get_current_user,
    hash_password,
    invalidate_user_cache,
)
from app.db import get_db, init_db


def _creds_for(email: str) -> tuple[HTTPAuthorizationCredentials, int]:
    email = email.strip().lower()
    init_db()
    with get_db() as conn:
        row = conn.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
        if row:
            uid = int(row["id"])
        else:
            cur = conn.execute(
                "INSERT INTO users (email, password_hash, email_verified) VALUES (?, ?, 1)",
                (email, hash_password("test-pass-12")),
            )
            uid = int(cur.lastrowid)
    token = create_access_token(uid, email)
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token), uid


def test_get_current_user_cache_skips_sqlite(monkeypatch):
    invalidate_user_cache()
    creds, uid = _creds_for("cache-user@example.com")
    loads = {"n": 0}
    original = _load_user_row

    def spy(user_id):
        loads["n"] += 1
        return original(user_id)

    monkeypatch.setattr("app.auth._load_user_row", spy)
    first = get_current_user(creds)
    second = get_current_user(creds)
    assert first["id"] == uid
    assert second["email"] == first["email"]
    assert loads["n"] == 1
    assert USER_CACHE_TTL_S <= 5


def test_get_current_user_cache_expires(monkeypatch):
    invalidate_user_cache()
    creds, _uid = _creds_for("cache-expire@example.com")
    loads = {"n": 0}
    original = _load_user_row

    def spy(user_id):
        loads["n"] += 1
        return original(user_id)

    monkeypatch.setattr("app.auth._load_user_row", spy)
    monkeypatch.setattr("app.auth.USER_CACHE_TTL_S", 0.05)
    get_current_user(creds)
    assert loads["n"] == 1
    time.sleep(0.08)
    get_current_user(creds)
    assert loads["n"] == 2


def test_invalidate_user_cache_forces_reload(monkeypatch):
    invalidate_user_cache()
    creds, uid = _creds_for("cache-inval@example.com")
    loads = {"n": 0}
    original = _load_user_row

    def spy(user_id):
        loads["n"] += 1
        return original(user_id)

    monkeypatch.setattr("app.auth._load_user_row", spy)
    get_current_user(creds)
    invalidate_user_cache(uid)
    get_current_user(creds)
    assert loads["n"] == 2
