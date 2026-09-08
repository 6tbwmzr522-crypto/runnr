"""Signed-in conversion funnel. Guests who never sync cannot be counted."""

from __future__ import annotations

from collections import Counter

from app.billing_util import email_is_boss
from app.db import get_db
from app.trade_limit import existing_countable_from_state_json
from app.trial import local_trial_is_active, utc_now

GUEST_NOTE = (
    "Guests who never sign in or never sync cannot be counted. "
    "Visit uniques are first-party page loads; journal counts come from "
    "user_state.state_json after a signed-in sync."
)


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


def build_funnel() -> dict:
    now = utc_now()
    with get_db() as conn:
        users = conn.execute(
            """
            SELECT id, email, subscription_status, plan, trial_ends_at, created_at
            FROM users
            """
        ).fetchall()
        states = conn.execute("SELECT user_id, state_json FROM user_state").fetchall()

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
        "note": GUEST_NOTE,
        "timezone": "UTC",
    }
