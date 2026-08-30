from fastapi import APIRouter, Depends, HTTPException

from app.auth import create_access_token, get_current_user, hash_password, verify_password
from app.auth_tokens import consume_token, issue_token
from app.billing_util import email_is_boss
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
    UpdateMeRequest,
    VerifyEmailRequest,
)
from app.names import normalize_first_name

router = APIRouter(prefix="/auth", tags=["auth"])


def _email_flags(email: str | None) -> dict:
    from app.routers.stats import email_can_view_stats

    e = (email or "").strip().lower()
    return {
        "house": email_is_boss(e),
        "can_view_stats": email_can_view_stats(e),
    }


def _me_response(user: dict) -> MeResponse:
    return MeResponse(
        id=user["id"],
        email=user["email"],
        pro=bool(user.get("pro")),
        plan=user.get("plan") or "free",
        subscription_status=user.get("subscription_status") or "free",
        billing_enabled=bool(user.get("billing_enabled")),
        email_verified=bool(user.get("email_verified", True)),
        email_configured=email_configured(),
        first_name=user.get("first_name") or None,
        **_email_flags(user.get("email")),
    )


def _app_url() -> str:
    return (settings.app_public_url or "https://runnr.fyi").rstrip("/")


def _verify_link(token: str) -> str:
    return f"{_app_url()}/?verify={token}"


def _reset_link(token: str) -> str:
    return f"{_app_url()}/?reset={token}"


def _token_response(**kwargs) -> TokenResponse:
    kwargs.setdefault("email_configured", email_configured())
    flags = _email_flags(kwargs.get("email"))
    kwargs.setdefault("house", flags["house"])
    kwargs.setdefault("can_view_stats", flags["can_view_stats"])
    return TokenResponse(**kwargs)


def _issue_verification(user_id: int, email: str) -> tuple[bool, str | None]:
    raw = issue_token(user_id, "verify", hours=24)
    url = _verify_link(raw)
    sent = send_verify_email(email, url)
    # Keep real sends when they work. If outbound mail fails (no key, Resend
    # 403, timeout), expose the same tap-to-verify link register/login already
    # surface so testers can confirm without a 502.
    return sent, (None if sent else url)


@router.post("/register", response_model=TokenResponse)
def register(body: RegisterRequest):
    email = body.email.lower()
    first_name = normalize_first_name(body.first_name)
    with get_db() as conn:
        existing = conn.execute(
            "SELECT id, email, password_hash, email_verified, first_name FROM users WHERE email = ?",
            (email,),
        ).fetchone()
        if existing:
            if verify_password(body.password, existing["password_hash"]):
                stored_name = None
                if "first_name" in existing.keys():
                    stored_name = existing["first_name"] or None
                if first_name and not stored_name:
                    conn.execute(
                        "UPDATE users SET first_name = ? WHERE id = ?",
                        (first_name, existing["id"]),
                    )
                    stored_name = first_name
                token = create_access_token(existing["id"], existing["email"])
                verified = bool(existing["email_verified"]) if "email_verified" in existing.keys() else True
                sent, verify_url = False, None
                if email_configured() and not verified:
                    sent, verify_url = _issue_verification(existing["id"], existing["email"])
                return _token_response(
                    access_token=token,
                    email=existing["email"],
                    email_verified=verified,
                    verification_sent=sent,
                    verify_url=verify_url,
                    first_name=stored_name,
                )
            raise HTTPException(status_code=400, detail="Wrong password for this email")
        if not email_configured() and not email_is_boss(email):
            raise HTTPException(
                status_code=503,
                detail="Confirmation emails are not sending yet. Try again later, or use your Runnr house account.",
            )
        verified = 0 if email_configured() else 1
        cur = conn.execute(
            "INSERT INTO users (email, password_hash, email_verified, first_name) VALUES (?, ?, ?, ?)",
            (email, hash_password(body.password), verified, first_name),
        )
        user_id = cur.lastrowid

    if email_configured():
        sent, verify_url = _issue_verification(user_id, email)
        verified_flag = False
    else:
        sent, verify_url, verified_flag = False, None, True
    token = create_access_token(user_id, email)
    return _token_response(
        access_token=token,
        email=email,
        email_verified=verified_flag,
        verification_sent=sent,
        verify_url=verify_url,
        first_name=first_name,
    )


@router.get("/me", response_model=MeResponse)
def me(user: dict = Depends(get_current_user)):
    return _me_response(user)


@router.patch("/me", response_model=MeResponse)
def update_me(body: UpdateMeRequest, user: dict = Depends(get_current_user)):
    first_name = normalize_first_name(body.first_name)
    if not first_name:
        raise HTTPException(status_code=400, detail="Enter a first name")
    with get_db() as conn:
        conn.execute("UPDATE users SET first_name = ? WHERE id = ?", (first_name, user["id"]))
    user["first_name"] = first_name
    return _me_response(user)


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
    configured = email_configured()
    if user.get("email_verified"):
        return MessageResponse(
            ok=True,
            detail="Email already verified",
            verification_sent=False,
            email_configured=configured,
        )
    sent, verify_url = _issue_verification(user["id"], user["email"])
    if sent:
        return MessageResponse(
            ok=True,
            detail="Verification email sent",
            verification_sent=True,
            email_configured=configured,
        )
    return MessageResponse(
        ok=True,
        detail="Could not send the confirmation email — use this link to verify",
        verification_sent=False,
        email_configured=configured,
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
        row = conn.execute("SELECT id, email, email_verified, first_name FROM users WHERE id = ?", (user_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        conn.execute(
            "UPDATE users SET password_hash = ?, email_verified = 1 WHERE id = ?",
            (hash_password(body.new_password), user_id),
        )
    token = create_access_token(row["id"], row["email"])
    stored_name = row["first_name"] if "first_name" in row.keys() else None
    return _token_response(
        access_token=token,
        email=row["email"],
        email_verified=True,
        first_name=stored_name or None,
    )


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest):
    with get_db() as conn:
        row = conn.execute(
            "SELECT id, email, password_hash, email_verified, first_name FROM users WHERE email = ?",
            (body.email.lower(),),
        ).fetchone()
    if not row or not verify_password(body.password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    verified = bool(row["email_verified"]) if "email_verified" in row.keys() else True
    token = create_access_token(row["id"], row["email"])
    stored_name = row["first_name"] if row and "first_name" in row.keys() else None
    sent, verify_url = False, None
    if not verified:
        sent, verify_url = _issue_verification(row["id"], row["email"])
    return _token_response(
        access_token=token,
        email=row["email"],
        email_verified=verified,
        verification_sent=sent,
        verify_url=verify_url,
        first_name=stored_name or None,
    )
