from fastapi import APIRouter, HTTPException

from app.auth import create_access_token, hash_password, verify_password
from app.db import get_db
from app.models.auth import LoginRequest, RegisterRequest, TokenResponse

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse)
def register(body: RegisterRequest):
    with get_db() as conn:
        existing = conn.execute("SELECT id FROM users WHERE email = ?", (body.email.lower(),)).fetchone()
        if existing:
            raise HTTPException(status_code=400, detail="Email already registered")
        cur = conn.execute(
            "INSERT INTO users (email, password_hash) VALUES (?, ?)",
            (body.email.lower(), hash_password(body.password)),
        )
        user_id = cur.lastrowid
    token = create_access_token(user_id, body.email.lower())
    return TokenResponse(access_token=token, email=body.email.lower())


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest):
    with get_db() as conn:
        row = conn.execute(
            "SELECT id, email, password_hash FROM users WHERE email = ?",
            (body.email.lower(),),
        ).fetchone()
    if not row or not verify_password(body.password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token(row["id"], row["email"])
    return TokenResponse(access_token=token, email=row["email"])
