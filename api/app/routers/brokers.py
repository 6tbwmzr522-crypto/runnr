from datetime import datetime, timezone

from alpaca.trading.client import TradingClient
from alpaca.trading.requests import GetOrdersRequest
from alpaca.trading.enums import QueryOrderStatus
from fastapi import APIRouter, Depends, HTTPException

from app.auth import get_current_user
from app.crypto_util import decrypt, encrypt
from app.db import get_db
from app.models.brokers import AlpacaConnectRequest, BrokerStatusResponse, SyncResponse

router = APIRouter(prefix="/brokers", tags=["brokers"])


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
        positions = client.get_all_positions()
        orders = client.get_orders(GetOrdersRequest(status=QueryOrderStatus.CLOSED, limit=50))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Alpaca sync failed: {exc}") from exc

    return SyncResponse(
        broker="alpaca",
        positions=[
            {
                "symbol": p.symbol,
                "qty": float(p.qty),
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
                "status": str(o.status),
                "submitted_at": o.submitted_at.isoformat() if o.submitted_at else None,
                "filled_at": o.filled_at.isoformat() if o.filled_at else None,
            }
            for o in orders
        ],
        as_of=datetime.now(timezone.utc).isoformat(),
    )
