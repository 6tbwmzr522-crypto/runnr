#!/usr/bin/env python3
"""
Compute institutional tear-sheet metrics from a Baron backtest export.

Usage:
  python scripts/baron_tearsheet_metrics.py path/to/trades.csv
  python scripts/baron_tearsheet_metrics.py path/to/trades.csv --start 2022-01-01 --end 2026-12-31

CSV columns (header row required; names are flexible):
  date        — exit date (YYYY-MM-DD or YYYY-MM-DD HH:MM:SS)
  pnl         — realised P&L in account currency (required)
  equity      — optional; if missing, built from --capital + cumulative pnl

Example:
  date,pnl
  2022-03-15,1250.50
  2022-03-22,-840.00
"""

from __future__ import annotations

import argparse
import csv
import math
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path


DATE_KEYS = ("date", "exit_date", "close_date", "timestamp", "time")
PNL_KEYS = ("pnl", "profit", "net_pnl", "pl", "realized_pnl")
EQ_KEYS = ("equity", "balance", "portfolio_value")


def pick(row: dict, keys: tuple[str, ...]) -> str | None:
    lower = {k.lower().strip(): v for k, v in row.items()}
    for k in keys:
        if k in lower and str(lower[k]).strip():
            return str(lower[k]).strip()
    return None


def parse_date(s: str) -> datetime:
    for fmt in (
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d",
        "%d/%m/%Y",
        "%m/%d/%Y",
        "%Y/%m/%d",
    ):
        try:
            return datetime.strptime(s[:19] if " " in s else s, fmt.replace(" %H:%M:%S", "") if " " not in s else fmt)
        except ValueError:
            continue
    raise ValueError(f"Unrecognised date: {s!r}")


