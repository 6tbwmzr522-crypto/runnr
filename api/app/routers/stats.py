"""First-party visitor counts. Hashes IP+date+UA; never stores IPs. Honours DNT/GPC."""

from __future__ import annotations

import hashlib
import hmac
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import JSONResponse

from app.auth import get_current_user
from app.config import settings
from app.db import get_db

router = APIRouter(tags=["stats"])

# Visitor totals are internal. Do not reuse email_is_boss — house billing
# emails are a different set (info@ is boss, gmail is not).
STATS_VIEWER_EMAILS = frozenset(
    {
        "janis@thinicedigital.com",
        "berzins.j@inbox.lv",
        "janis.berzins.liepins@gmail.com",
    }
)

_HASH_KEEP_DAYS = 2
_UA_MAX = 512
_IP_MAX = 64


def utc_day(now: datetime | None = None) -> str:
    stamp = now or datetime.now(timezone.utc)
    return stamp.astimezone(timezone.utc).strftime("%Y-%m-%d")


def client_ip(request: Request) -> str:
    forwarded = (request.headers.get("x-forwarded-for") or "").strip()
    if forwarded:
        return forwarded.split(",")[0].strip()[:_IP_MAX]
    real_ip = (request.headers.get("x-real-ip") or "").strip()
    if real_ip:
        return real_ip[:_IP_MAX]
    if request.client and request.client.host:
        return request.client.host[:_IP_MAX]
    return "0.0.0.0"


def dnt_enabled(request: Request) -> bool:
    dnt = (request.headers.get("dnt") or "").strip()
    gpc = (request.headers.get("sec-gpc") or "").strip()
    return dnt == "1" or gpc == "1"


def visitor_hash(ip: str, day: str, user_agent: str, secret: str) -> str:
    payload = f"{ip}|{day}|{user_agent}".encode("utf-8")
    key = (secret or "runnr").encode("utf-8")
    return hmac.new(key, payload, hashlib.sha256).hexdigest()


def record_hit(ip: str, user_agent: str, secret: str) -> None:
    day = utc_day()
    digest = visitor_hash(ip, day, user_agent, secret)
    cutoff = (datetime.now(timezone.utc) - timedelta(days=_HASH_KEEP_DAYS)).strftime("%Y-%m-%d")
    with get_db() as conn:
        conn.execute(
            """
            INSERT INTO site_stats_days (day, pageviews, uniques)
            VALUES (?, 0, 0)
            ON CONFLICT(day) DO NOTHING
            """,
            (day,),
        )
        conn.execute(
            "UPDATE site_stats_days SET pageviews = pageviews + 1 WHERE day = ?",
            (day,),
        )
        inserted = conn.execute(
            "INSERT OR IGNORE INTO site_stats_visitors (day, visitor_hash) VALUES (?, ?)",
            (day, digest),
        )
        if inserted.rowcount == 1:
            conn.execute(
                "UPDATE site_stats_days SET uniques = uniques + 1 WHERE day = ?",
                (day,),
            )
        conn.execute("DELETE FROM site_stats_visitors WHERE day < ?", (cutoff,))


def email_can_view_stats(email: str | None) -> bool:
    return (email or "").strip().lower() in STATS_VIEWER_EMAILS


def require_stats_viewer(user: dict = Depends(get_current_user)) -> dict:
    if not email_can_view_stats(user.get("email")):
        raise HTTPException(status_code=403, detail="Forbidden")
    return user


@router.post("/stats/hit", status_code=204)
def stats_hit(request: Request):
    if dnt_enabled(request):
        return Response(status_code=204)
    ua = (request.headers.get("user-agent") or "")[:_UA_MAX]
    record_hit(client_ip(request), ua, settings.runnr_secret_key)
    return Response(status_code=204)


@router.get("/stats")
def stats_get(_user: dict = Depends(require_stats_viewer)):
    today = utc_day()
    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT day, pageviews, uniques
            FROM site_stats_days
            ORDER BY day DESC
            LIMIT 90
            """
        ).fetchall()
        totals = conn.execute(
            """
            SELECT COALESCE(SUM(pageviews), 0) AS pageviews,
                   COALESCE(SUM(uniques), 0) AS uniques
            FROM site_stats_days
            """
        ).fetchone()
    days = [
        {"day": row["day"], "pageviews": int(row["pageviews"]), "uniques": int(row["uniques"])}
        for row in reversed(rows)
    ]
    today_row = next((row for row in days if row["day"] == today), None) or {
        "day": today,
        "pageviews": 0,
        "uniques": 0,
    }
    return JSONResponse(
        content={
            "today": today_row,
            "totals": {
                "pageviews": int(totals["pageviews"] or 0),
                "uniques": int(totals["uniques"] or 0),
            },
            "days": days,
            "timezone": "UTC",
            "note": "uniques are daily unique visitors (hash of IP + UTC date + user-agent). Totals sum those daily counts.",
        },
        headers={"Cache-Control": "no-store"},
    )
