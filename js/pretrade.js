/**
 * Pre-trade desk — gold sizer on the Size tab.
 * Size a plan, LOG TRADE into S.trades. WIN / LOSS / BE lives on the unified Journal.
 * Blocked plans still journal (planStatus=blocked, sizeOk=false) and drop the score.
 */
(function (global) {
  "use strict";

  const DEFAULT_RAILS = {
    maxRiskPct: 2,
    maxDailyLossPct: 5,
    minRR: 1.5,
    propDailyDDPct: 5,
    propMaxDDPct: 10,
  };
  const SAMPLE_LOG_CAP = 3;

  let view = "desk";
  let form = { ticker: "AAPL", dir: "long", entry: "", stop: "", target: "", notes: "" };
  let railsDraft = null;

  function S() {
    return global.S || (global.window && global.window.S) || {};
  }

  function todayKey(now) {
    const d = now instanceof Date ? now : new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }

  function tradeDayKey(t, now) {
    if (!t) return "";
    if (t.dateKey) return String(t.dateKey).slice(0, 10);
    if (t.filledAt) {
      const d = new Date(t.filledAt);
      if (!Number.isNaN(d.getTime())) return todayKey(d);
    }
    if (global.Baron && typeof Baron.isoDay === "function" && t.date) {
      const parsed = global.CoachEngine && CoachEngine.tradeDate
        ? CoachEngine.tradeDate(t)
        : null;
      if (parsed) return todayKey(parsed);
    }
    return "";
  }

  function num(v) {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }

  function clampPct(v, fallback) {
    const n = parseFloat(v);
    if (!Number.isFinite(n) || n < 0) return fallback;
    return n;
  }

  function normalizeRails(raw, state) {
    const src = raw || {};
    const st = state || S();
    const bal = num(src.bal != null ? src.bal : st.bal) || 10000;
    const sym = src.sym || st.sym || "€";
    return {
      bal,
      sym,
      maxRiskPct: clampPct(src.maxRiskPct, DEFAULT_RAILS.maxRiskPct),
      maxDailyLossPct: clampPct(src.maxDailyLossPct, DEFAULT_RAILS.maxDailyLossPct),
      minRR: clampPct(src.minRR, DEFAULT_RAILS.minRR),
      propDailyDDPct: clampPct(src.propDailyDDPct, DEFAULT_RAILS.propDailyDDPct),
      propMaxDDPct: clampPct(src.propMaxDDPct, DEFAULT_RAILS.propMaxDDPct),
    };
  }

  function readRails() {
    const st = S();
    return normalizeRails(Object.assign({}, DEFAULT_RAILS, st.pretrade || {}, {
      bal: st.bal,
      sym: st.sym,
    }), st);
  }

  function writeRails(rails) {
    const st = S();
    st.bal = rails.bal;
    st.sym = rails.sym;
    st.pretrade = {
      maxRiskPct: rails.maxRiskPct,
      maxDailyLossPct: rails.maxDailyLossPct,
      minRR: rails.minRR,
      propDailyDDPct: rails.propDailyDDPct,
      propMaxDDPct: rails.propMaxDDPct,
    };
    if (typeof global.persist === "function") global.persist();
    if (typeof global.updateHomeStats === "function") global.updateHomeStats();
  }

  function isPretradeRow(t) {
    if (!t || t.mergedAway) return false;
    return t.source === "pretrade" || t.planStatus === "approved" || t.planStatus === "blocked";
  }

  function isSamplePretradeLog(t) {
    if (!t || t.mergedAway) return false;
    if (t.source !== "pretrade") return false;
    return t.isDemo === true || t.seed === true;
  }

  function samplePretradeLogCount(trades) {
    return (trades || []).filter(isSamplePretradeLog).length;
  }

  function sampleLogGate(trades) {
    const used = samplePretradeLogCount(trades);
    const remaining = Math.max(0, SAMPLE_LOG_CAP - used);
    return {
      used,
      cap: SAMPLE_LOG_CAP,
      remaining,
      capped: used >= SAMPLE_LOG_CAP,
    };
  }

  function planStatusOf(t) {
    if (!t) return "approved";
    if (t.planStatus === "blocked" || t.planStatus === "approved") return t.planStatus;
    if (t.challengeFail || t.sizeOk === false) return "blocked";
    return "approved";
  }

  function riskAmtOf(t) {
    if (!t) return 0;
    if (Number.isFinite(Number(t.riskAmt)) && Number(t.riskAmt) > 0) return Number(t.riskAmt);
    const entry = num(t.entry);
    const stop = num(t.stop);
    const size = num(t.size);
    if (!entry || !stop || !size) return 0;
    return Math.abs(entry - stop) * size;
  }

  function rrOf(t) {
    if (!t) return 0;
    const target = num(t.target);
    if (Number.isFinite(Number(t.rr)) && Number(t.rr) > 0 && target > 0) return Number(t.rr);
    const entry = num(t.entry);
    const stop = num(t.stop);
    const risk = Math.abs(entry - stop);
    const reward = Math.abs(target - entry);
    if (!(risk > 0) || !(target > 0) || !(reward > 0)) return 0;
    return reward / risk;
  }

  function todayRows(trades, now) {
    const key = todayKey(now);
    return (trades || []).filter((t) => t && !t.mergedAway && isPretradeRow(t) && tradeDayKey(t, now) === key);
  }

  function todayRisked(trades, now) {
    return todayRows(trades, now).reduce((s, t) => s + riskAmtOf(t), 0);
  }

  function sameLevel(a, b) {
    return Math.abs(num(a) - num(b)) < 1e-6;
  }

  function isDuplicatePlan(plan, trades, now) {
    if (!plan || !plan.ticker || !(num(plan.size) > 0)) return false;
    const ticker = String(plan.ticker).toUpperCase();
    const dir = String(plan.dir || "long").toLowerCase();
    const entry = num(plan.entry);
    const stop = num(plan.stop);
    const target = num(plan.target);
    const size = num(plan.size);
    return todayRows(trades, now).some((t) => {
      if (!t) return false;
      if (String(t.instr || "").toUpperCase() !== ticker) return false;
      if (String(t.dir || "long").toLowerCase() !== dir) return false;
      if (!sameLevel(t.entry, entry) || !sameLevel(t.stop, stop)) return false;
      if (target > 0 && !sameLevel(t.target, target)) return false;
      if (!sameLevel(t.size, size)) return false;
      return true;
    });
  }

  function progressState(c) {
    const logged = Number(c && c.todayRisked) || 0;
    const pending = (c && c.ready && Number(c.totalRisk) > 0) ? Number(c.totalRisk) : 0;
    const projected = logged + pending;
    const dailyCap = Number(c && c.maxDailyAmt) || 0;
    const propDaily = Number(c && c.propDailyAmt) || 0;
    const overDaily = dailyCap > 0 && projected > dailyCap + 0.009;
    const overProp = propDaily > 0 && projected > propDaily + 0.009;
    const loggedOver = dailyCap > 0 && logged > dailyCap + 0.009;
    return {
      logged,
      pending,
      projected,
      dailyCap,
      over: overDaily || overProp,
      loggedOver,
      within: !(overDaily || overProp),
    };
  }

  function computePlan(input, rails, trades, now) {
    const r = normalizeRails(rails);
    const dir = String((input && input.dir) || "long").toLowerCase() === "short" ? "short" : "long";
    const ticker = String((input && input.ticker) || "").trim().toUpperCase();
    const entry = num(input && input.entry);
    const stop = num(input && input.stop);
    const target = num(input && input.target);
    const notes = String((input && input.notes) || "");
    const maxRiskAmt = r.bal * r.maxRiskPct / 100;
    const maxDailyAmt = r.bal * r.maxDailyLossPct / 100;
    const propDailyAmt = r.bal * r.propDailyDDPct / 100;
    const propMaxAmt = r.bal * r.propMaxDDPct / 100;
    const todayAmt = todayRisked(trades, now);
    const todayCount = todayRows(trades, now).length;
    const base = {
      ticker, dir, entry, stop, target, notes,
      ready: false,
      size: 0,
      riskPerShare: 0,
      totalRisk: 0,
      rewardPerShare: 0,
      totalReward: 0,
      rr: 0,
      blocked: false,
      reasons: [],
      maxRiskAmt, maxDailyAmt, propDailyAmt, propMaxAmt,
      todayRisked: todayAmt,
      todayCount,
      duplicate: false,
    };
    if (!ticker || !(entry > 0) || !(stop > 0)) return base;
    const riskPerShare = Math.abs(entry - stop);
    if (!(riskPerShare > 0)) {
      base.reasons.push("Entry and stop must differ");
      base.blocked = true;
      return base;
    }
    if (dir === "long" && stop >= entry) {
      base.reasons.push("Long stop must sit below entry");
      base.blocked = true;
      base.riskPerShare = riskPerShare;
      return base;
    }
    if (dir === "short" && stop <= entry) {
      base.reasons.push("Short stop must sit above entry");
      base.blocked = true;
      base.riskPerShare = riskPerShare;
      return base;
    }
    const size = Math.floor(maxRiskAmt / riskPerShare);
    const totalRisk = size * riskPerShare;
    const rewardPerShare = target > 0 ? Math.abs(target - entry) : 0;
    const rr = riskPerShare > 0 && rewardPerShare > 0 ? rewardPerShare / riskPerShare : 0;
    const reasons = [];
    if (target > 0) {
      if (dir === "long" && target <= entry) reasons.push("Long target must sit above entry");
      if (dir === "short" && target >= entry) reasons.push("Short target must sit below entry");
    }
    if (rr > 0 && rr + 1e-9 < r.minRR) {
      reasons.push("R:R " + rr.toFixed(2) + " below minimum " + r.minRR.toFixed(2));
    }
    if (size <= 0) reasons.push("No size at max risk / trade");
    if (totalRisk > maxRiskAmt + 0.009) reasons.push("Exceeds max risk per trade");
    if (todayAmt + totalRisk > maxDailyAmt + 0.009) reasons.push("Exceeds max daily loss limit");
    if (todayAmt + totalRisk > propDailyAmt + 0.009) reasons.push("Exceeds prop daily drawdown");
    const ready = size > 0 && entry > 0 && stop > 0;
    const duplicate = ready && isDuplicatePlan({
      ticker, dir, entry, stop, target, size: Math.max(0, size),
    }, trades, now);
    return Object.assign(base, {
      ready,
      size: Math.max(0, size),
      riskPerShare,
      totalRisk,
      rewardPerShare,
      totalReward: size * rewardPerShare,
      rr,
      blocked: reasons.length > 0,
      reasons,
      duplicate: !!duplicate,
    });
  }

  function isSampleDesk() {
    try {
      if (global.RunnrSync && typeof RunnrSync.isLoggedIn === "function" && RunnrSync.isLoggedIn()) {
        return false;
      }
    } catch (e) {}
    try {
      if (global.localStorage && localStorage.getItem("runnr_api_token")) return false;
    } catch (e) {}
    if (global.RunnrDemoSandbox && typeof RunnrDemoSandbox.isDemoState === "function") {
      return !!RunnrDemoSandbox.isDemoState(S());
    }
    return true;
  }

  function money(n, sym) {
    const sign = n < 0 ? "−" : "";
    const abs = Math.abs(Number(n) || 0);
    const body = abs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return sign + (sym || "€") + body;
  }

  function fmtPx(n) {
    if (!Number.isFinite(Number(n)) || Number(n) === 0) return "—";
    const x = Number(n);
    const d = Math.abs(x) >= 100 ? 2 : (Math.abs(x) >= 1 ? 2 : 4);
    return x.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
  }

  function fmtRR(n) {
    if (!Number.isFinite(n) || n <= 0) return "—";
    return n.toFixed(2);
  }

  function disciplineMix(trades) {
    const rows = (trades || []).filter((t) => t && !t.mergedAway && !t.incomplete);
    const approved = rows.filter((t) => planStatusOf(t) === "approved").length;
    const blocked = rows.filter((t) => planStatusOf(t) === "blocked").length;
    const total = approved + blocked;
    const pct = total ? Math.round((approved / total) * 100) : 0;
    return { approved, blocked, total, pct };
  }

  function outcomeOf(t) {
    return String((t && t.outcome) || "").toLowerCase();
  }

  function edgeFromTrades(trades) {
    const closed = (trades || []).filter((t) => {
      const o = outcomeOf(t);
      return t && !t.mergedAway && (o === "win" || o === "loss" || o === "be" || o === "breakeven");
    });
    const wins = closed.filter((t) => outcomeOf(t) === "win");
    const losses = closed.filter((t) => outcomeOf(t) === "loss");
    const bes = closed.filter((t) => outcomeOf(t) === "be" || outcomeOf(t) === "breakeven");
    const winRate = closed.length ? (wins.length / closed.length) * 100 : 0;
    const rWins = wins.map(rrOf).filter((n) => n > 0);
    const avgWinR = rWins.length ? rWins.reduce((a, b) => a + b, 0) / rWins.length : 0;
    const expectancy = closed.length
      ? ((wins.length * avgWinR) + (losses.length * -1) + (bes.length * 0)) / closed.length
      : 0;
    const allRR = (trades || []).filter((t) => t && !t.mergedAway).map(rrOf).filter((n) => n > 0);
    const avgRR = allRR.length ? allRR.reduce((a, b) => a + b, 0) / allRR.length : 0;
    const approvedRR = (trades || [])
      .filter((t) => t && !t.mergedAway && planStatusOf(t) === "approved")
      .map(rrOf)
      .filter((n) => n > 0);
    const avgApprovedRR = approvedRR.length
      ? approvedRR.reduce((a, b) => a + b, 0) / approvedRR.length
      : 0;
    return {
      closed: closed.length,
      total: (trades || []).filter((t) => t && !t.mergedAway).length,
      wins: wins.length,
      losses: losses.length,
      bes: bes.length,
      winRate,
      avgRR,
      avgApprovedRR,
      expectancy,
      positive: expectancy > 0,
      hasOutcomes: closed.length > 0,
    };
  }

  function applyOutcome(t, outcome) {
    if (!t) return t;
    const want = String(outcome || "").toLowerCase();
    if (!want || want === "reset") {
      if (t.outcomeExit) {
        t.exit = Object.prototype.hasOwnProperty.call(t, "openExit") ? t.openExit : null;
        t.pnl = Object.prototype.hasOwnProperty.call(t, "openPnl") ? t.openPnl : null;
        delete t.outcomeExit;
        delete t.openExit;
        delete t.openPnl;
      }
      delete t.outcome;
      return t;
    }
    if (!t.outcomeExit) {
      t.openExit = t.exit;
      t.openPnl = t.pnl;
      t.outcomeExit = true;
    }
    const entry = num(t.entry);
    const stop = num(t.stop);
    const target = num(t.target);
    if (want === "win") t.exit = target > 0 ? target : (num(t.exit) || entry);
    else if (want === "loss") t.exit = stop > 0 ? stop : entry;
    else t.exit = entry;
    t.outcome = want === "breakeven" ? "be" : want;
    const Baron = global.Baron;
    if (Baron && typeof Baron.tradePnl === "function") {
      const pair = t.pair || (typeof Baron.parseForexPair === "function" ? Baron.parseForexPair(t.instr) : null);
      t.pnl = Math.round(Baron.tradePnl(pair, entry, t.exit, num(t.size) || 1, t.dir || "long"));
    } else {
      const sign = (t.dir || "long") === "long" ? 1 : -1;
      t.pnl = Math.round((t.exit - entry) * sign * (num(t.size) || 1));
    }
    if (t.outcome === "be") t.pnl = 0;
    return t;
  }

  function logPlan(input, rails, trades, now) {
    const r = normalizeRails(rails);
    const computed = computePlan(input, r, trades, now);
    if (!computed.ticker || !(computed.entry > 0) || !(computed.stop > 0) || computed.size <= 0) {
      return { ok: false, error: "Add ticker, entry, stop & size first", computed };
    }
    const sample = isSampleDesk();
    const st = S();
    if (!Array.isArray(st.trades)) st.trades = [];
    const list = st.trades;
    if (sample) {
      const gate = sampleLogGate(list);
      if (gate.capped) {
        return { ok: false, error: "sample-log-cap", computed, sampleGate: gate };
      }
    } else if (typeof global.canAddJournalTrade === "function" && !global.canAddJournalTrade(1)) {
      if (typeof global.openJournalLimitUpgrade === "function") global.openJournalLimitUpgrade();
      return { ok: false, error: "journal-limit", computed };
    }
    const blocked = !!computed.blocked;
    const row = {
      id: Date.now(),
      date: (now instanceof Date ? now : new Date()).toLocaleDateString("en-GB", { month: "short", day: "numeric" }),
      dateKey: todayKey(now),
      filledAt: (now instanceof Date ? now : new Date()).toISOString(),
      instr: computed.ticker,
      dir: computed.dir,
      entry: computed.entry,
      stop: computed.stop,
      target: computed.target || null,
      size: computed.size,
      exit: null,
      pnl: null,
      type: "shares",
      stopOk: true,
      sizeOk: !blocked,
      incomplete: false,
      challengeFail: blocked,
      challengeNote: blocked ? computed.reasons.join("; ") : "",
      planStatus: blocked ? "blocked" : "approved",
      source: "pretrade",
      notes: computed.notes || "",
      rr: computed.rr,
      riskAmt: Math.round(computed.totalRisk * 100) / 100,
      riskSnapshot: { risk: r.maxRiskPct, bal: r.bal, at: todayKey(now), sym: r.sym },
    };
    if (sample) {
      row.isDemo = true;
      row.sampleOrigin = "manual";
    }
    if (typeof global.DisciplineReplay !== "undefined" && DisciplineReplay.stampTrade) {
      DisciplineReplay.stampTrade(row, st, global.Baron || null);
    }
    list.unshift(row);
    st.trades = list;
    if (typeof global.persist === "function") global.persist();
    if (typeof global.renderJournal === "function") global.renderJournal();
    if (typeof global.updateHomeStats === "function") global.updateHomeStats();
    if (typeof global.renderCoachPage === "function") global.renderCoachPage();
    if (sample && global.RunnrDemoSandbox && typeof RunnrDemoSandbox.markAha === "function") {
      try { RunnrDemoSandbox.markAha("pretrade"); } catch (e) {}
    }
    return { ok: true, row, computed, sampleGate: sample ? sampleLogGate(list) : null };
  }

  function setOutcome(id, outcome) {
    const st = S();
    const t = (st.trades || []).find((x) => String(x.id) === String(id));
    if (!t) return false;
    applyOutcome(t, outcome);
    if (typeof global.persist === "function") global.persist();
    if (typeof global.renderJournal === "function") global.renderJournal();
    if (typeof global.updateHomeStats === "function") global.updateHomeStats();
    if (typeof global.renderCoachPage === "function") global.renderCoachPage();
    return true;
  }

  function deskTrades() {
    return (S().trades || []).filter((t) => t && !t.mergedAway);
  }

  function planRows() {
    return deskTrades().filter(isPretradeRow);
  }

  function filterJournalBook(trades, filter) {
    const rows = (trades || []).filter((t) => t && !t.mergedAway);
    const want = String(filter || "all").toLowerCase();
    if (want === "approved") return rows.filter((t) => isPretradeRow(t) && planStatusOf(t) === "approved");
    if (want === "blocked") return rows.filter((t) => isPretradeRow(t) && planStatusOf(t) === "blocked");
    return rows;
  }

  function esc(s) {
    return String(s || "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c]));
  }

  function rootEl() {
    const doc = global.document;
    if (!doc) return null;
    return doc.getElementById("pretrade-root") || doc.getElementById("desk-root");
  }

  function currentComputed() {
    return computePlan(form, railsDraft || readRails(), deskTrades(), new Date());
  }

  function paintMoney(id, value, cls) {
    const el = global.document && document.getElementById(id);
    if (!el) return;
    el.textContent = value;
    if (cls) el.className = cls;
  }

  function renderStats(c, rails) {
    const mix = disciplineMix(deskTrades());
    const score = global.CoachEngine && typeof CoachEngine.disciplineScore === "function"
      ? CoachEngine.disciplineScore(deskTrades())
      : null;
    const discPct = mix.total ? mix.pct : (score && score.tradeCount ? score.overall : 0);
    const discSub = mix.total
      ? mix.approved + "/" + mix.total + " approved"
      : (score && score.tradeCount ? score.tradeCount + " scored" : "no plans yet");
    paintMoney("pt-stat-bal", money(rails.bal, rails.sym), "pt-stat-val gold");
    paintMoney("pt-stat-risked", money(c.todayRisked, rails.sym), "pt-stat-val");
    const limit = document.getElementById("pt-stat-limit");
    if (limit) limit.textContent = "limit " + money(c.maxDailyAmt, rails.sym);
    paintMoney("pt-stat-today", String(c.todayCount), "pt-stat-val");
    paintMoney("pt-stat-disc", discPct + "%", "pt-stat-val mint");
    const discHint = document.getElementById("pt-stat-disc-sub");
    if (discHint) discHint.textContent = discSub;
  }

  function renderEdge() {
    const box = document.getElementById("pt-edge");
    if (!box) return;
    const edge = edgeFromTrades(planRows());
    if (!edge.hasOutcomes) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    const wr = document.getElementById("pt-edge-wr");
    const arr = document.getElementById("pt-edge-rr");
    const exp = document.getElementById("pt-edge-exp");
    const eg = document.getElementById("pt-edge-label");
    const mix = document.getElementById("pt-edge-mix");
    const closed = document.getElementById("pt-edge-closed");
    if (wr) wr.textContent = edge.winRate.toFixed(1) + "%";
    if (arr) arr.textContent = fmtRR(edge.avgRR);
    if (exp) {
      const sign = edge.expectancy >= 0 ? "+" : "";
      exp.textContent = sign + edge.expectancy.toFixed(2) + "R";
      exp.className = "pt-stat-val " + (edge.positive ? "mint" : "neg");
    }
    if (eg) {
      eg.textContent = edge.positive ? "Positive" : "Negative";
      eg.className = "pt-stat-val " + (edge.positive ? "mint" : "neg");
    }
    if (mix) {
      mix.innerHTML = '<span class="mint">' + edge.wins + " WIN" + (edge.wins === 1 ? "" : "S") +
        '</span> <span class="neg">' + edge.losses + " LOSS" + (edge.losses === 1 ? "" : "ES") +
        '</span> <span class="dim">' + edge.bes + " BREAKEVEN</span>";
    }
    if (closed) closed.textContent = edge.closed + " CLOSED · " + edge.total + " TOTAL";
  }

  function outputHTML(c, rails) {
    if (!c.ready && !(c.riskPerShare > 0)) {
      return '<div class="pt-output-empty">Pending plan — enter ticker, entry &amp; stop</div>';
    }
    const rrCls = c.blocked || (c.rr > 0 && c.rr < (rails.minRR || 1.5)) ? "neg" : "gold";
    const tk = c.ticker ? esc(c.ticker) : "this setup";
    let banner = "";
    if (c.duplicate) {
      const extra = (c.reasons || []).map((r) => '<div class="pt-blocked-reason">⚠ ' + esc(r) + "</div>").join("");
      banner =
        '<div class="pt-already" role="status"><div class="pt-blocked-title">ALREADY LOGGED TODAY</div>' +
        '<div class="pt-blocked-reason">' + tk + " is already in Recent Trades. This panel is a pending plan, not that fill.</div>" +
        extra +
        "</div>";
    } else if (c.blocked) {
      banner =
        '<div class="pt-blocked" role="status"><div class="pt-blocked-title">✕ BLOCKED</div>' +
        '<div class="pt-blocked-reason">This pending plan is not logged yet — Recent Trades is the book.</div>' +
        c.reasons.map((r) => '<div class="pt-blocked-reason">⚠ ' + esc(r) + "</div>").join("") +
        "</div>";
    } else if (c.ready) {
      banner = '<div class="pt-cleared">PENDING · APPROVED — log to journal</div>';
    }
    return (
      '<div class="pt-output-kicker">PENDING PLAN</div>' +
      '<div class="pt-output-note">Computed size for the form — not a logged fill.</div>' +
      '<div class="pt-kv"><span>Position Size</span><strong class="mint">' + (c.size || 0) + " sh</strong></div>" +
      '<div class="pt-kv"><span>Risk / Share</span><strong>' + money(c.riskPerShare, rails.sym) + "</strong></div>" +
      '<div class="pt-kv"><span>Total Risk</span><strong class="neg">' + money(c.totalRisk, rails.sym) + "</strong></div>" +
      '<div class="pt-kv"><span>Reward</span><strong class="mint">' + money(c.rewardPerShare, rails.sym) + "</strong></div>" +
      '<div class="pt-kv"><span>R:R Ratio</span><strong class="' + rrCls + '">' + (c.rr ? c.rr.toFixed(2) + " : 1" : "—") + "</strong></div>" +
      banner
    );
  }

  function renderOutput(c, rails) {
    const el = document.getElementById("pt-output");
    if (!el) return;
    el.innerHTML = outputHTML(c, rails);
  }

  function barWidth(used, cap) {
    if (!(cap > 0)) return 0;
    return Math.max(0, Math.min(100, (used / cap) * 100));
  }

  function renderProgress(c, rails) {
    const prog = progressState(c);
    const today = document.getElementById("pt-prog-today");
    const todaySub = document.getElementById("pt-prog-today-sub");
    const maxD = document.getElementById("pt-prog-max");
    const prop = document.getElementById("pt-prog-prop");
    if (today) today.textContent = money(prog.projected, rails.sym);
    if (todaySub) {
      todaySub.textContent = prog.pending > 0
        ? money(prog.logged, rails.sym) + " logged + " + money(prog.pending, rails.sym) + " this plan"
        : (prog.logged > 0 ? "logged today" : "");
    }
    if (maxD) {
      maxD.innerHTML = money(c.maxDailyAmt, rails.sym) +
        '<span class="pt-muted">' + rails.maxDailyLossPct.toFixed(2) + "%</span>";
    }
    if (prop) {
      prop.innerHTML = money(c.propMaxAmt, rails.sym) +
        '<span class="pt-muted">' + rails.propMaxDDPct.toFixed(2) + "%</span>";
    }
    const loggedPct = barWidth(prog.logged, c.maxDailyAmt);
    const pendingPct = Math.max(0, Math.min(100 - loggedPct, barWidth(prog.pending, c.maxDailyAmt)));
    const pct = barWidth(prog.projected, c.maxDailyAmt);
    const label = document.getElementById("pt-prog-pct");
    if (label) {
      label.textContent = pct.toFixed(0) + "% OF DAILY LIMIT" +
        (prog.pending > 0 ? " INCL. THIS PLAN" : "");
    }
    const fillToday = document.getElementById("pt-bar-today");
    const fillPending = document.getElementById("pt-bar-pending");
    const fillMax = document.getElementById("pt-bar-max");
    const fillPropD = document.getElementById("pt-bar-propd");
    const fillPropM = document.getElementById("pt-bar-propm");
    if (fillToday) fillToday.style.width = loggedPct + "%";
    if (fillPending) fillPending.style.width = pendingPct + "%";
    if (fillMax) fillMax.style.width = "100%";
    if (fillPropD) fillPropD.style.width = barWidth(c.propDailyAmt, c.propMaxAmt) + "%";
    if (fillPropM) fillPropM.style.width = "100%";
    const capToday = document.getElementById("pt-cap-today");
    const capMax = document.getElementById("pt-cap-max");
    const capPropD = document.getElementById("pt-cap-propd");
    const capPropM = document.getElementById("pt-cap-propm");
    if (capToday) capToday.textContent = money(prog.projected, rails.sym);
    if (capMax) capMax.textContent = money(c.maxDailyAmt, rails.sym);
    if (capPropD) capPropD.textContent = money(c.propDailyAmt, rails.sym);
    if (capPropM) capPropM.textContent = money(c.propMaxAmt, rails.sym);
    const within = document.getElementById("pt-within");
    if (within) {
      within.textContent = prog.within
        ? "WITHIN LIMITS"
        : (prog.loggedOver ? "OVER LIMIT" : "WOULD EXCEED");
      within.className = "pt-within" + (prog.within ? "" : " neg");
    }
    const derivedRisk = document.getElementById("pt-derived-risk");
    const derivedDaily = document.getElementById("pt-derived-daily");
    if (derivedRisk) derivedRisk.textContent = money(c.maxRiskAmt, rails.sym);
    if (derivedDaily) derivedDaily.textContent = money(c.maxDailyAmt, rails.sym);
  }

  function statusCell(t) {
    const st = planStatusOf(t);
    if (st === "blocked") return '<span class="pt-st blocked">BLOCKED</span>';
    return '<span class="pt-st approved">APPROVED</span>';
  }

  function markIcon(t) {
    return planStatusOf(t) === "blocked"
      ? '<span class="pt-x" aria-hidden="true">✕</span>'
      : '<span class="pt-check" aria-hidden="true">✓</span>';
  }

  function recentRows() {
    return deskTrades().slice(0, 8);
  }

  function renderRecent() {
    const body = document.getElementById("pt-recent-body");
    if (!body) return;
    const rows = planRows().slice(0, 8);
    const rails = railsDraft || readRails();
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="9" class="pt-empty">No plans yet. Size a trade and log it.</td></tr>';
      return;
    }
    body.innerHTML = rows.map((t) => {
      const dir = (t.dir || "long") === "short" ? '<span class="neg">S</span>' : "L";
      return "<tr>" +
        '<td class="pt-tk">' + markIcon(t) + " " + esc(t.instr || "") + "</td>" +
        "<td>" + dir + "</td>" +
        "<td>" + fmtPx(t.entry) + "</td>" +
        "<td>" + fmtPx(t.stop) + "</td>" +
        "<td>" + fmtPx(t.target) + "</td>" +
        '<td class="mint">' + (t.size != null ? esc(String(t.size)) : "—") + "</td>" +
        '<td class="neg">' + money(riskAmtOf(t), rails.sym) + "</td>" +
        "<td>" + fmtRR(rrOf(t)) + "</td>" +
        "<td>" + statusCell(t) + "</td>" +
        "</tr>";
    }).join("");
  }

  function outcomeBtns(t) {
    const o = outcomeOf(t);
    const id = esc(String(t.id));
    const btn = (val, label) => {
      const on = (val === "be" ? (o === "be" || o === "breakeven") : o === val);
      const cls = "pt-out" + (val === "win" ? " win" : val === "loss" ? " loss" : " be") + (on ? " on" : "");
      return '<button type="button" class="' + cls + '" data-pt-out="' + val + '" data-id="' + id + '">' + label + "</button>";
    };
    return '<div class="pt-out-row"><span class="pt-out-lbl">OUTCOME</span>' +
      btn("win", "WIN") + btn("loss", "LOSS") + btn("be", "BE") +
      '<button type="button" class="pt-out-reset" data-pt-out="reset" data-id="' + id + '">RESET</button></div>';
  }

  function currencyOf(sym) {
    if (sym === "$") return "USD";
    if (sym === "£") return "GBP";
    return "EUR";
  }

  function symOf(code) {
    if (code === "USD") return "$";
    if (code === "GBP") return "£";
    return "€";
  }

  function deskHTML(rails) {
    const longOn = form.dir !== "short";
    return (
      '<header class="pt-top">' +
        '<div class="pt-brand">' +
          '<button type="button" class="pt-nav-btn" id="pt-exit">← RUNNR</button>' +
          '<span class="pt-mark" aria-hidden="true">r</span>' +
          '<div><div class="pt-name">runnr.terminal</div><div class="pt-kicker">PRE-TRADE DISCIPLINE ENGINE</div></div>' +
        "</div>" +
        '<button type="button" class="pt-nav-btn" id="pt-open-journal">JOURNAL</button>' +
      "</header>" +
      '<section class="pt-stats" aria-label="Account">' +
        '<div><div class="pt-stat-lbl">ACCOUNT BALANCE</div><div class="pt-stat-val gold" id="pt-stat-bal"></div></div>' +
        '<div><div class="pt-stat-lbl">TODAY RISKED</div><div class="pt-stat-val" id="pt-stat-risked"></div><div class="pt-stat-sub" id="pt-stat-limit"></div></div>' +
        '<div><div class="pt-stat-lbl">TRADES TODAY</div><div class="pt-stat-val" id="pt-stat-today"></div></div>' +
        '<div><div class="pt-stat-lbl">DISCIPLINE</div><div class="pt-stat-val mint" id="pt-stat-disc"></div><div class="pt-stat-sub" id="pt-stat-disc-sub"></div></div>' +
      "</section>" +
      '<section class="pt-edge" id="pt-edge" hidden>' +
        '<div class="pt-sec-hd"><span>TRADING EDGE</span><span class="pt-sec-meta" id="pt-edge-closed"></span></div>' +
        '<div class="pt-stats pt-edge-grid">' +
          '<div><div class="pt-stat-lbl">WIN RATE</div><div class="pt-stat-val mint" id="pt-edge-wr"></div></div>' +
          '<div><div class="pt-stat-lbl">AVG R:R</div><div class="pt-stat-val gold" id="pt-edge-rr"></div></div>' +
          '<div><div class="pt-stat-lbl">EXPECTANCY</div><div class="pt-stat-val mint" id="pt-edge-exp"></div></div>' +
          '<div><div class="pt-stat-lbl">EDGE</div><div class="pt-stat-val mint" id="pt-edge-label"></div></div>' +
        "</div>" +
        '<div class="pt-edge-foot"><div id="pt-edge-mix"></div><div class="pt-sec-meta">MARK OUTCOMES IN JOURNAL TO COMPUTE WIN RATE</div></div>' +
      "</section>" +
      '<div class="pt-split">' +
        '<section class="pt-panel" aria-label="Position sizer">' +
          '<div class="pt-sec-hd">POSITION SIZER</div>' +
          '<div class="pt-sample-cap" id="pt-sample-cap" hidden></div>' +
          '<div class="pt-sizer">' +
            '<div class="pt-form">' +
              '<label class="pt-field"><span>TICKER</span><input id="pt-ticker" autocomplete="off" spellcheck="false" value="' + esc(form.ticker) + '"></label>' +
              '<div class="pt-field"><span>DIRECTION</span>' +
                '<div class="pt-dir">' +
                  '<button type="button" class="pt-dir-btn' + (longOn ? " on" : "") + '" data-pt-dir="long">↑ LONG</button>' +
                  '<button type="button" class="pt-dir-btn' + (longOn ? "" : " on") + '" data-pt-dir="short">↓ SHORT</button>' +
                "</div>" +
              "</div>" +
              '<label class="pt-field"><span>ENTRY PRICE</span><input id="pt-entry" inputmode="decimal" value="' + esc(form.entry) + '"></label>' +
              '<label class="pt-field"><span>STOP LOSS</span><input id="pt-stop" inputmode="decimal" value="' + esc(form.stop) + '"></label>' +
              '<label class="pt-field"><span>TARGET PRICE</span><input id="pt-target" inputmode="decimal" value="' + esc(form.target) + '"></label>' +
              '<div class="pt-log-row">' +
                '<input id="pt-notes" placeholder="Notes (optional)…" value="' + esc(form.notes) + '">' +
                '<button type="button" class="pt-log" id="pt-log">LOG TRADE</button>' +
              "</div>" +
            "</div>" +
            '<div class="pt-output" id="pt-output"><div class="pt-output-empty">Pending plan — enter ticker, entry &amp; stop</div></div>' +
          "</div>" +
        "</section>" +
        '<section class="pt-panel" aria-label="Risk guardrails">' +
          '<div class="pt-sec-hd"><span>RISK GUARDRAILS</span><div class="pt-rails-actions">' +
            '<button type="button" class="pt-text-btn" id="pt-rails-reset">RESET</button>' +
            '<button type="button" class="pt-text-btn" id="pt-rails-save">SAVE</button>' +
          "</div></div>" +
          '<div class="pt-rails">' +
            '<label class="pt-field"><span>ACCOUNT BALANCE</span><input id="pt-bal" inputmode="decimal" value="' + esc(String(rails.bal)) + '"></label>' +
            '<label class="pt-field"><span>CURRENCY</span><select id="pt-ccy">' +
              '<option value="EUR"' + (currencyOf(rails.sym) === "EUR" ? " selected" : "") + ">EUR</option>" +
              '<option value="USD"' + (currencyOf(rails.sym) === "USD" ? " selected" : "") + ">USD</option>" +
              '<option value="GBP"' + (currencyOf(rails.sym) === "GBP" ? " selected" : "") + ">GBP</option>" +
            "</select></label>" +
            '<label class="pt-field"><span>MAX RISK / TRADE (%)</span><input id="pt-max-risk" inputmode="decimal" value="' + esc(String(rails.maxRiskPct)) + '"></label>' +
            '<label class="pt-field"><span>MAX DAILY LOSS (%)</span><input id="pt-max-daily" inputmode="decimal" value="' + esc(String(rails.maxDailyLossPct)) + '"></label>' +
            '<label class="pt-field"><span>MIN R:R RATIO</span><input id="pt-min-rr" inputmode="decimal" value="' + esc(String(rails.minRR)) + '"></label>' +
            '<label class="pt-field"><span>PROP DAILY DD (%)</span><input id="pt-prop-daily" inputmode="decimal" value="' + esc(String(rails.propDailyDDPct)) + '"></label>' +
            '<label class="pt-field"><span>PROP MAX DD (%)</span><input id="pt-prop-max" inputmode="decimal" value="' + esc(String(rails.propMaxDDPct)) + '"></label>' +
            '<div class="pt-derived">' +
              '<div class="pt-stat-lbl">DERIVED LIMITS</div>' +
              '<div class="pt-kv tight"><span>Max Risk/Trade</span><strong class="mint" id="pt-derived-risk"></strong></div>' +
              '<div class="pt-kv tight"><span>Max Daily Loss</span><strong class="neg" id="pt-derived-daily"></strong></div>' +
            "</div>" +
          "</div>" +
        "</section>" +
      "</div>" +
      '<section class="pt-panel pt-progress" aria-label="Daily loss progress">' +
        '<div class="pt-sec-hd"><span>DAILY LOSS PROGRESS</span><span class="pt-within" id="pt-within">WITHIN LIMITS</span></div>' +
        '<div class="pt-prog-stats">' +
          '<div><div class="pt-stat-lbl">TODAY + THIS PLAN</div><div class="pt-stat-val neg" id="pt-prog-today"></div><div class="pt-stat-sub" id="pt-prog-today-sub"></div></div>' +
          '<div><div class="pt-stat-lbl">MAX DAILY LOSS</div><div class="pt-stat-val gold" id="pt-prog-max"></div></div>' +
          '<div><div class="pt-stat-lbl">PROP MAX DD</div><div class="pt-stat-val gold" id="pt-prog-prop"></div></div>' +
        "</div>" +
        '<div class="pt-bars-hd"><span>PROGRESS VS DRAWDOWN LIMITS</span><span id="pt-prog-pct">0% OF DAILY LIMIT</span></div>' +
        '<div class="pt-bar-row"><span>TODAY</span><div class="pt-bar stacked"><i id="pt-bar-today"></i><i id="pt-bar-pending" class="pending"></i></div><em id="pt-cap-today"></em></div>' +
        '<div class="pt-bar-row"><span>MAX DAILY</span><div class="pt-bar gold"><i id="pt-bar-max"></i></div><em id="pt-cap-max"></em></div>' +
        '<div class="pt-bar-row"><span>PROP DAILY</span><div class="pt-bar gold"><i id="pt-bar-propd"></i></div><em id="pt-cap-propd"></em></div>' +
        '<div class="pt-bar-row"><span>PROP MAX</span><div class="pt-bar gold"><i id="pt-bar-propm"></i></div><em id="pt-cap-propm"></em></div>' +
        '<div class="pt-legend"><span class="swatch risk"></span> LOGGED TODAY <span class="swatch plan"></span> THIS PLAN <span class="swatch cap"></span> DRAWDOWN LIMITS</div>' +
      "</section>" +
      '<section class="pt-panel pt-recent" aria-label="Recent trades">' +
        '<div class="pt-sec-hd"><span>RECENT TRADES</span><button type="button" class="pt-text-btn" id="pt-view-all">view all →</button></div>' +
        '<div class="pt-table-wrap"><table class="pt-table">' +
          "<thead><tr><th>TICKER</th><th>DIR</th><th>ENTRY</th><th>STOP</th><th>TARGET</th><th>SIZE</th><th>RISK</th><th>R:R</th><th>STATUS</th></tr></thead>" +
          '<tbody id="pt-recent-body"></tbody>' +
        "</table></div>" +
      "</section>" +
      '<p class="pt-foot">RUNNR TERMINAL — CALCULATE RISK BEFORE YOU EXECUTE</p>'
    );
  }

  function readFormFromDom() {
    const ticker = document.getElementById("pt-ticker");
    const entry = document.getElementById("pt-entry");
    const stop = document.getElementById("pt-stop");
    const target = document.getElementById("pt-target");
    const notes = document.getElementById("pt-notes");
    if (ticker) form.ticker = ticker.value;
    if (entry) form.entry = entry.value;
    if (stop) form.stop = stop.value;
    if (target) form.target = target.value;
    if (notes) form.notes = notes.value;
  }

  function readRailsFromDom() {
    const bal = document.getElementById("pt-bal");
    const ccy = document.getElementById("pt-ccy");
    const maxRisk = document.getElementById("pt-max-risk");
    const maxDaily = document.getElementById("pt-max-daily");
    const minRR = document.getElementById("pt-min-rr");
    const propD = document.getElementById("pt-prop-daily");
    const propM = document.getElementById("pt-prop-max");
    const next = normalizeRails({
      bal: bal ? bal.value : undefined,
      sym: ccy ? symOf(ccy.value) : undefined,
      maxRiskPct: maxRisk ? maxRisk.value : undefined,
      maxDailyLossPct: maxDaily ? maxDaily.value : undefined,
      minRR: minRR ? minRR.value : undefined,
      propDailyDDPct: propD ? propD.value : undefined,
      propMaxDDPct: propM ? propM.value : undefined,
    });
    railsDraft = next;
    return next;
  }

  function refreshLive() {
    if (view !== "desk") return;
    readFormFromDom();
    const rails = document.getElementById("pt-bal") ? readRailsFromDom() : (railsDraft || readRails());
    const c = computePlan(form, rails, deskTrades(), new Date());
    renderStats(c, rails);
    renderEdge();
    renderOutput(c, rails);
    renderProgress(c, rails);
    renderRecent();
    renderSampleCap();
  }

  function setView(next) {
    if (next === "journal") {
      openUnifiedJournal();
      return;
    }
    view = "desk";
    render();
    syncHash("desk");
  }

  function showSampleCapWall() {
    if (typeof global.showToast === "function") {
      showToast("SAMPLE", "3 SAMPLE plans used — save with email to keep logging");
    }
    const SB = global.RunnrDemoSandbox;
    if (SB && typeof SB.showKeepScore === "function") {
      try { SB.showKeepScore({ reason: "sample-log-cap" }); } catch (e) {}
    }
  }

  function renderSampleCap() {
    const el = document.getElementById("pt-sample-cap");
    const logBtn = document.getElementById("pt-log");
    if (!el) return;
    if (!isSampleDesk()) {
      el.hidden = true;
      if (logBtn) logBtn.textContent = "LOG TRADE";
      return;
    }
    const gate = sampleLogGate(deskTrades());
    el.hidden = false;
    if (gate.capped) {
      el.className = "pt-sample-cap capped";
      el.innerHTML = '3 SAMPLE plans used — <a href="/login.html?keep=1">save with email</a> to keep logging';
      if (logBtn) logBtn.textContent = "SAVE WITH EMAIL";
    } else {
      el.className = "pt-sample-cap";
      el.textContent = "SAMPLE logs " + gate.used + " / " + gate.cap + " — sizing stays free";
      if (logBtn) logBtn.textContent = "LOG TRADE";
    }
  }

  function onLog() {
    readFormFromDom();
    const rails = railsDraft || readRails();
    if (isSampleDesk() && sampleLogGate(deskTrades()).capped) {
      showSampleCapWall();
      return;
    }
    const result = logPlan(form, rails, deskTrades(), new Date());
    if (!result.ok) {
      if (result.error === "journal-limit") return;
      if (result.error === "sample-log-cap") {
        showSampleCapWall();
        renderSampleCap();
        return;
      }
      if (typeof global.showToast === "function") {
        showToast("Sizer", result.error || "Add ticker, entry & stop first");
      }
      return;
    }
    const msg = result.computed.blocked
      ? "Logged as BLOCKED — score takes the hit"
      : "Logged ✓ — mark WIN / LOSS / BE in Journal";
    if (typeof global.showToast === "function") showToast(result.row.instr, msg);
    resetSizerFields();
    render();
    if (result.sampleGate && result.sampleGate.capped) showSampleCapWall();
  }

  function resetSizerFields() {
    form.ticker = "";
    form.entry = "";
    form.stop = "";
    form.target = "";
    form.notes = "";
  }

  function bind(el) {
    if (!el || el.dataset.ptBound === "1") return;
    el.dataset.ptBound = "1";
    el.addEventListener("input", (e) => {
      if (!e.target.closest(".pt-root")) return;
      refreshLive();
    });
    el.addEventListener("change", (e) => {
      if (!e.target.closest(".pt-root")) return;
      refreshLive();
    });
    el.addEventListener("click", (e) => {
      const dirBtn = e.target.closest("[data-pt-dir]");
      if (dirBtn) {
        form.dir = dirBtn.getAttribute("data-pt-dir") === "short" ? "short" : "long";
        el.querySelectorAll("[data-pt-dir]").forEach((b) => {
          b.classList.toggle("on", b.getAttribute("data-pt-dir") === form.dir);
        });
        refreshLive();
        return;
      }
      if (e.target.closest("#pt-open-journal") || e.target.closest("#pt-view-all")) {
        openUnifiedJournal();
        return;
      }
      if (e.target.closest("#pt-exit")) {
        if (typeof global.switchPage === "function") global.switchPage("home");
        return;
      }
      if (e.target.closest("#pt-log")) {
        onLog();
        return;
      }
      if (e.target.closest("#pt-rails-reset")) {
        railsDraft = normalizeRails(Object.assign({}, DEFAULT_RAILS, { bal: S().bal, sym: S().sym }));
        writeRails(railsDraft);
        render();
        return;
      }
      if (e.target.closest("#pt-rails-save")) {
        const rails = readRailsFromDom();
        writeRails(rails);
        if (typeof global.showToast === "function") showToast("Guardrails", "Saved");
        refreshLive();
        return;
      }
    });
  }

  function render() {
    const el = rootEl();
    if (!el) return;
    const rails = railsDraft || readRails();
    railsDraft = rails;
    el.classList.add("pt-root");
    view = "desk";
    el.innerHTML = deskHTML(rails);
    refreshLive();
    bind(el);
  }

  function hashName(loc) {
    loc = loc || (global.location || {});
    return String(loc.hash || "").replace(/^#/, "").split(/[/?&]/)[0].toLowerCase();
  }

  function wantsGold(loc) {
    loc = loc || (global.location || {});
    try {
      if (/(?:^|[?&])pretrade=1(?:&|$)/.test(String(loc.search || ""))) return true;
      if (/(?:^|[?&])sizer=1(?:&|$)/.test(String(loc.search || ""))) return true;
    } catch (e) {}
    try {
      const hash = hashName(loc);
      if (hash === "pretrade" || hash === "sizer" || hash === "size") return true;
    } catch (e) {}
    return false;
  }

  function wantsUnifiedJournal(loc) {
    loc = loc || (global.location || {});
    try {
      if (/(?:^|[?&])(?:desk|pretrade)=journal(?:&|$)/.test(String(loc.search || ""))) return true;
    } catch (e) {}
    try {
      const hash = hashName(loc);
      if (hash === "desk-journal" || hash === "pretrade-journal" || hash === "journal") return true;
    } catch (e) {}
    return false;
  }

  function wantsMarketDesk(loc) {
    loc = loc || (global.location || {});
    try {
      if (/(?:^|[?&])desk=1(?:&|$)/.test(String(loc.search || ""))) return true;
    } catch (e) {}
    try {
      const hash = hashName(loc);
      if (hash === "desk" || hash === "terminal") return true;
    } catch (e) {}
    return false;
  }

  function syncHash(kind) {
    try {
      const loc = global.location;
      if (!loc || !global.history || typeof history.replaceState !== "function") return;
      if (kind === "journal") return;
      const next = "#pretrade";
      if (String(loc.hash || "") === next) return;
      history.replaceState(null, "", loc.pathname + (loc.search || "") + next);
    } catch (e) {}
  }

  function journalHash() {
    try {
      const loc = global.location;
      if (!loc || !global.history || typeof history.replaceState !== "function") return;
      const next = "#journal";
      if (String(loc.hash || "") === next) return;
      history.replaceState(null, "", loc.pathname + (loc.search || "") + next);
    } catch (e) {}
  }

  function openUnifiedJournal() {
    if (typeof global.switchPage === "function") global.switchPage("journal");
    journalHash();
  }

  function prime(input) {
    if (!input) return form;
    if (input.ticker) form.ticker = String(input.ticker).trim().toUpperCase();
    if (input.dir) form.dir = String(input.dir).toLowerCase() === "short" ? "short" : "long";
    if (input.entry != null && input.entry !== "") form.entry = String(input.entry);
    if (input.stop != null && input.stop !== "") form.stop = String(input.stop);
    if (input.target != null && input.target !== "") form.target = String(input.target);
    if (input.notes != null) form.notes = String(input.notes);
    return form;
  }

  function enter() {
    const app = global.document && document.getElementById("app");
    if (app) app.classList.add("desk-wide");
    const page = global.document && document.getElementById("page-sizer");
    if (page) page.classList.add("pt-live");
    railsDraft = readRails();
    view = "desk";
    render();
    syncHash("desk");
  }

  function leave() {
    const page = global.document && document.getElementById("page-sizer");
    if (page) page.classList.remove("pt-live");
    const deskPage = global.document && document.getElementById("page-desk");
    if (deskPage && deskPage.classList.contains("active")) return;
    const app = global.document && document.getElementById("app");
    if (app) app.classList.remove("desk-wide");
  }

  function open(which) {
    if (which === "journal") {
      openUnifiedJournal();
      return;
    }
    if (which === "desk" || which === "gold") view = "desk";
    if (typeof global.switchPage === "function") global.switchPage("sizer");
    else enter();
  }

  const api = {
    DEFAULT_RAILS,
    SAMPLE_LOG_CAP,
    samplePretradeLogCount,
    sampleLogGate,
    isSamplePretradeLog,
    normalizeRails,
    computePlan,
    planStatusOf,
    isPretradeRow,
    isDuplicatePlan,
    filterJournalBook,
    todayRisked,
    progressState,
    outputHTML,
    resetSizerFields,
    rrOf,
    edgeFromTrades,
    applyOutcome,
    logPlan,
    setOutcome,
    setView,
    outcomeButtonsHtml: outcomeBtns,
    prime,
    render,
    enter,
    leave,
    open,
    openUnifiedJournal,
    wantsGold,
    wantsUnifiedJournal,
    wantsMarketDesk,
    wantsDesk: wantsGold,
    disciplineMix,
    isSampleDesk,
  };

  global.RunnrPretrade = api;
})(typeof window !== "undefined" ? window : globalThis);
