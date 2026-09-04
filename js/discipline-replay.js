/** Disciplined Replay v1 — same fills, corrected size/stop. No candles, no what-if. */
const DisciplineReplay = {
  /** Coach / sizer convention when a stop was confirmed but the price was not stored. Not ATR. */
  FALLBACK_STOP_PCT: 0.02,
  /** Ratio that triggers the unit-bug vs genuine-oversize check. */
  WILD_SIZE_RATIO: 80,
  HISTORY_CAP: 200,

  isEligible(trade) {
    if (!trade || typeof trade !== "object") return false;
    if (trade.incomplete) return false;
    return trade.sizeOk === false || trade.stopOk === false;
  },

  /**
   * Journal CTA: only when Replay has a real action.
   * 1) Missing-stop CTA — stopOk false and no recorded stop.
   * 2) Size flagged with no risk snapshot — open the missing-snapshot panel (do not hide the button).
   * 3) Numeric size cut — compliant size is strictly smaller than actual.
   * Empty-Δ (process stop with stored stop, and/or size already fits against a real basis) stays off the button.
   */
  canReplay(trade, settings, baron) {
    if (!this.isEligible(trade)) return false;
    if (this.needsStopToCalc(trade)) return true;
    if (trade.sizeOk === false) {
      const B = baron || (typeof Baron !== "undefined" ? Baron : null);
      const basis = this.resolveRiskBasis(trade, settings, B);
      if (!basis || basis.source === "missing") return true;
      return this.hasNumericSizeCut(trade, settings, baron);
    }
    return false;
  },

  shouldShowButton(trade, settings, baron) {
    return this.canReplay(trade, settings, baron);
  },

  hasNumericSizeCut(trade, settings, baron) {
    if (!this.isEligible(trade)) return false;
    const B = baron || (typeof Baron !== "undefined" ? Baron : null);
    const basis = this.resolveRiskBasis(trade, settings, B);
    if (!basis || basis.source === "missing") return false;
    const actual = this.num(trade && trade.size);
    if (actual == null || !(actual > 0)) return false;
    const discStop = this.disciplinedStop(trade);
    if (discStop == null) return false;
    const sized = this.compliantSize(trade, { bal: basis.bal, risk: basis.risk }, B, discStop);
    const computed = this.num(sized && sized.size);
    if (computed == null) return false;
    const sanity = this.sizeSanity(trade, sized, basis, discStop, B);
    if (!sanity.ok) return false;
    return this.isRealSizeCut(computed, actual);
  },

  isBrokerFill(trade) {
    const src = trade && trade.source;
    return src === "alpaca" || src === "ibkr" || src === "t212";
  },

  incompleteBrokerFills(trades) {
    if (!Array.isArray(trades)) return [];
    return trades.filter((t) => this.isBrokerFill(t) && t.incomplete);
  },

  firstIncompleteBrokerFill(trades) {
    const list = this.incompleteBrokerFills(trades);
    return list.length ? list[0] : null;
  },

  num(v) {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  },

  sameQty(a, b) {
    if (a == null && b == null) return true;
    const x = this.num(a);
    const y = this.num(b);
    if (x == null || y == null) return false;
    return Math.abs(x - y) < 1e-8;
  },

  /** Ignore floor / fractional-share noise so a 1% in-budget fill is not a fake cut. */
  isRealSizeCut(computed, actual) {
    if (computed == null || actual == null) return false;
    const c = this.num(computed);
    const a = this.num(actual);
    if (c == null || a == null || !(a > 0)) return false;
    if (!(c < a) || this.sameQty(c, a)) return false;
    const abs = a - c;
    const rel = abs / a;
    if (rel < 0.01 && abs < 0.05) return false;
    return true;
  },

  recordedStop(trade) {
    const s = this.num(trade && trade.stop);
    if (s == null || s === 0) return null;
    const entry = this.num(trade && trade.entry);
    if (entry != null && s === entry) return null;
    return s;
  },

  needsStopToCalc(trade) {
    if (!this.isEligible(trade)) return false;
    if (this.recordedStop(trade) != null) return false;
    return trade.stopOk === false;
  },

  balanceOf(state, trade, baron) {
    const s = state || {};
    const B = baron || (typeof Baron !== "undefined" ? Baron : null);
    const challengeTrade = !!(trade && (trade.book === "challenge" || trade.challengeFail));
    if (challengeTrade && B && typeof B.sizerBalance === "function") {
      const n = Number(B.sizerBalance(s));
      if (Number.isFinite(n) && n > 0) return n;
    }
    return Number(s.bal) || 0;
  },

  readSnapshot(trade) {
    const s = trade && trade.riskSnapshot;
    if (!s || typeof s !== "object") return null;
    const risk = Number(s.risk);
    const bal = Number(s.bal);
    if (!Number.isFinite(risk) || !(risk > 0)) return null;
    if (!Number.isFinite(bal) || !(bal > 0)) return null;
    return { risk, bal, at: s.at || null, sym: s.sym || null };
  },

  captureSnapshot(settings, trade, baron) {
    const S = settings || {};
    const risk = Number(S.risk);
    const riskPct = Number.isFinite(risk) && risk > 0 ? risk : null;
    const bal = this.balanceOf(S, trade, baron);
    if (riskPct == null || !(bal > 0)) return null;
    const snap = { risk: riskPct, bal, at: new Date().toISOString() };
    if (S.sym) snap.sym = S.sym;
    return snap;
  },

  /**
   * Attach a snapshot once. Never overwrite. Do not auto-backfill old rows on load.
   * The Replay modal CTA may stamp today's settings onto one fill with explicit consent.
   */
  stampTrade(trade, settings, baron) {
    if (!trade || typeof trade !== "object") return trade;
    if (this.readSnapshot(trade)) return trade;
    const snap = this.captureSnapshot(settings, trade, baron);
    if (snap) trade.riskSnapshot = snap;
    return trade;
  },

  stampHistory(settings) {
    if (!settings || typeof settings !== "object") return;
    const risk = Number(settings.risk);
    const bal = Number(settings.bal);
    if (!Number.isFinite(risk) || !(risk > 0) || !Number.isFinite(bal) || !(bal > 0)) return;
    if (!Array.isArray(settings.riskHistory)) settings.riskHistory = [];
    const last = settings.riskHistory[settings.riskHistory.length - 1];
    if (last && Number(last.risk) === risk && Number(last.bal) === bal) return;
    settings.riskHistory.push({ at: new Date().toISOString(), risk, bal, sym: settings.sym || null });
    if (settings.riskHistory.length > this.HISTORY_CAP) {
      settings.riskHistory.splice(0, settings.riskHistory.length - this.HISTORY_CAP);
    }
  },

  mergeHistory(a, b) {
    const map = new Map();
    const add = (e) => {
      if (!e || typeof e !== "object" || !e.at) return;
      const risk = Number(e.risk);
      const bal = Number(e.bal);
      if (!Number.isFinite(risk) || !(risk > 0) || !Number.isFinite(bal) || !(bal > 0)) return;
      map.set(String(e.at), { at: e.at, risk, bal, sym: e.sym || null });
    };
    (a || []).forEach(add);
    (b || []).forEach(add);
    return [...map.values()]
      .sort((x, y) => Date.parse(x.at) - Date.parse(y.at))
      .slice(-this.HISTORY_CAP);
  },

  tradeTimeMs(trade) {
    if (!trade) return null;
    if (trade.filledAt) {
      const ms = Date.parse(trade.filledAt);
      if (Number.isFinite(ms)) return ms;
    }
    if (trade.dateKey) {
      const ms = Date.parse(trade.dateKey);
      if (Number.isFinite(ms)) return ms;
    }
    return null;
  },

  lookupHistory(trade, settings) {
    const hist = settings && settings.riskHistory;
    if (!Array.isArray(hist) || !hist.length) return null;
    const t = this.tradeTimeMs(trade);
    if (t == null) return null;
    let best = null;
    let bestAt = -Infinity;
    for (let i = 0; i < hist.length; i++) {
      const e = hist[i];
      const at = Date.parse(e && e.at);
      if (!Number.isFinite(at) || at > t) continue;
      const risk = Number(e.risk);
      const bal = Number(e.bal);
      if (!Number.isFinite(risk) || !(risk > 0) || !Number.isFinite(bal) || !(bal > 0)) continue;
      if (at >= bestAt) {
        bestAt = at;
        best = { risk, bal, at: e.at, sym: e.sym || null };
      }
    }
    return best;
  },

  /**
   * Risk % / balance that applied at the trade, not today's profile.
   * Snapshot wins, then dated settings history. Live settings are never a silent fallback.
   */
  resolveRiskBasis(trade, settings, baron) {
    const snap = this.readSnapshot(trade);
    if (snap) {
      return { risk: snap.risk, bal: snap.bal, at: snap.at, sym: snap.sym, source: "snapshot" };
    }
    const hist = this.lookupHistory(trade, settings);
    if (hist) {
      return { risk: hist.risk, bal: hist.bal, at: hist.at, sym: hist.sym, source: "history" };
    }
    return { risk: null, bal: null, at: null, sym: null, source: "missing" };
  },

  formatBasisNote(basis, settings) {
    if (!basis || basis.source === "missing") return "no risk snapshot for this trade";
    const sym = (basis.sym || (settings && settings.sym) || "€");
    const riskLbl = Number.isFinite(Number(basis.risk)) ? String(basis.risk) + "%" : "";
    const balLbl = Number.isFinite(Number(basis.bal))
      ? sym + Math.round(Number(basis.bal)).toLocaleString()
      : "";
    const figs = [riskLbl, balLbl].filter(Boolean).join(" / ");
    if (basis.source === "history") {
      return figs
        ? ("nearest saved rules before this trade · " + figs)
        : "nearest saved rules before this trade";
    }
    return figs ? ("rules at time of trade · " + figs) : "rules at time of trade";
  },

  kindOf(trade, baron) {
    const type = String((trade && trade.type) || "").toLowerCase();
    if (type === "shares" || type === "stock" || type === "equity" || type === "options" || type === "option") {
      return "shares";
    }
    if (type === "crypto") return "crypto";
    const B = baron || (typeof Baron !== "undefined" ? Baron : null);
    const instr = (trade && trade.instr) || "";
    if ((trade && trade.pair) || (B && typeof B.parseForexPair === "function" && B.parseForexPair(instr))) {
      return "cfd";
    }
    if (type === "cfd") return "cfd";
    return "shares";
  },

  /**
   * Protective stop used for sizing.
   * Recorded stop wins. If stopOk is false and none is stored, do not invent ATR.
   * If size was flagged but stop price is missing, reuse the 2% distance Coach already uses.
   */
  disciplinedStop(trade) {
    const recorded = this.recordedStop(trade);
    if (recorded != null) return recorded;
    if (this.needsStopToCalc(trade)) return null;
    const entry = this.num(trade && trade.entry);
    if (!entry) return null;
    const dir = (trade && trade.dir) || "long";
    const dist = Math.abs(entry) * this.FALLBACK_STOP_PCT;
    if (!(dist > 0)) return null;
    const stop = dir === "short" ? entry + dist : entry - dist;
    return Math.round(stop * 10000) / 10000;
  },

  compliantSize(trade, settings, baron, stopOverride) {
    const B = baron || (typeof Baron !== "undefined" ? Baron : null);
    const entry = this.num(trade && trade.entry);
    const stop = stopOverride != null ? this.num(stopOverride) : this.disciplinedStop(trade);
    const actual = this.num(trade && trade.size);
    if (!entry || stop == null || !B) {
      return { size: null, uncapped: null, cappedToActual: false, kind: this.kindOf(trade, B) };
    }
    const bal = Number(settings && settings.bal) || 0;
    const risk = Number(settings && settings.risk);
    const riskPct = Number.isFinite(risk) ? risk : 1;
    const kind = this.kindOf(trade, B);
    let uncapped = 0;
    if (kind === "shares" && typeof B.sizeShares === "function") {
      uncapped = B.sizeShares(bal, riskPct, entry, stop).shares;
    } else if (typeof B.sizeForex === "function") {
      uncapped = B.sizeForex(bal, riskPct, entry, stop, (trade && trade.instr) || "").units;
    }
    const n = Number(uncapped);
    const computed = Number.isFinite(n) ? n : 0;
    const cappedToActual = actual != null && actual > 0 && computed > actual;
    const size = cappedToActual ? actual : computed;
    return { size, uncapped: computed, cappedToActual, kind };
  },

  /**
   * If a huge cut is internally consistent with snapshot + stop distance, keep it.
   * If it is not (wrong denominator / unit mix-up), refuse the fake size.
   */
  sizeSanity(trade, sized, basis, discStop, baron) {
    const actual = this.num(trade && trade.size);
    const computed = this.num(sized && sized.size);
    if (actual == null || computed == null || !(actual > 0) || !(computed > 0) || !basis) {
      return { ok: true, genuineOversize: false, ratio: null };
    }
    const ratio = actual / computed;
    if (!(ratio >= this.WILD_SIZE_RATIO)) {
      return { ok: true, genuineOversize: false, ratio };
    }
    const entry = this.num(trade && trade.entry);
    const stop = this.num(discStop);
    const stopDist = (entry != null && stop != null) ? Math.abs(entry - stop) : null;
    const budget = Number(basis.bal) * (Number(basis.risk) / 100);
    const B = baron || (typeof Baron !== "undefined" ? Baron : null);
    const kind = this.kindOf(trade, B);
    let actualRisk = null;
    if (stopDist != null && stopDist > 0) {
      if (kind === "cfd" && B && typeof B.riskAtStop === "function") {
        const pair = (trade && trade.pair) || (typeof B.parseForexPair === "function" ? B.parseForexPair(trade.instr) : null);
        actualRisk = B.riskAtStop(pair, entry, stop, actual);
      } else {
        actualRisk = actual * stopDist;
      }
    }
    const notional = (entry != null) ? actual * entry : null;
    const overRisk = actualRisk != null && budget > 0 && actualRisk > budget * 1.05;
    const overPos = notional != null && Number(basis.bal) > 0 && notional > Number(basis.bal) * 0.1 * 1.05;
    const genuine = overRisk || overPos;
    if (!genuine) {
      return { ok: false, genuineOversize: false, ratio };
    }
    return { ok: true, genuineOversize: true, ratio };
  },

  happenedPnl(trade, baron) {
    const B = baron || (typeof Baron !== "undefined" ? Baron : null);
    if (B && typeof B.resolveTradePnl === "function") {
      const stored = B.resolveTradePnl(trade);
      if (stored != null && Number.isFinite(Number(stored))) return Number(stored);
    }
    const stored = trade && trade.pnl;
    if (stored != null && stored !== "" && !Number.isNaN(Number(stored))) return Number(stored);
    return this.pnlAt(trade, this.num(trade && trade.size), B);
  },

  pnlAt(trade, size, baron) {
    const B = baron || (typeof Baron !== "undefined" ? Baron : null);
    const entry = this.num(trade && trade.entry);
    const exit = this.num(trade && trade.exit);
    const units = this.num(size);
    if (!entry || exit == null || units == null) return null;
    const dir = (trade && trade.dir) || "long";
    const pair = (trade && trade.pair) || (B && typeof B.parseForexPair === "function" ? B.parseForexPair(trade.instr) : null);
    if (B && typeof B.tradePnl === "function") {
      return Math.round(B.tradePnl(pair, entry, exit, units, dir));
    }
    const sign = dir === "long" ? 1 : -1;
    return Math.round((exit - entry) * sign * units);
  },

  formatPnl(n, sym) {
    if (n == null || !Number.isFinite(Number(n))) return "—";
    const v = Math.round(Number(n));
    const sign = v > 0 ? "+" : (v < 0 ? "−" : "");
    return sign + (sym || "€") + Math.abs(v).toLocaleString();
  },

  formatSize(n, kind) {
    if (n == null || !Number.isFinite(Number(n))) return "—";
    const v = Number(n);
    const unit = kind === "shares" ? " shares" : (kind === "crypto" ? " units" : " units");
    if (Number.isInteger(v)) return v.toLocaleString() + unit;
    return (Math.round(v * 10000) / 10000).toString() + unit;
  },

  formatStop(n) {
    if (n == null || !Number.isFinite(Number(n))) return "not stored";
    const v = Number(n);
    return Number.isInteger(v) ? String(v) : String(Math.round(v * 10000) / 10000);
  },

  takeawayLine(happened, disciplined, sym) {
    const h = this.formatPnl(happened, sym);
    if (disciplined == null || !Number.isFinite(Number(disciplined))) {
      return h + " happened · add a stop to see the disciplined result";
    }
    const d = this.formatPnl(disciplined, sym);
    const delta = Math.round(Number(disciplined) - (Number(happened) || 0));
    return h + " happened · " + d + " disciplined · Δ " + this.formatPnl(delta, sym);
  },

  takeawayUnchanged(happened, sym) {
    return this.formatPnl(happened, sym) + " happened · Δ " + this.formatPnl(0, sym) + " — no size or stop price to change";
  },

  emptyDeltaReasons(trade, sized) {
    const reasons = [];
    const actualSize = this.num(trade && trade.size);
    const kind = (sized && sized.kind) || this.kindOf(trade);
    if (trade && trade.sizeOk === false && sized && this.sameQty(sized.size, actualSize)) {
      reasons.push({
        id: "sizeFits",
        text: "You marked size outside rules, but at your recorded balance & risk % with this stop, "
          + this.formatSize(actualSize, kind)
          + " already fit. No size change to replay. (Process flag ≠ math.)",
      });
    }
    if (trade && trade.stopOk === false && this.recordedStop(trade) != null) {
      reasons.push({
        id: "stopProcess",
        text: "Stop flag means you didn't confirm before entry — it's a process miss. Replay can't invent a different stop price. Same fills, same stop.",
      });
    }
    return reasons;
  },

  ruleNote(trade, sized, usedFallbackStop, stopChanged) {
    const bits = [];
    if (trade && trade.challengeFail) bits.push("This fill was flagged against eval size rules.");
    if (trade && trade.sizeOk === false) {
      bits.push(sized && sized.cappedToActual
        ? "Actual size was already inside the recorded risk cap — kept as-is."
        : "Size was over your risk budget.");
    }
    if (usedFallbackStop) {
      bits.push("Stop price wasn’t stored. Size uses a 2% stop-distance convention and the recorded risk %.");
    } else if (stopChanged) {
      bits.push("Stop price was corrected.");
    } else if (trade && trade.sizeOk === false && this.recordedStop(trade) != null) {
      bits.push("Size uses the recorded stop and the risk % from the time of the trade.");
    }
    if (!bits.length) bits.push("Corrected size/stop against the rules at time of trade.");
    return bits.join(" ");
  },

  buildView(trade, settings, baron) {
    const B = baron || (typeof Baron !== "undefined" ? Baron : null);
    const S = settings || {};
    const basis = this.resolveRiskBasis(trade, S, B);
    const sym = (basis && basis.sym) || S.sym || "€";
    const kind = this.kindOf(trade, B);
    const happenedPnl = this.happenedPnl(trade, B);
    const actualSize = this.num(trade && trade.size);
    const actualStop = this.recordedStop(trade);
    const eligible = this.isEligible(trade);
    const usedFallbackStop = eligible && actualStop == null && !this.needsStopToCalc(trade);
    const missingBasis = !basis || basis.source === "missing";

    const view = {
      eligible,
      needsStop: false,
      missingSnapshot: missingBasis,
      instr: (trade && trade.instr) || "—",
      dir: (trade && trade.dir) || "long",
      settingsNote: this.formatBasisNote(basis, S),
      fillsNote: "same fills, corrected size/stop.",
      stopDisclaimer: null,
      cta: null,
      stampCta: missingBasis ? "Use current risk % / balance for this trade" : null,
      stampExplain: missingBasis
        ? "This stamps today's settings onto this fill because trade-time rules were never saved. It is not a historical claim."
        : null,
      happened: {
        size: actualSize,
        sizeLabel: this.formatSize(actualSize, kind),
        stop: actualStop,
        stopLabel: this.formatStop(actualStop),
        pnl: happenedPnl,
        pnlLabel: this.formatPnl(happenedPnl, sym),
      },
      disciplined: {
        size: null,
        sizeLabel: "—",
        stop: null,
        stopLabel: "—",
        pnl: null,
        pnlLabel: "—",
      },
      delta: null,
      deltaLabel: "—",
      takeaway: this.takeawayLine(happenedPnl, null, sym),
      ruleNote: "",
      unchanged: false,
      emptyReasons: [],
      kind,
      bal: missingBasis ? null : basis.bal,
      riskPct: missingBasis ? null : basis.risk,
      basisSource: basis && basis.source,
    };

    if (!eligible) {
      view.ruleNote = "Replay is for completed trades with a size or stop flag.";
      return view;
    }

    if (this.needsStopToCalc(trade)) {
      view.needsStop = true;
      view.cta = "Add a stop on this trade to replay";
      view.ruleNote = missingBasis
        ? "This trade was flagged for stop, and no stop price is stored. Add a stop to replay. No risk snapshot for this trade — Replay will not use today's settings."
        : "This trade was flagged for stop, and no stop price is stored. Add a stop to replay size against the rules at time of trade.";
      view.stopDisclaimer = "Exit is the recorded fill, not a simulated stop-out.";
      view.takeaway = this.takeawayLine(happenedPnl, null, sym);
      return view;
    }

    if (missingBasis) {
      view.fillsNote = "same fills — cannot size without a recorded risk % / balance.";
      view.ruleNote = "No risk snapshot for this trade. Replay will not invent a disciplined size from today's settings.";
      view.takeaway = this.formatPnl(happenedPnl, sym) + " happened · no risk snapshot for this trade";
      if (trade.stopOk === false) {
        view.stopDisclaimer = "Exit is the recorded fill, not a simulated stop-out.";
      }
      return view;
    }

    const discStop = this.disciplinedStop(trade);
    const sized = this.compliantSize(trade, { bal: basis.bal, risk: basis.risk }, B, discStop);
    const sanity = this.sizeSanity(trade, sized, basis, discStop, B);
    if (!sanity.ok) {
      view.fillsNote = "same fills — size math did not check out against the recorded rules.";
      view.ruleNote = "Disciplined size did not match the recorded risk % / balance, entry, and stop distance. Replay will not show a made-up size.";
      view.takeaway = this.formatPnl(happenedPnl, sym) + " happened · size math did not check out";
      view.missingSnapshot = false;
      view.sanityFailed = true;
      return view;
    }

    const discPnl = this.pnlAt(trade, sized.size, B);
    const delta = discPnl != null && happenedPnl != null
      ? Math.round(discPnl - happenedPnl)
      : null;

    view.disciplined = {
      size: sized.size,
      sizeLabel: this.formatSize(sized.size, kind),
      stop: discStop,
      stopLabel: this.formatStop(discStop),
      pnl: discPnl,
      pnlLabel: this.formatPnl(discPnl, sym),
    };
    view.delta = delta;
    view.deltaLabel = this.formatPnl(delta, sym);
    const sizeSame = !this.isRealSizeCut(sized.size, actualSize);
    const stopSame = this.sameQty(discStop, actualStop);
    const unchanged = sizeSame && stopSame;
    view.unchanged = unchanged;
    view.emptyReasons = unchanged ? this.emptyDeltaReasons(trade, sized) : [];
    if (unchanged) {
      view.fillsNote = "same fills — no size or stop price change.";
      view.takeaway = this.takeawayUnchanged(happenedPnl, sym);
      view.ruleNote = view.emptyReasons.map((r) => r.text).join(" ");
      if (!view.ruleNote) {
        view.ruleNote = "No size or stop price change to replay.";
      }
    } else {
      view.takeaway = this.takeawayLine(happenedPnl, discPnl, sym);
      view.ruleNote = this.ruleNote(trade, sized, usedFallbackStop, !stopSame);
    }
    if (trade.stopOk === false) {
      view.stopDisclaimer = "Exit is the recorded fill, not a simulated stop-out.";
    }
    return view;
  },
};

if (typeof window !== "undefined") window.DisciplineReplay = DisciplineReplay;
if (typeof globalThis !== "undefined") globalThis.DisciplineReplay = DisciplineReplay;
