"""Trading 212 public API — read-only history and positions for journal import.

Never place, amend, or cancel orders. GET only.
Auth: HTTP Basic from T212_API_KEY / T212_API_SECRET (key:secret).
Live host: https://live.trading212.com
"""

from __future__ import annotations

import base64
import json
import re
import time
from datetime import datetime, timezone
from typing import Callable
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from fastapi import HTTPException

from app.config import settings

LIVE_BASE = "https://live.trading212.com"
HISTORY_PATH = "/api/v0/equity/history/orders"
POSITIONS_PATH = "/api/v0/equity/positions"
USER_AGENT = "Runnr/1.0 (read-only T212 sync; +https://runnr.fyi)"

# History orders: 6 req / 60s. Stay inside that window; back off on 429.
HISTORY_LIMIT = 50
MAX_PAGES = 12
SYNC_BUDGET_S = 75.0
RETRY_CAP_S = 20.0

FILLED_STATUSES = {"filled", "partially_filled", "partially-filled"}
SKIP_FILL_TYPES = {
    "stock_split",
    "stock_distribution",
    "fop",
    "fop_correction",
    "custom_stock_distribution",
    "equity_rights",
    "scrip_stock_dividends",
    "stock_dividends",
    "stock_acquisition",
    "cash_and_stock_acquisition",
    "spin_off",
}

HttpGet = Callable[[str, dict, float], tuple[int, bytes, dict]]


class T212ConfigError(HTTPException):
    def __init__(self, detail: str = "Trading 212 is not configured. Set T212_API_KEY and T212_API_SECRET on the API service."):
        super().__init__(status_code=503, detail=detail)


def t212_configured() -> bool:
    return bool((settings.t212_api_key or "").strip() and (settings.t212_api_secret or "").strip())


def require_t212_configured() -> tuple[str, str]:
    key = (settings.t212_api_key or "").strip()
    secret = (settings.t212_api_secret or "").strip()
    if not key or not secret:
        raise T212ConfigError()
    return key, secret


def _basic_header(key: str, secret: str) -> str:
    raw = f"{key}:{secret}".encode("utf-8")
    return "Basic " + base64.b64encode(raw).decode("ascii")


def _redact(text: str, key: str = "", secret: str = "") -> str:
    out = str(text or "")
    if key:
        out = out.replace(key, "***")
    if secret:
        out = out.replace(secret, "***")
    out = re.sub(r"Basic\s+\S+", "Basic ***", out)
    out = re.sub(r"(?i)(authorization[:\s]+)\S+", r"\1***", out)
    return out[:300]


def _public_http_error(status: int, body: str, key: str, secret: str) -> HTTPException:
    snippet = _redact(body, key, secret).strip()
    if status in (401, 403):
        return HTTPException(
            status_code=400,
            detail="Trading 212 rejected the API credentials. Check T212_API_KEY / T212_API_SECRET (read-only).",
        )
    if status == 429:
        return HTTPException(status_code=429, detail="Trading 212 rate limit reached. Try again in a minute.")
    if 400 <= status < 500:
        return HTTPException(status_code=400, detail=f"Trading 212 request failed ({status}).")
    return HTTPException(status_code=502, detail=f"Trading 212 sync failed ({status}).")


def map_t212_ticker(ticker: str | None) -> str:
    """AAPL_US_EQ → AAPL, VUAG_EQ → VUAG. Do not invent a different instrument."""
    s = str(ticker or "").strip().upper()
    if not s or s == "?":
        return ""
    if s.endswith("_EQ"):
        s = s[: -len("_EQ")]
    m = re.fullmatch(r"(.+)_([A-Z]{2})", s)
    if m:
        return m.group(1)
    return s


def _to_float(raw) -> float | None:
    if raw is None or raw == "":
        return None
    try:
        return float(raw)
    except (TypeError, ValueError):
        return None


def _iso(raw) -> str | None:
    if not raw:
        return None
    s = str(raw).strip()
    try:
        if s.endswith("Z"):
            dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        else:
            dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).isoformat()
    except ValueError:
        return s


def _side_from_item(item: dict, qty: float) -> str | None:
    order = item.get("order") if isinstance(item.get("order"), dict) else {}
    raw = str(order.get("side") or item.get("side") or item.get("buySell") or "").strip().lower()
    if "sell" in raw:
        return "sell"
    if "buy" in raw:
        return "buy"
    signed = _to_float(item.get("quantity") if item.get("quantity") is not None else (order.get("quantity") if order else None))
    if signed is not None and signed < 0:
        return "sell"
    if qty < 0:
        return "sell"
    if qty > 0 and (signed is not None or item.get("fill") or item.get("fillPrice") is not None):
        return "buy"
    return None


def _status_ok(raw: str) -> bool:
    s = str(raw or "").strip().lower().replace(" ", "_")
    if not s:
        return True
    if s in FILLED_STATUSES or "fill" in s:
        return True
    return False


