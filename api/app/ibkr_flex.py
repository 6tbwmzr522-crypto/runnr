"""IBKR Flex Web Service — read-only trade pull."""

from __future__ import annotations

import re
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from fastapi import HTTPException

FLEX_SEND_URLS = [
    "https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService/SendRequest",
    "https://gdcdyn.interactivebrokers.com/Universal/servlet/FlexStatementService.SendRequest",
]
FLEX_GET_URLS = [
    "https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService/GetStatement",
    "https://gdcdyn.interactivebrokers.com/Universal/servlet/FlexStatementService.GetStatement",
]

USER_AGENT = "Runnr/1.0 (read-only Flex sync; +https://runnr.fyi)"


def _http_get(url: str, timeout: float = 30.0) -> str:
    req = Request(url, headers={"User-Agent": USER_AGENT})
    with urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", errors="replace")


def _parse_xml(text: str) -> ET.Element:
    try:
        return ET.fromstring(text)
    except ET.ParseError as exc:
        raise HTTPException(status_code=502, detail=f"IBKR Flex returned invalid XML: {exc}") from exc


def _flex_status(root: ET.Element) -> tuple[str, str | None, str | None]:
    """Return (status, reference_code_or_error, error_code)."""
    status = (root.findtext("Status") or root.get("status") or "").strip()
    ref = (root.findtext("ReferenceCode") or root.findtext("Reference") or "").strip() or None
    err = (root.findtext("ErrorCode") or root.findtext("ErrorMessage") or root.findtext("Error") or "").strip() or None
    if not status and root.tag.lower().endswith("flexqueryresponse"):
        status = "Success"
    return status, ref, err


def send_flex_request(token: str, query_id: str) -> str:
    """Initiate Flex query; return reference code."""
    params = urlencode({"t": token, "q": query_id, "v": "3"})
    last_err = "IBKR Flex SendRequest failed"
    for base in FLEX_SEND_URLS:
        try:
            body = _http_get(f"{base}?{params}", timeout=45.0)
            root = _parse_xml(body)
            status, ref, err = _flex_status(root)
            if status.lower() == "success" and ref:
                return ref
            last_err = err or status or body[:200]
        except HTTPException:
            raise
        except Exception as exc:
            last_err = str(exc)
            continue
    raise HTTPException(status_code=400, detail=f"IBKR Flex auth/request failed: {last_err}")


def get_flex_statement(token: str, reference_code: str, *, attempts: int = 8, delay_s: float = 2.0) -> str:
    """Poll GetStatement until the report is ready; return raw XML/CSV text."""
    params = urlencode({"t": token, "q": reference_code, "v": "3"})
    last_err = "timed out waiting for Flex statement"
    for _ in range(attempts):
        for base in FLEX_GET_URLS:
            try:
                body = _http_get(f"{base}?{params}", timeout=60.0)
                if body.lstrip().startswith("<"):
                    root = _parse_xml(body)
                    status, _, err = _flex_status(root)
                    # Statement not ready yet
                    if status and status.lower() in {"warn", "warning", "fail", "failure"}:
                        code = (root.findtext("ErrorCode") or "").strip()
                        # 1019 / 1001 style "statement generation in progress"
                        if code in {"1019", "1001", "1099"} or "generation in progress" in (err or "").lower():
                            last_err = err or "statement generation in progress"
                            break
                        if status.lower().startswith("fail"):
                            raise HTTPException(
                                status_code=400,
                                detail=f"IBKR Flex GetStatement failed: {err or status}",
                            )
                    # Real FlexQueryResponse with trades
                    if root.tag.lower().endswith("flexqueryresponse") or root.find(".//Trade") is not None:
                        return body
                    last_err = err or status or "waiting for statement"
                    break
                # CSV / plain text payload
                if "Symbol" in body or "symbol" in body or "Trade" in body:
                    return body
                last_err = "unexpected Flex response"
                break
            except HTTPException:
                raise
            except Exception as exc:
                last_err = str(exc)
                continue
        time.sleep(delay_s)
    raise HTTPException(status_code=502, detail=f"IBKR Flex sync failed: {last_err}")


