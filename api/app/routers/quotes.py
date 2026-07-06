import json
import time
from urllib.parse import quote as url_quote
from urllib.request import Request, urlopen

from fastapi import APIRouter, HTTPException, Query, Response

from app.config import settings
from app.finnhub import quote_as_yahoo_chart
from app.market_brief import build_market_brief
from app.quote_cache import fear_greed_cache, quote_cache

router = APIRouter()


def _cache_headers(response: Response, status: str, age: float | None) -> None:
    response.headers["X-Runnr-Cache"] = status
    if age is not None:
        response.headers["X-Runnr-Cache-Age"] = str(int(age))


def _attach_meta(payload: dict, status: str, age: float | None, source: str = "yahoo") -> dict:
    out = dict(payload)
    out["_runnr"] = {
        "cache": status,
        "age_s": round(age or 0, 1),
        "source": source,
    }
    return out


def _fetch_chart(symbol: str, interval: str, range_: str) -> dict:
    sym = url_quote(symbol, safe="")
    url = (
        f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}"
        f"?interval={interval}&range={range_}"
    )
    req = Request(url, headers={"User-Agent": "Runnr/0.1"})
    with urlopen(req, timeout=12) as resp:
        return json.loads(resp.read().decode())


def _fetch_json(url: str, headers: dict | None = None) -> dict:
    req = Request(url, headers=headers or {"User-Agent": "Runnr/0.1", "Accept": "application/json"})
    with urlopen(req, timeout=12) as resp:
        return json.loads(resp.read().decode())


def _load_fear_greed() -> dict:
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

    data = _fetch_json("https://api.alternative.me/fng/?limit=1")
    row = (data.get("data") or [{}])[0]
    return {
        "score": int(row.get("value", 50)),
        "rating": row.get("value_classification", ""),
        "source": "crypto",
    }


@router.get("/fear-greed")
def fear_greed_index(response: Response):
    """Fear & Greed proxy (browser CORS blocks direct fetch). Cached 15 min."""
    cache_key = "fear_greed"
    ttl = float(settings.fear_greed_cache_ttl)
    cached, status, age = fear_greed_cache.get(cache_key)
    if status == "hit" and cached:
        _cache_headers(response, status, age)
        return _attach_meta(cached, status, age, source=cached.get("source", "cnn"))

    try:
        data = _load_fear_greed()
    except Exception as exc:
        if cached:
            _cache_headers(response, "stale", age)
            return _attach_meta(cached, "stale", age, source=cached.get("source", "cnn"))
        raise HTTPException(status_code=502, detail=f"Fear & Greed fetch failed: {exc}") from exc

    fear_greed_cache.set(cache_key, data, ttl)
    _cache_headers(response, "miss", 0)
    return _attach_meta(data, "miss", 0, source=data.get("source", "cnn"))


@router.get("/{symbol}/brief")
def market_brief(
    symbol: str,
    response: Response,
    direction: str | None = Query(default=None, pattern="^(long|short)$"),
    entry: float | None = None,
    stop: float | None = None,
    target: float | None = None,
    refresh: bool = False,
):
    """Recent headline or AI one-liner for watchlist context (cached 30m)."""
    try:
        result = build_market_brief(
            symbol,
            direction=direction,
            entry=entry,
            stop=stop,
            target=target,
            refresh=refresh,
        )
        meta = result.pop("_runnr", None) or {}
        _cache_headers(response, meta.get("cache", "miss"), meta.get("age_s"))
        return result
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Brief fetch failed: {exc}") from exc


@router.get("/{symbol}")
def quote(
    symbol: str,
    response: Response,
    interval: str = Query(default="1m", pattern="^(1m|5m|1h|1d)$"),
    range_: str = Query(default="1d", alias="range", pattern="^(1d|5d|1mo|3mo|6mo|1y|2y|5y)$"),
):
    """Yahoo Finance chart proxy for the Runnr PWA (avoids browser CORS)."""
    cache_key = f"{symbol}|{interval}|{range_}"
    ttl = float(settings.quote_cache_ttl)
    cached, status, age = quote_cache.get(cache_key)
    if status == "hit" and cached:
        _cache_headers(response, "hit", age)
        return _attach_meta(cached, "hit", age, source=cached.get("_runnr", {}).get("source", "yahoo"))

    source = "yahoo"
    try:
        data = _fetch_chart(symbol, interval, range_)
    except Exception as exc:
        fh_key = (settings.finnhub_api_key or "").strip()
        if fh_key and interval in ("1m", "5m") and range_ in ("1d", "5d"):
            fallback = quote_as_yahoo_chart(symbol, fh_key)
            if fallback:
                data = fallback
                source = "finnhub"
            elif cached:
                _cache_headers(response, "stale", age)
                return _attach_meta(cached, "stale", age, source="yahoo")
            else:
                raise HTTPException(status_code=502, detail=f"Quote fetch failed: {exc}") from exc
        elif cached:
            _cache_headers(response, "stale", age)
            return _attach_meta(cached, "stale", age, source="yahoo")
        else:
            raise HTTPException(status_code=502, detail=f"Quote fetch failed: {exc}") from exc

    quote_cache.set(cache_key, data, ttl)
    cache_status = "refresh" if status == "stale" else "miss"
    _cache_headers(response, cache_status, 0)
    return _attach_meta(data, cache_status, 0, source=source)
