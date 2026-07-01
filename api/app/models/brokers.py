from pydantic import BaseModel, Field


class AlpacaConnectRequest(BaseModel):
    api_key: str = Field(min_length=8)
    api_secret: str = Field(min_length=8)
    paper: bool = True


class BrokerStatusResponse(BaseModel):
    broker: str
    connected: bool
    paper: bool | None = None
    equity: float | None = None
    cash: float | None = None
    buying_power: float | None = None
    position_count: int | None = None
    error: str | None = None


class SyncResponse(BaseModel):
    broker: str
    positions: list[dict]
    recent_orders: list[dict]
    as_of: str
