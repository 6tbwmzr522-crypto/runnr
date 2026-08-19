import os
import sqlite3
from contextlib import contextmanager

from app.config import settings


def _resolve_database_path() -> str:
    candidates = [
        os.environ.get("DATABASE_PATH"),
        "/data/runnr.db",
        "/tmp/runnr.db",
    ]
    for path in candidates:
        if not path:
            continue
        parent = os.path.dirname(path)
        try:
            if parent:
                os.makedirs(parent, exist_ok=True)
            return path
        except OSError:
            continue
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
    conn.execute("PRAGMA busy_timeout=5000")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()
