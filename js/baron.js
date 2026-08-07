/** Runnr risk helpers — sizing, P&L, open/closed trade checks. */
const Baron = {
  EQUITIES: [
    "AAPL", "MSFT", "NVDA", "AMD", "AVGO", "TSM", "ORCL", "NOW", "ADBE", "ARM", "LRCX",
    "META", "GOOGL", "NFLX",
    "AMZN", "TSLA",
    "COST", "PM",
    "NVO", "LLY", "ISRG", "ABBV", "AMGN",
    "JPM", "V", "GS", "BK",
    "CVX", "XLE", "XOM", "MPC", "VLO", "WMB", "PSX",
    "CAT", "GE", "LMT", "AVAV", "PH",
    "NEM",
    "SPY", "URA",
  ],
  COMMODITIES: ["GLD", "SLV", "COPX", "USO", "GDX", "IAU"],
  FX_MAJORS: ["USD", "EUR", "GBP", "JPY", "CHF", "AUD", "NZD", "CAD"],
  STRATEGY: {
    risk_pct: 1,
    atr_stop_mult: 2,
    atr_tp_mult: 4,
    max_position_pct: 10,
    volume_note: "1% risk, 2× ATR stop, 4× ATR target, 10% max position",
  },

  get watchlist() {
    return [...this.EQUITIES, ...this.COMMODITIES];
  },

  isCommodity(sym) {
    return this.COMMODITIES.includes(sym);
  },

  parseForexPair(instr) {
    const s = (instr || "").toUpperCase().replace(/[^A-Z]/g, "");
    if (s.length !== 6) return null;
    const base = s.slice(0, 3);
    const quote = s.slice(3, 6);
    if (!this.FX_MAJORS.includes(base) || !this.FX_MAJORS.includes(quote)) return null;
    return { base, quote };
  },

  /** True 1% risk sizing for T212-style forex CFD (base-currency notional). */
  sizeForex(balance, riskPct, entry, stop, instr) {
    const stopDist = Math.abs(entry - stop);
    if (!entry || !stop || !stopDist) return { units: 0, risk: 0, pair: null };
    const maxRisk = balance * (riskPct / 100);
    const pair = this.parseForexPair(instr);
    if (!pair) {
      const units = Math.floor(maxRisk / stopDist);
      return { units, risk: units * stopDist, pair: null };
    }
    const units = pair.quote === "USD"
      ? Math.floor(maxRisk / stopDist)
      : Math.floor((maxRisk * entry) / stopDist);
    const risk = pair.quote === "USD"
      ? units * stopDist
      : (units * stopDist) / entry;
    return { units: Math.max(0, units), risk, pair };
  },

  riskAtStop(pair, entry, stop, units) {
    const stopDist = Math.abs(entry - stop);
    if (!stopDist || !units) return 0;
    if (!pair) return units * stopDist;
    if (pair.quote === "USD") return units * stopDist;
    return (units * stopDist) / entry;
  },

  /** Signed P&L in account currency (USD/EUR/GBP) for CFD units. */
  tradePnl(pair, entry, exit, units, dir) {
    const sign = dir === "long" ? 1 : -1;
    const move = (exit - entry) * sign;
    if (!pair) return move * units;
    if (pair.quote === "USD") return move * units;
    return (units * move) / entry;
  },

  rewardAtTarget(pair, entry, target, units) {
    if (!target) return null;
    return Math.abs(this.tradePnl(pair, entry, target, units, target > entry ? "long" : "short"));
  },

  /** Realized P&L when stored value missing but entry/exit exist (forex-aware). */
  resolveTradePnl(t) {
    if (!t || t.disciplineOnly) return null;
    const entry = parseFloat(t.entry ?? (t.dir === "long" ? t.fillPrice : null));
    const exit = parseFloat(t.exit ?? (t.dir === "short" ? t.fillPrice : null));
    const hasRoundTrip = entry > 0 && exit > 0 && entry !== exit;
    const stored = t.pnl;
    if (stored != null && stored !== "" && !Number.isNaN(Number(stored))) {
      const n = Number(stored);
      if (n !== 0 || !hasRoundTrip) return n;
    }
    if (!hasRoundTrip) return null;
    const pair = t.pair || this.parseForexPair(t.instr);
    const size = parseFloat(t.size) || 1;
    const dir = t.dir || "long";
    return Math.round(this.tradePnl(pair, entry, exit, size, dir));
  },

  isOpenTrade(t) {
    if (!t || t.disciplineOnly) return false;
    const entry = parseFloat(t.entry ?? t.fillPrice);
    const exitRaw = t.exit ?? (t.dir === "short" ? t.fillPrice : null);
    if (exitRaw == null || exitRaw === "") return true;
    const exit = parseFloat(exitRaw);
    if (Number.isNaN(exit) || exit === 0) return true;
    if (entry > 0 && exit > 0 && Math.abs(entry - exit) < 1e-9) return true;
    return false;
  },

  /** Risk-based share count with 10% position cap */
  sizeShares(balance, riskPct, entry, stop) {
    if (!entry || !stop || entry === stop) return { shares: 0, risk: 0 };
    const stopDist = Math.abs(entry - stop);
    const riskAmount = balance * (riskPct / 100);
    const riskShares = Math.floor(riskAmount / stopDist);
    const maxShares = Math.floor((balance * this.STRATEGY.max_position_pct) / 100 / entry);
    const shares = Math.max(1, Math.min(riskShares, maxShares));
    return {
      shares,
      risk: Math.round(shares * stopDist),
      stopDist,
      capped: riskShares > maxShares,
    };
  },

  /** ATR-style stops from entry (user supplies ATR or % estimate) */
  stopsFromAtr(entry, atr) {
    const stop = entry - atr * this.STRATEGY.atr_stop_mult;
    const target = entry + atr * this.STRATEGY.atr_tp_mult;
    return {
      stop: Math.round(stop * 100) / 100,
      target: Math.round(target * 100) / 100,
      rr: this.STRATEGY.atr_tp_mult / this.STRATEGY.atr_stop_mult,
    };
  },

  /** Default ATR guess ~2.5% of price when no live ATR */
  estimateAtr(price) {
    return price * 0.025;
  },

  applySharesPreset(balance, riskPct) {
    const entry = parseFloat(document.getElementById("sh-entry")?.value);
    if (!entry) return false;
    const atr = this.estimateAtr(entry);
    const { stop, target } = this.stopsFromAtr(entry, atr);
    document.getElementById("sh-stop").value = stop;
    document.getElementById("sh-target").value = target;
    if (typeof calcShares === "function") calcShares();
    return true;
  },
};

window.Baron = Baron;
window.RunnrRisk = Baron;
