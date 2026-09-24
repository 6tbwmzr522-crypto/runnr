"""First-party visitor counts. Hashes IP+date+UA; never stores IPs. Honours DNT/GPC.

New vs returning uses a separate HMAC of an anonymous client id (not the IP).
"""

from __future__ import annotations

import hashlib
import hmac
import re
import threading
import time
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import JSONResponse

from app.auth import get_current_user
from app.config import settings
from app.db import get_db
from app.funnel import FUNNEL_EVENT_SET, build_funnel, record_variant_event

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
# Anonymous guest rows outlive the daily IP hash. Drop them after a long gap
# so a cleared browser can count as new again, and the table stays bounded.
_GUEST_KEEP_DAYS = 400
_UA_MAX = 512
_IP_MAX = 64
_EVENT_MAX = 64
_GUEST_ID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
)
# Old visitor-hash rows are only needed for same-day uniques. Sweep at most
# once per process every few hours so /stats/hit stays a cheap write.
_CLEANUP_INTERVAL_S = 6 * 3600
_last_visitor_cleanup: float | None = None
_cleanup_lock = threading.Lock()


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


def normalize_guest_id(raw: str | None) -> str | None:
    """Accept only a UUID-shaped anonymous id. Never persist the raw value."""
    if raw is None:
        return None
    gid = str(raw).strip().lower()
    if len(gid) != 36 or not _GUEST_ID_RE.fullmatch(gid):
        return None
    return gid


def guest_hash(client_id: str, secret: str) -> str:
    """Stable HMAC of the anonymous id. Distinct from the daily IP visitor hash."""
    payload = f"guest|{client_id}".encode("utf-8")
    key = (secret or "runnr").encode("utf-8")
    return hmac.new(key, payload, hashlib.sha256).hexdigest()


def maybe_cleanup_old_visitors(conn, cutoff: str) -> bool:
    """DELETE expired visitor hashes at most once per process per interval."""
    global _last_visitor_cleanup
    now = time.monotonic()
    if (
        _last_visitor_cleanup is not None
        and now - _last_visitor_cleanup < _CLEANUP_INTERVAL_S
    ):
        return False
    with _cleanup_lock:
        if (
            _last_visitor_cleanup is not None
            and now - _last_visitor_cleanup < _CLEANUP_INTERVAL_S
        ):
            return False
        conn.execute("DELETE FROM site_stats_visitors WHERE day < ?", (cutoff,))
        guest_cutoff = (
            datetime.now(timezone.utc) - timedelta(days=_GUEST_KEEP_DAYS)
        ).strftime("%Y-%m-%d")
        conn.execute(
            "DELETE FROM site_stats_guests WHERE last_seen_day < ?",
            (guest_cutoff,),
        )
        _last_visitor_cleanup = time.monotonic()
        return True



def normalize_funnel_event(raw: str | None) -> str | None:
    """Allowlisted SAMPLE funnel beacons only; unknown / overlong are ignored."""
    if raw is None:
        return None
    name = str(raw).strip()
    if not name or len(name) > _EVENT_MAX:
        return None
    if name not in FUNNEL_EVENT_SET:
        return None
    return name


def apply_guest_day(conn, guest_id: str, secret: str, day: str) -> None:
    """Count this anonymous id once for the UTC day: new, or returning.

    New means first_seen_day is today. Returning means the id was stored on an
    earlier UTC day. A repeat hit the same day does not increment either.
    """
    digest = guest_hash(guest_id, secret)
    inserted = conn.execute(
        """
        INSERT OR IGNORE INTO site_stats_guests (guest_hash, first_seen_day, last_seen_day)
        VALUES (?, ?, ?)
        """,
        (digest, day, day),
    )
    if inserted.rowcount == 1:
        conn.execute(
            "UPDATE site_stats_days SET new_visitors = new_visitors + 1 WHERE day = ?",
            (day,),
        )
        return
    updated = conn.execute(
        """
        UPDATE site_stats_guests
        SET last_seen_day = ?
        WHERE guest_hash = ? AND last_seen_day < ?
        """,
        (day, digest, day),
    )
    if updated.rowcount == 1:
        conn.execute(
            "UPDATE site_stats_days SET returning_visitors = returning_visitors + 1 WHERE day = ?",
            (day,),
        )


def record_hit(
    ip: str,
    user_agent: str,
    secret: str,
    event: str | None = None,
    guest_id: str | None = None,
    variant: str | None = None,
) -> None:
    day = utc_day()
    digest = visitor_hash(ip, day, user_agent, secret)
    gid = normalize_guest_id(guest_id)
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
        if gid:
            apply_guest_day(conn, gid, secret, day)
        if event:
            conn.execute(
                """
                INSERT INTO site_funnel_events (day, event, count)
                VALUES (?, ?, 1)
                ON CONFLICT(day, event) DO UPDATE SET count = count + 1
                """,
                (day, event),
            )
            record_variant_event(conn, event, variant, day)
        maybe_cleanup_old_visitors(conn, cutoff)


def email_can_view_stats(email: str | None) -> bool:
    return (email or "").strip().lower() in STATS_VIEWER_EMAILS


def require_stats_viewer(user: dict = Depends(get_current_user)) -> dict:
    if not email_can_view_stats(user.get("email")):
        raise HTTPException(status_code=403, detail="Forbidden")
    return user


@router.post("/stats/hit", status_code=204)
def stats_hit(request: Request, e: str | None = None, g: str | None = None, v: str | None = None):
    if dnt_enabled(request):
        return Response(status_code=204)
    ua = (request.headers.get("user-agent") or "")[:_UA_MAX]
    event = normalize_funnel_event(e)
    record_hit(
        client_ip(request),
        ua,
        settings.runnr_secret_key,
        event=event,
        guest_id=g,
        variant=v,
    )
    return Response(status_code=204)


def _day_row(row, today: str | None = None) -> dict:
    return {
        "day": row["day"] if row is not None else today,
        "pageviews": int((row["pageviews"] if row is not None else 0) or 0),
        "uniques": int((row["uniques"] if row is not None else 0) or 0),
        "new_visitors": int((row["new_visitors"] if row is not None else 0) or 0),
        "returning_visitors": int((row["returning_visitors"] if row is not None else 0) or 0),
    }


@router.get("/stats")
def stats_get(_user: dict = Depends(require_stats_viewer)):
    today = utc_day()
    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT day, pageviews, uniques, new_visitors, returning_visitors
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
    days = [_day_row(row) for row in reversed(rows)]
    today_row = next((row for row in days if row["day"] == today), None) or _day_row(None, today)
    return JSONResponse(
        content={
            "today": today_row,
            "totals": {
                "pageviews": int(totals["pageviews"] or 0),
                "uniques": int(totals["uniques"] or 0),
            },
            "days": days,
            "timezone": "UTC",
            "note": (
                "uniques are daily unique visitors (hash of IP + UTC date + user-agent). "
                "new_visitors are anonymous browser ids first seen today (UTC); "
                "returning_visitors were seen on an earlier UTC day. "
                "New + Returning is that day's identified browsers and can differ slightly "
                "from uniques (no id, storage cleared, or IP changed while the id stayed). "
                "Totals sum those daily unique counts."
            ),
        },
        headers={"Cache-Control": "no-store"},
    )


@router.get("/admin/funnel")
@router.get("/stats/funnel")
def funnel_get(_user: dict = Depends(require_stats_viewer)):
    payload = build_funnel()
    return JSONResponse(content=payload, headers={"Cache-Control": "no-store"})
