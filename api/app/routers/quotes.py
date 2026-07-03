import json
from urllib.parse import quote as url_quote
from urllib.request import Request, urlopen

from fastapi import APIRouter, HTTPException, Query

from app.market_brief import build_market_brief

router = APIRouter()


def _fetch_chart(symbol: str, interval: str, range_: str) -> dict:
    sym = url_quote(symbol, safe="")
    url = (
        f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}"
        f"?interval={interval}&range={range_}"
    )
    req = Request(url, headers={"User-Agent": "Runnr/0.1"})
    try:
        with urlopen(req, timeout=12) as resp:
            return json.loads(resp.read().decode())
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Quote fetch failed: {exc}") from exc


def _fetch_json(url: str, headers: dict | None = None) -> dict:
    req = Request(url, headers=headers or {"User-Agent": "Runnr/0.1", "Accept": "application/json"})
    with urlopen(req, timeout=12) as resp:
        return json.loads(resp.read().decode())


@router.get("/fear-greed")
def fear_greed_index():
    """Fear & Greed proxy (browser CORS blocks direct fetch)."""
    cnn_headers = {
        "User-Agent": "Mozilla/5.0 (compatible; Runnr/0.1)",
        "Accept": "application/json, text/plain, */*",
        "Origin": "https://www.cnn.com",
        "Referer": "https://www.cnn.com/markets/fear-and-greed",
    }
    try:
        data = _fetch_json(
            "https://production.dataviz.cnn.io/index/fearandgreed/graphdata",
            cnn_headers,
        )
        if data.get("fear_and_greed"):
            score = int(round(data["fear_and_greed"].get("score", 50)))
            rating = data["fear_and_greed"].get("rating", "")
            return {"score": score, "rating": rating, "source": "cnn"}
    except Exception:
        pass

    try:
        data = _fetch_json("https://api.alternative.me/fng/?limit=1")
        row = (data.get("data") or [{}])[0]
        return {
            "score": int(row.get("value", 50)),
            "rating": row.get("value_classification", ""),
            "source": "crypto",
        }
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Fear & Greed fetch failed: {exc}") from exc


@router.get("/{symbol}/brief")
def market_brief(
    symbol: str,
    direction: str | None = Query(default=None, pattern="^(long|short)$"),
    entry: float | None = None,
    stop: float | None = None,
    target: float | None = None,
    refresh: bool = False,
):
    """Recent headline or AI one-liner for watchlist context (cached 30m)."""
    try:
        return build_market_brief(
            symbol,
            direction=direction,
            entry=entry,
            stop=stop,
            target=target,
            refresh=refresh,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Brief fetch failed: {exc}") from exc


@router.get("/{symbol}")
def quote(
    symbol: str,
    interval: str = Query(default="1m", pattern="^(1m|5m|1h|1d)$"),
    range_: str = Query(default="1d", alias="range", pattern="^(1d|5d|1mo|3mo|6mo|1y|2y|5y)$"),
):
    """Yahoo Finance chart proxy for the Runnr PWA (avoids browser CORS)."""
    return _fetch_chart(symbol, interval, range_)