def _ibkr_datetime(raw: str | None) -> str | None:
    if not raw:
        return None
    s = str(raw).strip()
    m = re.match(r"^(\d{4})(\d{2})(\d{2})(?:[;T\s](\d{2}):?(\d{2}):?(\d{2}))?", s)
    if m:
        iso = f"{m.group(1)}-{m.group(2)}-{m.group(3)}T{m.group(4) or '12'}:{m.group(5) or '00'}:{m.group(6) or '00'}Z"
        try:
            return datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(timezone.utc).isoformat()
        except ValueError:
            return iso
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone(timezone.utc).isoformat()
    except ValueError:
        return None


def _attr(el: ET.Element, *names: str) -> str:
    for n in names:
        if n in el.attrib and str(el.attrib[n]).strip():
            return str(el.attrib[n]).strip()
        child = el.find(n)
        if child is not None and (child.text or "").strip():
            return child.text.strip()
    return ""


def parse_flex_trades(payload: str, limit: int = 200) -> list[dict]:
    """Parse Flex XML (preferred) or fall back to empty if CSV-only without XML trades."""
    text = payload.lstrip()
    if not text.startswith("<"):
        return []

    root = _parse_xml(text)
    trades: list[dict] = []
    for el in root.iter():
        tag = el.tag.split("}")[-1] if "}" in el.tag else el.tag
        if tag not in {"Trade", "Order", "trade", "order"}:
            continue
        asset = _attr(el, "assetCategory", "AssetCategory").lower()
        if asset and asset not in {"", "stk", "stock", "stocks", "etf", "equity", "adr", "fund"}:
            if any(x in asset for x in ("opt", "fut", "forex", "fx", "bond", "war", "cfd")):
                continue
        symbol = _attr(el, "symbol", "Symbol", "underlyingSymbol", "UnderlyingSymbol").upper()
        if not symbol:
            continue
        side_raw = _attr(el, "buySell", "Buy/Sell", "side", "Side").lower()
        if "sell" in side_raw or side_raw == "s":
            side = "sell"
        elif "buy" in side_raw or side_raw == "b":
            side = "buy"
        else:
            continue
        try:
            qty = abs(float(_attr(el, "quantity", "Quantity") or "0"))
            price = float(_attr(el, "tradePrice", "TradePrice", "price", "Price") or "0")
        except ValueError:
            continue
        if qty <= 0 or price <= 0:
            continue
        filled_at = _ibkr_datetime(
            _attr(el, "dateTime", "DateTime", "tradeDate", "TradeDate", "dateTime")
        )
        trade_id = _attr(el, "ibOrderID", "tradeID", "transactionID", "ibExecID") or (
            f"ibkr:{symbol}:{side}:{filled_at}:{qty}:{price}"
        )
        trades.append(
            {
                "id": str(trade_id),
                "symbol": symbol,
                "side": side,
                "qty": qty,
                "filled_qty": qty,
                "filled_avg_price": price,
                "status": "filled",
                "submitted_at": filled_at,
                "filled_at": filled_at,
            }
        )
        if len(trades) >= limit:
            break

    # Newest first for API symmetry with Alpaca; client re-sorts oldest-first
    trades.sort(key=lambda o: o.get("filled_at") or "", reverse=True)
    return trades


def verify_flex_credentials(token: str, query_id: str) -> None:
    """Lightweight validation: token + query id must look usable, then SendRequest."""
    if not re.fullmatch(r"\d{6,}", str(token).strip()):
        raise HTTPException(status_code=400, detail="IBKR Flex token should be a numeric token from Account Management")
    if not re.fullmatch(r"\d{4,}", str(query_id).strip()):
        raise HTTPException(status_code=400, detail="IBKR Flex Query ID should be numeric")
    send_flex_request(str(token).strip(), str(query_id).strip())
