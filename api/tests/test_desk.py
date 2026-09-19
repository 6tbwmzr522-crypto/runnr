"""Desk bars keep enough history for SMA(200) on the 60-bar window."""
from fastapi.testclient import TestClient

from app.main import app
from app.quote_cache import quote_cache
from app.routers import desk as desk_mod


def _chart(n: int, symbol: str = "NEM") -> dict:
    closes = [100.0 + i * 0.1 for i in range(n)]
    return {
        "chart": {
            "result": [
                {
                    "timestamp": list(range(1_700_000_000, 1_700_000_000 + n)),
                    "indicators": {
                        "quote": [
                            {
                                "close": closes,
                                "open": closes,
                                "high": [c + 1 for c in closes],
                                "low": [c - 1 for c in closes],
                                "volume": [10] * n,
                            }
                        ]
                    },
                }
            ],
            "error": None,
        }
    }


def test_chart_keep_covers_ma200_on_display_window():
    assert desk_mod.DISPLAY_BARS == 60
    assert desk_mod.MA_WARMUP_BARS == 199
    assert desk_mod.CHART_KEEP == 259
    assert desk_mod.BAR_TF["1D"][3] in ("1y", "2y", "5y")
    assert desk_mod.BAR_TF["1W"][3] in ("5y", "10y")


def test_bars_return_warmup_plus_display(monkeypatch):
    quote_cache.clear()
    monkeypatch.setattr(desk_mod, "_alpaca_creds", lambda _user: None)
    monkeypatch.setattr(desk_mod, "_fetch_chart", lambda *_a, **_k: _chart(400))
    client = TestClient(app)
    res = client.get("/api/v1/desk/bars/NEM?timeframe=1D")
    assert res.status_code == 200
    bars = res.json()["bars"]
    assert len(bars) == desk_mod.CHART_KEEP
    assert bars[0]["c"] != bars[-1]["c"]
    quote_cache.clear()
