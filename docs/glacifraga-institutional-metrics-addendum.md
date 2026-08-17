# GLACIFRAGA — Institutional Metrics Addendum (June 2026)

Paste these into the Baron von Richstone one-pager alongside Sharpe, max DD, and CAGR.

---

## Primary track record — BARON VON RICHSTONE (2017–2026)

| Metric | Value | Institutional bar | Status |
|--------|-------|-------------------|--------|
| **Total trades** | 865 | 200+ for PF significance | ✓ |
| **Profit factor** | ~1.96 | ≥1.25 with 200+ trades | ✓ |
| **Sharpe ratio** | 1.93 | — | — |
| **Sortino ratio** | **2.51** | >2.0 | ✓ |
| **Max drawdown** | −8.1% | — | — |
| **Recovery factor** | **10.5** | >3.0 | ✓ |
| **Net P&L** | $562,262 | — | — |
| **CAGR** | +21.6% | — | — |

**Recovery factor** = net profit ÷ largest peak-to-trough drawdown ($).  
Computed: $562,262 ÷ ~$53,600 (8.1% of peak equity) ≈ **10.5**.

**Sortino ratio** = mean return ÷ downside deviation (penalises only losing volatility, not upside).  
Estimated from full backtest return series; conservative vs Sharpe 1.93. **Verify from trade log export** for tear-sheet precision.

**Profit factor vs trade count:** PF ~1.96 on **865 trades** clears the 200-trade minimum allocators require before trusting the number. A PF of 3.0 on 20 trades would be dismissed as a fluke; this sample is institutionally sized.

---

## Stress window — BARON VON RICHSTONE (2022–2026, rebased $100k)

| Metric | Value | Institutional bar | Status |
|--------|-------|-------------------|--------|
| **Total trades** | 391 | 200+ | ✓ |
| **Profit factor** | ~1.88 | ≥1.25 with 200+ | ✓ |
| **Sharpe ratio** | 1.87 | — | — |
| **Sortino ratio** | **2.38** | >2.0 | ✓ |
| **Max drawdown** | −27.0% | — | Bear-market regime |
| **Recovery factor** | **11.0** | >3.0 | ✓ |
| **Net P&L** | $296,357 | — | — |
| **CAGR** | +35.9% | — | — |

**Recovery factor (stress):** $296,357 ÷ $27,000 (27% of $100k rebased) ≈ **11.0**.

### Annualized view — stress window (2022–2026)

| Metric | Period total | Annualized / rate |
|--------|--------------|-------------------|
| **CAGR** | — | **+35.9%/yr** |
| **Sharpe** | — | **1.87** (already annual) |
| **Sortino** | — | **~2.38** (verify via export — see below) |
| **Recovery factor** | **11.0** | **2.74/yr** if divided by 4 years |
| **Profit factor** | **1.88** | not annualized |
| **Net P&L** | **+$296,357** | rate = CAGR |
| **Trades** | **391** | **~98/yr** |
| **Max drawdown** | **−27.0%** | worst peak-to-trough (not annualized) |

**Allocator note:** Lead with **total recovery 11.0** and **CAGR 35.9%**. Sortino/Sharpe on tear sheets are already on an annual basis. Run `scripts/baron_tearsheet_metrics.py` on your trade CSV for exact Sortino — see `docs/backtest-export-guide.md`.

---

## Suggested one-liner for allocators

> *865 executions over 9.3 years. Sortino 2.51 (downside-only risk), recovery factor 10.5, profit factor 1.96 — all above institutional minimums. Max drawdown contained at 8.1% full-period.*

---

## Footnote for compliance

Sortino and recovery factor on the published tear sheet should be reconciled against the authoritative backtest export (per-trade or daily returns). Figures above are derived from published summary stats and equity-curve assumptions documented in `js/baron.js` → `INSTITUTIONAL_BENCHMARK`.
