import json
from urllib.parse import quote as url_quote
from urllib.request import Request, urlopen

from fastapi import APIRouter, HTTPException, Query

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


@router.get("/{symbol}")
def quote(
    symbol: str,
    interval: str = Query(default="1m", pattern="^(1m|1d|1h)$"),
    range_: str = Query(default="1d", alias="range", pattern="^(1d|5d|1mo|3mo|6mo|1y|2y|5y)$"),
):
    """Yahoo Finance chart proxy for the Runnr PWA (avoids browser CORS)."""
    return _fetch_chart(symbol, interval, range_)
