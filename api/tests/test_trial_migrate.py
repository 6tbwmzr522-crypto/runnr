"""Existing accounts get a fresh 7-day trial window on first migrate."""

from app.auth import hash_password
from app.db import _migrate_local_trial, get_db, init_db
from app.trial import LOCAL_TRIAL_BACKFILL_KEY, parse_utc, utc_now


def test_backfill_gives_current_users_a_fresh_window():
    init_db()
    with get_db() as conn:
        conn.execute("DELETE FROM runnr_meta WHERE k = ?", (LOCAL_TRIAL_BACKFILL_KEY,))
        conn.execute(
            """
            INSERT INTO users (email, password_hash, email_verified, trial_ends_at)
            VALUES (?, ?, 1, NULL)
            """,
            ("legacy.trial@example.com", hash_password("test-pass-12")),
        )
        _migrate_local_trial(conn)
        row = conn.execute(
            "SELECT trial_ends_at FROM users WHERE email = ?",
            ("legacy.trial@example.com",),
        ).fetchone()
        meta = conn.execute(
            "SELECT v FROM runnr_meta WHERE k = ?",
            (LOCAL_TRIAL_BACKFILL_KEY,),
        ).fetchone()
    ends = parse_utc(row["trial_ends_at"])
    assert ends is not None
    assert ends > utc_now()
    assert meta is not None

    with get_db() as conn:
        conn.execute(
            "UPDATE users SET trial_ends_at = NULL WHERE email = ?",
            ("legacy.trial@example.com",),
        )
        _migrate_local_trial(conn)
        again = conn.execute(
            "SELECT trial_ends_at FROM users WHERE email = ?",
            ("legacy.trial@example.com",),
        ).fetchone()
    assert again["trial_ends_at"] in (None, "")
