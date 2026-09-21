"""SPY/QQQ Trend day hygiene — compact snapshot for the Size chip.

Clock is America/New_York only. Benchmark is SPY for checks 1–3;
check 4 is SPY and QQQ agreeing on break side. Not an entry system.
"""

from __future__ import annotations

import threading
import time
from datetime import datetime, timezone
from typing import Any
from zoneinfo import ZoneInfo

TZ = ZoneInfo("America/New_York")
RTH_OPEN = 9 * 60 + 30
RTH_CLOSE = 16 * 60
SCORE_OPEN = 10 * 60
SCORE_CLOSE = 10 * 60 + 30
PREMARKET_OPEN = 4 * 60

_cache_lock = threading.Lock()
_cache: dict[str, dict[str, Any]] = {}


def et_parts(now: datetime | None = None) -> dict[str, Any]:
    dt = now.astimezone(TZ) if isinstance(now, datetime) else datetime.now(TZ)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc).astimezone(TZ)
    minutes = dt.hour * 60 + dt.minute
    weekday = dt.strftime("%a")
    return {
        "date": dt.strftime("%Y-%m-%d"),
        "weekday": weekday,
        "minutes": minutes,
        "weekend": weekday in ("Sat", "Sun"),
    }


def clock_of(now: datetime | None = None) -> dict[str, Any]:
    p = et_parts(now)
    in_rth = (not p["weekend"]) and RTH_OPEN <= p["minutes"] < RTH_CLOSE
    in_score = (not p["weekend"]) and SCORE_OPEN <= p["minutes"] < SCORE_CLOSE
    after_score = in_rth and p["minutes"] >= SCORE_CLOSE
    before_score = in_rth and p["minutes"] < SCORE_OPEN
    phase = "outside"
    if in_score:
        phase = "score"
    elif after_score:
        phase = "after"
    elif before_score:
        phase = "before"
    return {
        "tz": "America/New_York",
        "date": p["date"],
        "weekday": p["weekday"],
        "minutes": p["minutes"],
        "weekend": p["weekend"],
        "inRth": in_rth,
        "inScoreWindow": in_score,
        "afterScoreWindow": after_score,
        "beforeScoreWindow": before_score,
        "outsideRth": not in_rth,
        "phase": phase,
    }


def auto_eligible(clock: dict[str, Any]) -> bool:
    return (not clock["weekend"]) and clock["minutes"] >= SCORE_OPEN


def score_of(checks: list[bool]) -> int:
    return sum(1 for x in checks if x)


def band_of(score: int) -> str:
    n = int(score or 0)
    if n <= 1:
        return "sit"
    if n == 2:
        return "half"
    return "full"


def multiplier_of(score: int, quarter: bool = False) -> float:
    band = band_of(score)
    if band == "sit":
        return 0.25 if quarter else 0.0
    if band == "half":
        return 0.5
    return 1.0


def _num(v: Any) -> float | None:
    try:
        if v is None:
            return None
        x = float(v)
        if x != x:  # NaN
            return None
        return x
    except (TypeError, ValueError):
        return None


def parse_chart(payload: dict | None) -> list[dict[str, Any]]:
    if not payload:
        return []
    chart = payload.get("chart") or {}
    results = chart.get("result") or []
    if not results:
        return []
    row = results[0] or {}
    stamps = row.get("timestamp") or []
    quote = ((row.get("indicators") or {}).get("quote") or [{}])[0] or {}
    highs = quote.get("high") or []
    lows = quote.get("low") or []
    closes = quote.get("close") or []
    opens = quote.get("open") or []
    bars: list[dict[str, Any]] = []
    for i, raw_ts in enumerate(stamps):
        try:
            ts = int(raw_ts)
        except (TypeError, ValueError):
            continue
        high = _num(highs[i] if i < len(highs) else None)
        low = _num(lows[i] if i < len(lows) else None)
        close = _num(closes[i] if i < len(closes) else None)
        open_ = _num(opens[i] if i < len(opens) else None)
        if high is None or low is None or close is None:
            continue
        dt = datetime.fromtimestamp(ts, tz=timezone.utc)
        p = et_parts(dt)
        bars.append(
            {
                "t": ts,
                "date": p["date"],
                "minutes": p["minutes"],
                "o": open_ if open_ is not None else close,
                "h": high,
                "l": low,
                "c": close,
            }
        )
    return bars


def _in_win(bar: dict[str, Any], date: str, start: int, end: int) -> bool:
    return bar["date"] == date and start <= bar["minutes"] < end


def _hi_lo(bars: list[dict[str, Any]]) -> tuple[float | None, float | None]:
    if not bars:
        return None, None
    return max(b["h"] for b in bars), min(b["l"] for b in bars)


def prior_session_date(bars: list[dict[str, Any]], session_date: str) -> str:
    dates = sorted(
        {
            b["date"]
            for b in bars
            if b["date"] < session_date and RTH_OPEN <= b["minutes"] < RTH_CLOSE
        }
    )
    return dates[-1] if dates else ""


def pick_stamp(bars: list[dict[str, Any]], session_date: str) -> dict[str, Any] | None:
    score = [b for b in bars if _in_win(b, session_date, SCORE_OPEN, SCORE_CLOSE)]
    if score:
        return score[-1]
    after = [b for b in bars if _in_win(b, session_date, SCORE_OPEN, RTH_CLOSE)]
    if after:
        return after[-1]
    rth = [b for b in bars if _in_win(b, session_date, RTH_OPEN, RTH_CLOSE)]
    return rth[-1] if rth else None


