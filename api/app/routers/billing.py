from __future__ import annotations

import secrets
import time

import stripe
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse

from app.auth import get_current_user
from app.billing_util import plan_from_price_id, subscription_is_pro
from app.config import settings
from app.db import get_db
from app.models.billing import (
    BillingStatusResponse,
    CheckoutRequest,
    CheckoutResponse,
    PortalResponse,
)

router = APIRouter(prefix="/billing", tags=["billing"])

# short-lived checkout tickets: code -> {user_id, interval, exp}
_CHECKOUT_TICKETS: dict[str, dict] = {}


def _stripe() -> None:
    if not settings.stripe_enabled:
        raise HTTPException(status_code=503, detail="Stripe is not configured")
    stripe.api_key = settings.stripe_secret_key
    # Account uses Managed Payments — requires basil+ (dashboard default is dahlia).
    stripe.api_version = "2026-07-29.dahlia"
    stripe.max_network_retries = 1


def _load_user(user_id: int) -> dict:
    with get_db() as conn:
        row = conn.execute(
            """
            SELECT id, email, stripe_customer_id, subscription_status, plan, stripe_subscription_id
            FROM users WHERE id = ?
            """,
            (user_id,),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    return dict(row)


def _save_customer(user_id: int, customer_id: str) -> None:
    with get_db() as conn:
        conn.execute(
            "UPDATE users SET stripe_customer_id = ? WHERE id = ?",
            (customer_id, user_id),
        )


def _set_subscription(
    *,
    user_id: int | None = None,
    customer_id: str | None = None,
    status: str,
    plan: str,
    subscription_id: str | None = None,
) -> None:
    with get_db() as conn:
        if user_id is not None:
            conn.execute(
                """
                UPDATE users
                SET subscription_status = ?, plan = ?, stripe_subscription_id = COALESCE(?, stripe_subscription_id)
                WHERE id = ?
                """,
                (status, plan, subscription_id, user_id),
            )
        elif customer_id:
            conn.execute(
                """
                UPDATE users
                SET subscription_status = ?, plan = ?, stripe_subscription_id = COALESCE(?, stripe_subscription_id)
                WHERE stripe_customer_id = ?
                """,
                (status, plan, subscription_id, customer_id),
            )


def _ensure_customer(user: dict) -> str:
    existing = user.get("stripe_customer_id")
    if existing:
        return existing
    try:
        customer = stripe.Customer.create(
            email=user["email"],
            metadata={"runnr_user_id": str(user["id"])},
        )
    except stripe.error.StripeError as exc:
        raise HTTPException(status_code=502, detail=f"Stripe customer error: {exc.user_message or exc}") from exc
    _save_customer(user["id"], customer.id)
    return customer.id


def _price_for_interval(interval: str) -> str:
    if interval == "year":
        price = (settings.stripe_price_yearly or "").strip()
        if not price:
            raise HTTPException(status_code=400, detail="Yearly price not configured")
        return price
    price = (settings.stripe_price_monthly or "").strip()
    if not price:
        raise HTTPException(status_code=400, detail="Monthly price not configured")
    return price


def _purge_tickets() -> None:
    now = time.time()
    dead = [k for k, v in _CHECKOUT_TICKETS.items() if v.get("exp", 0) < now]
    for k in dead:
        _CHECKOUT_TICKETS.pop(k, None)


def _create_checkout_session(user: dict, interval: str) -> str:
    """Create Stripe Checkout session; return hosted URL."""
    _stripe()
    if subscription_is_pro(user.get("subscription_status"), user.get("plan"), user.get("email")):
        raise HTTPException(status_code=400, detail="Already subscribed — manage billing in the portal")
    try:
        customer_id = _ensure_customer(user)
        price_id = _price_for_interval(interval)
        session = stripe.checkout.Session.create(
            mode="subscription",
            customer=customer_id,
            line_items=[{"price": price_id, "quantity": 1}],
            success_url=settings.stripe_success_url,
            cancel_url=settings.stripe_cancel_url,
            client_reference_id=str(user["id"]),
            metadata={"runnr_user_id": str(user["id"]), "interval": interval},
            subscription_data={"metadata": {"runnr_user_id": str(user["id"])}},
            allow_promotion_codes=True,
        )
    except stripe.error.StripeError as exc:
        raise HTTPException(status_code=502, detail=f"Stripe checkout error: {exc.user_message or exc}") from exc
    if not session.url:
        raise HTTPException(status_code=502, detail="Stripe did not return a checkout URL")
    return session.url


@router.get("/status", response_model=BillingStatusResponse)
def billing_status(user: dict = Depends(get_current_user)):
    row = _load_user(user["id"])
    status = row.get("subscription_status") or "free"
    plan = row.get("plan") or "free"
    return BillingStatusResponse(
        enabled=settings.stripe_enabled,
        pro=subscription_is_pro(status, plan, row.get("email")),
        plan=plan,
        status=status,
        publishable_key=settings.stripe_publishable_key or None,
        price_monthly=settings.stripe_price_monthly or None,
        price_yearly=settings.stripe_price_yearly or None,
    )


@router.post("/checkout", response_model=CheckoutResponse)
def create_checkout(body: CheckoutRequest, request: Request, user: dict = Depends(get_current_user)):
    """Mint a short-lived ticket, return a same-API redirect URL (avoids long browser fetch to Stripe)."""
    _stripe()
    row = _load_user(user["id"])
    if subscription_is_pro(row.get("subscription_status"), row.get("plan"), row.get("email")):
        raise HTTPException(status_code=400, detail="Already subscribed — manage billing in the portal")
    _purge_tickets()
    code = secrets.token_urlsafe(24)
    _CHECKOUT_TICKETS[code] = {
        "user_id": user["id"],
        "interval": body.interval,
        "exp": time.time() + 600,
    }
    # Prefer public HTTPS API host (Railway often reports http behind the TLS terminator)
    host = (request.url.hostname or "").lower()
    if host in {"localhost", "127.0.0.1"}:
        base = str(request.base_url).rstrip("/")
    else:
        base = "https://api.runnr.fyi"
    return CheckoutResponse(url=f"{base}/api/v1/billing/go/{code}")


@router.get("/go/{code}")
def checkout_go(code: str):
    """Browser navigates here → Stripe Checkout (no CORS/fetch)."""
    _purge_tickets()
    ticket = _CHECKOUT_TICKETS.pop(code, None)
    if not ticket:
        raise HTTPException(status_code=400, detail="Checkout link expired — go back and tap €19 again")
    user = _load_user(int(ticket["user_id"]))
    url = _create_checkout_session(user, ticket.get("interval") or "month")
    return RedirectResponse(url=url, status_code=303)


@router.post("/portal", response_model=PortalResponse)
def create_portal(user: dict = Depends(get_current_user)):
    _stripe()
    row = _load_user(user["id"])
    try:
        customer_id = row.get("stripe_customer_id") or _ensure_customer(row)
        session = stripe.billing_portal.Session.create(
            customer=customer_id,
            return_url="https://runnr.fyi/",
        )
    except stripe.error.StripeError as exc:
        raise HTTPException(status_code=502, detail=f"Stripe portal error: {exc.user_message or exc}") from exc
    if not session.url:
        raise HTTPException(status_code=502, detail="Stripe did not return a portal URL")
    return PortalResponse(url=session.url)


def _apply_subscription_object(sub: dict) -> None:
    customer_id = sub.get("customer")
    status = sub.get("status") or "free"
    sub_id = sub.get("id")
    price_id = None
    items = (sub.get("items") or {}).get("data") or []
    if items:
        price_id = (items[0].get("price") or {}).get("id")
    plan = plan_from_price_id(price_id) if status in ("active", "trialing") else "free"
    if status not in ("active", "trialing"):
        plan = "free"
    meta = sub.get("metadata") or {}
    user_id = None
    if meta.get("runnr_user_id"):
        try:
            user_id = int(meta["runnr_user_id"])
        except (TypeError, ValueError):
            user_id = None
    _set_subscription(
        user_id=user_id,
        customer_id=None if user_id is not None else customer_id,
        status=status if status in ("active", "trialing", "past_due", "canceled", "unpaid") else status,
        plan=plan if status in ("active", "trialing") else "free",
        subscription_id=sub_id,
    )


@router.post("/webhook")
async def stripe_webhook(request: Request):
    if not settings.stripe_secret_key:
        raise HTTPException(status_code=503, detail="Stripe is not configured")
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")
    secret = (settings.stripe_webhook_secret or "").strip()
    try:
        if secret:
            event = stripe.Webhook.construct_event(payload, sig, secret)
        else:
            import json

            event = stripe.Event.construct_from(json.loads(payload), settings.stripe_secret_key)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Webhook error: {exc}") from exc

    etype = event["type"]
    data = event["data"]["object"]

    if etype == "checkout.session.completed":
        user_id = None
        if data.get("client_reference_id"):
            try:
                user_id = int(data["client_reference_id"])
            except (TypeError, ValueError):
                user_id = None
        if not user_id and (data.get("metadata") or {}).get("runnr_user_id"):
            try:
                user_id = int(data["metadata"]["runnr_user_id"])
            except (TypeError, ValueError):
                user_id = None
        customer_id = data.get("customer")
        sub_id = data.get("subscription")
        if customer_id and user_id is not None:
            _save_customer(user_id, customer_id)
        if sub_id and settings.stripe_secret_key:
            stripe.api_key = settings.stripe_secret_key
            stripe.api_version = "2026-07-29.dahlia"
            try:
                sub = stripe.Subscription.retrieve(sub_id)
                _apply_subscription_object(sub)
            except stripe.error.StripeError:
                if user_id is not None:
                    _set_subscription(user_id=user_id, status="active", plan="pro", subscription_id=sub_id)
        elif user_id is not None:
            _set_subscription(
                user_id=user_id,
                status="active",
                plan="pro",
                subscription_id=sub_id,
            )

    elif etype in (
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
    ):
        _apply_subscription_object(data)

    return {"received": True}
