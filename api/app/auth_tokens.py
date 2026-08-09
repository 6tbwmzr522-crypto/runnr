"""Auth token helpers — email verify + password reset."""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from app.db import get_db


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def issue_token(user_id: int, purpose: str, hours: float = 24) -> str:
    raw = secrets.token_urlsafe(32)
    exp = (datetime.now(timezone.utc) + timedelta(hours=hours)).isoformat()
    with get_db() as conn:
        conn.execute("DELETE FROM auth_tokens WHERE user_id = ? AND purpose = ?", (user_id, purpose))
        conn.execute(
            """
            INSERT INTO auth_tokens (user_id, purpose, token_hash, expires_at)
            VALUES (?, ?, ?, ?)
            """,
            (user_id, purpose, _hash(raw), exp),
        )
    return raw


def consume_token(raw: str, purpose: str) -> int | None:
    """Return user_id if token valid; consume it."""
    if not raw:
        return None
    now = datetime.now(timezone.utc).isoformat()
    with get_db() as conn:
        row = conn.execute(
            """
            SELECT id, user_id, expires_at FROM auth_tokens
            WHERE token_hash = ? AND purpose = ?
            """,
            (_hash(raw), purpose),
        ).fetchone()
        if not row:
            return None
        if str(row["expires_at"]) < now:
            conn.execute("DELETE FROM auth_tokens WHERE id = ?", (row["id"],))
            return None
        conn.execute("DELETE FROM auth_tokens WHERE id = ?", (row["id"],))
        return int(row["user_id"])
