"""Google + Apple sign-in. Secrets come from env only — never invent client keys."""

from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from typing import Any

from jose import JWTError, jwt

from app.auth import create_access_token, hash_password
from app.config import settings
from app.db import get_db
from app.names import normalize_first_name

OAUTH_PASSWORD_SENTINEL = "oauth:unusable"
GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO = "https://www.googleapis.com/oauth2/v3/userinfo"
APPLE_AUTH = "https://appleid.apple.com/auth/authorize"
APPLE_TOKEN = "https://appleid.apple.com/auth/token"
APPLE_KEYS = "https://appleid.apple.com/auth/keys"
STATE_MINUTES = 15


def is_oauth_sentinel(password_hash: str | None) -> bool:
    return not password_hash or str(password_hash).startswith("oauth:")


def google_configured() -> bool:
    return bool(
        (settings.google_oauth_client_id or "").strip()
        and (settings.google_oauth_client_secret or "").strip()
    )


def apple_configured() -> bool:
    return bool(
        (settings.apple_oauth_client_id or "").strip()
        and (settings.apple_oauth_team_id or "").strip()
        and (settings.apple_oauth_key_id or "").strip()
        and (settings.apple_oauth_private_key or "").strip()
    )


def providers_status() -> dict[str, bool]:
    return {"google": google_configured(), "apple": apple_configured()}


def api_public_url() -> str:
    return (settings.api_public_url or "https://api.runnr.fyi").rstrip("/")


def app_public_url() -> str:
    return (settings.app_public_url or "https://runnr.fyi").rstrip("/")


def google_redirect_uri() -> str:
    return f"{api_public_url()}/api/v1/auth/oauth/google/callback"


def apple_redirect_uri() -> str:
    return f"{api_public_url()}/api/v1/auth/oauth/apple/callback"


def _apple_private_key() -> str:
    return (settings.apple_oauth_private_key or "").strip().replace("\\n", "\n")


def encode_oauth_state(provider: str, next_path: str = "/") -> str:
    payload = {
        "p": provider,
        "n": next_path or "/",
        "exp": datetime.now(timezone.utc).timestamp() + STATE_MINUTES * 60,
    }
    return jwt.encode(payload, settings.runnr_secret_key, algorithm="HS256")


def decode_oauth_state(raw: str, provider: str) -> dict[str, Any]:
    try:
        data = jwt.decode(raw, settings.runnr_secret_key, algorithms=["HS256"])
    except JWTError as exc:
        raise ValueError("Invalid or expired sign-in state") from exc
    if data.get("p") != provider:
        raise ValueError("Sign-in state does not match provider")
    return data


def safe_next_path(raw: str | None) -> str:
    n = (raw or "").strip() or "/"
    if not n.startswith("/") or n.startswith("//") or "\\" in n or "://" in n:
        return "/"
    if any(ch in n for ch in (" ", "<", ">", "'", '"', "`")):
        return "/"
    return n


def _http_json(
    method: str,
    url: str,
    *,
    data: dict[str, str] | None = None,
    headers: dict[str, str] | None = None,
    timeout: int = 15,
) -> dict[str, Any]:
    body = None
    req_headers = {"Accept": "application/json", **(headers or {})}
    if data is not None:
        body = urllib.parse.urlencode(data).encode("utf-8")
        req_headers.setdefault("Content-Type", "application/x-www-form-urlencoded")
    req = urllib.request.Request(url, data=body, headers=req_headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:400]
        raise RuntimeError(f"OAuth provider error ({exc.code}): {detail}") from exc
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError("OAuth provider returned non-JSON") from exc
    return parsed if isinstance(parsed, dict) else {}


def google_authorize_url(state: str) -> str:
    qs = urllib.parse.urlencode(
        {
            "client_id": settings.google_oauth_client_id.strip(),
            "redirect_uri": google_redirect_uri(),
            "response_type": "code",
            "scope": "openid email profile",
            "state": state,
            "prompt": "select_account",
            "access_type": "online",
        }
    )
    return f"{GOOGLE_AUTH}?{qs}"


def apple_authorize_url(state: str) -> str:
    qs = urllib.parse.urlencode(
        {
            "client_id": settings.apple_oauth_client_id.strip(),
            "redirect_uri": apple_redirect_uri(),
            "response_type": "code id_token",
            "response_mode": "form_post",
            "scope": "name email",
            "state": state,
        }
    )
    return f"{APPLE_AUTH}?{qs}"


