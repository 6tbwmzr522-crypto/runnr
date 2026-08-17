"""Runnr Desk — watchlist tape + 60-session bars.

Alpaca IEX when the signed-in user has broker keys. Otherwise the same
Yahoo / Finnhub path the watchlist already uses. Read-only.
"""
from __future__ import annotations

import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from fastapi import APIRouter, Depends, HTTPException, Query, Response

from app.auth import get_optional_user
from app.quote_cache import quote_cache
from app.routers.brokers import _load_alpaca
from app.routers.quotes import _fetch_chart

router = APIRouter()
ALPACA_DATA = "https://data.alpaca.markets/v2"
GOLD_API = "https://api.gold-api.com/price/XAU"


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _http_json(url: str, headers: dict | None = None, timeout: float = 12) -> dict:
    req = Request(
        url,
        headers=headers
        or {"User-Agent": "Runnr/0.1", "Accept": "application/json"},
    )
    with urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode())


def _clean_syms(raw: str) -> list[str]:
    out = []
    for part in (raw or "").split(","):
        s = part.strip().upper()
        if not s or s in out:
            continue
        if len(s) > 10:
            continue
        out.append(s)
        if len(out) >= 24:
            break
    return out


def _alpaca_json(key: str, secret: str, path: str, query: dict) -> dict:
    q = dict(query)
    q.setdefault("feed", "iex")
    url = ALPACA_DATA + path + "?" + urlencode(q)
    return _http_json(
        url,
        {
            "User-Agent": "Runnr/0.1",
            "Accept": "application/json",
            "APCA-API-KEY-ID": key,
            "APCA-API-SECRET-KEY": secret,
        },
    )


def _alpaca_creds(user: dict | None) -> tuple[str, str] | None:
    if not user:
        return None
    try:
        loaded = _load_alpaca(user["id"])
    except Exception:
        return None
    if not loaded:
        return None
    key, secret, _paper = loaded
    if key and secret:
        return key, secret
    return None


def _row_from_alpaca(sym: str, snap: dict) -> dict | None:
    trade = snap.get("latestTrade") or {}
    daily = snap.get("dailyBar") or {}
    prev = snap.get("prevDailyBar") or {}
    last = trade.get("p") if trade.get("p") is not None else daily.get("c")
    prev_c = prev.get("c")
    if last is None:
        return None
    last = float(last)
    prev_c = float(prev_c) if prev_c is not None else last
    chg = last - prev_c
    asof = trade.get("t") or daily.get("t") or _now_iso()
    if isinstance(asof, str) and asof.endswith("+00:00"):
        asof = asof.replace("+00:00", "Z")
    return {
        "sym": sym,
        "last": round(last, 4),
        "prevClose": round(prev_c, 4),
        "chg": round(chg, 4),
        "chgPct": round((chg / prev_c * 100) if prev_c else 0.0, 2),
        "src": "Alpaca IEX",
        "asof": asof if isinstance(asof, str) else _now_iso(),
    }


def _row_from_yahoo(sym: str) -> dict | None:
    try:
        data = _fetch_chart(sym, "1d", "1d")
    except Exception:
        return None
    result = ((data.get("chart") or {}).get("result") or [None])[0] or {}
    meta = result.get("meta") or {}
    last = meta.get("regularMarketPrice")
    prev = meta.get("previousClose") or meta.get("chartPreviousClose")
    if last is None:
        return None
    last = float(last)
    prev = float(prev) if prev is not None else last
    chg = last - prev
    return {
        "sym": meta.get("symbol") or sym,
        "last": round(last, 4),
        "prevClose": round(prev, 4),
        "chg": round(chg, 4),
        "chgPct": round((chg / prev * 100) if prev else 0.0, 2),
        "src": "Yahoo/Finnhub",
        "asof": _now_iso(),
    }


def _gold_row() -> dict | None:
    try:
        data = _http_json(GOLD_API, timeout=8)
        last = float(data.get("price"))
    except Exception:
        return None
    return {
        "sym": "XAU",
        "last": round(last, 2),
        "prevClose": round(last, 2),
        "chg": 0.0,
        "chgPct": 0.0,
        "src": "gold-api.com spot",
        "asof": data.get("updatedAt") or _now_iso(),
        "kind": "METAL",
    }


def _alpaca_snapshots(key: str, secret: str, symbols: list[str]) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for i in range(0, len(symbols), 40):
        chunk = symbols[i : i + 40]
        data = _alpaca_json(key, secret, "/stocks/snapshots", {"symbols": ",".join(chunk)})
        rows = data.get("snapshots") if isinstance(data.get("snapshots"), dict) else data
        if not isinstance(rows, dict):
            continue
        for sym, snap in rows.items():
            if not isinstance(snap, dict):
                continue
            row = _row_from_alpaca(sym, snap)
            if row:
                out[sym.upper()] = row
    return out


