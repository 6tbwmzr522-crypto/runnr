"""Outbound email via Resend (optional). Without a key, callers get links in API for manual copy."""

from __future__ import annotations

import json
import logging
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from app.config import settings

log = logging.getLogger("runnr.email")


def email_configured() -> bool:
    return bool((settings.resend_api_key or "").strip() and (settings.resend_from_email or "").strip())


def send_email(*, to: str, subject: str, html: str, text: str) -> bool:
    if not email_configured():
        log.warning("Email not configured — would send to %s subject=%s", to, subject)
        return False
    body = {
        "from": settings.resend_from_email.strip(),
        "to": [to],
        "subject": subject,
        "html": html,
        "text": text,
    }
    req = Request(
        "https://api.resend.com/emails",
        data=json.dumps(body).encode(),
        headers={
            "Authorization": f"Bearer {settings.resend_api_key.strip()}",
            "Content-Type": "application/json",
            "User-Agent": "Runnr/1.0",
        },
        method="POST",
    )
    try:
        with urlopen(req, timeout=20) as resp:
            resp.read()
        return True
    except (HTTPError, URLError, TimeoutError) as exc:
        log.error("Resend failed: %s", exc)
        return False


def send_verify_email(to: str, verify_url: str) -> bool:
    return send_email(
        to=to,
        subject="Verify your Runnr email",
        text=f"Verify your Runnr account:\n\n{verify_url}\n\nThis link expires in 24 hours.",
        html=(
            f"<p>Verify your Runnr account:</p>"
            f'<p><a href="{verify_url}">Confirm email</a></p>'
            f"<p style='color:#666;font-size:13px'>Link expires in 24 hours.</p>"
        ),
    )


def send_reset_email(to: str, reset_url: str) -> bool:
    return send_email(
        to=to,
        subject="Reset your Runnr password",
        text=f"Reset your Runnr password:\n\n{reset_url}\n\nThis link expires in 1 hour. If you didn't ask, ignore this email.",
        html=(
            f"<p>Reset your Runnr password:</p>"
            f'<p><a href="{reset_url}">Choose a new password</a></p>'
            f"<p style='color:#666;font-size:13px'>Link expires in 1 hour. If you didn't ask, ignore this email.</p>"
        ),
    )
