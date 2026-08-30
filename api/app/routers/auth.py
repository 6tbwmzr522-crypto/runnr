from fastapi import APIRouter, Depends, Form, HTTPException, Query
from fastapi.responses import HTMLResponse, RedirectResponse

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
    OAuthExchangeRequest,
    OAuthProvidersResponse,
    RegisterRequest,
    ResetPasswordRequest,
    TokenResponse,
    UpdateMeRequest,
    VerifyEmailRequest,
)
from app.names import normalize_first_name
from app.oauth import (
    apple_authorize_url,
    apple_configured,
    decode_oauth_state,
    encode_oauth_state,
    exchange_apple_code,
    exchange_google_code,
    finish_app_redirect,
    google_authorize_url,
    google_configured,
    is_oauth_sentinel,
    providers_status,
    safe_next_path,
    upsert_oauth_user,
)

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
        created_at=user.get("created_at") or None,
        intro_seen=bool(user.get("intro_seen")),
        avatar_url=user.get("avatar_url") or None,
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
    # Expose link only when outbound email isn't configured (dev / bootstrap).
    return sent, (None if email_configured() else url)


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
            stored_hash = existing["password_hash"]
            oauth_only = is_oauth_sentinel(stored_hash)
            if oauth_only:
                conn.execute(
                    "UPDATE users SET password_hash = ? WHERE id = ?",
                    (hash_password(body.password), existing["id"]),
                )
            elif not verify_password(body.password, stored_hash):
                raise HTTPException(status_code=400, detail="Wrong password for this email")
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
    sets: list[str] = []
    args: list = []
    first_name = normalize_first_name(body.first_name) if body.first_name is not None else None
    if body.first_name is not None:
        if not first_name:
            raise HTTPException(status_code=400, detail="Enter a first name")
        sets.append("first_name = ?")
        args.append(first_name)
        user["first_name"] = first_name
    if body.intro_seen is not None:
        sets.append("intro_seen = ?")
        args.append(1 if body.intro_seen else 0)
        user["intro_seen"] = bool(body.intro_seen)
    if not sets:
        raise HTTPException(status_code=400, detail="Nothing to update")
    args.append(user["id"])
    with get_db() as conn:
        conn.execute(f"UPDATE users SET {', '.join(sets)} WHERE id = ?", args)
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
    if user.get("email_verified"):
        return MessageResponse(ok=True, detail="Email already verified")
    sent, verify_url = _issue_verification(user["id"], user["email"])
    if sent:
        return MessageResponse(ok=True, detail="Verification email sent")
    if email_configured():
        raise HTTPException(
            status_code=502,
            detail="Could not send the confirmation email. Check Resend, then tap resend.",
        )
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


def _oauth_error_page(message: str, status_code: int = 503) -> HTMLResponse:
    body = f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Runnr sign-in</title>
<style>body{{font-family:-apple-system,sans-serif;background:#080c12;color:#f5f2ec;padding:32px;max-width:440px;margin:0 auto;line-height:1.5}}
a{{color:#C9A96E}}</style></head>
<body><h1>runnr</h1><p>{message}</p>
<p><a href="https://runnr.fyi/login.html">Back to sign in</a></p></body></html>"""
    return HTMLResponse(body, status_code=status_code)


def _finish_oauth(identity: dict, next_path: str) -> RedirectResponse:
    user = upsert_oauth_user(**identity)
    code = issue_token(user["id"], "oauth", hours=0.25)
    return RedirectResponse(finish_app_redirect(next_path, code), status_code=302)


@router.get("/oauth/providers", response_model=OAuthProvidersResponse)
def oauth_providers():
    return OAuthProvidersResponse(**providers_status())


@router.get("/oauth/google/start")
def oauth_google_start(next: str = Query(default="/")):
    if not google_configured():
        return _oauth_error_page(
            "Google sign-in is not configured yet. Add GOOGLE_OAUTH_CLIENT_ID and "
            "GOOGLE_OAUTH_CLIENT_SECRET on the Railway API, then set the redirect URI "
            "https://api.runnr.fyi/api/v1/auth/oauth/google/callback."
        )
    state = encode_oauth_state("google", safe_next_path(next))
    return RedirectResponse(google_authorize_url(state), status_code=302)


@router.get("/oauth/google/callback")
def oauth_google_callback(code: str = "", state: str = "", error: str = ""):
    if error:
        return _oauth_error_page(f"Google sign-in was cancelled ({error}).", 400)
    if not code or not state:
        return _oauth_error_page("Google sign-in missing code or state.", 400)
    try:
        st = decode_oauth_state(state, "google")
        identity = exchange_google_code(code)
        return _finish_oauth(identity, st.get("n") or "/")
    except Exception as exc:
        return _oauth_error_page(str(exc) or "Google sign-in failed.", 400)


@router.get("/oauth/apple/start")
def oauth_apple_start(next: str = Query(default="/")):
    if not apple_configured():
        return _oauth_error_page(
            "Apple sign-in needs a paid Apple Developer Program account (Services ID, "
            "Key ID, Team ID, and a .p8 key). The button and callback are scaffolded — "
            "set APPLE_OAUTH_CLIENT_ID, APPLE_OAUTH_TEAM_ID, APPLE_OAUTH_KEY_ID, and "
            "APPLE_OAUTH_PRIVATE_KEY on Railway. Return URL: "
            "https://api.runnr.fyi/api/v1/auth/oauth/apple/callback"
        )
    state = encode_oauth_state("apple", safe_next_path(next))
    return RedirectResponse(apple_authorize_url(state), status_code=302)


@router.post("/oauth/apple/callback")
def oauth_apple_callback(
    code: str = Form(default=""),
    id_token: str = Form(default=""),
    state: str = Form(default=""),
    user: str = Form(default=""),
    error: str = Form(default=""),
):
    if error:
        return _oauth_error_page(f"Apple sign-in was cancelled ({error}).", 400)
    if not code or not state:
        return _oauth_error_page("Apple sign-in missing code or state.", 400)
    try:
        st = decode_oauth_state(state, "apple")
        identity = exchange_apple_code(code, id_token=id_token, user_json=user)
        return _finish_oauth(identity, st.get("n") or "/")
    except Exception as exc:
        return _oauth_error_page(str(exc) or "Apple sign-in failed.", 400)


@router.post("/oauth/exchange", response_model=TokenResponse)
def oauth_exchange(body: OAuthExchangeRequest):
    user_id = consume_token(body.code.strip(), "oauth")
    if not user_id:
        raise HTTPException(status_code=400, detail="Invalid or expired sign-in — try Google or Apple again")
    with get_db() as conn:
        row = conn.execute(
            "SELECT id, email, email_verified, first_name FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    verified = bool(row["email_verified"]) if "email_verified" in row.keys() else True
    token = create_access_token(row["id"], row["email"])
    stored_name = row["first_name"] if "first_name" in row.keys() else None
    return _token_response(
        access_token=token,
        email=row["email"],
        email_verified=verified,
        first_name=stored_name or None,
    )
