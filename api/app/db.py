import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone


def on_railway() -> bool:
    return bool(
        (os.environ.get("RAILWAY_ENVIRONMENT") or "").strip()
        or (os.environ.get("RAILWAY_PROJECT_ID") or "").strip()
    )


def volume_mount_path() -> str:
    return (os.environ.get("RAILWAY_VOLUME_MOUNT_PATH") or "").strip().rstrip("/")


def _is_mount(path: str) -> bool:
    target = (path or "").rstrip("/") or "/"
    if os.path.ismount(target):
        return True
    try:
        with open("/proc/self/mounts", encoding="utf-8") as fh:
            return any(line.split()[1] == target for line in fh if line.strip())
    except OSError:
        return False


def path_is_persistent(path: str) -> bool:
    """True when the sqlite file sits on a Railway volume (survives redeploys)."""
    vol = volume_mount_path()
    if vol and (path == vol or path.startswith(vol + "/")):
        return True
    if on_railway() and (path == "/data" or path.startswith("/data/")):
        return _is_mount("/data")
    return False


def _ensure_parent(path: str, *, allow_create: bool) -> None:
    parent = os.path.dirname(path)
    if not parent:
        return
    if os.path.isdir(parent):
        return
    if not allow_create:
        raise RuntimeError(
            "Runnr API on Railway needs a persistent Volume mounted at /data "
            "(service → Volumes → Add, mount path /data). Writing sqlite on the "
            "container disk resets visitor stats and accounts on every deploy."
        )
    os.makedirs(parent, exist_ok=True)


def _resolve_database_path() -> str:
    explicit = (os.environ.get("DATABASE_PATH") or "").strip()
    if explicit:
        _ensure_parent(explicit, allow_create=True)
        return explicit

    vol = volume_mount_path()
    if vol:
        path = os.path.join(vol, "runnr.db")
        _ensure_parent(path, allow_create=False)
        return path

    data_db = "/data/runnr.db"
    if os.path.isdir("/data") and (not on_railway() or _is_mount("/data")):
        return data_db

    if on_railway():
        raise RuntimeError(
            "Runnr API on Railway needs a persistent Volume mounted at /data "
            "(service → Volumes → Add, mount path /data). Without it, visitor "
            "stats reset to 0 on every deploy."
        )

    _ensure_parent("/tmp/runnr.db", allow_create=True)
    return "/tmp/runnr.db"


DB_PATH = _resolve_database_path()


def _migrate_checkout_tickets(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS checkout_tickets (
            code TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            interval TEXT NOT NULL,
            exp REAL NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_checkout_tickets_exp ON checkout_tickets(exp)")


def init_db() -> None:
    with get_db() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS broker_connections (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                broker TEXT NOT NULL,
                api_key_enc TEXT NOT NULL,
                api_secret_enc TEXT NOT NULL,
                paper INTEGER DEFAULT 1,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, broker),
                FOREIGN KEY(user_id) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS user_state (
                user_id INTEGER PRIMARY KEY,
                state_json TEXT NOT NULL,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(id)
            );
            """
        )
        _migrate_users_billing(conn)
        _migrate_auth_tokens(conn)
        _migrate_checkout_tickets(conn)
        _migrate_site_stats(conn)
        _migrate_meta(conn)


def _migrate_users_billing(conn: sqlite3.Connection) -> None:
    cols = {row[1] for row in conn.execute("PRAGMA table_info(users)").fetchall()}
    migrations = [
        ("stripe_customer_id", "TEXT"),
        ("subscription_status", "TEXT DEFAULT 'free'"),
        ("plan", "TEXT DEFAULT 'free'"),
        ("stripe_subscription_id", "TEXT"),
        ("email_verified", "INTEGER DEFAULT 1"),
        ("first_name", "TEXT"),
    ]
    for col, ddl in migrations:
        if col not in cols:
            conn.execute(f"ALTER TABLE users ADD COLUMN {col} {ddl}")
    # Existing accounts are grandfathered as verified
    if "email_verified" not in cols:
        conn.execute("UPDATE users SET email_verified = 1 WHERE email_verified IS NULL")


def _migrate_site_stats(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS site_stats_days (
            day TEXT PRIMARY KEY,
            pageviews INTEGER NOT NULL DEFAULT 0,
            uniques INTEGER NOT NULL DEFAULT 0
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS site_stats_visitors (
            day TEXT NOT NULL,
            visitor_hash TEXT NOT NULL,
            PRIMARY KEY (day, visitor_hash)
        )
        """
    )


def _migrate_meta(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS runnr_meta (
            k TEXT PRIMARY KEY,
            v TEXT NOT NULL
        )
        """
    )
    row = conn.execute("SELECT v FROM runnr_meta WHERE k = 'db_created_at'").fetchone()
    if not row:
        conn.execute(
            "INSERT INTO runnr_meta (k, v) VALUES ('db_created_at', ?)",
            (datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),),
        )


def db_created_at() -> str | None:
    try:
        with get_db() as conn:
            row = conn.execute("SELECT v FROM runnr_meta WHERE k = 'db_created_at'").fetchone()
        return str(row["v"]) if row else None
    except sqlite3.Error:
        return None


def stats_day_count() -> int:
    try:
        with get_db() as conn:
            row = conn.execute("SELECT COUNT(*) AS n FROM site_stats_days").fetchone()
        return int(row["n"] if row else 0)
    except sqlite3.Error:
        return 0


def _migrate_auth_tokens(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS auth_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            purpose TEXT NOT NULL,
            token_hash TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_auth_tokens_hash ON auth_tokens(token_hash, purpose)"
    )


@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH, timeout=5)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA busy_timeout=5000")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def checkpoint_db() -> None:
    """Flush WAL into runnr.db so a SIGTERM deploy does not drop recent hits."""
    try:
        conn = sqlite3.connect(DB_PATH, timeout=5)
        try:
            conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
            conn.commit()
        finally:
            conn.close()
    except sqlite3.Error:
        pass
