"""Optional Finnhub fallback when Yahoo chart fetch fails."""

from __future__ import annotations

import json
import time
from urllib.parse import quote as url_quote
from urllib.request import Request, urlopen

from app.market_brief import normalize_yahoo_symbol


def _fetch(url: str) -> dict:
    req = Request(url, headers={"User-Agent": "Runnr/0.1", "Accept": "application/json"})
    with urlopen(req, timeout=10) as resp:
        return json.loads(resp.read().decode())


def finnhub_symbol(symbol: str) -> str | None:
    """Map Runnr/Yahoo symbols to Finnhub tickers where possible."""
    sym = normalize_yahoo_symbol(symbol)
    if not sym:
        return None
    if sym.endswith("=X"):
        base = sym.replace("=X", "")
        if len(base) == 6:
            return f"OANDA:{base[:3]}_{base[3:]}"
        return None
    if sym.endswith("-USD"):
        return f"BINANCE:{sym.replace('-USD', '')}USDT"
    if sym.startswith("^"):
        return sym
    return sym.split("-")[0]


def quote_as_yahoo_chart(symbol: str, api_key: str) -> dict | None:
    """Build a minimal Yahoo-shaped chart payload from Finnhub quote."""
    fh_sym = finnhub_symbol(symbol)
    if not fh_sym or not api_key:
        return None
    url = (
        "https://finnhub.io/api/v1/quote"
        f"?symbol={url_quote(fh_sym)}&token={url_quote(api_key)}"
    )
    try:
        data = _fetch(url)
    except Exception:
        return None
    price = data.get("c")
    if price is None or price == 0:
        return None
    prev = data.get("pc") or price
    ts = int(data.get("t") or time.time())
    sym = normalize_yahoo_symbol(symbol)
    return {
        "chart": {
            "result": [
                {
                    "meta": {
                        "symbol": sym,
                        "regularMarketPrice": float(price),
                        "previousClose": float(prev),
                        "chartPreviousClose": float(prev),
                        "regularMarketTime": ts,
                    },
                    "timestamp": [ts],
                    "indicators": {
                        "quote": [
                            {
                                "close": [float(price)],
                                "high": [float(data.get("h") or price)],
                                "low": [float(data.get("l") or price)],
                                "open": [float(data.get("o") or price)],
                                "volume": [0],
                            }
                        ]
                    },
                }
            ],
            "error": None,
        }
    }
