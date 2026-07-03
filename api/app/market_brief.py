"""Fetch recent headlines and optional AI trader remark for watchlist tickers."""

from __future__ import annotations

import json
import re
import time
from urllib.parse import quote as url_quote
from urllib.request import Request, urlopen

from app.config import settings

FX_MAJORS = frozenset({"USD", "EUR", "GBP", "JPY", "CHF", "AUD", "NZD", "CAD"})
CRYPTO = frozenset({"BTC", "ETH", "SOL", "DOGE", "XRP", "ADA", "AVAX", "LINK", "BNB"})

_CACHE: dict[str, tuple[float, dict]] = {}
_CACHE_TTL = 30 * 60


def normalize_yahoo_symbol(symbol: str) -> str:
    raw = (symbol or "").upper().strip()
    if not raw:
        return raw
    if "=" in raw or "-" in raw:
        return raw
    clean = re.sub(r"[^A-Z]", "", raw)
    if len(clean) == 6 and clean[:3] in FX_MAJORS and clean[3:] in FX_MAJORS:
        return f"{clean}=X"
    if clean in CRYPTO:
        return f"{clean}-USD"
    m = re.match(r"^([A-Z]{1,5})", clean)
    return m.group(1) if m else clean


def _fetch_json(url: str, *, method: str = "GET", body: dict | None = None) -> dict:
    data = json.dumps(body).encode() if body is not None else None
    req = Request(
        url,
        data=data,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; Runnr/0.1)",
            "Accept": "application/json",
            **({"Content-Type": "application/json"} if body is not None else {}),
        },
        method=method,
    )
    with urlopen(req, timeout=12) as resp:
        return json.loads(resp.read().decode())


def fetch_headlines(symbol: str, limit: int = 5) -> list[dict]:
    sym = normalize_yahoo_symbol(symbol)
    url = (
        "https://query1.finance.yahoo.com/v1/finance/search"
        f"?q={url_quote(sym)}&quotesCount=0&newsCount={limit}"
    )
    try:
        data = _fetch_json(url)
    except Exception:
        return []
    items = data.get("news") or []
    out = []
    for item in items:
        title = (item.get("title") or "").strip()
        if not title:
            continue
        out.append(
            {
                "title": title,
                "publisher": item.get("publisher") or "",
                "link": item.get("link") or "",
            }
        )
    return out


def _score_headline(title: str, symbol: str) -> int:
    t = title.lower()
    score = 0
    if "sector update" in t or t.startswith("sector "):
        score -= 12
    if symbol.upper() in title.upper():
        score += 6
    if any(w in t for w in ("earnings", "guidance", "fed", "rate", "cpi", "merger", "deal")):
        score += 3
    return score


def headline_remark(headlines: list[dict], symbol: str) -> str:
    if not headlines:
        return ""
    sym = re.sub(r"[^A-Z]", "", symbol.upper())[:5] or symbol.upper()
    best = max(headlines, key=lambda h: _score_headline(h["title"], sym))
    title = best["title"]
    if len(title) > 140:
        title = title[:137].rstrip() + "…"
    return title


def _openai_remark(
    symbol: str,
    headlines: list[dict],
    *,
    direction: str | None = None,
    entry: float | None = None,
    stop: float | None = None,
    target: float | None = None,
) -> str | None:
    key = settings.openai_api_key.strip()
    if not key:
        return None

    lines = "\n".join(f"- {h['title']}" for h in headlines[:4])
    setup = ""
    if any(v is not None for v in (entry, stop, target)):
        setup = (
            f"\nTrader setup: {direction or 'long'} | "
            f"entry {entry or '—'} | stop {stop or '—'} | target {target or '—'}"
        )

    prompt = f"""Write ONE trader-focused market remark for {symbol}.
Use the headlines for context.{setup}

Headlines:
{lines or '- No recent headlines'}

Rules:
- Max 120 characters
- One sentence, plain English
- Focus on what matters for the trade idea now
- No hype, no emojis, no "you" or "I"
- Do not mention "headlines" or "news"
"""

    body = {
        "model": settings.openai_model,
        "messages": [
            {
                "role": "system",
                "content": "You write concise market remarks for a trading journal app.",
            },
            {"role": "user", "content": prompt},
        ],
        "max_tokens": 80,
        "temperature": 0.35,
    }
    payload = json.dumps(body).encode()
    req = Request(
        "https://api.openai.com/v1/chat/completions",
        data=payload,
        headers={
            "User-Agent": "Runnr/0.1",
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Authorization": f"Bearer {key}",
        },
        method="POST",
    )
    try:
        with urlopen(req, timeout=20) as resp:
            data = json.loads(resp.read().decode())
        text = (
            data.get("choices", [{}])[0]
            .get("message", {})
            .get("content", "")
            .strip()
            .strip('"')
        )
        if len(text) > 160:
            text = text[:157].rstrip() + "…"
        return text or None
    except Exception:
        return None


def build_market_brief(
    symbol: str,
    *,
    direction: str | None = None,
    entry: float | None = None,
    stop: float | None = None,
    target: float | None = None,
) -> dict:
    sym = normalize_yahoo_symbol(symbol)
    cache_key = f"{sym}|{direction}|{entry}|{stop}|{target}"
    now = time.time()
    cached = _CACHE.get(cache_key)
    if cached and now - cached[0] < _CACHE_TTL:
        return cached[1]

    headlines = fetch_headlines(sym)
    ai = _openai_remark(
        symbol,
        headlines,
        direction=direction,
        entry=entry,
        stop=stop,
        target=target,
    )
    if ai:
        result = {
            "symbol": sym,
            "remark": ai,
            "mode": "ai",
            "source": "openai",
            "headline": headlines[0]["title"] if headlines else None,
        }
    else:
        remark = headline_remark(headlines, sym)
        result = {
            "symbol": sym,
            "remark": remark or f"No fresh headline for {symbol} — add your own remark.",
            "mode": "headline" if remark else "fallback",
            "source": "yahoo",
            "headline": remark or None,
        }

    _CACHE[cache_key] = (now, result)
    return result
