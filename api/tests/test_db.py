from app.db import SQLITE_BUSY_TIMEOUT_MS, get_db, init_db


def test_busy_timeout_is_raised():
    init_db()
    with get_db() as conn:
        row = conn.execute("PRAGMA busy_timeout").fetchone()
        assert int(row[0]) >= 15_000
        assert int(row[0]) == SQLITE_BUSY_TIMEOUT_MS


def test_wal_mode_persists_without_pragma_on_every_connect():
    init_db()
    with get_db() as conn:
        mode = conn.execute("PRAGMA journal_mode").fetchone()[0]
        assert str(mode).lower() == "wal"


def test_read_path_does_not_commit():
    init_db()
    traced: list[str] = []
    with get_db() as conn:
        conn.set_trace_callback(traced.append)
        conn.execute("SELECT 1").fetchone()
        conn.execute("SELECT v FROM runnr_meta WHERE k = 'db_created_at'").fetchone()
    assert not any("COMMIT" in (s or "").upper() for s in traced)


def test_write_path_commits():
    init_db()
    traced: list[str] = []
    with get_db() as conn:
        conn.set_trace_callback(traced.append)
        conn.execute(
            "INSERT OR REPLACE INTO runnr_meta (k, v) VALUES (?, ?)",
            ("commit_probe", "1"),
        )
    assert any("COMMIT" in (s or "").upper() for s in traced)
