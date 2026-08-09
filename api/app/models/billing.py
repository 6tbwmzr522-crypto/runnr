from pydantic import BaseModel, Field


class CheckoutRequest(BaseModel):
    interval: str = Field(pattern="^(month|year)$", default="month")


class CheckoutResponse(BaseModel):
    url: str


class PortalResponse(BaseModel):
    url: str


class BillingStatusResponse(BaseModel):
    enabled: bool
    pro: bool
    plan: str
    status: str
    publishable_key: str | None = None
    price_monthly: str | None = None
    price_yearly: str | None = None
