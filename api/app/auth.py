from datetime import datetime, timedelta, timezone

import bcrypt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from app.billing_util import subscription_is_pro
from app.config import settings
from app.db import get_db

bearer = HTTPBearer(auto_error=False)

ALGORITHM = "HS256"
ACCESS_TOKEN_HOURS = 24 * 365


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
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
    return {
        "id": row["id"],
        "email": row["email"],
        "subscription_status": status,
        "plan": plan,
        "pro": subscription_is_pro(status, plan),
        "billing_enabled": settings.stripe_enabled,
        "stripe_customer_id": row["stripe_customer_id"] if "stripe_customer_id" in row.keys() else None,
        "email_verified": verified,
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
