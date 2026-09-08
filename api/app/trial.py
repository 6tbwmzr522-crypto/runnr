"""Local 7-day Runnr trial. Complements Stripe status (active / trialing)."""

from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone

TRIAL_DAYS = 7
STRIPE_TRIAL_DAYS = 7
LOCAL_TRIAL_BACKFILL_KEY = "local_trial_backfill_at"
TRIAL_EXPIRED_DETAIL = (
    "Your 7-day Runnr trial has ended. Upgrade to keep the journal, Coach, sync, and report."
)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def format_utc(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_utc(value: str | None) -> datetime | None:
    if not value:
        return None
    raw = str(value).strip()
    if not raw:
        return None
    raw = raw.replace(" ", "T")
    if raw.endswith("Z"):
        raw = raw[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(raw)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def trial_end_from(start: datetime | None = None) -> datetime:
    return (start or utc_now()) + timedelta(days=TRIAL_DAYS)


def default_trial_ends_at_iso(start: datetime | None = None) -> str:
    return format_utc(trial_end_from(start))


def resolve_trial_ends_at(
    trial_ends_at: str | None,
    created_at: str | None = None,
) -> datetime | None:
    stored = parse_utc(trial_ends_at)
    if stored:
        return stored
    created = parse_utc(created_at)
    if created:
        return trial_end_from(created)
    return None


def local_trial_is_active(
    trial_ends_at: str | None,
    created_at: str | None = None,
    now: datetime | None = None,
) -> bool:
    ends = resolve_trial_ends_at(trial_ends_at, created_at)
    if not ends:
        return False
    stamp = now or utc_now()
    return stamp < ends


def trial_days_left(
    trial_ends_at: str | None,
    created_at: str | None = None,
    now: datetime | None = None,
) -> int:
    ends = resolve_trial_ends_at(trial_ends_at, created_at)
    if not ends:
        return 0
    stamp = now or utc_now()
    seconds = (ends - stamp).total_seconds()
    if seconds <= 0:
        return 0
    return max(1, int(math.ceil(seconds / 86400)))


def trial_fields(
    trial_ends_at: str | None,
    created_at: str | None = None,
    now: datetime | None = None,
) -> dict:
    stamp = now or utc_now()
    ends = resolve_trial_ends_at(trial_ends_at, created_at)
    active = bool(ends and stamp < ends)
    return {
        "trial_ends_at": format_utc(ends) if ends else None,
        "trial_active": active,
        "trial_days_left": trial_days_left(trial_ends_at, created_at, stamp),
    }
