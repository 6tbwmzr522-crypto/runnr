"""Fetch recent headlines and optional AI trader remark for watchlist tickers."""

from __future__ import annotations

import json
import re
import time
from urllib.error import HTTPError
from urllib.parse import quote as url_quote
from urllib.request import Request, urlopen

from app.config import settings

FX_MAJORS = frozenset({"USD", "EUR", "GBP", "JPY", "CHF", "AUD", "NZD", "CAD"})
CRYPTO = frozenset({"BTC", "ETH", "SOL", "DOGE", "XRP", "ADA", "AVAX", "LINK", "BNB"})

_BRIEF_REFRESH: dict[str, float] = {}
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


def ai_key_configured() -> bool:
    return bool((settings.openai_api_key or "").strip())


def _openai_remark(
    symbol: str,
    headlines: list[dict],
    *,
    direction: str | None = None,
    entry: float | None = None,
    stop: float | None = None,
    target: float | None = None,
) -> tuple[str | None, str | None]:
    key = (settings.openai_api_key or "").strip()
    if not key:
        return None, "OPENAI_API_KEY not set on API server"

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
        return text or None, None
    except HTTPError as exc:
        try:
            body = exc.read().decode()[:240]
        except Exception:
            body = str(exc)
        return None, f"OpenAI HTTP {exc.code}: {body}"
    except Exception as exc:
        return None, f"OpenAI error: {exc}"


def build_market_brief(
    symbol: str,
    *,
    direction: str | None = None,
    entry: float | None = None,
    stop: float | None = None,
    target: float | None = None,
    refresh: bool = False,
) -> dict:
    sym = normalize_yahoo_symbol(symbol)
    ai_on = ai_key_configured()
    cache_key = f"{sym}|{direction}|{entry}|{stop}|{target}|ai={ai_on}"
    now = time.time()
    if refresh:
        from app.config import settings

        last = _BRIEF_REFRESH.get(sym, 0)
        if now - last < settings.brief_refresh_cooldown_s:
            cached = _CACHE.get(cache_key)
            if cached:
                out = dict(cached[1])
                out["_runnr"] = {"cache": "hit", "refresh_limited": True}
                return out
        _BRIEF_REFRESH[sym] = now
    elif not refresh:
        cached = _CACHE.get(cache_key)
        if cached and now - cached[0] < _CACHE_TTL:
            out = dict(cached[1])
            out["_runnr"] = {"cache": "hit", "age_s": round(now - cached[0], 1)}
            return out

    headlines = fetch_headlines(sym)
    ai, ai_error = _openai_remark(
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
            "ai_enabled": True,
        }
    else:
        remark = headline_remark(headlines, sym)
        result = {
            "symbol": sym,
            "remark": remark or f"No fresh headline for {symbol} — add your own remark.",
            "mode": "headline" if remark else "fallback",
            "source": "yahoo",
            "headline": remark or None,
            "ai_enabled": ai_on,
            "ai_error": ai_error if ai_on else None,
        }

    _CACHE[cache_key] = (now, result)
    out = dict(result)
    out["_runnr"] = {"cache": "miss", "age_s": 0}
    return out
