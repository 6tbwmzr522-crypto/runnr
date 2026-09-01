from datetime import datetime, timezone

from alpaca.trading.client import TradingClient
from alpaca.trading.requests import GetOrdersRequest
from alpaca.trading.enums import QueryOrderStatus
from fastapi import APIRouter, Depends, HTTPException

from app.auth import get_current_user
from app.crypto_util import decrypt, encrypt
from app.db import get_db
from app.ibkr_flex import get_flex_statement, parse_flex_trades, send_flex_request, verify_flex_credentials
from app.t212 import fetch_history_orders, fetch_positions
from app.models.brokers import (
    AlpacaConnectRequest,
    BrokerStatusResponse,
    IbkrFlexConnectRequest,
    SyncResponse,
    T212ConnectRequest,
)

router = APIRouter(prefix="/brokers", tags=["brokers"])

T212_NOT_CONNECTED_FOR_ACCOUNT = (
    "Trading 212 is not connected for this account. Connect a read-only key on the Sync page."
)


def _save_alpaca(user_id: int, body: AlpacaConnectRequest) -> None:
    with get_db() as conn:
        conn.execute(
            """
            INSERT INTO broker_connections (user_id, broker, api_key_enc, api_secret_enc, paper)
            VALUES (?, 'alpaca', ?, ?, ?)
            ON CONFLICT(user_id, broker) DO UPDATE SET
                api_key_enc = excluded.api_key_enc,
                api_secret_enc = excluded.api_secret_enc,
                paper = excluded.paper
            """,
            (user_id, encrypt(body.api_key), encrypt(body.api_secret), int(body.paper)),
        )


def _load_alpaca(user_id: int) -> tuple[str, str, bool] | None:
    with get_db() as conn:
        row = conn.execute(
            """
            SELECT api_key_enc, api_secret_enc, paper
            FROM broker_connections
            WHERE user_id = ? AND broker = 'alpaca'
            """,
            (user_id,),
        ).fetchone()
    if not row:
        return None
    return decrypt(row["api_key_enc"]), decrypt(row["api_secret_enc"]), bool(row["paper"])


def _client(user_id: int) -> TradingClient:
    creds = _load_alpaca(user_id)
    if not creds:
        raise HTTPException(status_code=404, detail="Alpaca not connected")
    key, secret, paper = creds
    return TradingClient(key, secret, paper=paper)


@router.post("/alpaca/connect", response_model=BrokerStatusResponse)
def connect_alpaca(body: AlpacaConnectRequest, user: dict = Depends(get_current_user)):
    client = TradingClient(body.api_key, body.api_secret, paper=body.paper)
    try:
        account = client.get_account()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Alpaca auth failed: {exc}") from exc

    _save_alpaca(user["id"], body)
    positions = client.get_all_positions()
    return BrokerStatusResponse(
        broker="alpaca",
        connected=True,
        paper=body.paper,
        equity=float(account.equity),
        cash=float(account.cash),
        buying_power=float(account.buying_power),
        position_count=len(positions),
    )


@router.get("/alpaca/status", response_model=BrokerStatusResponse)
def alpaca_status(user: dict = Depends(get_current_user)):
    creds = _load_alpaca(user["id"])
    if not creds:
        return BrokerStatusResponse(broker="alpaca", connected=False)

    key, secret, paper = creds
    try:
        client = TradingClient(key, secret, paper=paper)
        account = client.get_account()
        positions = client.get_all_positions()
        return BrokerStatusResponse(
            broker="alpaca",
            connected=True,
            paper=paper,
            equity=float(account.equity),
            cash=float(account.cash),
            buying_power=float(account.buying_power),
            position_count=len(positions),
        )
    except Exception as exc:
        return BrokerStatusResponse(broker="alpaca", connected=False, error=str(exc))


@router.get("/alpaca/sync", response_model=SyncResponse)
def alpaca_sync(user: dict = Depends(get_current_user)):
    client = _client(user["id"])
    try:
        account = client.get_account()
        positions = client.get_all_positions()
        orders = client.get_orders(GetOrdersRequest(status=QueryOrderStatus.CLOSED, limit=100))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Alpaca sync failed: {exc}") from exc

    return SyncResponse(
        broker="alpaca",
        equity=float(account.equity),
        cash=float(account.cash),
        buying_power=float(account.buying_power),
        positions=[
            {
                "symbol": p.symbol,
                "qty": float(p.qty),
                "avg_entry_price": float(p.avg_entry_price) if getattr(p, "avg_entry_price", None) else None,
                "market_value": float(p.market_value),
                "unrealized_pl": float(p.unrealized_pl),
                "unrealized_plpc": float(p.unrealized_plpc) * 100,
            }
            for p in positions
        ],
        recent_orders=[
            {
                "id": str(o.id),
                "symbol": o.symbol,
                "side": str(o.side),
                "qty": float(o.qty) if o.qty else None,
                "filled_qty": float(o.filled_qty) if o.filled_qty else None,
                "filled_avg_price": (
                    float(o.filled_avg_price)
                    if o.filled_avg_price
                    else (
                        float(o.notional) / float(o.filled_qty)
                        if getattr(o, "notional", None) and o.filled_qty
                        else None
                    )
                ),
                "status": str(o.status),
                "submitted_at": o.submitted_at.isoformat() if o.submitted_at else None,
                "filled_at": o.filled_at.isoformat() if o.filled_at else None,
            }
            for o in orders
        ],
        as_of=datetime.now(timezone.utc).isoformat(),
    )


