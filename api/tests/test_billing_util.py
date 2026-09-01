"""subscription_is_pro: status is authoritative; stale plan is not Pro."""

from pathlib import Path

from app.billing_util import subscription_is_pro, user_has_pro_access
from app.config import settings

BILLING_PY = Path(__file__).resolve().parents[1] / "app" / "routers" / "billing.py"


def _enable_billing(monkeypatch):
    monkeypatch.setattr(settings, "stripe_secret_key", "sk_test_limit")
    monkeypatch.setattr(settings, "stripe_price_monthly", "price_monthly_test")


def test_stale_plan_canceled_is_not_pro(monkeypatch):
    _enable_billing(monkeypatch)
    assert settings.stripe_enabled
    assert subscription_is_pro("canceled", "monthly", "user@example.com") is False
    assert subscription_is_pro("canceled", "yearly", "user@example.com") is False
    assert subscription_is_pro("canceled", "pro", "user@example.com") is False
    assert subscription_is_pro("past_due", "monthly", "user@example.com") is False
    assert subscription_is_pro("unpaid", "yearly", "user@example.com") is False
    assert subscription_is_pro("free", "pro", "user@example.com") is False


def test_active_and_trialing_are_pro(monkeypatch):
    _enable_billing(monkeypatch)
    assert subscription_is_pro("active", "monthly", "user@example.com") is True
    assert subscription_is_pro("trialing", "yearly", "user@example.com") is True
    assert subscription_is_pro("active", "free", "user@example.com") is True


def test_boss_email_is_pro_even_if_canceled(monkeypatch):
    _enable_billing(monkeypatch)
    assert subscription_is_pro("canceled", "free", "janis@thinicedigital.com") is True
    assert subscription_is_pro("free", "free", "info@thinicedigital.com") is True


def test_billing_disabled_is_unlimited(monkeypatch):
    monkeypatch.setattr(settings, "stripe_secret_key", "")
    monkeypatch.setattr(settings, "stripe_price_monthly", "")
    assert settings.stripe_enabled is False
    assert subscription_is_pro("canceled", "free", "user@example.com") is True


def test_user_has_pro_access_matches_journal_helper():
    assert user_has_pro_access({"pro": True, "billing_enabled": True}) is True
    assert user_has_pro_access({"pro": False, "billing_enabled": False}) is True
    assert user_has_pro_access({"pro": False, "billing_enabled": True}) is False
    assert user_has_pro_access(None) is False


def test_webhook_still_clears_plan_when_not_active():
    src = BILLING_PY.read_text(encoding="utf-8")
    assert 'plan = "free"' in src
    assert 'status not in ("active", "trialing")' in src
    assert "customer.subscription.deleted" in src
