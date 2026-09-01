from app.trade_limit import (
    FREE_TRADE_LIMIT,
    count_journal_trades_for_limit,
    journal_is_unlimited,
    would_exceed_free_limit,
)


def test_demo_trades_do_not_count():
    demo = [
        {"id": 1, "isDemo": True, "instr": "RACE"},
        {"id": 2, "isDemo": True, "instr": "BE"},
        {"id": 3, "isDemo": True, "instr": "USDJPY"},
        {"id": 4, "isDemo": True, "instr": "AAPL CFD"},
    ]
    assert count_journal_trades_for_limit(demo) == 0


def test_crafted_ids_without_flag_count():
    crafted = [
        {"id": 1, "instr": "RACE"},
        {"id": 2, "instr": "BE"},
        {"id": 3, "instr": "USDJPY"},
        {"id": 4, "instr": "AAPL CFD"},
    ]
    assert count_journal_trades_for_limit(crafted) == 4


def test_seed_true_excluded():
    assert count_journal_trades_for_limit([{"id": 9, "seed": True}]) == 0


def test_imported_fills_count():
    trades = [{"id": 100 + i, "source": "t212", "instr": "AAPL"} for i in range(10)]
    assert count_journal_trades_for_limit(trades) == 10


def test_csv_ibkr_alpaca_count():
    trades = [
        {"id": 1, "source": "csv"},
        {"id": 2, "source": "ibkr"},
        {"id": 3, "source": "alpaca"},
    ]
    assert count_journal_trades_for_limit(trades) == 3


def test_merged_away_excluded():
    trades = [
        {"id": 10, "source": "t212"},
        {"id": 11, "source": "t212", "mergedAway": True},
    ]
    assert count_journal_trades_for_limit(trades) == 1


def test_demo_plus_imports():
    trades = [
        {"id": 1, "isDemo": True, "instr": "RACE"},
        {"id": 2, "isDemo": True, "instr": "BE"},
        {"id": 100, "source": "csv"},
    ]
    assert count_journal_trades_for_limit(trades) == 1


def test_unlimited_pro_and_billing_off():
    assert journal_is_unlimited({"pro": True, "billing_enabled": True}) is True
    assert journal_is_unlimited({"pro": False, "billing_enabled": False}) is True
    assert journal_is_unlimited({"pro": False, "billing_enabled": True}) is False


def test_existing_over_limit_may_stay_but_not_grow():
    assert would_exceed_free_limit(11, 0) is True
    assert would_exceed_free_limit(FREE_TRADE_LIMIT, 0) is False
    assert would_exceed_free_limit(15, 15) is False
    assert would_exceed_free_limit(16, 15) is True