def normalize_history_item(item: dict) -> dict | None:
    """Map one T212 history row to the Alpaca-like fill shape. Never copies broker P&L."""
    if not isinstance(item, dict):
        return None
    fill = item.get("fill") if isinstance(item.get("fill"), dict) else {}
    order = item.get("order") if isinstance(item.get("order"), dict) else {}
    instrument = order.get("instrument") if isinstance(order.get("instrument"), dict) else {}

    fill_type = str(fill.get("type") or "").strip().upper()
    if fill_type and fill_type.lower() in SKIP_FILL_TYPES:
        return None

    status = str(order.get("status") or item.get("status") or "")
    if not _status_ok(status):
        return None

    ticker = (
        fill.get("ticker")
        or order.get("ticker")
        or instrument.get("ticker")
        or item.get("ticker")
        or ""
    )
    symbol = map_t212_ticker(str(ticker))
    if not symbol:
        return None

    qty = _to_float(fill.get("quantity"))
    if qty is None:
        qty = _to_float(order.get("filledQuantity"))
    if qty is None:
        qty = _to_float(item.get("filledQuantity"))
    if qty is None:
        qty = _to_float(item.get("quantity"))
    if qty is None or qty == 0:
        return None
    qty_abs = abs(qty)

    price = _to_float(fill.get("price"))
    if price is None:
        price = _to_float(item.get("fillPrice"))
    if price is None:
        filled_value = _to_float(order.get("filledValue") or item.get("filledValue"))
        if filled_value is not None and qty_abs:
            price = abs(filled_value) / qty_abs
    if price is None or price <= 0:
        return None

    side = _side_from_item(item, qty)
    if side not in {"buy", "sell"}:
        return None

    fill_id = fill.get("id")
    order_id = order.get("id") if order else item.get("id")
    if fill_id not in (None, ""):
        external_id = f"t212:fill:{fill_id}"
    elif order_id not in (None, ""):
        external_id = f"t212:order:{order_id}"
    else:
        filled_at_raw = fill.get("filledAt") or item.get("dateExecuted") or item.get("dateCreated") or ""
        external_id = f"t212:{symbol}:{side}:{filled_at_raw}:{qty_abs}:{price}"

    filled_at = _iso(
        fill.get("filledAt")
        or item.get("dateExecuted")
        or item.get("dateModified")
        or order.get("createdAt")
        or item.get("dateCreated")
    )
    submitted_at = _iso(order.get("createdAt") or item.get("dateCreated")) or filled_at

    return {
        "id": str(external_id),
        "symbol": symbol,
        "side": side,
        "qty": qty_abs,
        "filled_qty": qty_abs,
        "filled_avg_price": price,
        "status": "filled",
        "submitted_at": submitted_at,
        "filled_at": filled_at,
    }


def normalize_history_items(items: list) -> list[dict]:
    """Dedupe by fill id. Does not attach realisedProfitLoss / P&L."""
    out: list[dict] = []
    seen: set[str] = set()
    for item in items or []:
        mapped = normalize_history_item(item)
        if not mapped:
            continue
        if mapped["id"] in seen:
            continue
        seen.add(mapped["id"])
        out.append(mapped)
    out.sort(key=lambda o: o.get("filled_at") or "", reverse=True)
    return out


def normalize_positions(rows: list) -> list[dict]:
    out: list[dict] = []
    for p in rows or []:
        if not isinstance(p, dict):
            continue
        symbol = map_t212_ticker(p.get("ticker") or p.get("symbol"))
        qty = _to_float(p.get("quantity") if p.get("quantity") is not None else p.get("qty"))
        if not symbol or qty is None or qty == 0:
            continue
        avg = _to_float(p.get("averagePrice") or p.get("avg_entry_price"))
        current = _to_float(p.get("currentPrice"))
        market_value = None
        if current is not None:
            market_value = current * qty
        out.append(
            {
                "symbol": symbol,
                "qty": qty,
                "avg_entry_price": avg,
                "market_value": market_value,
                "unrealized_pl": _to_float(p.get("ppl") if p.get("ppl") is not None else p.get("unrealized_pl")),
            }
        )
    return out


def _safe_next_path(next_page_path: str | None) -> str | None:
    if not next_page_path:
        return None
    path = str(next_page_path).strip()
    prefix = LIVE_BASE.rstrip("/")
    if path.startswith(prefix):
        path = path[len(prefix) :]
    if path.startswith("http://") or path.startswith("https://"):
        return None
    if not path.startswith(HISTORY_PATH):
        return None
    if ".." in path or "\n" in path or "\r" in path:
        return None
    return path


def _header_map(headers) -> dict:
    if hasattr(headers, "items"):
        return {str(k).lower(): str(v) for k, v in headers.items()}
    return {}