def _yahoo_snapshots(symbols: list[str]) -> dict[str, dict]:
    out: dict[str, dict] = {}
    with ThreadPoolExecutor(max_workers=6) as pool:
        futs = {pool.submit(_row_from_yahoo, s): s for s in symbols}
        for fut in as_completed(futs):
            row = fut.result()
            if row:
                out[str(row["sym"]).upper()] = row
    return out


def _day(val) -> str:
    s = str(val or "")
    if "T" in s:
        return s.split("T", 1)[0]
    return s[:10]


@router.get("/snapshot")
def desk_snapshot(
    response: Response,
    symbols: str = Query(default="AAPL,MSFT,NVDA"),
    user: dict | None = Depends(get_optional_user),
):
    syms = _clean_syms(symbols) or ["AAPL", "MSFT", "NVDA"]
    cache_key = "desk-snap:" + ",".join(syms)
    cached, status, age = quote_cache.get(cache_key)
    if status == "hit" and cached:
        response.headers["X-Runnr-Cache"] = "hit"
        return cached

    source = "yahoo"
    rows_map: dict[str, dict] = {}
    creds = _alpaca_creds(user)
    if creds:
        try:
            rows_map = _alpaca_snapshots(creds[0], creds[1], syms)
            if rows_map:
                source = "alpaca iex"
        except Exception:
            rows_map = {}
    missing = [s for s in syms if s not in rows_map]
    if missing:
        rows_map.update(_yahoo_snapshots(missing))
        if source == "alpaca iex" and missing:
            source = "alpaca iex + yahoo"
        elif source != "alpaca iex":
            source = "yahoo"

    gold = _gold_row()
    rows = [rows_map[s] for s in syms if s in rows_map]
    if gold:
        rows.append(gold)

    payload = {
        "rows": rows,
        "asof": _now_iso(),
        "source": source,
        "alpaca": source.startswith("alpaca"),
    }
    quote_cache.set(cache_key, payload, 15)
    response.headers["X-Runnr-Cache"] = "miss"
    return payload


@router.get("/bars/{symbol}")
def desk_bars(
    symbol: str,
    response: Response,
    user: dict | None = Depends(get_optional_user),
):
    sym = (symbol or "AAPL").strip().upper()
    cache_key = "desk-bars:" + sym
    cached, status, age = quote_cache.get(cache_key)
    if status == "hit" and cached:
        response.headers["X-Runnr-Cache"] = "hit"
        return cached

    bars = []
    source = "yahoo"
    creds = _alpaca_creds(user)
    if creds:
        try:
            start = (datetime.now(timezone.utc) - timedelta(days=130)).strftime(
                "%Y-%m-%dT00:00:00Z"
            )
            data = _alpaca_json(
                creds[0],
                creds[1],
                "/stocks/bars",
                {
                    "symbols": sym,
                    "timeframe": "1Day",
                    "start": start,
                    "limit": "70",
                    "adjustment": "split",
                    "sort": "asc",
                },
            )
            blob = data.get("bars") or {}
            raw = blob.get(sym) if isinstance(blob, dict) else None
            if raw is None and isinstance(blob, list):
                raw = blob
            for row in raw or []:
                c = row.get("c")
                if c is None:
                    continue
                bars.append(
                    {
                        "d": _day(row.get("t")),
                        "o": round(float(row.get("o") or c), 4),
                        "h": round(float(row.get("h") or c), 4),
                        "l": round(float(row.get("l") or c), 4),
                        "c": round(float(c), 4),
                        "v": int(row.get("v") or 0),
                    }
                )
            if bars:
                source = "alpaca iex"
        except Exception:
            bars = []

    if not bars:
        data = _fetch_chart(sym, "1d", "3mo")
        result = ((data.get("chart") or {}).get("result") or [None])[0]
        if not result:
            raise HTTPException(status_code=502, detail=f"no bars for {sym}")
        ts = result.get("timestamp") or []
        quote = ((result.get("indicators") or {}).get("quote") or [{}])[0]
        closes = quote.get("close") or []
        opens = quote.get("open") or []
        highs = quote.get("high") or []
        lows = quote.get("low") or []
        vols = quote.get("volume") or []
        for i, t in enumerate(ts):
            if i >= len(closes) or closes[i] is None:
                continue
            c = float(closes[i])
            day = datetime.fromtimestamp(int(t), tz=timezone.utc).strftime("%Y-%m-%d")
            bars.append(
                {
                    "d": day,
                    "o": round(float(opens[i]) if i < len(opens) and opens[i] is not None else c, 4),
                    "h": round(float(highs[i]) if i < len(highs) and highs[i] is not None else c, 4),
                    "l": round(float(lows[i]) if i < len(lows) and lows[i] is not None else c, 4),
                    "c": round(c, 4),
                    "v": int(vols[i] if i < len(vols) and vols[i] is not None else 0),
                }
            )
        source = "yahoo"

    payload = {
        "symbol": sym,
        "bars": bars[-60:],
        "source": source,
        "asof": _now_iso(),
    }
    quote_cache.set(cache_key, payload, 90)
    response.headers["X-Runnr-Cache"] = "miss"
    return payload