def load_trades(path: Path, start: datetime | None, end: datetime | None) -> list[dict]:
    rows: list[dict] = []
    with path.open(newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            ds = pick(row, DATE_KEYS)
            ps = pick(row, PNL_KEYS)
            if not ds or ps is None:
                continue
            try:
                dt = parse_date(ds)
                pnl = float(str(ps).replace(",", "").replace("$", ""))
            except (ValueError, TypeError):
                continue
            if start and dt < start:
                continue
            if end and dt > end:
                continue
            eqs = pick(row, EQ_KEYS)
            equity = float(eqs.replace(",", "").replace("$", "")) if eqs else None
            rows.append({"date": dt, "pnl": pnl, "equity": equity})
    rows.sort(key=lambda r: r["date"])
    return rows


def build_equity(trades: list[dict], capital: float) -> list[float]:
    eq = capital
    curve = [eq]
    for t in trades:
        if t["equity"] is not None:
            eq = t["equity"]
        else:
            eq += t["pnl"]
        curve.append(eq)
    return curve


def max_drawdown(curve: list[float]) -> tuple[float, float, float]:
    peak = curve[0]
    max_dd_abs = 0.0
    max_dd_pct = 0.0
    for eq in curve:
        if eq > peak:
            peak = eq
        dd = peak - eq
        if dd > max_dd_abs:
            max_dd_abs = dd
            max_dd_pct = (dd / peak * 100) if peak > 0 else 0.0
    return max_dd_abs, max_dd_pct, peak


def profit_factor(trades: list[dict]) -> float:
    wins = sum(t["pnl"] for t in trades if t["pnl"] > 0)
    losses = abs(sum(t["pnl"] for t in trades if t["pnl"] <= 0))
    if losses > 0:
        return wins / losses
    return float("inf") if wins > 0 else 0.0


def daily_returns(trades: list[dict], capital: float) -> list[float]:
    """Aggregate to calendar-day equity, then daily % returns."""
    if not trades:
        return []
    by_day: dict[str, float] = defaultdict(float)
    for t in trades:
        by_day[t["date"].strftime("%Y-%m-%d")] += t["pnl"]
    days = sorted(by_day.keys())
    eq = capital
    rets: list[float] = []
    for d in days:
        prev = eq
        eq += by_day[d]
        if prev > 0:
            rets.append((eq - prev) / prev)
    return rets


def per_trade_returns(trades: list[dict], capital: float) -> list[float]:
    eq = capital
    rets: list[float] = []
    for t in trades:
        if eq > 0:
            rets.append(t["pnl"] / eq)
        eq += t["pnl"]
    return rets


def sortino(returns: list[float], periods_per_year: float) -> float:
    if not returns:
        return 0.0
    mean = sum(returns) / len(returns)
    downside_sq = sum(min(r, 0.0) ** 2 for r in returns) / len(returns)
    downside = math.sqrt(downside_sq)
    if downside <= 0:
        return float("inf") if mean > 0 else 0.0
    return (mean / downside) * math.sqrt(periods_per_year)


def sharpe(returns: list[float], periods_per_year: float) -> float:
    if len(returns) < 2:
        return 0.0
    mean = sum(returns) / len(returns)
    var = sum((r - mean) ** 2 for r in returns) / (len(returns) - 1)
    std = math.sqrt(var)
    if std <= 0:
        return float("inf") if mean > 0 else 0.0
    return (mean / std) * math.sqrt(periods_per_year)


def span_years(trades: list[dict]) -> float:
    if len(trades) < 2:
        return 1.0
    delta = (trades[-1]["date"] - trades[0]["date"]).total_seconds()
    return max(delta / (365.25 * 86400), 0.25)


def cagr(capital: float, ending: float, years: float) -> float:
    if capital <= 0 or years <= 0:
        return 0.0
    return (ending / capital) ** (1 / years) - 1


def fmt(x: float, digits: int = 2) -> str:
    if math.isinf(x):
        return "∞"
    return f"{x:.{digits}f}"


def main() -> int:
    ap = argparse.ArgumentParser(description="Baron backtest tear-sheet metrics")
    ap.add_argument("csv", type=Path, help="Trade export CSV")
    ap.add_argument("--capital", type=float, default=100_000, help="Starting capital (default 100000)")
    ap.add_argument("--start", type=str, default=None, help="Filter start YYYY-MM-DD")
    ap.add_argument("--end", type=str, default=None, help="Filter end YYYY-MM-DD")
    args = ap.parse_args()

    start = datetime.strptime(args.start, "%Y-%m-%d") if args.start else None
    end = datetime.strptime(args.end, "%Y-%m-%d") if args.end else None

    trades = load_trades(args.csv, start, end)
    if not trades:
        print("No trades loaded — check CSV columns (date, pnl).", file=sys.stderr)
        return 1

    years = span_years(trades)
    curve = build_equity(trades, args.capital)
    end_eq = curve[-1]
    net = end_eq - args.capital
    dd_abs, dd_pct, peak = max_drawdown(curve)
    pf = profit_factor(trades)
    rf = net / dd_abs if dd_abs > 0 else (float("inf") if net > 0 else 0.0)
    rf_per_year = rf / years if years > 0 else 0.0

    daily = daily_returns(trades, args.capital)
    trade_rets = per_trade_returns(trades, args.capital)
    tpy = len(trades) / years

    sortino_daily = sortino(daily, 252) if len(daily) >= 5 else 0.0
    sortino_trade = sortino(trade_rets, tpy) if trade_rets else 0.0
    sharpe_daily = sharpe(daily, 252) if len(daily) >= 5 else 0.0

    wins = sum(1 for t in trades if t["pnl"] > 0)
    wr = wins / len(trades) * 100

    print("=" * 60)
    print("BARON TEAR-SHEET METRICS")
    print("=" * 60)
    print(f"Trades loaded     : {len(trades)}")
    print(f"Period            : {trades[0]['date'].date()} → {trades[-1]['date'].date()} ({years:.2f} years)")
    print(f"Starting capital  : ${args.capital:,.0f}")
    print()
    print("── PERIOD TOTALS (not annualized) ──")
    print(f"Net P&L           : ${net:,.0f}")
    print(f"Ending equity     : ${end_eq:,.0f}")
    print(f"Max drawdown      : −{dd_pct:.1f}% (${dd_abs:,.0f} from peak ${peak:,.0f})")
    print(f"Profit factor     : {fmt(pf)}")
    print(f"Recovery factor   : {fmt(rf)}  (net ÷ max DD $)")
    print()
    print("── ANNUALIZED / RATES ──")
    print(f"CAGR              : {cagr(args.capital, end_eq, years) * 100:.1f}%/year")
    print(f"Trades per year   : {tpy:.0f}")
    print(f"Recovery / year   : {fmt(rf_per_year)}  (RF ÷ years in window)")
    print(f"Sharpe (daily)    : {fmt(sharpe_daily)}  ← preferred for allocators")
    print(f"Sortino (daily)   : {fmt(sortino_daily)}  ← preferred for allocators")
    print(f"Sortino (per-trade): {fmt(sortino_trade)}  (alternative; use daily if possible)")
    print()
    print("── INSTITUTIONAL BARS ──")
    print(f"Sortino > 2.0     : {'PASS' if sortino_daily >= 2.0 else 'CHECK'} (daily basis)")
    print(f"Recovery > 3.0    : {'PASS' if rf >= 3.0 else 'CHECK'} (period total)")
    print(f"Recovery > 3.0/yr : {'PASS' if rf_per_year >= 3.0 else 'CHECK'} (strict per-year)")
    print(f"PF + 200 trades   : {'PASS' if len(trades) >= 200 and pf >= 1.25 else 'CHECK'}")
    print(f"Win rate          : {wr:.1f}%")
    print("=" * 60)
    print()
    print("Tip: Export daily equity from your backtest platform if possible.")
    print("Daily-return Sortino/Sharpe is what most allocators expect on tear sheets.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
