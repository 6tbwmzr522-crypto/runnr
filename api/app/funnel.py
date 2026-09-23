"""Signed-in conversion funnel plus guest SAMPLE event beacons."""

from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone

from app.billing_util import email_is_boss
from app.db import get_db
from app.trade_limit import existing_countable_from_state_json
from app.trial import local_trial_is_active, utc_now

# Guest SAMPLE keep-score wall: shown first, locked only after a hold,
# oauth_start on Google/Apple tap, converted after account/OAuth complete.
# Never record locked without shown.
FUNNEL_EVENTS = (
    "demo_view",
    "demo_ig_land",
    "demo_aha",
    "demo_score_trade",
    "demo_cta_start",
    "email_wall_shown",
    "email_wall_locked",
    "email_wall_oauth_start",
    "email_wall_converted",
)
FUNNEL_EVENT_SET = frozenset(FUNNEL_EVENTS)

GUEST_NOTE = (
    "Visit uniques ≠ users; guest events are SAMPLE beacons; users only after "
    "email register. Guests who never sign in or never sync cannot be counted "
    "in the signed-in journal funnel. Visit uniques are first-party page loads; "
    "journal counts come from user_state.state_json after a signed-in sync."
)


def _utc_day(now: datetime | None = None) -> str:
    stamp = now or datetime.now(timezone.utc)
    return stamp.astimezone(timezone.utc).strftime("%Y-%m-%d")


def _hist_bucket(n: int) -> str:
    if n <= 0:
        return "0"
    if n == 1:
        return "1"
    if n == 2:
        return "2"
    if n <= 9:
        return "3-9"
    if n <= 24:
        return "10-24"
    return "25+"


def _guest_event_counts(conn, *, day: str | None = None) -> dict[str, int]:
    out = {name: 0 for name in FUNNEL_EVENTS}
    if day is None:
        rows = conn.execute(
            """
            SELECT event, COALESCE(SUM(count), 0) AS count
            FROM site_funnel_events
            GROUP BY event
            """
        ).fetchall()
    else:
        rows = conn.execute(
            """
            SELECT event, count
            FROM site_funnel_events
            WHERE day = ?
            """,
            (day,),
        ).fetchall()
    for row in rows:
        name = str(row["event"] or "")
        if name in out:
            out[name] = int(row["count"] or 0)
    return out


def _users_created_on(conn, day: str) -> int:
    # created_at may be "YYYY-MM-DD HH:MM:SS" or ISO-8601 with T/Z.
    row = conn.execute(
        """
        SELECT COUNT(*) AS n
        FROM users
        WHERE substr(REPLACE(created_at, 'T', ' '), 1, 10) = ?
        """,
        (day,),
    ).fetchone()
    return int(row["n"] if row else 0)


def build_funnel() -> dict:
    now = utc_now()
    today = _utc_day(now)
    with get_db() as conn:
        users = conn.execute(
            """
            SELECT id, email, subscription_status, plan, trial_ends_at, created_at
            FROM users
            """
        ).fetchall()
        states = conn.execute("SELECT user_id, state_json FROM user_state").fetchall()
        guest_events_today = _guest_event_counts(conn, day=today)
        guest_events_totals = _guest_event_counts(conn, day=None)
        users_created_today = _users_created_on(conn, today)

    trade_counts: dict[int, int] = {}
    for row in states:
        trade_counts[int(row["user_id"])] = existing_countable_from_state_json(row["state_json"])

    users_total = len(users)
    users_with_state = len(trade_counts)
    ge1 = ge3 = ge10 = 0
    users_pro = users_trialing = users_free = 0
    users_in_local_trial = users_trial_expired = 0
    hist: Counter[str] = Counter()

    for row in users:
        uid = int(row["id"])
        n = trade_counts.get(uid, 0)
        hist[_hist_bucket(n)] += 1
        if n >= 1:
            ge1 += 1
        if n >= 3:
            ge3 += 1
        if n >= 10:
            ge10 += 1

        email = row["email"]
        status = (row["subscription_status"] or "free").lower()
        boss = email_is_boss(email)
        stripe_pro = boss or status == "active"
        stripe_trial = (not boss) and status == "trialing"
        if stripe_pro:
            users_pro += 1
        elif stripe_trial:
            users_trialing += 1
        else:
            users_free += 1
            if local_trial_is_active(row["trial_ends_at"] if "trial_ends_at" in row.keys() else None, row["created_at"], now):
                users_in_local_trial += 1
            else:
                users_trial_expired += 1

    histogram = {
        key: int(hist.get(key, 0))
        for key in ("0", "1", "2", "3-9", "10-24", "25+")
    }

    return {
        "users_total": users_total,
        "users_with_state": users_with_state,
        "users_with_trades_ge_1": ge1,
        "users_with_trades_ge_3": ge3,
        "users_with_trades_ge_10": ge10,
        "users_pro": users_pro,
        "users_trialing": users_trialing,
        "users_free": users_free,
        "users_in_local_trial": users_in_local_trial,
        "users_trial_expired": users_trial_expired,
        "trade_count_histogram": histogram,
        "guest_events_today": guest_events_today,
        "guest_events_totals": guest_events_totals,
        "users_created_today": users_created_today,
        "note": GUEST_NOTE,
        "timezone": "UTC",
    }
