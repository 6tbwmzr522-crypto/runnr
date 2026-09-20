from datetime import datetime, timezone

from app.trend_day import (
    auto_eligible,
    band_of,
    break_side,
    cache_clear,
    clock_of,
    evaluate_from_charts,
    evaluate_levels,
    multiplier_of,
    parse_chart,
    score_of,
)


def _chart(symbol, rows):
    ts, high, low, close = [], [], [], []
    for stamp, h, l, c in rows:
        if isinstance(stamp, str):
            stamp = int(datetime.fromisoformat(stamp.replace("Z", "+00:00")).timestamp())
        ts.append(stamp)
        high.append(h)
        low.append(l)
        close.append(c)
    return {
        "chart": {
            "result": [
                {
                    "meta": {"symbol": symbol, "regularMarketPrice": close[-1]},
                    "timestamp": ts,
                    "indicators": {
                        "quote": [
                            {
                                "high": high,
                                "low": low,
                                "close": close,
                                "open": close,
                                "volume": [1] * len(ts),
                            }
                        ]
                    },
                }
            ],
            "error": None,
        }
    }


def _demo_charts():
    spy_m = _chart(
        "SPY",
        [
            ("2026-09-17T13:35:00Z", 565, 560, 563),
            ("2026-09-17T19:55:00Z", 564, 561, 562),
            ("2026-09-18T08:15:00Z", 567, 563, 566),
            ("2026-09-18T13:20:00Z", 566, 562, 565),
            ("2026-09-18T13:30:00Z", 568, 564, 566),
            ("2026-09-18T13:55:00Z", 567, 565, 566),
            ("2026-09-18T14:15:00Z", 571, 569, 570),
        ],
    )
    qqq_m = _chart(
        "QQQ",
        [
            ("2026-09-17T13:35:00Z", 485, 480, 483),
            ("2026-09-17T19:55:00Z", 484, 481, 482),
            ("2026-09-18T08:15:00Z", 488, 484, 487),
            ("2026-09-18T13:20:00Z", 487, 483, 486),
            ("2026-09-18T13:30:00Z", 491, 489, 490),
            ("2026-09-18T13:55:00Z", 490, 488, 489),
            ("2026-09-18T14:15:00Z", 494, 492, 493),
        ],
    )
    spy_d = _chart("SPY", [("2026-09-17T13:30:00Z", 565, 560, 562)])
    qqq_d = _chart("QQQ", [("2026-09-17T13:30:00Z", 485, 480, 482)])
    return {
        "SPY": {"m1": spy_m, "d1": spy_d},
        "QQQ": {"m1": qqq_m, "d1": qqq_d},
    }


def test_score_bands():
    assert score_of([False, False, False, False]) == 0
    assert band_of(0) == "sit" and multiplier_of(0) == 0
    assert band_of(1) == "sit" and multiplier_of(1, quarter=True) == 0.25
    assert band_of(2) == "half" and multiplier_of(2) == 0.5
    assert band_of(3) == "full" and multiplier_of(4) == 1


def test_demo_four_checks_full_up():
    now = datetime(2026, 9, 18, 14, 15, tzinfo=timezone.utc)
    snap = evaluate_from_charts(_demo_charts(), now=now, session_date="2026-09-18")
    spy = snap["levels"]["SPY"]
    assert snap["checks"] == [True, True, True, True]
    assert snap["score"] == 4
    assert snap["band"] == "full"
    assert snap["sides"] == {"SPY": "up", "QQQ": "up"}
    assert spy["stamp"] == 570
    assert spy["firstHourHigh"] == 568 and spy["firstHourLow"] == 564
    assert spy["pmHigh"] == 567 and spy["pmLow"] == 562
    assert spy["ydayHigh"] == 565 and spy["ydayLow"] == 560


def test_inside_range_is_sit():
    out = evaluate_levels(
        {
            "stamp": 566,
            "firstHourHigh": 568,
            "firstHourLow": 564,
            "pmHigh": 570,
            "pmLow": 560,
            "ydayHigh": 575,
            "ydayLow": 550,
        },
        {
            "stamp": 490,
            "firstHourHigh": 491,
            "firstHourLow": 488,
            "pmHigh": 495,
            "pmLow": 480,
            "ydayHigh": 500,
            "ydayLow": 470,
        },
    )
    assert out["score"] == 0
    assert out["sides"]["SPY"] == "flat"
    assert out["checks"] == [False, False, False, False]


def test_peers_require_same_side():
    disagree = evaluate_levels(
        {
            "stamp": 570,
            "firstHourHigh": 568,
            "firstHourLow": 564,
            "pmHigh": 567,
            "pmLow": 562,
            "ydayHigh": 565,
            "ydayLow": 560,
        },
        {
            "stamp": 470,
            "firstHourHigh": 491,
            "firstHourLow": 488,
            "pmHigh": 488,
            "pmLow": 483,
            "ydayHigh": 485,
            "ydayLow": 480,
        },
    )
    assert disagree["sides"]["SPY"] == "up"
    assert disagree["sides"]["QQQ"] == "down"
    assert disagree["checks"][3] is False
    assert disagree["score"] == 3


def test_first_hour_side_beats_yesterday():
    assert (
        break_side(556, 555, 550, 570, 560) == "up"
    )


def test_clock_and_eligibility():
    score = datetime(2026, 9, 18, 14, 10, tzinfo=timezone.utc)
    before = datetime(2026, 9, 18, 13, 45, tzinfo=timezone.utc)
    weekend = datetime(2026, 9, 19, 14, 10, tzinfo=timezone.utc)
    after_hours = datetime(2026, 9, 18, 21, 15, tzinfo=timezone.utc)
    assert clock_of(score)["phase"] == "score"
    assert auto_eligible(clock_of(score)) is True
    assert auto_eligible(clock_of(before)) is False
    assert auto_eligible(clock_of(weekend)) is False
    assert auto_eligible(clock_of(after_hours)) is True
    assert clock_of(weekend)["weekend"] is True


def test_parse_chart_skips_null_bars():
    payload = {
        "chart": {
            "result": [
                {
                    "timestamp": [1, 2],
                    "indicators": {"quote": [{"high": [1, None], "low": [1, 2], "close": [1, 2]}]},
                }
            ]
        }
    }
    bars = parse_chart(payload)
    assert len(bars) == 1


def test_trend_day_endpoint_skips_weekend(monkeypatch):
    from fastapi.testclient import TestClient

    from app.main import app
    from app.routers import quotes as quotes_mod

    cache_clear()
    weekend = datetime(2026, 9, 20, 16, 0, tzinfo=timezone.utc)
    monkeypatch.setattr(quotes_mod.trend_day_mod, "clock_of", lambda now=None: clock_of(weekend))
    with TestClient(app) as client:
        res = client.get("/api/v1/quotes/trend-day")
    assert res.status_code == 200
    data = res.json()
    assert data["eligible"] is False
    assert data["checks"] is None
    assert data["phase"] in ("outside", "before", "after", "score")
