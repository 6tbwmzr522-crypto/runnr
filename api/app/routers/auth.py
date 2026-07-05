from fastapi import APIRouter, Depends, HTTPException

from app.auth import create_access_token, get_current_user, hash_password, verify_password
from app.db import get_db
from app.models.auth import LoginRequest, MeResponse, RegisterRequest, ResetPasswordRequest, TokenResponse

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse)
def register(body: RegisterRequest):
    email = body.email.lower()
    with get_db() as conn:
        existing = conn.execute(
            "SELECT id, email, password_hash FROM users WHERE email = ?",
            (email,),
        ).fetchone()
        if existing:
            if verify_password(body.password, existing["password_hash"]):
                token = create_access_token(existing["id"], existing["email"])
                return TokenResponse(access_token=token, email=existing["email"])
            raise HTTPException(status_code=400, detail="Wrong password for this email")
        cur = conn.execute(
            "INSERT INTO users (email, password_hash) VALUES (?, ?)",
            (email, hash_password(body.password)),
        )
        user_id = cur.lastrowid
    token = create_access_token(user_id, email)
    return TokenResponse(access_token=token, email=email)


@router.get("/me", response_model=MeResponse)
def me(user: dict = Depends(get_current_user)):
    return MeResponse(id=user["id"], email=user["email"])


@router.post("/reset-password", response_model=TokenResponse)
def reset_password(body: ResetPasswordRequest):
    email = body.email.lower()
    with get_db() as conn:
        row = conn.execute("SELECT id, email FROM users WHERE email = ?", (email,)).fetchone()
        if not row:
            raise HTTPException(
                status_code=404,
                detail="No account with this email — tap Continue to create one",
            )
        conn.execute(
            "UPDATE users SET password_hash = ? WHERE id = ?",
            (hash_password(body.new_password), row["id"]),
        )
    token = create_access_token(row["id"], row["email"])
    return TokenResponse(access_token=token, email=row["email"])


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
