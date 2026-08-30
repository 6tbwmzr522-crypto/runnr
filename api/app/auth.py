from datetime import datetime, timedelta, timezone

import sqlite3

import bcrypt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from app.billing_util import email_is_boss, subscription_is_pro
from app.config import settings
from app.db import get_db

bearer = HTTPBearer(auto_error=False)

ALGORITHM = "HS256"
ACCESS_TOKEN_HOURS = 24 * 365


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    if not password_hash or str(password_hash).startswith("oauth:"):
        return False
    return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))


def create_access_token(user_id: int, email: str) -> str:
    payload = {
        "sub": str(user_id),
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(hours=ACCESS_TOKEN_HOURS),
    }
    return jwt.encode(payload, settings.runnr_secret_key, algorithm=ALGORITHM)


def _user_from_row(row) -> dict:
    status = row["subscription_status"] if "subscription_status" in row.keys() else "free"
    plan = row["plan"] if "plan" in row.keys() else "free"
    status = status or "free"
    plan = plan or "free"
    verified = True
    if "email_verified" in row.keys():
        verified = bool(row["email_verified"])
    email = row["email"]
    boss = email_is_boss(email)
    first_name = None
    if "first_name" in row.keys():
        first_name = row["first_name"] or None
    created_at = None
    if "created_at" in row.keys():
        created_at = row["created_at"] or None
    intro_seen = False
    if "intro_seen" in row.keys():
        intro_seen = bool(row["intro_seen"])
    avatar_url = None
    if "avatar_url" in row.keys():
        avatar_url = row["avatar_url"] or None
    return {
        "id": row["id"],
        "email": email,
        "subscription_status": "active" if boss else status,
        "plan": "boss" if boss else plan,
        "pro": subscription_is_pro(status, plan, email),
        "billing_enabled": settings.stripe_enabled,
        "stripe_customer_id": row["stripe_customer_id"] if "stripe_customer_id" in row.keys() else None,
        "email_verified": True if boss else verified,
        "first_name": first_name,
        "created_at": created_at,
        "intro_seen": intro_seen,
        "avatar_url": avatar_url,
    }


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> dict:
    if not creds or not creds.credentials:
        raise HTTPException(status_code=401, detail="Missing bearer token")
    try:
        payload = jwt.decode(creds.credentials, settings.runnr_secret_key, algorithms=[ALGORITHM])
        user_id = int(payload["sub"])
    except (JWTError, ValueError, KeyError):
        raise HTTPException(status_code=401, detail="Invalid token") from None

    with get_db() as conn:
        try:
            row = conn.execute(
                """
                SELECT id, email, stripe_customer_id, subscription_status, plan, email_verified, first_name,
                       created_at, intro_seen, avatar_url
                FROM users WHERE id = ?
                """,
                (user_id,),
            ).fetchone()
        except sqlite3.OperationalError:
            row = conn.execute(
                """
                SELECT id, email, stripe_customer_id, subscription_status, plan, email_verified
                FROM users WHERE id = ?
                """,
                (user_id,),
            ).fetchone()
    if not row:
        raise HTTPException(
            status_code=401,
            detail="Session expired — sign in again with the same email",
        )
    return _user_from_row(row)


def get_optional_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> dict | None:
    """Bearer user when present; None when anonymous (public quote fallbacks)."""
    if not creds or not creds.credentials:
        return None
    try:
        return get_current_user(creds)
    except HTTPException:
        return None