def levels_for(
    minute_bars: list[dict[str, Any]],
    daily_bars: list[dict[str, Any]] | None,
    session_date: str,
) -> dict[str, Any]:
    first = [b for b in minute_bars if _in_win(b, session_date, RTH_OPEN, SCORE_OPEN)]
    prem = [b for b in minute_bars if _in_win(b, session_date, PREMARKET_OPEN, RTH_OPEN)]
    stamp = pick_stamp(minute_bars, session_date)
    orb_h, orb_l = _hi_lo(first)
    pm_h, pm_l = _hi_lo(prem)

    yday_h = yday_l = None
    yday_date = ""
    daily = daily_bars or []
    prior_daily = [b for b in daily if b["date"] < session_date]
    if prior_daily:
        prior_daily.sort(key=lambda b: b["date"])
        last = prior_daily[-1]
        yday_h, yday_l = last["h"], last["l"]
        yday_date = last["date"]
    if yday_h is None:
        yday_date = prior_session_date(minute_bars, session_date)
        if yday_date:
            yday_h, yday_l = _hi_lo(
                [b for b in minute_bars if _in_win(b, yday_date, RTH_OPEN, RTH_CLOSE)]
            )

    return {
        "stamp": stamp["c"] if stamp else None,
        "stampAt": stamp["t"] if stamp else None,
        "firstHourHigh": orb_h,
        "firstHourLow": orb_l,
        "pmHigh": pm_h,
        "pmLow": pm_l,
        "ydayHigh": yday_h,
        "ydayLow": yday_l,
        "ydayDate": yday_date,
        "ok": stamp is not None,
    }


def broke(stamp: float | None, high: float | None, low: float | None) -> bool:
    if stamp is None or high is None or low is None:
        return False
    return stamp > high or stamp < low


def break_side(
    stamp: float | None,
    first_high: float | None,
    first_low: float | None,
    yday_high: float | None,
    yday_low: float | None,
) -> str:
    """First-hour break wins; else yesterday H/L. Flat if neither."""
    if stamp is None:
        return "flat"
    if first_high is not None and stamp > first_high:
        return "up"
    if first_low is not None and stamp < first_low:
        return "down"
    if yday_high is not None and stamp > yday_high:
        return "up"
    if yday_low is not None and stamp < yday_low:
        return "down"
    return "flat"


def evaluate_levels(spy: dict[str, Any], qqq: dict[str, Any]) -> dict[str, Any]:
    """Four hygiene checks. SPY for 1–3; peers = SPY & QQQ same break side."""
    orb = broke(spy.get("stamp"), spy.get("firstHourHigh"), spy.get("firstHourLow"))
    pm = broke(spy.get("stamp"), spy.get("pmHigh"), spy.get("pmLow"))
    yday = broke(spy.get("stamp"), spy.get("ydayHigh"), spy.get("ydayLow"))
    spy_side = break_side(
        spy.get("stamp"),
        spy.get("firstHourHigh"),
        spy.get("firstHourLow"),
        spy.get("ydayHigh"),
        spy.get("ydayLow"),
    )
    qqq_side = break_side(
        qqq.get("stamp"),
        qqq.get("firstHourHigh"),
        qqq.get("firstHourLow"),
        qqq.get("ydayHigh"),
        qqq.get("ydayLow"),
    )
    peers = spy_side == qqq_side and spy_side != "flat"
    checks = [orb, pm, yday, peers]
    score = score_of(checks)
    return {
        "checks": checks,
        "score": score,
        "band": band_of(score),
        "multiplier": multiplier_of(score),
        "sides": {"SPY": spy_side, "QQQ": qqq_side},
        "levels": {"SPY": spy, "QQQ": qqq},
        "benchmark": "SPY",
        "peers": "QQQ",
    }


def evaluate_from_charts(
    charts: dict[str, Any],
    now: datetime | None = None,
    session_date: str | None = None,
) -> dict[str, Any]:
    clock = clock_of(now)
    date = session_date or clock["date"]
    spy_m = parse_chart((charts.get("SPY") or {}).get("m1") or charts.get("SPY"))
    qqq_m = parse_chart((charts.get("QQQ") or {}).get("m1") or charts.get("QQQ"))
    spy_d = parse_chart((charts.get("SPY") or {}).get("d1"))
    qqq_d = parse_chart((charts.get("QQQ") or {}).get("d1"))
    spy = levels_for(spy_m, spy_d, date)
    qqq = levels_for(qqq_m, qqq_d, date)
    out = evaluate_levels(spy, qqq)
    out["date"] = date
    out["phase"] = clock["phase"]
    out["locked"] = (not clock["weekend"]) and clock["minutes"] >= SCORE_CLOSE
    out["eligible"] = auto_eligible(clock)
    out["stampAt"] = spy.get("stampAt")
    return out


def cache_get(date: str) -> dict[str, Any] | None:
    with _cache_lock:
        row = _cache.get(date)
        return dict(row) if row else None


def cache_set(date: str, payload: dict[str, Any], locked: bool) -> None:
    with _cache_lock:
        _cache[date] = {
            "payload": payload,
            "locked": locked,
            "fetched_at": time.time(),
        }


def cache_clear() -> None:
    with _cache_lock:
        _cache.clear()


def cached_snapshot(clock: dict[str, Any], ttl_s: float = 45.0) -> dict[str, Any] | None:
    row = cache_get(clock["date"])
    if not row:
        return None
    age = time.time() - float(row.get("fetched_at") or 0)
    if age < ttl_s:
        return row.get("payload")
    return None