def exchange_google_code(code: str) -> dict[str, Any]:
    token = _http_json(
        "POST",
        GOOGLE_TOKEN,
        data={
            "code": code,
            "client_id": settings.google_oauth_client_id.strip(),
            "client_secret": settings.google_oauth_client_secret.strip(),
            "redirect_uri": google_redirect_uri(),
            "grant_type": "authorization_code",
        },
    )
    access = (token.get("access_token") or "").strip()
    if not access:
        raise RuntimeError("Google did not return an access token")
    info = _http_json(
        "GET",
        GOOGLE_USERINFO,
        headers={"Authorization": f"Bearer {access}"},
    )
    sub = str(info.get("sub") or "").strip()
    email = str(info.get("email") or "").strip().lower()
    if not sub or not email:
        raise RuntimeError("Google account is missing email")
    if info.get("email_verified") is False:
        raise RuntimeError("Google email is not verified")
    given = normalize_first_name(info.get("given_name") or info.get("name"))
    picture = str(info.get("picture") or "").strip() or None
    return {
        "provider": "google",
        "provider_sub": sub,
        "email": email,
        "email_verified": True,
        "first_name": given,
        "avatar_url": picture,
    }


def apple_client_secret() -> str:
    now = int(datetime.now(timezone.utc).timestamp())
    payload = {
        "iss": settings.apple_oauth_team_id.strip(),
        "iat": now,
        "exp": now + 86400 * 180,
        "aud": "https://appleid.apple.com",
        "sub": settings.apple_oauth_client_id.strip(),
    }
    return jwt.encode(
        payload,
        _apple_private_key(),
        algorithm="ES256",
        headers={"kid": settings.apple_oauth_key_id.strip()},
    )


def _apple_claims_from_id_token(id_token: str) -> dict[str, Any]:
    if not id_token:
        raise RuntimeError("Apple did not return an identity token")
    # Signature check needs Apple's JWKS. Tests can inject claims via exchange_apple_code.
    jwks = _http_json("GET", APPLE_KEYS)
    keys = jwks.get("keys") if isinstance(jwks, dict) else None
    if not keys:
        raise RuntimeError("Could not load Apple signing keys")
    try:
        header = jwt.get_unverified_header(id_token)
    except JWTError as exc:
        raise RuntimeError("Invalid Apple identity token") from exc
    kid = header.get("kid")
    key = next((k for k in keys if k.get("kid") == kid), None)
    if not key:
        raise RuntimeError("Apple identity token key not found")
    try:
        return jwt.decode(
            id_token,
            key,
            algorithms=["RS256"],
            audience=settings.apple_oauth_client_id.strip(),
            issuer="https://appleid.apple.com",
        )
    except JWTError as exc:
        raise RuntimeError("Apple identity token failed verification") from exc


def exchange_apple_code(code: str, id_token: str = "", user_json: str = "") -> dict[str, Any]:
    token = _http_json(
        "POST",
        APPLE_TOKEN,
        data={
            "code": code,
            "client_id": settings.apple_oauth_client_id.strip(),
            "client_secret": apple_client_secret(),
            "redirect_uri": apple_redirect_uri(),
            "grant_type": "authorization_code",
        },
    )
    raw_id = (id_token or token.get("id_token") or "").strip()
    claims = _apple_claims_from_id_token(raw_id)
    sub = str(claims.get("sub") or "").strip()
    email = str(claims.get("email") or "").strip().lower()
    if not email and user_json:
        try:
            extra = json.loads(user_json)
            email = str((extra.get("email") or "")).strip().lower()
        except json.JSONDecodeError:
            extra = {}
    else:
        extra = {}
        if user_json:
            try:
                extra = json.loads(user_json)
            except json.JSONDecodeError:
                extra = {}
    if not sub:
        raise RuntimeError("Apple account is missing a subject")
    if not email:
        email = _email_for_existing_identity("apple", sub)
    if not email:
        raise RuntimeError("Apple did not share an email — try again and allow email")
    name = None
    if isinstance(extra.get("name"), dict):
        name = normalize_first_name(extra["name"].get("firstName"))
    return {
        "provider": "apple",
        "provider_sub": sub,
        "email": email,
        "email_verified": True,
        "first_name": name,
        "avatar_url": None,
    }