def _default_http_get(url: str, headers: dict, timeout: float) -> tuple[int, bytes, dict]:
    req = Request(url, headers=headers, method="GET")
    try:
        with urlopen(req, timeout=timeout) as resp:
            return int(resp.status), resp.read(), _header_map(resp.headers)
    except HTTPError as exc:
        body = b""
        try:
            body = exc.read() or b""
        except Exception:
            body = b""
        return int(exc.code), body, _header_map(getattr(exc, "headers", {}) or {})


def _decode_json(raw: bytes):
    text = raw.decode("utf-8", errors="replace") if raw else ""
    if not text.strip():
        return None
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=502, detail="Trading 212 returned invalid JSON.") from exc


def t212_get(
    path: str,
    *,
    key: str,
    secret: str,
    timeout: float = 30.0,
    http_get: HttpGet | None = None,
    sleeper: Callable[[float], None] | None = None,
    attempts: int = 4,
) -> tuple[dict | list, dict, str | None]:
    if not path.startswith("/"):
        raise HTTPException(status_code=500, detail="Invalid Trading 212 path.")
    if not path.startswith("/api/v0/equity/"):
        raise HTTPException(status_code=500, detail="Refusing non-equity Trading 212 path.")
    # Read-only: this helper is GET-only. Never call order-write URLs.
    if "/orders/limit" in path or "/orders/market" in path or "/orders/stop" in path:
        raise HTTPException(status_code=500, detail="Refusing Trading 212 order-write path.")

    getter = http_get or _default_http_get
    sleep_fn = sleeper or time.sleep
    url = LIVE_BASE.rstrip("/") + path
    headers = {
        "Authorization": _basic_header(key, secret),
        "Accept": "application/json",
        "User-Agent": USER_AGENT,
    }
    last_status = 0
    last_body = ""
    for i in range(attempts):
        try:
            status, body, resp_headers = getter(url, headers, timeout)
        except URLError as exc:
            raise HTTPException(
                status_code=502,
                detail="Trading 212 is unreachable.",
            ) from exc
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(
                status_code=502,
                detail="Trading 212 request failed.",
            ) from exc
        last_status = status
        last_body = body.decode("utf-8", errors="replace") if body else ""
        if status == 429 and i < attempts - 1:
            reset = _to_float((resp_headers or {}).get("x-ratelimit-reset"))
            now = time.time()
            wait = 2.0 * (i + 1)
            if reset and reset > now:
                wait = min(max(reset - now, 1.0), RETRY_CAP_S)
            sleep_fn(wait)
            continue
        if status >= 400:
            raise _public_http_error(status, last_body, key, secret)
        payload = _decode_json(body)
        remaining = (resp_headers or {}).get("x-ratelimit-remaining")
        return payload if payload is not None else {}, resp_headers, remaining
    raise _public_http_error(last_status or 429, last_body, key, secret)


def fetch_history_orders(
    *,
    key: str,
    secret: str,
    http_get: HttpGet | None = None,
    sleeper: Callable[[float], None] | None = None,
    now_fn: Callable[[], float] | None = None,
) -> list[dict]:
    """Paginate historical orders. Respects 6 req/min via 429 + remaining headers."""
    sleep_fn = sleeper or time.sleep
    now = now_fn or time.time
    deadline = now() + SYNC_BUDGET_S
    path: str | None = f"{HISTORY_PATH}?limit={HISTORY_LIMIT}"
    items: list = []
    pages = 0
    while path and pages < MAX_PAGES and now() < deadline:
        payload, headers, remaining = t212_get(
            path,
            key=key,
            secret=secret,
            http_get=http_get,
            sleeper=sleeper,
        )
        pages += 1
        if isinstance(payload, dict):
            chunk = payload.get("items") or []
            items.extend(chunk)
            path = _safe_next_path(payload.get("nextPagePath"))
        elif isinstance(payload, list):
            items.extend(payload)
            path = None
        else:
            break
        if path:
            rem = _to_float(remaining if remaining is not None else (headers or {}).get("x-ratelimit-remaining"))
            if rem is not None and rem <= 0:
                reset = _to_float((headers or {}).get("x-ratelimit-reset"))
                wait = min(max((reset or 0) - now(), 1.0), max(0.0, deadline - now()))
                if wait <= 0:
                    break
                sleep_fn(min(wait, RETRY_CAP_S))
    return normalize_history_items(items)


def fetch_positions(
    *,
    key: str,
    secret: str,
    http_get: HttpGet | None = None,
    sleeper: Callable[[float], None] | None = None,
) -> list[dict]:
    payload, _, _ = t212_get(
        POSITIONS_PATH,
        key=key,
        secret=secret,
        http_get=http_get,
        sleeper=sleeper,
    )
    rows = payload if isinstance(payload, list) else (payload.get("items") if isinstance(payload, dict) else [])
    return normalize_positions(rows or [])
