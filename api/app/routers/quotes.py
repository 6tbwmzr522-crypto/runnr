import json
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import quote as url_quote
from urllib.request import Request, urlopen

from fastapi import APIRouter, HTTPException, Query, Response
from pydantic import BaseModel, Field

from app.config import settings
from app.finnhub import quote_as_yahoo_chart
from app.market_brief import build_market_brief
from app.quote_cache import fear_greed_cache, quote_cache

router = APIRouter()

_SOURCE_KEY = "_runnr_source"
_FAIL_COOLDOWN_S = 15.0
_BATCH_MAX = 40
_BATCH_WORKERS = 4
_fail_until: dict[str, float] = {}
_fail_lock = threading.Lock()

_INTERVAL_OK = {"1m", "5m", "1h", "1d"}
_RANGE_OK = {"1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y"}


class QuoteBatchRequest(BaseModel):
    symbols: list[str] = Field(..., min_length=1)
    interval: str = "1m"
    range: str = "1d"


def _mark_fetch_fail(key: str) -> None:
    with _fail_lock:
        _fail_until[key] = time.time() + _FAIL_COOLDOWN_S


def _mark_fetch_ok(key: str) -> None:
    with _fail_lock:
        _fail_until.pop(key, None)


def _can_refresh(key: str) -> bool:
    with _fail_lock:
        return time.time() >= _fail_until.get(key, 0.0)


def _cache_headers(response: Response, status: str, age: float | None) -> None:
    response.headers["X-Runnr-Cache"] = status
    if age is not None:
        response.headers["X-Runnr-Cache-Age"] = str(int(age))


