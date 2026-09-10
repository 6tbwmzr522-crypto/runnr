/** Runnr Coach v1 — insights, discipline scoring, trade analysis */
const CoachEngine = {
  parseTradeDate(dateStr, filledAt) {
    if (filledAt) {
      const iso = new Date(filledAt);
      if (!Number.isNaN(iso.getTime())) return iso;
    }
    const s = String(dateStr || "").trim();
    if (!s) return null;
    const months = {
      Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
      Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
    };
    const parts = s.replace(/,/g, " ").split(/\s+/).filter(Boolean);
    const mon = (tok) => months[String(tok || "").slice(0, 3)];
    const yearNow = new Date().getFullYear();
    if (parts.length >= 2 && mon(parts[0]) != null) {
      const y = parseInt(parts[2], 10);
      return new Date(Number.isFinite(y) ? y : yearNow, mon(parts[0]), parseInt(parts[1], 10) || 1);
    }
    if (parts.length >= 2 && mon(parts[1]) != null) {
      const y = parseInt(parts[2], 10);
      return new Date(Number.isFinite(y) ? y : yearNow, mon(parts[1]), parseInt(parts[0], 10) || 1);
    }
    const parsed = new Date(s);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  },

  tradeDate(t) {
    if (!t) return null;
    return this.parseTradeDate(t.date, t.filledAt);
  },

  /**
   * Fill-evidence weights (hypothesis — refine if the mix feels off).
   * Broker-synced fills are higher-confidence than self-reported journal rows.
   * CSV imports sit in between: they come from a broker export but can be
   * remapped or edited. Manual logs are still scored — they just weigh less,
   * so an 80% stop rate is not self-graded homework.
   *
   *   synced   (alpaca / ibkr / t212 / sampleOrigin synced) = 1.00
   *   imported (csv / sampleOrigin imported)                = 0.85
   *   manual   (typed journal / sampleOrigin manual)        = 0.50
   */
  FILL_WEIGHT: { synced: 1, imported: 0.85, manual: 0.5 },
  BROKER_SOURCES: { alpaca: true, ibkr: true, t212: true },

  fillEvidenceKind(t) {
    if (!t) return "manual";
    const origin = String(t.sampleOrigin || "").toLowerCase();
    if (origin === "synced" || origin === "broker") return "synced";
    if (origin === "imported" || origin === "csv") return "imported";
    if (origin === "manual") return "manual";
    const src = String(t.source || "").toLowerCase();
    if (this.BROKER_SOURCES[src]) return "synced";
    if (src === "csv") return "imported";
    // SAMPLE factory rows without a source are a broker-like preview.
    if (t.isDemo === true || t.seed === true) return "synced";
    return "manual";
  },

  fillWeight(t) {
    const kind = this.fillEvidenceKind(t);
    const w = this.FILL_WEIGHT[kind];
    return Number.isFinite(w) ? w : this.FILL_WEIGHT.manual;
  },

  fillEvidenceLabel(t) {
    const kind = this.fillEvidenceKind(t);
    const demo = !!(t && (t.isDemo === true || t.seed === true));
    if (kind === "synced") return demo ? "Synced (sample)" : "Synced";
    if (kind === "imported") return demo ? "Imported (sample)" : "Imported";
    return demo ? "Manual (sample)" : "Manual";
  },

  fillEvidenceBadgeHtml(t) {
    const kind = this.fillEvidenceKind(t);
    const label = this.fillEvidenceLabel(t);
    return `<span class="flag flag-src flag-src-${kind}">${label}</span>`;
  },

  fillEvidenceMix(trades) {
    const mix = { synced: 0, imported: 0, manual: 0 };
    (trades || []).forEach((t) => {
      if (!t) return;
      mix[this.fillEvidenceKind(t)] += 1;
    });
    return mix;
  },

  weightedFlagPct(trades, pred) {
    let ok = 0;
    let all = 0;
    (trades || []).forEach((t) => {
      const w = this.fillWeight(t);
      all += w;
      if (pred(t)) ok += w;
    });
    return all > 0 ? (ok / all) * 100 : 0;
  },

  isClosedPnlTrade(t) {
    if (!t || t.disciplineOnly || t.mergedAway) return false;
    if (window.Baron?.isOpenTrade?.(t)) return false;
    const pnl = window.Baron?.resolveTradePnl?.(t);
    if (pnl == null) return false;
    if (!t.incomplete) return true;
    const src = String(t.source || "").toLowerCase();
    return src === "alpaca" && (t.alpacaPaired || (Number(t.entry) > 0 && Number(t.exit) > 0));
  },

  completed(trades) {
    return trades
      .filter((t) => this.isClosedPnlTrade(t))
      .map((t) => {
        const pnl = window.Baron?.resolveTradePnl?.(t) ?? t.pnl;
        return pnl != null ? { ...t, pnl } : null;
      })
      .filter(Boolean);
  },

  forDiscipline(trades) {
    return trades.filter((t) => !t.incomplete);
  },

  withinDays(trades, days) {
    const now = new Date();
    return this.completed(trades).filter((t) => {
      const d = this.tradeDate(t);
      if (!d) return days >= 365;
      return (now - d) / 86400000 <= days;
    });
  },

  metrics(trades) {
    const c = this.completed(trades);
    const d = this.forDiscipline(trades);
    const wins = c.filter((t) => t.pnl > 0);
    const losses = c.filter((t) => t.pnl <= 0);
    const winPnL = wins.reduce((s, t) => s + t.pnl, 0);
    const lossPnL = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
    return {
      count: c.length,
      winRate: c.length ? (wins.length / c.length) * 100 : 0,
      profitFactor: lossPnL > 0 ? winPnL / lossPnL : wins.length ? 999 : 0,
      stopPct: this.weightedFlagPct(d, (t) => t.stopOk),
      sizePct: this.weightedFlagPct(d, (t) => t.sizeOk),
      totalPnl: c.reduce((s, t) => s + t.pnl, 0),
      undiscPnl: c.filter((t) => !t.stopOk || !t.sizeOk).reduce((s, t) => s + t.pnl, 0),
      discPnl: c.filter((t) => t.stopOk && t.sizeOk).reduce((s, t) => s + t.pnl, 0),
    };
  },

  /**
   * Discipline score: 40% stops, 40% size, 20% both-flags completeness.
   * Stop / size / completeness percents are fill-weighted (see FILL_WEIGHT)
   * so broker-synced rows move the needle more than manual journal rows.
   * tradeCount stays an unweighted headcount. P&L is never weighted.
   */
  disciplineScore(trades) {
    const d = this.forDiscipline(trades);
    const c = this.completed(trades);
    const evidence = this.fillEvidenceMix(d);
    if (!d.length) {
      return {
        overall: 0, stopPct: 0, sizePct: 0, completePct: 0,
        streak: this.loggingStreak(trades), tradeCount: 0, tier: "Novice",
        evidence,
      };
    }
    const stopPct = this.weightedFlagPct(d, (t) => t.stopOk);
    const sizePct = this.weightedFlagPct(d, (t) => t.sizeOk);
    const completePct = this.weightedFlagPct(d, (t) => t.stopOk && t.sizeOk);
    const overall = stopPct * 0.4 + sizePct * 0.4 + completePct * 0.2;
    let tier = "Novice";
    if (overall >= 80 && d.length >= 20) tier = "Consistent Runner";
    else if (overall >= 65 && d.length >= 10) tier = "Disciplined";
    else if (overall >= 45 || d.length >= 3) tier = "Learning";
    return {
      overall: Math.round(overall),
      stopPct: Math.round(stopPct),
      sizePct: Math.round(sizePct),
      completePct: Math.round(completePct),
      streak: this.loggingStreak(trades),
      tradeCount: d.length,
      tier,
      evidence,
    };
  },

  loggingStreak(trades) {
    const dates = [...new Set(
      trades.filter((t) => t.date).map((t) => {
        const d = this.tradeDate(t);
        return d ? d.toDateString() : null;
      }).filter(Boolean),
    )];
    if (!dates.length) return 0;
    const daySet = new Set(dates);
    let streak = 0;
    const cursor = new Date();
    cursor.setHours(0, 0, 0, 0);
    while (daySet.has(cursor.toDateString())) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  },

  /** 5-minute onboarding hook — cost of oversizing / no stop */
  analyzeTrade(trade, balance = 10000, riskPct = 1, sym = "€") {
    const entry = parseFloat(trade.entry);
    const exit = parseFloat(trade.exit);
    const size = parseFloat(trade.size) || 1;
    const dir = trade.dir || "long";
    const stop = parseFloat(trade.stop);

    if (!entry || !exit) {
      return { ok: false, error: "Entry and exit are required." };
    }

    const stopDist = stop && stop !== entry
      ? Math.abs(entry - stop)
      : Math.abs(entry) * 0.02;

    let properShares = size;
    let capped = false;
    const pair = window.Baron?.parseForexPair?.(trade.instr);
    const stopPrice = stop && stop !== entry
      ? stop
      : (dir === "long" ? entry - stopDist : entry + stopDist);
    if (pair && window.Baron?.sizeForex) {
      const sized = Baron.sizeForex(balance, riskPct, entry, stopPrice, trade.instr);
      properShares = sized.units;
    } else if (window.Baron && typeof Baron.sizeShares === "function" && stopDist > 0) {
      const sized = Baron.sizeShares(balance, riskPct, entry, dir === "long" ? entry - stopDist : entry + stopDist);
      properShares = sized.shares;
      capped = sized.capped;
    } else if (stopDist > 0) {
      const riskAmount = balance * (riskPct / 100);
      properShares = Math.max(1, Math.floor(riskAmount / stopDist));
      const maxShares = Math.floor((balance * 0.1) / entry);
      if (maxShares > 0) properShares = Math.min(properShares, maxShares);
    }

    const sign = dir === "long" ? 1 : -1;
    const pnlAt = (px, units) => pair && Baron.tradePnl
      ? Baron.tradePnl(pair, entry, px, units, dir)
      : (px - entry) * sign * units;
    const actualPnl = Math.round(pnlAt(exit, size));
    const properPnl = Math.round(pnlAt(exit, properShares));
    const oversizeUnits = Math.max(0, size - properShares);
    const oversizeCost = oversizeUnits > 0
      ? Math.round(pnlAt(exit, oversizeUnits))
      : 0;

    const noStop = !trade.stopOk && trade.stopOk !== true;
    const oversize = size > properShares * 1.05;
    const riskAmount = balance * (riskPct / 100);
    const extraRisk = oversize
      ? Math.round(pair && Baron.sizeForex
        ? Baron.sizeForex(balance, riskPct, entry, stopPrice, trade.instr).risk * (size / properShares - 1)
        : (size - properShares) * stopDist)
      : 0;

    let disciplineCost = 0;
    if (actualPnl < 0 && oversizeCost < 0) disciplineCost = Math.abs(oversizeCost);
    else if (actualPnl < 0 && oversize) disciplineCost = Math.abs(actualPnl) - Math.abs(properPnl);
    else if (oversize && actualPnl >= 0) disciplineCost = Math.max(0, actualPnl - properPnl);

    if (disciplineCost < 0) disciplineCost = 0;

    const headline = disciplineCost > 0
      ? `Undisciplined sizing cost you ${sym}${Math.round(disciplineCost).toLocaleString()}`
      : actualPnl >= 0
        ? "Process was clean on this trade"
        : "Loss within rules — size looked appropriate";

    let insight = "";
    if (oversize) {
      insight = `You traded ${size} units; at ${riskPct}% risk the cap was ~${properShares}${capped ? " (10% position cap)" : ""}.`;
    } else if (noStop) {
      insight = "Stop was not confirmed before entry — the #1 fix for most retail blow-ups.";
    } else {
      insight = "Size matched your risk rules. Keep logging every trade so Coach can spot patterns.";
    }

    return {
      ok: true,
      instr: trade.instr || "—",
      actualPnl,
      properPnl,
      properShares,
      actualShares: size,
      oversizeCost: disciplineCost,
      extraRisk,
      riskAmount: Math.round(riskAmount),
      stopDist: +stopDist.toFixed(4),
      headline,
      insight,
      suggestedStopOk: !!stop || trade.stopOk === true,
      suggestedSizeOk: !oversize,
      flags: { oversize, noStop },
    };
  },

  weeklyDigest(trades, sym = "€") {
    const score = this.disciplineScore(trades);
    const week = this.metrics(this.withinDays(trades, 7));
    const priorTrades = this.completed(trades).filter((t) => {
      const d = this.tradeDate(t);
      if (!d) return false;
      const days = (new Date() - d) / 86400000;
      return days > 7 && days <= 14;
    });
    const prior = this.metrics(priorTrades);
    const insights = this.generateInsights(trades, sym);
    const top = insights[0];

    const stopDelta = week.count ? week.stopPct - prior.stopPct : 0;
    const deltaStr = week.count && prior.count
      ? `${stopDelta >= 0 ? "↑" : "↓"} ${Math.abs(stopDelta).toFixed(0)}pp stops vs last week`
      : week.count ? `${week.stopPct.toFixed(0)}% stop discipline this week` : "Log trades to unlock weekly Coach";

    return {
      score: score.overall,
      stopPct: score.stopPct,
      sizePct: score.sizePct,
      streak: score.streak,
      tradeCount: score.tradeCount,
      weekPnl: week.totalPnl,
      subject: `Runnr · ${score.overall}% discipline this week`,
      pushTitle: `Discipline score: ${score.overall}%`,
      pushBody: top ? top.title.replace(/^[^\s]+\s/, "") + " — " + top.text.slice(0, 80) + "…" : deltaStr,
      bannerText: week.count
        ? `Weekly review ready · ${score.overall}% discipline · ${deltaStr}`
        : "Analyse your last trade — see what discipline would have saved",
      action: top && top.type === "warning" ? top.text.split(".")[0] + "." : "Review your journal before Monday's open.",
      insights,
    };
  },

  tradesInDays(trades, days, now = new Date()) {
    const end = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
    return (trades || []).filter((t) => {
      if (!t || t.mergedAway) return false;
      const d = this.tradeDate(t);
      if (!d) return false;
      return (end - d) / 86400000 <= days;
    });
  },

  formatCardRange(start, end) {
    const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    if (!(start instanceof Date) || !(end instanceof Date)) return "";
    const d1 = start.getDate();
    const d2 = end.getDate();
    const m1 = months[start.getMonth()];
    const m2 = months[end.getMonth()];
    const y1 = start.getFullYear();
    const y2 = end.getFullYear();
    if (m1 === m2 && y1 === y2) return `${d1} – ${d2} ${m1} ${y1}`;
    if (y1 === y2) return `${d1} ${m1} – ${d2} ${m2} ${y1}`;
    return `${d1} ${m1} ${y1} – ${d2} ${m2} ${y2}`;
  },

  fmtCardMoney(sym, n) {
    if (n == null || !Number.isFinite(Number(n))) return "—";
    const r = Math.round(Number(n));
    return (r < 0 ? "-" : "") + sym + Math.abs(r).toLocaleString("en-GB");
  },

  fmtCardPct(n) {
    if (n == null || !Number.isFinite(Number(n))) return "—";
    return Math.round(Number(n)) + "%";
  },

  fmtCardPf(n) {
    if (n == null || !Number.isFinite(Number(n))) return "—";
    if (Number(n) >= 99) return "∞";
    return (Math.round(Number(n) * 10) / 10).toFixed(1);
  },

  leakLabel(score, metrics) {
    if (!metrics || !metrics.count) return "followed";
    const stop = Number(score && score.stopPct);
    const size = Number(score && score.sizePct);
    if (Number.isFinite(stop) && Number.isFinite(size)) {
      if (size + 5 < stop) return "size leaks";
      if (stop + 5 < size) return "stop leaks";
    }
    if (metrics.undiscPnl) return "process leaks";
    return "followed";
  },

  shareCoachNote(score, metrics, riskPct, hasWeek) {
    if (!hasWeek) {
      return "No trades logged this week. Journal the next fill and Coach will write the note.";
    }
    const stop = Number(score && score.stopPct);
    const size = Number(score && score.sizePct);
    const risk = Number(riskPct) > 0 ? Number(riskPct) : 1;
    if (stop >= 95 && size < 80) {
      return `Stops were perfect. Size is the only leak — next week: hard ${risk}% max.`;
    }
    if (stop >= 80 && size < 70) {
      return `Stops held. Size is the leak — next week: hard ${risk}% max.`;
    }
    if (size >= 95 && stop < 80) {
      return "Size was clean. Stops slipped — confirm before the next entry.";
    }
    if (stop >= 80 && size >= 80) {
      return "Process held. Keep the checklist before the next session.";
    }
    if (stop < 70 && size < 70) {
      return "Stops and size both leaked — tighten rules before the next entry.";
    }
    if (size <= stop) {
      return `Size is the weaker leg (${Math.round(size)}%). Next week: hard ${risk}% max.`;
    }
    return `Stops are the weaker leg (${Math.round(stop)}%). Confirm before entry.`;
  },

  eliteProgress(trades) {
    const d = this.forDiscipline(trades);
    const n = d.length;
    const stopPct = this.weightedFlagPct(d, (t) => t.stopOk);
    const target = 20;
    const consistent = n >= target && stopPct >= 80;
    return {
      label: consistent ? "ELITE RUNNER" : "PROGRESS TO ELITE RUNNER",
      ratio: consistent ? 1 : Math.min(1, n / target),
      detail: `${Math.min(n, target)} / ${target} trades with 80%+ stop confirmation`,
      current: n,
      target,
      stopPct: Math.round(stopPct),
    };
  },

  /** Share-card payload from journal metrics — never invents sample numbers. */
  weeklyShareModel(trades, opts = {}) {
    const now = opts.now instanceof Date && !Number.isNaN(opts.now.getTime()) ? opts.now : new Date();
    const sym = opts.sym || "€";
    const riskPct = Number(opts.riskPct) > 0 ? Number(opts.riskPct) : 1;
    const handle = String(opts.handle || "").replace(/^@/, "").trim();
    const weekTrades = this.tradesInDays(trades, 7, now);
    const weekScore = this.disciplineScore(weekTrades);
    const weekMetrics = this.metrics(weekTrades);
    const hasWeek = weekScore.tradeCount > 0 || weekMetrics.count > 0;
    const score = hasWeek ? weekScore : { overall: null, stopPct: null, sizePct: null, streak: this.loggingStreak(trades), tradeCount: 0, tier: "" };
    const dated = weekTrades.map((t) => this.tradeDate(t)).filter(Boolean);
    let start;
    let end;
    if (dated.length) {
      start = new Date(Math.min(...dated.map((d) => d.getTime())));
      end = new Date(Math.max(...dated.map((d) => d.getTime())));
    } else {
      end = new Date(now);
      start = new Date(now);
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() - 6);
    }
    return {
      dateLabel: this.formatCardRange(start, end),
      overall: hasWeek && score.tradeCount ? score.overall : null,
      overallLabel: hasWeek && score.tradeCount ? score.overall + "%" : "—",
      tier: hasWeek && score.tradeCount ? score.tier : "—",
      streak: this.loggingStreak(trades),
      tradeCount: score.tradeCount || 0,
      stopPct: hasWeek && score.tradeCount ? score.stopPct : null,
      sizePct: hasWeek && score.tradeCount ? score.sizePct : null,
      stopLabel: this.fmtCardPct(hasWeek && score.tradeCount ? score.stopPct : null),
      sizeLabel: this.fmtCardPct(hasWeek && score.tradeCount ? score.sizePct : null),
      profitFactor: weekMetrics.count ? weekMetrics.profitFactor : null,
      winRate: weekMetrics.count ? weekMetrics.winRate : null,
      pfLabel: this.fmtCardPf(weekMetrics.count ? weekMetrics.profitFactor : null),
      winLabel: this.fmtCardPct(weekMetrics.count ? weekMetrics.winRate : null),
      discPnl: weekMetrics.count ? weekMetrics.discPnl : null,
      undiscPnl: weekMetrics.count ? weekMetrics.undiscPnl : null,
      discPnlLabel: this.fmtCardMoney(sym, weekMetrics.count ? weekMetrics.discPnl : null),
      undiscPnlLabel: this.fmtCardMoney(sym, weekMetrics.count ? weekMetrics.undiscPnl : null),
      hasPnl: weekMetrics.count > 0,
      leakLabel: this.leakLabel(score, weekMetrics),
      coachNote: this.shareCoachNote(score, weekMetrics, riskPct, hasWeek),
      progress: this.eliteProgress(trades),
      handle,
      brandUrl: "runnr.fyi",
      handleUrl: handle ? "runnr.fyi/u/" + handle : "",
      tagline: "Discipline OS · Process · not P&L",
      hasWeek,
    };
  },

  byInstrument(trades) {
    const map = {};
    this.completed(trades).forEach((t) => {
      if (!map[t.instr]) map[t.instr] = { n: 0, stopFail: 0, sizeFail: 0, pnl: 0 };
      map[t.instr].n++;
      if (!t.stopOk) map[t.instr].stopFail++;
      if (!t.sizeOk) map[t.instr].sizeFail++;
      map[t.instr].pnl += t.pnl;
    });
    return map;
  },

  generateInsights(trades, sym = "€") {
    const insights = [];
    const all = this.metrics(trades);
    const week = this.metrics(this.withinDays(trades, 7));
    const byInstr = this.byInstrument(trades);

    if (all.count < 1) {
      insights.push({
        type: "info",
        title: "ℹ Getting started",
        text: "Log your first trade to see what discipline would have saved. The 5-minute analysis is free.",
      });
      return insights;
    }

    if (all.count < 3) {
      insights.push({
        type: "info",
        title: "ℹ Building your book",
        text: `You have ${all.count} completed trade${all.count > 1 ? "s" : ""}. Coach gets sharper after 5 — keep flagging stops and size.`,
      });
    }

    if (week.stopPct < 70 && week.count >= 2) {
      insights.push({
        type: "warning",
        title: "⚠ Stop confirmation slipping",
        text: `Only ${week.stopPct.toFixed(0)}% of trades this week had stops confirmed before entry. Undisciplined stops cost ${sym}${Math.abs(Math.round(week.undiscPnl)).toLocaleString()} in your recent book.`,
      });
    }

    if (all.stopPct >= 80) {
      insights.push({
        type: "positive",
        title: "✓ Stop discipline strong",
        text: `${all.stopPct.toFixed(0)}% stop confirmation across ${all.count} trades. Strong process — keep the pre-trade checklist.`,
      });
    }

    if (all.sizePct < 75 && all.count >= 2) {
      insights.push({
        type: "warning",
        title: "⚠ Oversizing pattern",
        text: `Size discipline is ${all.sizePct.toFixed(0)}%. Check the Sizer before entry — default rules use 1% risk with a 10% position cap.`,
      });
    }

    const worst = Object.entries(byInstr)
      .map(([name, v]) => ({
        name,
        failRate: (v.stopFail + v.sizeFail) / (v.n * 2),
        pnl: v.pnl,
        n: v.n,
      }))
      .filter((x) => x.n >= 2)
      .sort((a, b) => b.failRate - a.failRate)[0];

    if (worst && worst.failRate > 0.35) {
      insights.push({
        type: "warning",
        title: "⚠ Instrument alert",
        text: `${worst.name} has the weakest discipline (${(worst.failRate * 100).toFixed(0)}% flag failures on ${worst.n} trades). Consider shrinking size or skipping until process improves.`,
      });
    }

    const winners = this.completed(trades).filter((t) => t.pnl > 0);
    const earlyCuts = winners.filter((t) => t.exit && t.entry && Math.abs(t.exit - t.entry) < Math.abs(t.entry) * 0.03);
    if (winners.length >= 3 && earlyCuts.length / winners.length > 0.4) {
      insights.push({
        type: "warning",
        title: "⚠ Winners cut early",
        text: `${earlyCuts.length} of ${winners.length} winners exited with <3% gain — possible fear of giving back profits. Trail stops often beat manual early exits.`,
      });
    }

    if (all.profitFactor >= 1.5) {
      insights.push({
        type: "positive",
        title: "✓ Profit factor healthy",
        text: `Profit factor ${all.profitFactor.toFixed(2)} on ${all.count} trades. Disciplined P&L: ${sym}${Math.round(all.discPnl).toLocaleString()}.`,
      });
    }

    const toTier = Math.max(0, 20 - all.count);
    if (toTier > 0 && all.count >= 3) {
      insights.push({
        type: "info",
        title: "ℹ Tier progress",
        text: `${toTier} more logged trades to hit the 20-trade Consistent Runner benchmark (need 80%+ stop discipline).`,
      });
    }

    return insights.slice(0, 5);
  },

  answerQuestion(trades, question, sym = "€", balance = 10000, riskPct = 1) {
    const q = (question || "").toLowerCase();
    const all = this.metrics(trades);
    const byInstr = this.byInstrument(trades);
    const completed = this.completed(trades);

    if (q.includes("cut winners") || q.includes("early")) {
      const winners = completed.filter((t) => t.pnl > 0);
      if (winners.length < 3) {
        return "Need more winning trades in the journal to detect an early-exit pattern.";
      }
      const small = winners.filter((t) => t.pnl < (balance * riskPct) / 100 * 2);
      return `${small.length} of ${winners.length} winners booked less than 2R — review exits on ${[...new Set(small.map((t) => t.instr))].slice(0, 3).join(", ") || "recent names"}. Consider letting trail stops run.`;
    }

    if (q.includes("worst instrument") || (q.includes("discipline") && q.includes("instrument"))) {
      const ranked = Object.entries(byInstr)
        .map(([name, v]) => ({ name, rate: 1 - (v.stopFail + v.sizeFail) / (v.n * 2), n: v.n }))
        .filter((x) => x.n >= 2)
        .sort((a, b) => a.rate - b.rate);
      if (!ranked.length) return "Log 2+ trades per instrument for a meaningful comparison.";
      const w = ranked[0];
      return `${w.name} shows the lowest discipline score (${(w.rate * 100).toFixed(0)}% clean flags over ${w.n} trades). Tighten process or reduce size there first.`;
    }

    if (q.includes("p&l") || q.includes("rules") || q.includes("100%")) {
      const gap = all.undiscPnl;
      return `Actual P&L on disciplined vs sloppy trades: clean flags ${sym}${Math.round(all.discPnl).toLocaleString()}, lapses ${sym}${Math.round(gap).toLocaleString()}. Closing the discipline gap is worth ${sym}${Math.abs(Math.round(all.discPnl - all.totalPnl)).toLocaleString()} vs your current path.`;
    }

    if (q.includes("oversiz") || q.includes("position size") || q.includes("too big")) {
      const sizeFail = completed.filter((t) => t.sizeOk === false).length;
      if (!completed.length) return "Log closed trades with size flags to check oversizing.";
      return `${sizeFail} of ${completed.length} trades flagged size issues (${all.sizePct.toFixed(0)}% size discipline). Default risk is ${riskPct}% with a 10% max position — size in the Sizer before entry.`;
    }

    if (q.includes("win rate") || q.includes("profit factor") || q.includes("pf")) {
      if (!completed.length) return "Need closed trades with P&L for win rate and profit factor.";
      return `Win rate ${all.winRate.toFixed(0)}% · profit factor ${all.profitFactor.toFixed(2)} across ${all.count} closed trades. PF > 1.25 with 200+ trades is the institutional bar — keep logging.`;
    }

    if (q.includes("day of week") || q.includes("weekday") || q.includes("best day")) {
      const buckets = {};
      completed.forEach((t) => {
        const d = this.tradeDate(t);
        if (!d) return;
        const key = d.toLocaleDateString("en-GB", { weekday: "short" });
        if (!buckets[key]) buckets[key] = { n: 0, pnl: 0 };
        buckets[key].n += 1;
        buckets[key].pnl += t.pnl || 0;
      });
      const ranked = Object.entries(buckets).sort((a, b) => b[1].pnl - a[1].pnl);
      if (!ranked.length) return "Need dated closed trades to see weekday patterns.";
      const [best, b] = ranked[0];
      const [worst, w] = ranked[ranked.length - 1];
      return `Best: ${best} (${sym}${Math.round(b.pnl).toLocaleString()} / ${b.n} trades). Softest: ${worst} (${sym}${Math.round(w.pnl).toLocaleString()} / ${w.n}). Sample is small — treat as a hint, not a rule.`;
    }

    if (q.includes("long vs short") || q.includes("long/short") || (q.includes("long") && q.includes("short"))) {
      const longs = completed.filter((t) => (t.dir || "long") === "long");
      const shorts = completed.filter((t) => t.dir === "short");
      const sum = (arr) => arr.reduce((s, t) => s + (t.pnl || 0), 0);
      if (!longs.length && !shorts.length) return "No closed trades yet to compare long vs short.";
      return `Longs: ${longs.length} trades · ${sym}${Math.round(sum(longs)).toLocaleString()}. Shorts: ${shorts.length} trades · ${sym}${Math.round(sum(shorts)).toLocaleString()}. Lean into the side with cleaner process, not just raw P&L.`;
    }

    if (q.includes("streak")) {
      const chrono = this.sortTradesChrono(completed);
      if (!chrono.length) return "Log closed trades to track win/loss streaks.";
      let cur = 0;
      let best = 0;
      let worst = 0;
      let run = 0;
      chrono.forEach((t) => {
        const win = (t.pnl || 0) > 0;
        if (cur === 0) {
          cur = win ? 1 : -1;
        } else if ((cur > 0 && win) || (cur < 0 && !win)) {
          cur += win ? 1 : -1;
        } else {
          cur = win ? 1 : -1;
        }
        best = Math.max(best, cur);
        worst = Math.min(worst, cur);
        run = cur;
      });
      return `Current run: ${run > 0 ? run + " wins" : Math.abs(run) + " losses"}. Best win streak ${Math.max(best, 0)}, worst loss streak ${Math.abs(Math.min(worst, 0))}. Protect process on loss streaks — don't revenge-size.`;
    }

    return `Based on ${all.count} trades: ${all.stopPct.toFixed(0)}% stop discipline, ${all.sizePct.toFixed(0)}% size discipline, PF ${all.profitFactor.toFixed(2)}. Try: early exits, worst instrument, oversizing, win rate vs PF, weekday edge, long vs short, or streaks.`;
  },

  equityComparison(trades, balance) {
    const c = this.completed(trades);
    let actual = 0;
    let ideal = 0;
    const pointsA = [0];
    const pointsI = [0];
    c.slice().reverse().forEach((t) => {
      actual += t.pnl;
      ideal += t.stopOk && t.sizeOk ? t.pnl : Math.min(t.pnl, 0);
      pointsA.push(actual);
      pointsI.push(ideal);
    });
    if (pointsA.length < 2) {
      return { actual: [0, 0], ideal: [0, 0], actualEnd: 0, idealEnd: 0 };
    }
    return {
      actual: pointsA,
      ideal: pointsI,
      actualEnd: actual,
      idealEnd: ideal,
    };
  },

  sortTradesChrono(trades) {
    return [...trades].sort((a, b) => {
      const da = this.tradeDate(a);
      const db = this.tradeDate(b);
      if (!da && !db) return (a.id || 0) - (b.id || 0);
      if (!da) return 1;
      if (!db) return -1;
      return da - db;
    });
  },

  tradeSpanYears(trades) {
    const dates = trades.map((t) => this.tradeDate(t)).filter(Boolean);
    if (!dates.length) return 0;
    if (dates.length === 1) return 1;
    const min = Math.min(...dates.map((d) => d.getTime()));
    const max = Math.max(...dates.map((d) => d.getTime()));
    return Math.max((max - min) / (365.25 * 86400000), 0.25);
  },

  /** Equity curve + peak-to-trough drawdown for recovery factor. */
  buildEquityCurve(trades, startBalance = 10000) {
    const c = this.sortTradesChrono(trades);
    let equity = startBalance;
    let peak = startBalance;
    let maxDrawdownAbs = 0;
    let maxDrawdownPct = 0;
    const points = [startBalance];
    c.forEach((t) => {
      equity += t.pnl;
      points.push(equity);
      if (equity > peak) peak = equity;
      const dd = peak - equity;
      if (dd > maxDrawdownAbs) {
        maxDrawdownAbs = dd;
        maxDrawdownPct = peak > 0 ? (dd / peak) * 100 : 0;
      }
    });
    return {
      points,
      peak,
      end: equity,
      maxDrawdownAbs,
      maxDrawdownPct,
      netProfit: equity - startBalance,
    };
  },

  /** PF 3.0 on 20 trades = noise; PF 1.25 on 2,000+ = institutional edge. */
  profitFactorSignificance(pf, count) {
    if (count < 30) {
      return { tier: "none", label: "Too few trades", detail: "Need 30+ for any reading", pass: false };
    }
    if (count < 200) {
      return {
        tier: "early",
        label: "Below 200-trade bar",
        detail: `${count} trades — allocators want 200+ before trusting PF`,
        pass: false,
      };
    }
    if (count >= 2000 && pf >= 1.25) {
      return {
        tier: "institutional",
        label: "Institutional-grade sample",
        detail: `PF ${pf.toFixed(2)} over ${count.toLocaleString()} trades`,
        pass: true,
      };
    }
    if (count >= 200 && pf >= 1.5) {
      return {
        tier: "significant",
        label: "Statistically meaningful",
        detail: `PF ${pf.toFixed(2)} · ${count} trades (200+ met)`,
        pass: true,
      };
    }
    if (count >= 200 && pf >= 1.25) {
      return {
        tier: "adequate",
        label: "Sample adequate",
        detail: `PF ${pf.toFixed(2)} · ${count} trades — modest but real edge`,
        pass: true,
      };
    }
    return {
      tier: "weak",
      label: "Edge unclear",
      detail: `PF ${pf.toFixed(2)} over ${count} trades despite sample size`,
      pass: false,
    };
  },

  /**
   * Sortino, recovery factor, and PF significance — what allocators actually read.
   * Sortino annualized from per-trade returns on running balance.
   */
  institutionalMetrics(trades, startBalance) {
    const c = this.sortTradesChrono(this.completed(trades));
    const base = this.metrics(trades);
    const bal = Number(startBalance) > 0 ? Number(startBalance) : 10000;
    const curve = this.buildEquityCurve(c, bal);
    const years = this.tradeSpanYears(c) || 1;

    const returns = [];
    let runBal = bal;
    c.forEach((t) => {
      returns.push(runBal > 0 ? t.pnl / runBal : 0);
      runBal += t.pnl;
    });

    const mean = returns.length ? returns.reduce((s, r) => s + r, 0) / returns.length : 0;
    const downsideSq = returns.length
      ? returns.reduce((s, r) => s + Math.min(r, 0) ** 2, 0) / returns.length
      : 0;
    const downsideDev = Math.sqrt(downsideSq);
    const sortinoPerTrade = downsideDev > 0 ? mean / downsideDev : (mean > 0 ? 999 : 0);
    const tradesPerYear = c.length / years;
    const sortino = sortinoPerTrade * Math.sqrt(Math.max(tradesPerYear, 1));

    const recoveryFactor = curve.maxDrawdownAbs > 0
      ? curve.netProfit / curve.maxDrawdownAbs
      : (curve.netProfit > 0 ? 999 : 0);
    const recoveryFactorPerYear = years > 0 ? recoveryFactor / years : 0;
    const pfSig = this.profitFactorSignificance(base.profitFactor, base.count);

    return {
      ...base,
      sortino,
      sortinoPerTrade,
      recoveryFactor,
      recoveryFactorPerYear,
      maxDrawdownPct: curve.maxDrawdownPct,
      maxDrawdownAbs: curve.maxDrawdownAbs,
      netProfit: curve.netProfit,
      tradeYears: years,
      profitFactorSignificance: pfSig,
      sortinoPass: sortino >= 2.0,
      recoveryPass: recoveryFactor >= 3.0,
    };
  },
};

window.CoachEngine = CoachEngine;
