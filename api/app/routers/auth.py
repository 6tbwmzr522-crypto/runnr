from fastapi import APIRouter, Depends, HTTPException

from app.auth import create_access_token, get_current_user, hash_password, verify_password
from app.auth_tokens import consume_token, issue_token
from app.config import settings
from app.db import get_db
from app.email_util import email_configured, send_reset_email, send_verify_email
from app.models.auth import (
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    LoginRequest,
    MeResponse,
    MessageResponse,
    RegisterRequest,
    ResetPasswordRequest,
    TokenResponse,
    VerifyEmailRequest,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def _app_url() -> str:
    return (settings.app_public_url or "https://runnr.fyi").rstrip("/")


def _verify_link(token: str) -> str:
    return f"{_app_url()}/?verify={token}"


def _reset_link(token: str) -> str:
    return f"{_app_url()}/?reset={token}"


def _issue_verification(user_id: int, email: str) -> tuple[bool, str | None]:
    raw = issue_token(user_id, "verify", hours=24)
    url = _verify_link(raw)
    sent = send_verify_email(email, url)
    # Expose link only when outbound email isn't configured (dev / bootstrap).
    return sent, (None if email_configured() else url)


@router.post("/register", response_model=TokenResponse)
def register(body: RegisterRequest):
    email = body.email.lower()
    with get_db() as conn:
        existing = conn.execute(
            "SELECT id, email, password_hash, email_verified FROM users WHERE email = ?",
            (email,),
        ).fetchone()
        if existing:
            if verify_password(body.password, existing["password_hash"]):
                token = create_access_token(existing["id"], existing["email"])
                verified = bool(existing["email_verified"]) if "email_verified" in existing.keys() else True
                return TokenResponse(
                    access_token=token,
                    email=existing["email"],
                    email_verified=verified,
                )
            raise HTTPException(status_code=400, detail="Wrong password for this email")
        verified = 0 if email_configured() else 1
        cur = conn.execute(
            "INSERT INTO users (email, password_hash, email_verified) VALUES (?, ?, ?)",
            (email, hash_password(body.password), verified),
        )
        user_id = cur.lastrowid

    if email_configured():
        sent, verify_url = _issue_verification(user_id, email)
        verified_flag = False
    else:
        sent, verify_url, verified_flag = False, None, True
    token = create_access_token(user_id, email)
    return TokenResponse(
        access_token=token,
        email=email,
        email_verified=verified_flag,
        verification_sent=sent,
        verify_url=verify_url,
    )


@router.get("/me", response_model=MeResponse)
def me(user: dict = Depends(get_current_user)):
    return MeResponse(
        id=user["id"],
        email=user["email"],
        pro=bool(user.get("pro")),
        plan=user.get("plan") or "free",
        subscription_status=user.get("subscription_status") or "free",
        billing_enabled=bool(user.get("billing_enabled")),
        email_verified=bool(user.get("email_verified", True)),
        email_configured=email_configured(),
    )


@router.post("/verify-email", response_model=MessageResponse)
def verify_email(body: VerifyEmailRequest):
    user_id = consume_token(body.token.strip(), "verify")
    if not user_id:
        raise HTTPException(status_code=400, detail="Invalid or expired verification link")
    with get_db() as conn:
        conn.execute("UPDATE users SET email_verified = 1 WHERE id = ?", (user_id,))
    return MessageResponse(ok=True, detail="Email verified — you're good to go")


@router.post("/resend-verification", response_model=MessageResponse)
def resend_verification(user: dict = Depends(get_current_user)):
    if user.get("email_verified"):
        return MessageResponse(ok=True, detail="Email already verified")
    sent, verify_url = _issue_verification(user["id"], user["email"])
    if sent:
        return MessageResponse(ok=True, detail="Verification email sent")
    return MessageResponse(
        ok=True,
        detail="Email provider not configured — use this link to verify",
        verify_url=verify_url,
    )


@router.post("/forgot-password", response_model=ForgotPasswordResponse)
def forgot_password(body: ForgotPasswordRequest):
    email = body.email.lower()
    with get_db() as conn:
        row = conn.execute("SELECT id, email FROM users WHERE email = ?", (email,)).fetchone()
    # Always look successful to avoid account enumeration
    if not row:
        return ForgotPasswordResponse()
    raw = issue_token(row["id"], "reset", hours=1)
    url = _reset_link(raw)
    sent = send_reset_email(row["email"], url)
    if email_configured() and sent:
        return ForgotPasswordResponse()
    if not email_configured():
        return ForgotPasswordResponse(
            detail="Email provider not configured — use the reset link below",
            reset_url=url,
        )
    return ForgotPasswordResponse(detail="If that email exists, we sent a reset link.")


@router.post("/reset-password", response_model=TokenResponse)
def reset_password(body: ResetPasswordRequest):
    user_id = consume_token(body.token.strip(), "reset")
    if not user_id:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link — request a new one")
    with get_db() as conn:
        row = conn.execute("SELECT id, email, email_verified FROM users WHERE id = ?", (user_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        conn.execute(
            "UPDATE users SET password_hash = ?, email_verified = 1 WHERE id = ?",
            (hash_password(body.new_password), user_id),
        )
    token = create_access_token(row["id"], row["email"])
    return TokenResponse(
        access_token=token,
        email=row["email"],
        email_verified=True,
    )


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest):
    with get_db() as conn:
        row = conn.execute(
            "SELECT id, email, password_hash, email_verified FROM users WHERE email = ?",
            (body.email.lower(),),
        ).fetchone()
    if not row or not verify_password(body.password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    verified = bool(row["email_verified"]) if "email_verified" in row.keys() else True
    token = create_access_token(row["id"], row["email"])
    return TokenResponse(
        access_token=token,
        email=row["email"],
        email_verified=verified,
    )