def _attach_meta(payload: dict, status: str, age: float | None, source: str = "yahoo") -> dict:
    out = {k: v for k, v in payload.items() if k not in (_SOURCE_KEY, "_runnr")}
    src = payload.get(_SOURCE_KEY) or source
    nested = payload.get("_runnr")
    if isinstance(nested, dict) and nested.get("source"):
        src = nested.get("source") or src
    out["_runnr"] = {
        "cache": status,
        "age_s": round(age or 0, 1),
        "source": src,
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


def _load_quote(symbol: str, interval: str, range_: str) -> tuple[dict, str]:
    """Yahoo first; Finnhub for 1m/5d-or-1d when Yahoo fails."""
    try:
        return _fetch_chart(symbol, interval, range_), "yahoo"
    except Exception as exc:
        fh_key = (settings.finnhub_api_key or "").strip()
        if fh_key and interval in ("1m", "5m") and range_ in ("1d", "5d"):
            fallback = quote_as_yahoo_chart(symbol, fh_key)
            if fallback:
                return fallback, "finnhub"
        raise exc


def _fetch_and_cache(cache_key: str, symbol: str, interval: str, range_: str, ttl: float) -> dict:
    try:
        data, source = _load_quote(symbol, interval, range_)
    except Exception:
        _mark_fetch_fail(cache_key)
        raise
    stored = dict(data)
    stored[_SOURCE_KEY] = source
    quote_cache.set(cache_key, stored, ttl)
    _mark_fetch_ok(cache_key)
    return stored


def resolve_quote(symbol: str, interval: str, range_: str) -> tuple[dict, str, float | None, str]:
    """Fresh hit, stale-while-revalidate, or singleflight fetch.

    Returns (payload_with__runnr, cache_status, age_s, source).
    """
    cache_key = f"{symbol}|{interval}|{range_}"
    ttl = float(settings.quote_cache_ttl)
    stale_ttl = float(settings.quote_stale_ttl)
    cached, status, age = quote_cache.lookup(cache_key)

    if status == "hit" and cached:
        quote_cache.note_hit()
        source = str(cached.get(_SOURCE_KEY) or "yahoo")
        return _attach_meta(cached, "hit", age, source), "hit", age, source

    within_stale = (
        status == "stale"
        and cached is not None
        and age is not None
        and age < stale_ttl
    )
    if within_stale:
        quote_cache.note_swr()
        if _can_refresh(cache_key):
            quote_cache.flight.start_background(
                cache_key,
                lambda: _fetch_and_cache(cache_key, symbol, interval, range_, ttl),
            )
        source = str(cached.get(_SOURCE_KEY) or "yahoo")
        return _attach_meta(cached, "swr", age, source), "swr", age, source

    try:
        stored = quote_cache.flight.do(
            cache_key,
            lambda: _fetch_and_cache(cache_key, symbol, interval, range_, ttl),
        )
    except Exception as exc:
        if cached:
            quote_cache.note_stale()
            source = str(cached.get(_SOURCE_KEY) or "yahoo")
            return _attach_meta(cached, "stale", age, source), "stale", age, source
        quote_cache.note_miss()
        raise HTTPException(status_code=502, detail=f"Quote fetch failed: {exc}") from exc

    source = str(stored.get(_SOURCE_KEY) or "yahoo")
    cache_status = "refresh" if status == "stale" else "miss"
    if cache_status == "miss":
        quote_cache.note_miss()
    return _attach_meta(stored, cache_status, 0, source), cache_status, 0.0, source


def _clean_batch_symbols(raw: list[str] | str) -> list[str]:
    if isinstance(raw, str):
        parts = raw.split(",")
    else:
        parts = list(raw)
    out: list[str] = []
    seen: set[str] = set()
    for item in parts:
        sym = str(item or "").strip().upper()[:32]
        if not sym or sym in seen:
            continue
        seen.add(sym)
        out.append(sym)
        if len(out) >= _BATCH_MAX:
            break
    return out


def _safe_resolve(symbol: str, interval: str, range_: str) -> tuple[str, dict | None, str, dict | None]:
    try:
        payload, status, _age, _source = resolve_quote(symbol, interval, range_)
        return symbol, payload, status, None
    except HTTPException as exc:
        return symbol, None, "error", {"status": exc.status_code, "detail": str(exc.detail)}


def resolve_quote_batch(symbols: list[str], interval: str, range_: str) -> tuple[dict, dict, str]:
    cleaned = _clean_batch_symbols(symbols)
    if not cleaned:
        raise HTTPException(status_code=400, detail="No symbols")
    if interval not in _INTERVAL_OK or range_ not in _RANGE_OK:
        raise HTTPException(status_code=400, detail="Invalid interval or range")

    quotes: dict[str, dict] = {}
    errors: dict[str, dict] = {}
    statuses: list[str] = []
    workers = min(_BATCH_WORKERS, len(cleaned))
    if workers == 1:
        rows = [_safe_resolve(cleaned[0], interval, range_)]
    else:
        with ThreadPoolExecutor(max_workers=workers) as pool:
            rows = list(pool.map(lambda s: _safe_resolve(s, interval, range_), cleaned))
    for symbol, payload, status, err in rows:
        statuses.append(status)
        if payload is not None:
            quotes[symbol] = payload
        elif err is not None:
            errors[symbol] = err

    unique = set(statuses)
    cache_status = next(iter(unique)) if len(unique) == 1 else "mixed"
    return quotes, errors, cache_status


def _batch_payload(symbols: list[str], interval: str, range_: str, response: Response) -> dict:
    quotes, errors, cache_status = resolve_quote_batch(symbols, interval, range_)
    _cache_headers(response, cache_status, None)
    return {
        "quotes": quotes,
        "errors": errors,
        "_runnr": {
            "cache": cache_status,
            "ok": len(quotes),
            "failed": len(errors),
        },
    }


def resolve_fear_greed() -> tuple[dict, str, float | None]:
    cache_key = "fear_greed"
    ttl = float(settings.fear_greed_cache_ttl)
    cached, status, age = fear_greed_cache.lookup(cache_key)
    if status == "hit" and cached:
        fear_greed_cache.note_hit()
        return cached, "hit", age

    try:
        data = fear_greed_cache.flight.do(cache_key, _load_fear_greed)
    except Exception as exc:
        if cached:
            fear_greed_cache.note_stale()
            return cached, "stale", age
        fear_greed_cache.note_miss()
        raise HTTPException(status_code=502, detail=f"Fear & Greed fetch failed: {exc}") from exc

    fear_greed_cache.set(cache_key, data, ttl)
    cache_status = "refresh" if status == "stale" else "miss"
    if cache_status == "miss":
        fear_greed_cache.note_miss()
    return data, cache_status, 0.0


@router.get("/fear-greed")
def fear_greed_index(response: Response):
    """Fear & Greed proxy (browser CORS blocks direct fetch). Cached 15 min."""
    data, status, age = resolve_fear_greed()
    _cache_headers(response, status, age)
    return _attach_meta(data, status, age, source=data.get("source", "cnn"))


@router.post("/batch")
def quote_batch(body: QuoteBatchRequest, response: Response):
    """Watchlist/home poll: one request for many symbols (singleflight per key)."""
    return _batch_payload(body.symbols, body.interval, body.range, response)


@router.get("/batch")
def quote_batch_get(
    response: Response,
    symbols: str = Query(..., min_length=1),
    interval: str = Query(default="1m", pattern="^(1m|5m|1h|1d)$"),
    range_: str = Query(default="1d", alias="range", pattern="^(1d|5d|1mo|3mo|6mo|1y|2y|5y)$"),
):
    return _batch_payload(symbols.split(","), interval, range_, response)


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
    """Recent headline or AI one-liner for watchlist context (cached ~10m)."""
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
    payload, status, age, _source = resolve_quote(symbol, interval, range_)
    _cache_headers(response, status, age)
    return payload
