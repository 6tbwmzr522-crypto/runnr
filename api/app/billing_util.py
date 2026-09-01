from __future__ import annotations

from app.config import settings


PRO_STATUSES = frozenset({"active", "trialing"})
_DEFAULT_BOSS = (
    "janis@thinicedigital.com,"
    "info@thinicedigital.com,"
    "berzins.j@inbox.lv"
)


def boss_emails() -> set[str]:
    raw = (settings.runnr_boss_emails or "").strip() or _DEFAULT_BOSS
    return {e.strip().lower() for e in raw.split(",") if e.strip()}


def email_is_boss(email: str | None) -> bool:
    """Founder / house accounts skip Stripe and email confirm."""
    e = (email or "").strip().lower()
    return bool(e) and e in boss_emails()


def subscription_is_pro(status: str | None, plan: str | None = None, email: str | None = None) -> bool:
    """True when the user has an active Runnr subscription or is a boss account.

    ``subscription_status`` is authoritative. A leftover plan of monthly/yearly/pro
    does not grant Pro when status is canceled, past_due, unpaid, or free.
    ``plan`` is kept on the signature for callers; it is not a substitute for status.
    """
    if email_is_boss(email):
        return True
    if not settings.stripe_enabled:
        # Billing not configured — keep app usable (dev / pre-Stripe).
        return True
    st = (status or "free").lower()
    return st in PRO_STATUSES


def user_has_pro_access(user: dict | None) -> bool:
    """Boss/Pro, or billing disabled (dev). Used by journal cap and broker mutations."""
    if not user:
        return False
    if user.get("pro"):
        return True
    if user.get("billing_enabled") is False:
        return True
    return False


PRO_REQUIRED_DETAIL = "Upgrade to Runnr Pro to use this feature."


def plan_from_price_id(price_id: str | None) -> str:
    if not price_id:
        return "pro"
    if price_id == settings.stripe_price_yearly:
        return "yearly"
    if price_id == settings.stripe_price_monthly:
        return "monthly"
    return "pro"
