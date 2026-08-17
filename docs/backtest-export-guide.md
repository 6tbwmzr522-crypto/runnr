# Baron Backtest Export — Tear-Sheet Metrics Guide

## What “annualized” means (2022–2026 stress window)

Some metrics are **already annual rates**. Others are **period totals** and should not be “annualized” the same way.

| Metric | 2022–26 value | Annualized? | How to read it |
|--------|---------------|-------------|----------------|
| **CAGR** | **+35.9%/yr** | Yes — by definition | Compounded return per year on $100k rebased |
| **Sharpe** | **1.87** | Yes (daily/monthly basis) | Already annual on the one-pager |
| **Sortino** | **~2.38** | Yes (same basis as Sharpe) | Verify with script below |
| **Max drawdown** | **−27.0%** | No | Worst peak-to-trough in the window |
| **Recovery factor** | **11.0** (period) | Optional: **2.74/yr** | Total RF ÷ 4 years |
| **Profit factor** | **1.88** | No | Structural ratio over all trades |
| **Net P&L** | **+$296,357** | No | Use CAGR for the rate |
| **Trades** | **391** | **~98/yr** | 391 ÷ 4 years |

### Recovery factor — two ways allocators quote it

1. **Period total (most common on tear sheets):**  
   `Net profit ÷ max drawdown ($)` = $296,357 ÷ $27,000 ≈ **11.0** → passes bar **> 3.0**

2. **Per calendar year (stricter):**  
   `11.0 ÷ 4 years` ≈ **2.74/yr** → slightly under **3.0/yr** if they use that exact rule  
   Most desks care about **total RF** and **max DD %**, not RF/year.

### Sortino — why we need the export

Sortino = **mean return ÷ downside deviation**, annualized.

- **Downside deviation** only counts returns below zero (or below a minimum acceptable return).
- Upside volatility does **not** hurt Sortino — that’s why institutions prefer it over Sharpe for momentum systems.

**You cannot derive an exact Sortino from Sharpe alone** without knowing the return distribution. The ~2.38 figure is a conservative estimate. The export gives the exact number.

---

## How to get precise Sortino (3 steps)

### Step 1 — Export trades from your backtest

From your backtest platform (Python, TradingView, MetaTrader, custom Glacifraga engine, etc.), export a CSV with at least:

```csv
date,pnl
2022-01-18,1840.50
2022-01-25,-920.00
2022-02-03,2100.00
```

Optional column `equity` if the platform already tracks running balance.

### Step 2 — Run the tear-sheet script

```bash
cd /path/to/runnr
python3 scripts/baron_tearsheet_metrics.py your_trades.csv --start 2022-01-01 --end 2026-12-31 --capital 100000
```

### Step 3 — Paste outputs into the one-pager

Use **Sortino (daily)** and **Sharpe (daily)** from the script output — that’s what allocators expect when CAGR is quoted annually.

---

## Where exports usually come from

| Source | What to export |
|--------|----------------|
| **Custom Python backtest** | List of closed trades with `exit_date`, `pnl` |
| **Alpaca / broker** | Fills or closed positions CSV → aggregate to round-trips |
| **TradingView** | Strategy closed trades list |
| **MT4/5** | Report → CSV closed orders |

If you only have **daily equity** (no per-trade file), send a CSV with `date,equity` and we can add a daily-equity mode to the script.

---

## Full track record (2017–2026) — annualized reference

| Metric | Period total | Annualized / rate |
|--------|--------------|-------------------|
| CAGR | — | **+21.6%/yr** |
| Sharpe | — | **1.93** (annual) |
| Sortino | — | **~2.51** (verify from export) |
| Recovery | **10.5** | **~1.13/yr** (10.5 ÷ 9.3y) |
| Trades | 865 | **~93/yr** |
| Max DD | −8.1% | point-in-time |

Full-period recovery **per year** looks modest only because the strategy compounded for 9+ years — **total RF 10.5** is what you lead with on the tear sheet.
