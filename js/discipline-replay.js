/** Disciplined Replay v1 — same fills, corrected size/stop. No candles, no what-if. */
const DisciplineReplay = {
  /** Coach / sizer convention when a stop was confirmed but the price was not stored. Not ATR. */
  FALLBACK_STOP_PCT: 0.02,

  isEligible(trade) {
    if (!trade || typeof trade !== "object") return false;
    if (trade.incomplete) return false;
    return trade.sizeOk === false || trade.stopOk === false;
  },

  /**
   * Journal CTA: only when Replay has a real action.
   * 1) Missing-stop CTA — stopOk false and no recorded stop.
   * 2) Numeric size cut — compliant size is strictly smaller than actual.
   * Empty-Δ (process stop with stored stop, and/or size already fits) stays off the button.
   */
  canReplay(trade, settings, baron) {
    if (!this.isEligible(trade)) return false;
    if (this.needsStopToCalc(trade)) return true;
    return this.hasNumericSizeCut(trade, settings, baron);
  },

  shouldShowButton(trade, settings, baron) {
    return this.canReplay(trade, settings, baron);
  },

  hasNumericSizeCut(trade, settings, baron) {
    if (!this.isEligible(trade)) return false;
    const B = baron || (typeof Baron !== "undefined" ? Baron : null);
    const S = settings || {};
    const actual = this.num(trade && trade.size);
    if (actual == null || !(actual > 0)) return false;
    const discStop = this.disciplinedStop(trade);
    if (discStop == null) return false;
    const bal = this.balanceOf(S, trade, B);
    const risk = Number(S.risk);
    const riskPct = Number.isFinite(risk) ? risk : 1;
    const sized = this.compliantSize(trade, { bal, risk: riskPct }, B, discStop);
    const computed = this.num(sized && sized.size);
    if (computed == null) return false;
    return computed < actual && !this.sameQty(computed, actual);
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
        text: "You marked size outside rules, but at your current balance & risk % with this stop, "
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

  ruleNote(trade, sized, usedFallbackStop) {
    const bits = [];
    if (trade && trade.challengeFail) bits.push("This fill was flagged against eval size rules.");
    if (trade && trade.sizeOk === false) {
      bits.push(sized && sized.cappedToActual
        ? "Actual size was already inside the current risk cap — kept as-is."
        : "Size was over your current risk budget.");
    }
    if (trade && trade.stopOk === false && this.recordedStop(trade) != null) {
      bits.push("Stop was flagged. Size uses the recorded stop and current risk %.");
    }
    if (usedFallbackStop) {
      bits.push("Stop price wasn’t stored. Size uses a 2% stop-distance convention and your current risk %.");
    }
    if (!bits.length) bits.push("Corrected size/stop against your current risk rules.");
    return bits.join(" ");
  },

  buildView(trade, settings, baron) {
    const B = baron || (typeof Baron !== "undefined" ? Baron : null);
    const S = settings || {};
    const sym = S.sym || "€";
    const risk = Number(S.risk);
    const riskPct = Number.isFinite(risk) ? risk : 1;
    const bal = this.balanceOf(S, trade, B);
    const kind = this.kindOf(trade, B);
    const happenedPnl = this.happenedPnl(trade, B);
    const actualSize = this.num(trade && trade.size);
    const actualStop = this.recordedStop(trade);
    const eligible = this.isEligible(trade);
    const usedFallbackStop = eligible && actualStop == null && !this.needsStopToCalc(trade);

    const view = {
      eligible,
      needsStop: false,
      instr: (trade && trade.instr) || "—",
      dir: (trade && trade.dir) || "long",
      settingsNote: "using your current risk % / balance",
      fillsNote: "same fills, corrected size/stop.",
      stopDisclaimer: null,
      cta: null,
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
      bal,
      riskPct,
    };

    if (!eligible) {
      view.ruleNote = "Replay is for completed trades with a size or stop flag.";
      return view;
    }

    if (this.needsStopToCalc(trade)) {
      view.needsStop = true;
      view.cta = "Add a stop on this trade to replay";
      view.ruleNote = "This trade was flagged for stop, and no stop price is stored. Add a stop to replay size against your current risk rules.";
      view.stopDisclaimer = "Exit is the recorded fill, not a simulated stop-out.";
      view.takeaway = this.takeawayLine(happenedPnl, null, sym);
      return view;
    }

    const discStop = this.disciplinedStop(trade);
    const sized = this.compliantSize(trade, { bal, risk: riskPct }, B, discStop);
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
    const sizeSame = this.sameQty(sized.size, actualSize);
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
      view.ruleNote = this.ruleNote(trade, sized, usedFallbackStop);
    }
    if (trade.stopOk === false) {
      view.stopDisclaimer = "Exit is the recorded fill, not a simulated stop-out.";
    }
    return view;
  },
};

if (typeof window !== "undefined") window.DisciplineReplay = DisciplineReplay;
if (typeof globalThis !== "undefined") globalThis.DisciplineReplay = DisciplineReplay;
