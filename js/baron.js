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

  /** Prop-eval presets — round numbers, not a vendor's TOS. */
  CHALLENGE_PRESETS: [
    {
      id: "ftmo100",
      label: "FTMO 100k-style",
      firm: "FTMO",
      accountSize: 100000,
      maxDailyLoss: 2000,
      maxTrailingDd: 5000,
      profitTarget: 10000,
      consistencyPct: 30,
    },
    {
      id: "eval50",
      label: "50k eval-style",
      firm: "Eval",
      accountSize: 50000,
      maxDailyLoss: 1000,
      maxTrailingDd: 2500,
      profitTarget: 3000,
      consistencyPct: 30,
    },
  ],

  /** Warn when remaining daily/DD is at or under this share of the cap. */
  APPROACHING_REMAINING_RATIO: 0.2,

  defaultChallenge() {
    const p = this.CHALLENGE_PRESETS[0];
    return {
      enabled: false,
      preset: p.id,
      firm: p.firm,
      accountSize: p.accountSize,
      maxDailyLoss: p.maxDailyLoss,
      maxTrailingDd: p.maxTrailingDd,
      profitTarget: p.profitTarget,
      consistencyPct: 0,
      overrideDailyUsed: null,
      overrideDdUsed: null,
      overrideProfit: null,
    };
  },

  normalizeChallenge(raw) {
    const d = this.defaultChallenge();
    if (!raw || typeof raw !== "object") return d;
    const num = (v, fallback) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : fallback;
    };
    const opt = (v) => {
      if (v == null || v === "") return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const cons = num(raw.consistencyPct, d.consistencyPct);
    return {
      enabled: !!raw.enabled,
      preset: typeof raw.preset === "string" && raw.preset ? raw.preset : d.preset,
      firm: typeof raw.firm === "string" && raw.firm.trim() ? raw.firm.trim() : d.firm,
      accountSize: Math.max(0, num(raw.accountSize, d.accountSize)),
      maxDailyLoss: Math.max(0, num(raw.maxDailyLoss, d.maxDailyLoss)),
      maxTrailingDd: Math.max(0, num(raw.maxTrailingDd, d.maxTrailingDd)),
      profitTarget: Math.max(0, num(raw.profitTarget, d.profitTarget)),
      consistencyPct: Math.max(0, Math.min(100, cons)),
      overrideDailyUsed: opt(raw.overrideDailyUsed),
      overrideDdUsed: opt(raw.overrideDdUsed),
      overrideProfit: opt(raw.overrideProfit),
    };
  },

  applyChallengePreset(cfg, presetId) {
    const next = this.normalizeChallenge(cfg);
    const p = this.CHALLENGE_PRESETS.find((x) => x.id === presetId);
    if (!p) {
      next.preset = "custom";
      return next;
    }
    next.preset = p.id;
    next.firm = p.firm;
    next.accountSize = p.accountSize;
    next.maxDailyLoss = p.maxDailyLoss;
    next.maxTrailingDd = p.maxTrailingDd;
    next.profitTarget = p.profitTarget;
    next.consistencyPct = p.consistencyPct != null ? p.consistencyPct : 30;
    return next;
  },

  isoDay(d) {
    const x = d instanceof Date ? d : new Date(d || Date.now());
    if (Number.isNaN(x.getTime())) return "";
    const y = x.getFullYear();
    const m = String(x.getMonth() + 1).padStart(2, "0");
    const day = String(x.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  },

  dateLabels(d) {
    const x = d instanceof Date ? d : new Date(d || Date.now());
    if (Number.isNaN(x.getTime())) return [];
    return [
      x.toLocaleDateString("en-GB", { month: "short", day: "numeric" }),
      x.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    ];
  },

  tradeDayKey(t, now) {
    if (!t) return "";
    if (t.dateKey && /^\d{4}-\d{2}-\d{2}/.test(String(t.dateKey))) return String(t.dateKey).slice(0, 10);
    const raw = String(t.date || "");
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
    const today = this.isoDay(now);
    const labels = this.dateLabels(now);
    if (raw && labels.includes(raw)) return today;
    return "";
  },

  isChallengeTrade(t) {
    if (!t || typeof t !== "object") return false;
    if (t.book === "challenge") return true;
    return !!t.challengeFail;
  },

  sizerBalance(state) {
    const s = state || {};
    if (s.challenge && s.challenge.enabled) {
      const n = Number(s.challenge.accountSize);
      if (Number.isFinite(n) && n > 0) return n;
    }
    return Number(s.bal) || 0;
  },

  challengeRemaining(cfg, trades, now, helpers) {
    const c = this.normalizeChallenge(cfg);
    const resolvePnl = helpers && helpers.resolvePnl
      ? helpers.resolvePnl
      : (t) => this.resolveTradePnl(t);
    const isOpen = helpers && helpers.isOpenTrade
      ? helpers.isOpenTrade
      : (t) => this.isOpenTrade(t);
    const today = this.isoDay(now);
    const book = (trades || []).filter((t) => this.isChallengeTrade(t) && !t.disciplineOnly);
    const closed = book.filter((t) => !isOpen(t));
    closed.sort((a, b) => {
      const da = this.tradeDayKey(a, now) || "";
      const db = this.tradeDayKey(b, now) || "";
      if (da !== db) return da < db ? -1 : 1;
      return (Number(a.id) || 0) - (Number(b.id) || 0);
    });
    let cum = 0;
    let hwm = c.accountSize;
    let todayPnl = 0;
    const byDay = Object.create(null);
    closed.forEach((t) => {
      const pnl = Number(resolvePnl(t));
      const n = Number.isFinite(pnl) ? pnl : 0;
      cum += n;
      const equity = c.accountSize + cum;
      if (equity > hwm) hwm = equity;
      const key = this.tradeDayKey(t, now);
      if (today && key === today) todayPnl += n;
      if (key) byDay[key] = (byDay[key] || 0) + n;
    });
    let bestDayPnl = 0;
    let bestDayKey = "";
    Object.keys(byDay).forEach((k) => {
      if (byDay[k] > bestDayPnl) {
        bestDayPnl = byDay[k];
        bestDayKey = k;
      }
    });
    const dailyUsed = c.overrideDailyUsed != null ? c.overrideDailyUsed : Math.max(0, -todayPnl);
    const ddUsed = c.overrideDdUsed != null ? c.overrideDdUsed : Math.max(0, hwm - (c.accountSize + cum));
    const profit = c.overrideProfit != null ? c.overrideProfit : cum;
    const dailyLeft = Math.max(0, c.maxDailyLoss - dailyUsed);
    const ddLeft = Math.max(0, c.maxTrailingDd - ddUsed);
    const profitLeft = Math.max(0, c.profitTarget - profit);
    const consistencyPct = c.consistencyPct;
    const consistencyOn = consistencyPct > 0;
    const consistencyShare = profit > 0 && bestDayPnl > 0 ? bestDayPnl / profit : 0;
    const consistencyCapAmt = profit > 0 && consistencyOn ? profit * (consistencyPct / 100) : 0;
    return {
      firm: c.firm,
      accountSize: c.accountSize,
      dailyUsed,
      dailyLimit: c.maxDailyLoss,
      dailyLeft,
      ddUsed,
      ddLimit: c.maxTrailingDd,
      ddLeft,
      profit,
      profitTarget: c.profitTarget,
      profitLeft,
      todayPnl,
      bestDayPnl,
      bestDayKey,
      consistencyPct,
      consistencyOn,
      consistencyShare,
      consistencyCapAmt,
      cum,
      hwm,
      emptyBook: closed.length === 0,
      dailyFromJournal: c.overrideDailyUsed == null,
      ddFromJournal: c.overrideDdUsed == null,
      profitFromJournal: c.overrideProfit == null,
    };
  },

  usedLeftLabel(used, left) {
    const fmt = (n) => {
      const v = Math.round(Number(n) || 0);
      return String(Math.abs(v));
    };
    return fmt(used) + " used · " + fmt(left) + " left";
  },

  profitToTargetLabel(profit, target) {
    const fmt = (n) => {
      const v = Math.round(Number(n) || 0);
      return (n < 0 ? "−" : "") + String(Math.abs(v));
    };
    const left = Math.max(0, (Number(target) || 0) - (Number(profit) || 0));
    return fmt(profit) + " · " + fmt(left) + " to target";
  },

  wouldBreachConsistency(remaining, addProfit) {
    const rem = remaining || {};
    const r = Number(rem.consistencyPct) / 100;
    const add = Number(addProfit) || 0;
    if (!(r > 0) || !(r < 1) || !(add > 0)) return false;
    const profit = Number(rem.profit) || 0;
    const today = Number(rem.todayPnl) || 0;
    if (profit <= 0 && today <= 0) return false;
    const newToday = today + add;
    const newProfit = profit + add;
    if (!(newProfit > 0)) return false;
    return newToday > r * newProfit + 1e-6;
  },

  maxSizeForConsistency(remaining, rewardPerUnit, size) {
    const per = Number(rewardPerUnit) || 0;
    const qty = Math.max(0, Math.floor(Number(size) || 0));
    if (!(per > 0) || qty <= 0) return 0;
    let lo = 0;
    let hi = qty;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi + 1) / 2);
      if (this.wouldBreachConsistency(remaining, mid * per)) hi = mid - 1;
      else lo = mid;
    }
    return lo;
  },

  challengeApproaching(remaining) {
    const rem = remaining || {};
    const ratio = this.APPROACHING_REMAINING_RATIO;
    const reasons = [];
    const tight = (left, limit) => {
      const l = Number(left);
      const cap = Number(limit);
      return cap > 0 && l > 0 && l <= cap * ratio + 1e-9;
    };
    if (tight(rem.dailyLeft, rem.dailyLimit)) reasons.push("daily");
    if (tight(rem.ddLeft, rem.ddLimit)) reasons.push("dd");
    if (rem.consistencyOn && rem.profit > 0) {
      const cap = Number(rem.consistencyCapAmt) || 0;
      const room = cap - (Number(rem.todayPnl) || 0);
      if (cap > 0 && room <= cap * ratio + 1e-9) reasons.push("consistency");
    }
    return { tight: reasons.length > 0, reasons };
  },

  evaluateChallengeFill(remaining, cashRisk, size, proposedProfit) {
    const rem = remaining || {};
    const risk = Number(cashRisk) || 0;
    const qty = Number(size) || 0;
    const add = Number(proposedProfit) || 0;
    const dailyLeft = Math.max(0, Number(rem.dailyLeft) || 0);
    const ddLeft = Math.max(0, Number(rem.ddLeft) || 0);
    const headroom = Math.min(dailyLeft, ddLeft);
    let blocked = risk > 0 && risk > headroom;
    const riskPerUnit = qty > 0 ? risk / qty : 0;
    let maxSize = riskPerUnit > 0 ? Math.floor(headroom / riskPerUnit + 1e-9) : 0;
    let reason = null;
    if (blocked) reason = dailyLeft <= ddLeft ? "daily" : "dd";
    if (!blocked && this.wouldBreachConsistency(rem, add)) {
      blocked = true;
      reason = "consistency";
      const rewardPerUnit = qty > 0 && add > 0 ? add / qty : 0;
      maxSize = this.maxSizeForConsistency(rem, rewardPerUnit, qty);
    }
    return {
      blocked,
      reason,
      cashRisk: risk,
      size: qty,
      maxSize,
      dailyLeft,
      ddLeft,
      headroom,
      proposedProfit: add,
    };
  },

  challengeNearMissNote(verdict, unitLabel) {
    const v = verdict || {};
    const units = unitLabel || "contracts";
    const size = Number.isFinite(Number(v.size)) ? Number(v.size) : 0;
    const maxSize = Number.isFinite(Number(v.maxSize)) ? Number(v.maxSize) : 0;
    const why = v.reason === "dd"
      ? "trailing DD left"
      : (v.reason === "consistency" ? "consistency cap" : "daily loss left");
    const fmt = (n) => {
      if (!Number.isFinite(n)) return "0";
      return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
    };
    return fmt(size) + " " + units + " vs " + fmt(maxSize) + " max for " + why + ".";
  },
};

window.Baron = Baron;
window.RunnrRisk = Baron;
