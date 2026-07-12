/** Runnr Coach v1 — insights, discipline scoring, trade analysis */
const CoachEngine = {
  parseTradeDate(dateStr) {
    const months = {
      Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
      Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
    };
    const parts = (dateStr || "").split(" ");
    if (parts.length < 2) return null;
    const y = new Date().getFullYear();
    return new Date(y, months[parts[0]] ?? 0, parseInt(parts[1], 10) || 1);
  },

  completed(trades) {
    return trades
      .filter((t) => !t.incomplete && !t.disciplineOnly && !window.Baron?.isOpenTrade?.(t))
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
      const d = this.parseTradeDate(t.date);
      if (!d) return days >= 365;
      return (now - d) / 86400000 <= days;
    });
  },

  metrics(trades) {
    const c = this.completed(trades);
    const d = this.forDiscipline(trades);
    const wins = c.filter((t) => t.pnl > 0);
    const losses = c.filter((t) => t.pnl <= 0);
    const stopOk = d.filter((t) => t.stopOk).length;
    const sizeOk = d.filter((t) => t.sizeOk).length;
    const winPnL = wins.reduce((s, t) => s + t.pnl, 0);
    const lossPnL = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
    return {
      count: c.length,
      winRate: c.length ? (wins.length / c.length) * 100 : 0,
      profitFactor: lossPnL > 0 ? winPnL / lossPnL : wins.length ? 999 : 0,
      stopPct: d.length ? (stopOk / d.length) * 100 : 0,
      sizePct: d.length ? (sizeOk / d.length) * 100 : 0,
      totalPnl: c.reduce((s, t) => s + t.pnl, 0),
      undiscPnl: c.filter((t) => !t.stopOk || !t.sizeOk).reduce((s, t) => s + t.pnl, 0),
      discPnl: c.filter((t) => t.stopOk && t.sizeOk).reduce((s, t) => s + t.pnl, 0),
    };
  },

  /** Weighted discipline score: 40% stops, 40% size, 20% journal completeness */
  disciplineScore(trades) {
    const d = this.forDiscipline(trades);
    const c = this.completed(trades);
    if (!d.length) {
      return {
        overall: 0, stopPct: 0, sizePct: 0, completePct: 0,
        streak: this.loggingStreak(trades), tradeCount: 0, tier: "Novice",
      };
    }
    const stopPct = d.filter((t) => t.stopOk).length / d.length * 100;
    const sizePct = d.filter((t) => t.sizeOk).length / d.length * 100;
    const completePct = d.filter((t) => t.stopOk && t.sizeOk).length / d.length * 100;
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
    };
  },

  loggingStreak(trades) {
    const dates = [...new Set(
      trades.filter((t) => t.date).map((t) => {
        const d = this.parseTradeDate(t.date);
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
      const d = this.parseTradeDate(t.date);
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
        text: `${all.stopPct.toFixed(0)}% stop confirmation across ${all.count} trades. This is Baron-grade process — keep the pre-trade checklist.`,
      });
    }

    if (all.sizePct < 75 && all.count >= 2) {
      insights.push({
        type: "warning",
        title: "⚠ Oversizing pattern",
        text: `Size discipline is ${all.sizePct.toFixed(0)}%. Check the Sizer before entry — Baron uses 1% risk with a 10% position cap.`,
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
        text: `${earlyCuts.length} of ${winners.length} winners exited with <3% gain — possible fear of giving back profits. Trail stops (Baron style) beat manual exits.`,
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

    if (q.includes("cut winners") || q.includes("early")) {
      const winners = this.completed(trades).filter((t) => t.pnl > 0);
      if (winners.length < 3) {
        return "Need more winning trades in the journal to detect an early-exit pattern.";
      }
      const small = winners.filter((t) => t.pnl < (balance * riskPct) / 100 * 2);
      return `${small.length} of ${winners.length} winners booked less than 2R — review exits on ${[...new Set(small.map((t) => t.instr))].slice(0, 3).join(", ") || "recent names"}. Consider letting Baron-style trails run.`;
    }

    if (q.includes("worst instrument") || q.includes("discipline")) {
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

    return `Based on ${all.count} trades: ${all.stopPct.toFixed(0)}% stop discipline, ${all.sizePct.toFixed(0)}% size discipline, PF ${all.profitFactor.toFixed(2)}. Ask about early exits, worst instrument, or rule-following P&L.`;
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
      const da = this.parseTradeDate(a.date);
      const db = this.parseTradeDate(b.date);
      if (!da && !db) return (a.id || 0) - (b.id || 0);
      if (!da) return 1;
      if (!db) return -1;
      return da - db;
    });
  },

  tradeSpanYears(trades) {
    const dates = trades.map((t) => this.parseTradeDate(t.date)).filter(Boolean);
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