def _email_for_existing_identity(provider: str, provider_sub: str) -> str:
    with get_db() as conn:
        row = conn.execute(
            """
            SELECT email FROM oauth_identities
            WHERE provider = ? AND provider_sub = ?
            """,
            (provider, provider_sub),
        ).fetchone()
    return str(row["email"] or "").strip().lower() if row else ""


def upsert_oauth_user(
    *,
    provider: str,
    provider_sub: str,
    email: str,
    email_verified: bool = True,
    first_name: str | None = None,
    avatar_url: str | None = None,
) -> dict[str, Any]:
    """Attach this identity to an existing email user, or create one."""
    provider = (provider or "").strip().lower()
    provider_sub = (provider_sub or "").strip()
    email = (email or "").strip().lower()
    if provider not in ("google", "apple") or not provider_sub or not email:
        raise ValueError("OAuth identity is incomplete")
    first_name = normalize_first_name(first_name)
    avatar_url = (avatar_url or "").strip() or None
    verified = 1 if email_verified else 0

    with get_db() as conn:
        ident = conn.execute(
            """
            SELECT user_id FROM oauth_identities
            WHERE provider = ? AND provider_sub = ?
            """,
            (provider, provider_sub),
        ).fetchone()
        user = None
        if ident:
            user = conn.execute(
                "SELECT * FROM users WHERE id = ?",
                (ident["user_id"],),
            ).fetchone()
        if user is None:
            user = conn.execute(
                "SELECT * FROM users WHERE email = ?",
                (email,),
            ).fetchone()
        if user is None:
            cur = conn.execute(
                """
                INSERT INTO users (email, password_hash, email_verified, first_name, avatar_url)
                VALUES (?, ?, ?, ?, ?)
                """,
                (email, OAUTH_PASSWORD_SENTINEL, verified, first_name, avatar_url),
            )
            user_id = int(cur.lastrowid)
            user = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        else:
            user_id = int(user["id"])
            updates: list[str] = []
            args: list[Any] = []
            if first_name and not (user["first_name"] if "first_name" in user.keys() else None):
                updates.append("first_name = ?")
                args.append(first_name)
            if avatar_url and not (user["avatar_url"] if "avatar_url" in user.keys() else None):
                updates.append("avatar_url = ?")
                args.append(avatar_url)
            if verified and "email_verified" in user.keys() and not user["email_verified"]:
                updates.append("email_verified = 1")
            if updates:
                args.append(user_id)
                conn.execute(f"UPDATE users SET {', '.join(updates)} WHERE id = ?", args)
                user = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()

        existing_ident = conn.execute(
            """
            SELECT id, user_id FROM oauth_identities
            WHERE provider = ? AND provider_sub = ?
            """,
            (provider, provider_sub),
        ).fetchone()
        if existing_ident:
            if int(existing_ident["user_id"]) != user_id:
                conn.execute(
                    "UPDATE oauth_identities SET user_id = ?, email = ? WHERE id = ?",
                    (user_id, email, existing_ident["id"]),
                )
        else:
            conn.execute(
                """
                INSERT INTO oauth_identities (user_id, provider, provider_sub, email)
                VALUES (?, ?, ?, ?)
                """,
                (user_id, provider, provider_sub, email),
            )

    token = create_access_token(int(user["id"]), user["email"])
    return {
        "id": int(user["id"]),
        "email": user["email"],
        "access_token": token,
        "first_name": (user["first_name"] if "first_name" in user.keys() else None) or first_name,
        "email_verified": bool(user["email_verified"]) if "email_verified" in user.keys() else True,
        "avatar_url": (user["avatar_url"] if "avatar_url" in user.keys() else None) or avatar_url,
    }


def finish_app_redirect(next_path: str, oauth_code: str) -> str:
    dest = safe_next_path(next_path)
    if dest == "/":
        dest = "/?signedin=1"
    joiner = "&" if "?" in dest else "?"
    if "signedin=" not in dest and dest.startswith("/"):
        dest = f"{dest}{joiner}signedin=1"
        joiner = "&"
    return f"{app_public_url()}{dest}{joiner}oauth={urllib.parse.quote(oauth_code)}"