def _save_ibkr(user_id: int, token: str, query_id: str) -> None:
    with get_db() as conn:
        conn.execute(
            """
            INSERT INTO broker_connections (user_id, broker, api_key_enc, api_secret_enc, paper)
            VALUES (?, 'ibkr', ?, ?, 0)
            ON CONFLICT(user_id, broker) DO UPDATE SET
                api_key_enc = excluded.api_key_enc,
                api_secret_enc = excluded.api_secret_enc,
                paper = 0
            """,
            (user_id, encrypt(token), encrypt(query_id)),
        )


def _load_ibkr(user_id: int) -> tuple[str, str] | None:
    with get_db() as conn:
        row = conn.execute(
            """
            SELECT api_key_enc, api_secret_enc
            FROM broker_connections
            WHERE user_id = ? AND broker = 'ibkr'
            """,
            (user_id,),
        ).fetchone()
    if not row:
        return None
    return decrypt(row["api_key_enc"]), decrypt(row["api_secret_enc"])


@router.post("/ibkr/connect", response_model=BrokerStatusResponse)
def connect_ibkr(body: IbkrFlexConnectRequest, user: dict = Depends(get_current_user)):
    token = body.token.strip()
    query_id = body.query_id.strip()
    verify_flex_credentials(token, query_id)
    _save_ibkr(user["id"], token, query_id)
    return BrokerStatusResponse(broker="ibkr", connected=True)


@router.get("/ibkr/status", response_model=BrokerStatusResponse)
def ibkr_status(user: dict = Depends(get_current_user)):
    creds = _load_ibkr(user["id"])
    if not creds:
        return BrokerStatusResponse(broker="ibkr", connected=False)
    return BrokerStatusResponse(broker="ibkr", connected=True)


@router.get("/ibkr/sync", response_model=SyncResponse)
def ibkr_sync(user: dict = Depends(get_current_user)):
    creds = _load_ibkr(user["id"])
    if not creds:
        raise HTTPException(status_code=404, detail="IBKR Flex not connected")
    token, query_id = creds
    try:
        ref = send_flex_request(token, query_id)
        payload = get_flex_statement(token, ref)
        orders = parse_flex_trades(payload)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"IBKR Flex sync failed: {exc}") from exc

    return SyncResponse(
        broker="ibkr",
        positions=[],
        recent_orders=orders,
        as_of=datetime.now(timezone.utc).isoformat(),
    )


def _save_t212(user_id: int, api_key: str, api_secret: str) -> None:
    with get_db() as conn:
        conn.execute(
            """
            INSERT INTO broker_connections (user_id, broker, api_key_enc, api_secret_enc, paper)
            VALUES (?, 't212', ?, ?, 0)
            ON CONFLICT(user_id, broker) DO UPDATE SET
                api_key_enc = excluded.api_key_enc,
                api_secret_enc = excluded.api_secret_enc,
                paper = 0
            """,
            (user_id, encrypt(api_key), encrypt(api_secret)),
        )


def _load_t212(user_id: int) -> tuple[str, str] | None:
    with get_db() as conn:
        row = conn.execute(
            """
            SELECT api_key_enc, api_secret_enc
            FROM broker_connections
            WHERE user_id = ? AND broker = 't212'
            """,
            (user_id,),
        ).fetchone()
    if not row:
        return None
    return decrypt(row["api_key_enc"]), decrypt(row["api_secret_enc"])


@router.post("/t212/connect", response_model=BrokerStatusResponse)
def connect_t212(body: T212ConnectRequest, user: dict = Depends(get_current_user)):
    key = body.api_key.strip()
    secret = body.api_secret.strip()
    try:
        positions = fetch_positions(key=key, secret=secret)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=400,
            detail="Trading 212 rejected the API credentials. Use a read-only key (account, history, portfolio).",
        ) from None

    _save_t212(user["id"], key, secret)
    return BrokerStatusResponse(
        broker="t212",
        connected=True,
        position_count=len(positions),
    )


@router.get("/t212/status", response_model=BrokerStatusResponse)
def t212_status(user: dict = Depends(get_current_user)):
    creds = _load_t212(user["id"])
    if not creds:
        raise HTTPException(status_code=404, detail=T212_NOT_CONNECTED_FOR_ACCOUNT)
    return BrokerStatusResponse(broker="t212", connected=True)


@router.get("/t212/sync", response_model=SyncResponse)
def t212_sync(user: dict = Depends(get_current_user)):
    creds = _load_t212(user["id"])
    if not creds:
        raise HTTPException(status_code=404, detail=T212_NOT_CONNECTED_FOR_ACCOUNT)
    key, secret = creds
    try:
        positions = fetch_positions(key=key, secret=secret)
        orders = fetch_history_orders(key=key, secret=secret)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=502, detail="Trading 212 sync failed.") from None

    return SyncResponse(
        broker="t212",
        positions=positions,
        recent_orders=orders,
        as_of=datetime.now(timezone.utc).isoformat(),
    )
