"""Free-plan journal cap — matches js/trade-limit.js.

Manual journal rows and imported fills (csv / t212 / ibkr / alpaca) share
FREE_TRADE_LIMIT. Demo seed trades and merged-away pair legs do not count.
"""

from __future__ import annotations

import json
from typing import Any

FREE_TRADE_LIMIT = 10
DEMO_TRADE_IDS = frozenset({1, 2, 3, 4})
IMPORT_SOURCES = frozenset({"alpaca", "csv", "ibkr", "t212"})
FREE_LIMIT_DETAIL = (
    "Free plan allows 10 trades (manual and imported). Upgrade for unlimited."
)


def is_demo_journal_trade(trade: Any) -> bool:
    if not isinstance(trade, dict):
        return False
    if trade.get("source"):
        return False
    try:
        return int(trade.get("id")) in DEMO_TRADE_IDS
    except (TypeError, ValueError):
        return False


def is_countable_journal_trade(trade: Any) -> bool:
    if not isinstance(trade, dict):
        return False
    if trade.get("mergedAway"):
        return False
    if is_demo_journal_trade(trade):
        return False
    return True


def count_journal_trades_for_limit(trades: Any) -> int:
    if not isinstance(trades, list):
        return 0
    return sum(1 for t in trades if is_countable_journal_trade(t))


def journal_is_unlimited(user: dict | None) -> bool:
    if not user:
        return False
    if user.get("pro"):
        return True
    if user.get("billing_enabled") is False:
        return True
    return False


def existing_countable_from_state_json(state_json: str | None) -> int:
    if not state_json:
        return 0
    try:
        state = json.loads(state_json)
    except (TypeError, ValueError):
        return 0
    if not isinstance(state, dict):
        return 0
    return count_journal_trades_for_limit(state.get("trades"))


def would_exceed_free_limit(new_count: int, existing_count: int) -> bool:
    """True when a free user grows the journal past the cap.

    Already-over-limit snapshots may stay (no delete). Growth beyond the
    stored count is blocked.
    """
    allowed = max(FREE_TRADE_LIMIT, existing_count)
    return new_count > allowed
