/**
 * Trend day size gate — checklist before the gold sizer.
 * SAMPLE guests and signed-in books. Size multiplier only. Not an entry system.
 * Auto fills the four hygiene checks from SPY (1–3) and SPY+QQQ (peers).
 */
(function (global) {
  "use strict";

  const KEY = "runnr_trend_day_v1";
  const AUTO_KEY = "runnr_trend_day_auto_v1";
  const SCHEMA = 2;
  const TZ = "America/New_York";
  const RTH_OPEN = 9 * 60 + 30;
  const RTH_CLOSE = 16 * 60;
  const SCORE_OPEN = 10 * 60;
  const SCORE_CLOSE = 10 * 60 + 30;
  const PREMARKET_OPEN = 4 * 60;
  const AUTO_REFRESH_MS = 45000;

  const CHECKS = [
    { id: "orb", label: "Outside first-hour range" },
    { id: "pm", label: "Broke premarket high/low" },
    { id: "yday", label: "Cleared yesterday’s H/L" },
    { id: "peers", label: "Peers same direction" },
  ];

  let bound = false;
  let draftChecks = null;
  let draftScope = "";
  let autoTimer = null;
  let autoInflight = null;
  let lastPointerUp = 0;
  let lastStampPointer = 0;
  let chipOpen = false;
  let chipUserSet = false;
  let chipUserDate = "";

  function S() {
    return global.S || (global.window && global.window.S) || {};
  }

  function sessionWho() {
    try {
      if (global.RunnrSync && typeof RunnrSync.sessionEmail === "function") {
        const e = String(RunnrSync.sessionEmail() || "").trim().toLowerCase();
        if (e) return e;
      }
    } catch (e) {}
    try {
      const own = String((S() && S().ownerEmail) || "").trim().toLowerCase();
      if (own) return own;
    } catch (e2) {}
    try {
      if (global.localStorage) {
        const e = String(localStorage.getItem("runnr_api_email") || "").trim().toLowerCase();
        if (e) return e;
      }
    } catch (e3) {}
    return "";
  }

  function bookScope() {
    if (isLoggedIn()) return sessionWho() || "auth";
    return "sample";
  }

  function storageKey(scope) {
    return KEY + ":" + (scope || bookScope());
  }

  function parseRec(raw) {
    if (!raw) return null;
    try {
      const rec = typeof raw === "string" ? JSON.parse(raw) : raw;
      return rec && typeof rec === "object" ? rec : null;
    } catch (e) {
      return null;
    }
  }

  function storageGet() {
    try {
      if (!global.localStorage) return bookRecord();
      const scoped = parseRec(localStorage.getItem(storageKey()));
      if (scoped) return scoped;
      if (bookScope() === "sample") return parseRec(localStorage.getItem(KEY));
      return bookRecord();
    } catch (e) {
      return bookRecord();
    }
  }

  function bookRecord() {
    if (!isLoggedIn()) return null;
    try {
      const rec = parseRec(S() && S().trendDay);
      if (!rec) return null;
      const scope = String(rec.scope || "");
      if (scope !== bookScope()) return null;
      return rec;
    } catch (e) {
      return null;
    }
  }

  function storageSet(rec) {
    if (rec && typeof rec === "object") rec.scope = bookScope();
    try {
      if (global.localStorage) localStorage.setItem(storageKey(), JSON.stringify(rec));
    } catch (e) {}
    try {
      if (global.localStorage && bookScope() === "sample") {
        localStorage.removeItem(KEY);
      }
    } catch (eBare) {}
    try {
      const st = S();
      if (isLoggedIn()) {
        st.trendDay = rec;
      } else if (st.trendDay && (st.trendDay.scope === "sample" || !st.trendDay.scope)) {
        delete st.trendDay;
      }
    } catch (e2) {}
  }

  function isAccidentalSit(rec) {
    if (!rec || rec.skipped) return false;
    if (!rec.applied) return false;
    if (rec.explicit || rec.sitChosen) return false;
    if (rec.userEdited) return false;
    const src = String(rec.source || "");
    if (src === "auto" || src === "mixed") return false;
    const score = scoreOf(rec.checks);
    const m = Number(rec.multiplier);
    return score <= 1 && (rec.band === "sit" || m === 0);
  }

  function migrateRecord(rec, clock) {
    if (!rec || typeof rec !== "object") return rec;
    rec.schema = SCHEMA;
    if (rec.skipped) {
      rec.applied = false;
      rec.multiplier = 1;
      rec.band = "skip";
      rec.locked = true;
      return rec;
    }
    if (isAccidentalSit(rec)) {
      const fresh = blankRecord(clock);
      fresh.checks = normalizeChecks(rec.checks);
      fresh.score = scoreOf(fresh.checks);
      fresh.band = bandOf(fresh.score);
      fresh.multiplier = multiplierOf(fresh.score);
      fresh.autoChecks = Array.isArray(rec.autoChecks) ? normalizeChecks(rec.autoChecks) : null;
      fresh.autoAt = rec.autoAt || "";
      fresh.autoError = rec.autoError || "";
      fresh.autoLevels = rec.autoLevels || null;
      fresh.autoSides = rec.autoSides || null;
      fresh.autoFixture = !!rec.autoFixture;
      fresh.migratedSit = true;
      return fresh;
    }
    return rec;
  }

  function autoStoreGet() {
    try {
      if (!global.localStorage) return null;
      return parseRec(localStorage.getItem(AUTO_KEY));
    } catch (e) {
      return null;
    }
  }

  function autoStoreSet(snap) {
    try {
      if (global.localStorage) localStorage.setItem(AUTO_KEY, JSON.stringify(snap));
    } catch (e) {}
  }

  function etParts(now) {
    const d = now instanceof Date ? now : new Date();
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      hour12: false,
    });
    const o = {};
    dtf.formatToParts(d).forEach((x) => { o[x.type] = x.value; });
    const hour = (+o.hour) % 24;
    return {
      date: o.year + "-" + o.month + "-" + o.day,
      weekday: o.weekday,
      minutes: hour * 60 + (+o.minute),
      weekend: o.weekday === "Sat" || o.weekday === "Sun",
    };
  }

  function clockOf(now) {
    const p = etParts(now);
    const inRth = !p.weekend && p.minutes >= RTH_OPEN && p.minutes < RTH_CLOSE;
    const inScore = !p.weekend && p.minutes >= SCORE_OPEN && p.minutes < SCORE_CLOSE;
    const afterScore = inRth && p.minutes >= SCORE_CLOSE;
    const beforeScore = inRth && p.minutes < SCORE_OPEN;
    let phase = "outside";
    if (inScore) phase = "score";
    else if (afterScore) phase = "after";
    else if (beforeScore) phase = "before";
    return {
      tz: TZ,
      date: p.date,
      weekday: p.weekday,
      minutes: p.minutes,
      weekend: p.weekend,
      inRth: inRth,
      inScoreWindow: inScore,
      afterScoreWindow: afterScore,
      beforeScoreWindow: beforeScore,
      outsideRth: !inRth,
      phase: phase,
    };
  }

  function clockLabel(clock) {
    const c = clock || clockOf();
    if (c.phase === "score") return "";
    if (c.phase === "after") return "Live SPY/QQQ — still updating";
    if (c.phase === "before") return "Score window opens 10:00 ET";
    return "Outside RTH — gate is optional";
  }

  function autoEligible(clock) {
    const c = clock || clockOf();
    return !c.weekend && c.minutes >= SCORE_OPEN;
  }

  function emptyChecks() {
    return CHECKS.map(function () { return false; });
  }

  function normalizeChecks(raw) {
    const src = Array.isArray(raw) ? raw : [];
    return CHECKS.map(function (_, i) { return !!src[i]; });
  }

  function sameChecks(a, b) {
    const x = normalizeChecks(a);
    const y = normalizeChecks(b);
    return x.every(function (v, i) { return v === y[i]; });
  }

  function scoreOf(checks) {
    return normalizeChecks(checks).reduce(function (n, on) { return n + (on ? 1 : 0); }, 0);
  }

  function bandOf(score) {
    const n = Number(score) || 0;
    if (n <= 1) return "sit";
    if (n === 2) return "half";
    return "full";
  }

  function multiplierOf(score, opts) {
    const band = bandOf(score);
    if (band === "sit") return opts && opts.quarter ? 0.25 : 0;
    if (band === "half") return 0.5;
    return 1;
  }

  function statusText(score, band) {
    if (band === "skip") return score + " / 4 · skipped";
    const label = band === "sit" ? "sit" : band === "half" ? "half size" : "full size";
    return score + " / 4 · " + label;
  }

  function ctaLabel(band) {
    if (band === "sit") return "Sit — no trade (0 size)";
    if (band === "half") return "Apply half size";
    return "Apply full size";
  }

  function optionalClock(clock) {
    const c = clock || clockOf();
    return !!(c.outsideRth || c.beforeScoreWindow);
  }

  function primaryAction(rec, clock) {
    const c = clock || clockOf();
    const band = (rec && rec.band) || "sit";
    if (band === "half" || band === "full") return "apply";
    if (optionalClock(c)) return "skip";
    return "sit";
  }

  /* Half/full from an Auto score counts immediately. Sit stays 0× only after an explicit Apply.
     Optional hours stay at 1× so visitors are never silently zeroed. */
  function softLive(rec, clock) {
    if (!rec || rec.skipped || rec.applied) return false;
    if (optionalClock(clock || clockOf())) return false;
    if (!rec.autoChecks) return false;
    const band = rec.band || bandOf(rec.score);
    return band === "half" || band === "full";
  }

  function appliedQuiet(band) {
    return band === "half" ? "Applied · half size" : "Applied · full size";
  }

  function stampTone(rec, clock) {
    if (!rec || rec.skipped) return rec && rec.skipped ? "skipped" : "optional";
    if (rec.applied || softLive(rec, clock || clockOf())) return "live";
    return "optional";
  }

  function sourceOf(rec) {
    if (!rec) return "";
    if (!rec.autoChecks) return rec.userEdited ? "manual" : (rec.source || "");
    if (sameChecks(rec.checks, rec.autoChecks)) return "auto";
    return "mixed";
  }

  function blankRecord(clock) {
    const c = clock || clockOf();
    return {
      date: c.date,
      checks: emptyChecks(),
      score: 0,
      band: "sit",
      multiplier: 0,
      applied: false,
      skipped: false,
      skipReason: "",
      locked: false,
      appliedAt: "",
      source: "",
      userEdited: false,
      explicit: false,
      sitChosen: false,
      migratedSit: false,
      schema: SCHEMA,
      autoChecks: null,
      autoAt: "",
      autoLocked: false,
      autoError: "",
      autoLevels: null,
      autoSides: null,
      autoFixture: false,
    };
  }

  function todayRecord(now) {
    const clock = clockOf(now);
    const saved = storageGet();
    if (!saved || saved.date !== clock.date) {
      const fresh = blankRecord(clock);
      if (draftChecks && draftScope === bookScope()) fresh.checks = normalizeChecks(draftChecks);
      return fresh;
    }
    let rec = Object.assign(blankRecord(clock), saved);
    rec = migrateRecord(rec, clock);
    rec.date = clock.date;
    rec.checks = normalizeChecks(rec.checks);
    rec.autoChecks = Array.isArray(rec.autoChecks) ? normalizeChecks(rec.autoChecks) : null;
    rec.score = scoreOf(rec.checks);
    rec.source = sourceOf(rec);
    rec.userEdited = !!rec.userEdited;
    rec.explicit = !!rec.explicit;
    if (rec.skipped) {
      rec.applied = false;
      rec.multiplier = 1;
      rec.band = "skip";
      rec.locked = true;
    } else if (!rec.applied) {
      rec.band = bandOf(rec.score);
      rec.multiplier = multiplierOf(rec.score);
      rec.locked = false;
    } else {
      rec.band = rec.band || bandOf(rec.score);
      rec.locked = true;
      if (rec.band === "sit" && rec.multiplier !== 0.25) rec.multiplier = 0;
    }
    let dirty = !!rec.migratedSit
      || !!(saved.skipped && (Number(saved.multiplier) === 0 || saved.applied || saved.band !== "skip"));
    try {
      if (!dirty && bookScope() === "sample" && global.localStorage) {
        dirty = !localStorage.getItem(storageKey()) && !!localStorage.getItem(KEY);
      }
    } catch (eDirty) {}
    if (dirty) storageSet(rec);
    return rec;
  }

  function isLoggedIn() {
    try {
      if (global.RunnrSync && typeof RunnrSync.isLoggedIn === "function" && RunnrSync.isLoggedIn()) {
        return true;
      }
    } catch (e) {}
    try {
      if (global.localStorage && localStorage.getItem("runnr_api_token")) return true;
    } catch (e2) {}
    return false;
  }

  function isSampleDesk() {
    if (isLoggedIn()) return false;
    try {
      if (global.RunnrPretrade && typeof RunnrPretrade.isSampleDesk === "function") {
        return !!RunnrPretrade.isSampleDesk();
      }
    } catch (e) {}
    try {
      if (global.RunnrDemoSandbox && typeof RunnrDemoSandbox.isDemoState === "function") {
        return !!RunnrDemoSandbox.isDemoState(S());
      }
    } catch (e2) {}
    return true;
  }

  function tourWantsSize() {
    try {
      const loc = global.location || {};
      if (/(?:^|[?&])tour=1(?:&|$)/.test(String(loc.search || ""))) return true;
      if (/^#tour\b/i.test(String(loc.hash || ""))) return true;
    } catch (e) {}
    try {
      if (global.RunnrTour && typeof RunnrTour.queryForce === "function" && RunnrTour.queryForce()) {
        return true;
      }
    } catch (e2) {}
    try {
      if (global.RunnrTour && typeof RunnrTour.isOpen === "function" && RunnrTour.isOpen()) {
        return true;
      }
    } catch (e3) {}
    try {
      if (global.document && document.documentElement && document.documentElement.classList.contains("runnr-tour")) {
        return true;
      }
    } catch (e4) {}
    return false;
  }

  function introIsOpen() {
    try {
      if (global.RunnrIntro && typeof RunnrIntro.isOpen === "function" && RunnrIntro.isOpen()) {
        return true;
      }
    } catch (e) {}
    try {
      const el = global.document && document.getElementById("intro-overlay");
      if (el && !el.hidden && el.classList && el.classList.contains("open")) return true;
    } catch (e2) {}
    return false;
  }

  function shouldYield() {
    return tourWantsSize() || introIsOpen();
  }

  function sizePageOpen() {
    try {
      const page = global.document && document.getElementById("page-sizer");
      return !!(page && page.classList && page.classList.contains("active"));
    } catch (e) {
      return false;
    }
  }

  function settled(rec) {
    return !!(rec && (rec.applied || rec.skipped));
  }

  function shouldShowChip(now) {
    if (shouldYield()) return false;
    const rec = todayRecord(now);
    if (settled(rec)) return false;
    return true;
  }

  function autoOpenOverlay(now) {
    const rec = todayRecord(now);
    if (settled(rec)) return false;
    const clock = clockOf(now);
    if (optionalClock(clock)) return false;
    if (softLive(rec, clock)) return false;
    return true;
  }

  /* Auto-open is the default inside the gate window. A strip tap records
     an explicit open/closed choice for that ET date so collapse sticks. */
  function shouldOpenOverlay(now) {
    if (shouldYield()) return false;
    const clock = clockOf(now);
    if (chipUserSet && chipUserDate === clock.date) return !!chipOpen;
    return autoOpenOverlay(now);
  }

  function noteUserChip(open, now) {
    chipUserSet = true;
    chipUserDate = clockOf(now).date;
    chipOpen = !!open;
  }

  function riskMultiplier(now) {
    const rec = todayRecord(now);
    if (!rec || rec.skipped) return 1;
    if (rec.applied) {
      const m = Number(rec.multiplier);
      return Number.isFinite(m) && m >= 0 ? m : 1;
    }
    if (softLive(rec, clockOf(now))) return multiplierOf(rec.score);
    return 1;
  }

  function planMeta(now) {
    const rec = todayRecord(now);
    const soft = softLive(rec, clockOf(now));
    if (!rec.applied && !rec.skipped && !soft) return null;
    const multiplier = rec.skipped ? 1 : (rec.applied ? Number(rec.multiplier) : multiplierOf(rec.score));
    return {
      date: rec.date,
      score: rec.score,
      band: rec.skipped ? "skip" : rec.band,
      multiplier: multiplier,
      applied: !!rec.applied,
      soft: !!soft,
      skipped: !!rec.skipped,
      skipReason: rec.skipReason || "",
      checks: rec.checks.slice(),
      source: rec.source || (rec.skipped ? "manual" : ""),
      explicit: !!rec.explicit,
    };
  }

  function coachHint(now) {
    const rec = todayRecord(now);
    if (!rec.skipped) return "";
    return "Sized without the trend day check";
  }

  /* —— Auto hygiene (SPY / QQQ) ————————————————————————————————
   * 1. Outside first-hour range — SPY stamp vs RTH 09:30–10:00 ET high/low
   * 2. Broke premarket high/low — SPY stamp vs 04:00–09:30 ET high/low
   * 3. Cleared yesterday’s H/L — SPY stamp vs prior regular-session high/low
   * 4. Peers same direction — SPY and QQQ both `up` or both `down`
   *    Break side: first-hour break wins; else yesterday H/L; else flat.
   * Stamp = last 1m close in 10:00–10:30 ET, else last RTH print from 10:00.
   */

  function parseChart(payload) {
    const result = payload && payload.chart && payload.chart.result && payload.chart.result[0];
    if (!result) return [];
    const stamps = result.timestamp || [];
    const quote = (result.indicators && result.indicators.quote && result.indicators.quote[0]) || {};
    const highs = quote.high || [];
    const lows = quote.low || [];
    const closes = quote.close || [];
    const opens = quote.open || [];
    const bars = [];
    for (let i = 0; i < stamps.length; i++) {
      const t = +stamps[i];
      if (!t) continue;
      const h = +highs[i];
      const l = +lows[i];
      const c = +closes[i];
      const o = +opens[i];
      if (![h, l, c].every(function (x) { return Number.isFinite(x); })) continue;
      const p = etParts(new Date(t * 1000));
      bars.push({
        t: t,
        date: p.date,
        minutes: p.minutes,
        o: Number.isFinite(o) ? o : c,
        h: h,
        l: l,
        c: c,
      });
    }
    return bars;
  }

  function inWin(bar, date, start, end) {
    return bar.date === date && bar.minutes >= start && bar.minutes < end;
  }

  function hiLo(bars) {
    if (!bars || !bars.length) return { high: null, low: null };
    let high = -Infinity;
    let low = Infinity;
    bars.forEach(function (b) {
      if (b.h > high) high = b.h;
      if (b.l < low) low = b.l;
    });
    return { high: high, low: low };
  }

  function priorSessionDate(bars, sessionDate) {
    const seen = {};
    const dates = [];
    (bars || []).forEach(function (b) {
      if (b.date < sessionDate && b.minutes >= RTH_OPEN && b.minutes < RTH_CLOSE && !seen[b.date]) {
        seen[b.date] = true;
        dates.push(b.date);
      }
    });
    dates.sort();
    return dates.length ? dates[dates.length - 1] : "";
  }

  function pickStamp(bars, sessionDate) {
    const score = (bars || []).filter(function (b) { return inWin(b, sessionDate, SCORE_OPEN, SCORE_CLOSE); });
    if (score.length) return score[score.length - 1];
    const after = (bars || []).filter(function (b) { return inWin(b, sessionDate, SCORE_OPEN, RTH_CLOSE); });
    if (after.length) return after[after.length - 1];
    const rth = (bars || []).filter(function (b) { return inWin(b, sessionDate, RTH_OPEN, RTH_CLOSE); });
    return rth.length ? rth[rth.length - 1] : null;
  }

  function levelsFor(minuteBars, dailyBars, sessionDate) {
    const first = (minuteBars || []).filter(function (b) { return inWin(b, sessionDate, RTH_OPEN, SCORE_OPEN); });
    const prem = (minuteBars || []).filter(function (b) { return inWin(b, sessionDate, PREMARKET_OPEN, RTH_OPEN); });
    const stamp = pickStamp(minuteBars, sessionDate);
    const orb = hiLo(first);
    const pm = hiLo(prem);
    let ydayHigh = null;
    let ydayLow = null;
    let ydayDate = "";
    const daily = (dailyBars || []).filter(function (b) { return b.date < sessionDate; });
    daily.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    if (daily.length) {
      const last = daily[daily.length - 1];
      ydayHigh = last.h;
      ydayLow = last.l;
      ydayDate = last.date;
    }
    if (ydayHigh == null) {
      ydayDate = priorSessionDate(minuteBars, sessionDate);
      if (ydayDate) {
        const y = hiLo((minuteBars || []).filter(function (b) { return inWin(b, ydayDate, RTH_OPEN, RTH_CLOSE); }));
        ydayHigh = y.high;
        ydayLow = y.low;
      }
    }
    return {
      stamp: stamp ? stamp.c : null,
      stampAt: stamp ? stamp.t : null,
      firstHourHigh: orb.high,
      firstHourLow: orb.low,
      pmHigh: pm.high,
      pmLow: pm.low,
      ydayHigh: ydayHigh,
      ydayLow: ydayLow,
      ydayDate: ydayDate,
      ok: !!stamp,
    };
  }

  function broke(stamp, high, low) {
    if (stamp == null || high == null || low == null) return false;
    return stamp > high || stamp < low;
  }

  function breakSide(stamp, firstHigh, firstLow, ydayHigh, ydayLow) {
    if (stamp == null) return "flat";
    if (firstHigh != null && stamp > firstHigh) return "up";
    if (firstLow != null && stamp < firstLow) return "down";
    if (ydayHigh != null && stamp > ydayHigh) return "up";
    if (ydayLow != null && stamp < ydayLow) return "down";
    return "flat";
  }

  function evaluateLevels(spy, qqq) {
    const orb = broke(spy.stamp, spy.firstHourHigh, spy.firstHourLow);
    const pm = broke(spy.stamp, spy.pmHigh, spy.pmLow);
    const yday = broke(spy.stamp, spy.ydayHigh, spy.ydayLow);
    const spySide = breakSide(spy.stamp, spy.firstHourHigh, spy.firstHourLow, spy.ydayHigh, spy.ydayLow);
    const qqqSide = breakSide(qqq.stamp, qqq.firstHourHigh, qqq.firstHourLow, qqq.ydayHigh, qqq.ydayLow);
    const peers = spySide === qqqSide && spySide !== "flat";
    const checks = [orb, pm, yday, peers];
    const score = scoreOf(checks);
    return {
      checks: checks,
      score: score,
      band: bandOf(score),
      multiplier: multiplierOf(score),
      sides: { SPY: spySide, QQQ: qqqSide },
      levels: { SPY: spy, QQQ: qqq },
      benchmark: "SPY",
      peers: "QQQ",
    };
  }

  function chartBundle(charts, symbol) {
    const row = (charts && charts[symbol]) || {};
    if (row.m1 || row.d1) return row;
    return { m1: charts && charts[symbol], d1: null };
  }

  function evaluateFromCharts(charts, now, sessionDate) {
    const clock = clockOf(now);
    const date = sessionDate || clock.date;
    const spyPack = chartBundle(charts, "SPY");
    const qqqPack = chartBundle(charts, "QQQ");
    const spy = levelsFor(parseChart(spyPack.m1), parseChart(spyPack.d1), date);
    const qqq = levelsFor(parseChart(qqqPack.m1), parseChart(qqqPack.d1), date);
    const out = evaluateLevels(spy, qqq);
    out.date = date;
    out.phase = clock.phase;
    out.locked = !clock.weekend && clock.minutes >= SCORE_CLOSE;
    out.eligible = autoEligible(clock);
    out.stampAt = spy.stampAt;
    return out;
  }

  function yahooChart(symbol, rows) {
    const ts = [];
    const high = [];
    const low = [];
    const close = [];
    (rows || []).forEach(function (r) {
      const t = typeof r[0] === "number" ? r[0] : Math.floor(new Date(r[0]).getTime() / 1000);
      ts.push(t);
      high.push(r[1]);
      low.push(r[2]);
      close.push(r[3]);
    });
    return {
      chart: {
        result: [{
          meta: { symbol: symbol, regularMarketPrice: close[close.length - 1] },
          timestamp: ts,
          indicators: { quote: [{ high: high, low: low, close: close, open: close, volume: ts.map(function () { return 1; }) }] },
        }],
        error: null,
      },
    };
  }

  function demoCharts() {
    /* Friday 2026-09-18 (EDT). Thursday RTH = prior session. */
    const spyM = yahooChart("SPY", [
      ["2026-09-17T13:35:00Z", 565, 560, 563],
      ["2026-09-17T19:55:00Z", 564, 561, 562],
      ["2026-09-18T08:15:00Z", 567, 563, 566],
      ["2026-09-18T13:20:00Z", 566, 562, 565],
      ["2026-09-18T13:30:00Z", 568, 564, 566],
      ["2026-09-18T13:55:00Z", 567, 565, 566],
      ["2026-09-18T14:15:00Z", 571, 569, 570],
    ]);
    const qqqM = yahooChart("QQQ", [
      ["2026-09-17T13:35:00Z", 485, 480, 483],
      ["2026-09-17T19:55:00Z", 484, 481, 482],
      ["2026-09-18T08:15:00Z", 488, 484, 487],
      ["2026-09-18T13:20:00Z", 487, 483, 486],
      ["2026-09-18T13:30:00Z", 491, 489, 490],
      ["2026-09-18T13:55:00Z", 490, 488, 489],
      ["2026-09-18T14:15:00Z", 494, 492, 493],
    ]);
    const spyD = yahooChart("SPY", [["2026-09-17T13:30:00Z", 565, 560, 562]]);
    const qqqD = yahooChart("QQQ", [["2026-09-17T13:30:00Z", 485, 480, 482]]);
    return { SPY: { m1: spyM, d1: spyD }, QQQ: { m1: qqqM, d1: qqqD } };
  }

  function demoSnapshot(now) {
    return evaluateFromCharts(demoCharts(), now || new Date("2026-09-18T14:15:00Z"), "2026-09-18");
  }

  function wantsFixture() {
    try {
      if (global.RUNNR_TREND_DAY_FIXTURE) return true;
    } catch (e) {}
    try {
      const loc = global.location || {};
      if (/(?:^|[?&])tdfix=1(?:&|$)/.test(String(loc.search || ""))) return true;
    } catch (e2) {}
    return false;
  }

  function persistDraft(checks, meta, now) {
    draftScope = bookScope();
    draftChecks = normalizeChecks(checks);
    const rec = todayRecord(now);
    if (settled(rec)) return rec;
    rec.checks = draftChecks;
    if (meta && meta.userEdited) rec.userEdited = true;
    if (meta && meta.auto) {
      rec.autoChecks = normalizeChecks(meta.auto.checks);
      rec.autoAt = meta.auto.stampAt || "";
      rec.autoLocked = !!meta.auto.locked;
      rec.autoError = "";
      rec.autoLevels = meta.auto.levels || null;
      rec.autoSides = meta.auto.sides || null;
      rec.autoFixture = !!meta.auto.fixture;
    }
    if (meta && Object.prototype.hasOwnProperty.call(meta, "autoError")) {
      rec.autoError = meta.autoError || "";
    }
    rec.score = scoreOf(rec.checks);
    rec.band = bandOf(rec.score);
    rec.multiplier = multiplierOf(rec.score);
    rec.source = sourceOf(rec);
    storageSet(rec);
    return rec;
  }

  function applyAutoSnapshot(snap, now, opts) {
    const o = opts || {};
    const before = riskMultiplier(now);
    const rec = todayRecord(now);
    if (settled(rec) || !snap || !snap.checks) return rec;
    const next = rec.userEdited ? rec.checks : normalizeChecks(snap.checks);
    persistDraft(next, {
      auto: {
        checks: snap.checks,
        stampAt: snap.stampAt || "",
        locked: !!snap.locked,
        levels: snap.levels || null,
        sides: snap.sides || null,
        fixture: !!o.fixture,
      },
    }, now);
    if (snap.date) autoStoreSet({ date: snap.date, snap: snap, locked: !!snap.locked, fetchedAt: Date.now() });
    if (riskMultiplier(now) !== before) refreshSizer();
    paint(now);
    return todayRecord(now);
  }

  function markAutoError(message, now) {
    const rec = todayRecord(now);
    if (settled(rec)) return rec;
    rec.autoError = message || "Auto unavailable";
    storageSet(rec);
    paintChip(now);
    return rec;
  }

  function cachedAutoFor(clock) {
    const row = autoStoreGet();
    if (!row || !row.snap || row.snap.date !== clock.date) return null;
    const age = Date.now() - (Number(row.fetchedAt) || 0);
    if (age < AUTO_REFRESH_MS) return row.snap;
    return null;
  }

  function apiBase() {
    try {
      if (global.RunnrSync && typeof RunnrSync.apiBase === "function") {
        const b = String(RunnrSync.apiBase() || "").replace(/\/$/, "");
        if (b) return b;
      }
    } catch (e) {}
    return "https://api.runnr.fyi";
  }

  function snapshotFromPayload(data, now) {
    if (!data || typeof data !== "object") return null;
    if (data.error && !data.levels) return null;
    if (data.levels && data.levels.SPY && data.levels.QQQ) {
      const ev = evaluateLevels(data.levels.SPY, data.levels.QQQ);
      ev.date = data.date || clockOf(now).date;
      ev.phase = data.phase || clockOf(now).phase;
      ev.locked = !!data.locked || ev.locked;
      ev.eligible = data.eligible !== false;
      ev.stampAt = data.stampAt || ev.levels.SPY.stampAt;
      ev.checks = normalizeChecks(ev.checks);
      return ev;
    }
    if (data.SPY || (data.charts && data.charts.SPY)) {
      return evaluateFromCharts(data.charts || data, now);
    }
    return null;
  }

  function fetchJson(url, init) {
    const fn = global.fetch;
    if (typeof fn !== "function") return Promise.reject(new Error("no fetch"));
    return fn.call(global, url, init || { headers: { Accept: "application/json" } }).then(function (res) {
      if (!res || !res.ok) throw new Error("fetch failed");
      return res.json();
    });
  }

  function fetchAutoSnapshot(now) {
    const clock = clockOf(now);
    const cached = cachedAutoFor(clock);
    if (cached) return Promise.resolve(cached);
    const base = apiBase();
    return fetchJson(base + "/api/v1/quotes/trend-day").then(function (data) {
      if (data && data.eligible === false) return null;
      const snap = snapshotFromPayload(data, now);
      if (snap) return snap;
      throw new Error("incomplete");
    }).catch(function () {
      return fetchJson(base + "/api/v1/quotes/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ symbols: ["SPY", "QQQ"], interval: "1m", range: "5d", includePrePost: true }),
      }).then(function (mins) {
        return fetchJson(base + "/api/v1/quotes/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ symbols: ["SPY", "QQQ"], interval: "1d", range: "5d" }),
        }).then(function (days) {
          const quotesM = (mins && mins.quotes) || mins || {};
          const quotesD = (days && days.quotes) || days || {};
          if (!quotesM.SPY || !quotesM.QQQ) throw new Error("feed");
          return evaluateFromCharts({
            SPY: { m1: quotesM.SPY, d1: quotesD.SPY },
            QQQ: { m1: quotesM.QQQ, d1: quotesD.QQQ },
          }, now);
        });
      });
    });
  }

  function hydrateAuto(now) {
    const clock = clockOf(now);
    if (wantsFixture() && !autoEligible(clock)) {
      const snap = demoSnapshot(now);
      snap.locked = true;
      applyAutoSnapshot(snap, now, { fixture: true });
      return Promise.resolve(todayRecord(now));
    }
    if (!autoEligible(clock)) return Promise.resolve(null);
    const rec = todayRecord(now);
    if (settled(rec)) return Promise.resolve(rec);
    if (autoInflight) return autoInflight;
    autoInflight = fetchAutoSnapshot(now).then(function (snap) {
      autoInflight = null;
      if (!snap || !snap.checks) {
        markAutoError("Auto unavailable", now);
        return todayRecord(now);
      }
      applyAutoSnapshot(snap, now);
      return todayRecord(now);
    }).catch(function () {
      autoInflight = null;
      markAutoError("Auto unavailable", now);
      return todayRecord(now);
    });
    return autoInflight;
  }

  function shouldPollAuto(now) {
    const clock = clockOf(now);
    if (!autoEligible(clock)) return false;
    if (!sizePageOpen()) return false;
    const rec = todayRecord(now);
    if (settled(rec)) return false;
    return true;
  }

  function scheduleAutoRefresh() {
    if (autoTimer || typeof global.setInterval !== "function") return;
    autoTimer = global.setInterval(function () {
      if (!sizePageOpen()) {
        if (typeof global.clearInterval === "function") global.clearInterval(autoTimer);
        autoTimer = null;
        return;
      }
      if (!shouldPollAuto()) return;
      hydrateAuto();
    }, AUTO_REFRESH_MS);
  }

  function apply(opts, now) {
    const clock = clockOf(now);
    const rec = todayRecord(now);
    if (settled(rec)) return rec;
    const o = opts || {};
    const quarter = !!o.quarter;
    rec.checks = draftChecks ? normalizeChecks(draftChecks) : rec.checks;
    rec.score = scoreOf(rec.checks);
    rec.band = bandOf(rec.score);
    rec.multiplier = multiplierOf(rec.score, { quarter: quarter && rec.band === "sit" });
    rec.applied = true;
    rec.skipped = false;
    rec.skipReason = "";
    rec.locked = true;
    rec.explicit = o.auto ? rec.band !== "sit" : true;
    rec.sitChosen = rec.band === "sit" && rec.explicit;
    rec.source = o.auto ? (sourceOf(rec) || "auto") : (sourceOf(rec) || "manual");
    rec.appliedAt = (now instanceof Date ? now : new Date()).toISOString();
    rec.date = clock.date;
    rec.schema = SCHEMA;
    storageSet(rec);
    noteUserChip(false, now);
    draftScope = bookScope();
    draftChecks = rec.checks.slice();
    if (typeof global.persist === "function") {
      try { global.persist(); } catch (e) {}
    }
    paint(now);
    refreshSizer();
    return rec;
  }

  function skip(reason, now) {
    const clock = clockOf(now);
    const rec = todayRecord(now);
    if (settled(rec)) return rec;
    rec.checks = draftChecks ? normalizeChecks(draftChecks) : rec.checks;
    rec.score = scoreOf(rec.checks);
    rec.band = "skip";
    rec.multiplier = 1;
    rec.applied = false;
    rec.skipped = true;
    rec.skipReason = reason || "user";
    rec.locked = true;
    rec.explicit = true;
    rec.sitChosen = false;
    rec.source = rec.source || sourceOf(rec) || "manual";
    rec.appliedAt = (now instanceof Date ? now : new Date()).toISOString();
    rec.date = clock.date;
    rec.schema = SCHEMA;
    storageSet(rec);
    noteUserChip(false, now);
    if (typeof global.persist === "function") {
      try { global.persist(); } catch (e) {}
    }
    paint(now);
    refreshSizer();
    return rec;
  }

  function maybeAutoApply(now) {
    /* Derived in softLive / riskMultiplier. Do not set applied or locked — that froze the chip. */
    return todayRecord(now);
  }

  function refreshSizer() {
    try {
      if (global.RunnrPretrade && typeof RunnrPretrade.render === "function") {
        const page = global.document && document.getElementById("page-sizer");
        if (page && page.classList.contains("pt-live")) {
          global.RunnrPretrade.render();
        }
      }
    } catch (e) {}
  }

  function overlayEl() {
    return global.document ? document.getElementById("trend-day-overlay") : null;
  }

  function chipEl() {
    return global.document ? document.getElementById("trend-day-chip") : null;
  }

  function stampEl() {
    return global.document ? document.getElementById("pt-trend-stamp") : null;
  }

  function primedTicker() {
    try {
      const input = global.document && document.getElementById("pt-ticker");
      const v = input && String(input.value || "").trim().toUpperCase();
      if (v) return v;
    } catch (e) {}
    return "AAPL";
  }

  function autoLineHTML(rec) {
    if (rec.autoError) {
      return '<div class="td-auto err" id="trend-day-auto">Auto unavailable</div>';
    }
    if (!rec.autoChecks) {
      return '<div class="td-auto" id="trend-day-auto" hidden></div>';
    }
    const extra = rec.source === "mixed"
      ? " · edited"
      : (rec.autoFixture ? " · fixture" : "");
    return '<div class="td-auto" id="trend-day-auto">Auto · SPY/QQQ' + extra + "</div>";
  }

  function chipHTML(rec, clock, opts) {
    const o = opts || {};
    const score = rec.score;
    const band = rec.band;
    const label = clockLabel(clock);
    const locked = !!(settled(rec) || o.readonly);
    const checks = CHECKS.map(function (item, i) {
      const on = !!rec.checks[i];
      return (
        '<button type="button" class="td-check' + (on ? " on" : "") + '"' +
          ' data-td-check="' + i + '"' +
          (locked ? " disabled" : "") +
          ' aria-pressed="' + (on ? "true" : "false") + '">' +
          '<span class="td-check-mark" aria-hidden="true"></span>' +
          '<span class="td-check-label">' + item.label + "</span>" +
        "</button>"
      );
    }).join("");
    const primary = primaryAction(rec, clock);
    const soft = softLive(rec, clock);
    const quarter = band === "sit" && !locked
      ? '<button type="button" class="td-quarter" id="td-quarter">Use 0.25×</button>'
      : "";
    const skipBtn = locked
      ? ""
      : (primary === "skip"
        ? '<button type="button" class="td-cta" id="td-skip">Size without gate</button>'
        : '<button type="button" class="td-skip" id="td-skip">Skip — size without gate</button>');
    const sitQuiet = !locked && band === "sit" && primary === "skip"
      ? '<button type="button" class="td-sit" id="td-apply">Sit — no trade (0 size)</button>'
      : "";
    const cta = locked || sitQuiet || soft
      ? ""
      : '<button type="button" class="td-cta" id="td-apply">' + ctaLabel(band) + "</button>";
    const appliedNote = soft
      ? '<p class="td-applied" id="td-applied">' + appliedQuiet(band) + "</p>"
      : "";
    const hint = optionalClock(clock)
      ? "Optional now — size is not gated until you sit"
      : "Sit if 0–1 · half at 2 · full at 3–4";
    return (
      '<div class="td-title" id="trend-day-title">Trend day check</div>' +
      '<div class="td-status" id="trend-day-status">' + statusText(score, band) + "</div>" +
      autoLineHTML(rec) +
      (label ? '<div class="td-clock" id="trend-day-clock">' + label + "</div>" : '<div class="td-clock" id="trend-day-clock" hidden></div>') +
      '<div class="td-checks" role="group" aria-label="Trend day checks">' + checks + "</div>" +
      appliedNote +
      cta +
      quarter +
      skipBtn +
      sitQuiet +
      '<p class="td-hint">' + hint + "</p>"
    );
  }

  function stampHTML(rec, clock) {
    if (!rec) return "";
    if (rec.skipped) {
      return "Trend day check · skipped · sized without gate";
    }
    const c = clock || clockOf();
    if (rec.applied || softLive(rec, c)) {
      const extra = rec.band === "sit" && rec.multiplier === 0.25 ? " · 0.25×" : (rec.band === "sit" ? " · 0 size" : "");
      const src = rec.source === "auto" ? " · auto" : rec.source === "mixed" ? " · edited" : "";
      return "Trend day check · " + statusText(rec.score, rec.band) + extra + src;
    }
    if (optionalClock(c)) {
      const when = c.outsideRth ? "Outside RTH" : "before 10:00 ET";
      return "Trend day check · optional · " + when + " — size not gated";
    }
    return "Trend day check · " + statusText(rec.score, rec.band || bandOf(rec.score));
  }

  function setOverlayOpen(open) {
    const overlay = overlayEl();
    const page = global.document && document.getElementById("page-sizer");
    if (page) page.classList.toggle("pt-trend-gate", !!open);
    if (!overlay) return;
    if (open) {
      overlay.hidden = false;
      overlay.classList.add("open");
      overlay.setAttribute("aria-hidden", "false");
    } else {
      overlay.hidden = true;
      overlay.classList.remove("open");
      overlay.setAttribute("aria-hidden", "true");
    }
  }

  function paintChip(now) {
    const rec = todayRecord(now);
    const clock = clockOf(now);
    const chip = chipEl();
    if (chip) chip.innerHTML = chipHTML(rec, clock);
    const mark = global.document && document.getElementById("trend-day-watermark");
    if (mark) mark.innerHTML = "Size<br>" + primedTicker();
  }

  function paintStamp(now) {
    const el = stampEl();
    if (!el) return;
    const setAttr = function (k, v) {
      if (typeof el.setAttribute === "function") el.setAttribute(k, v);
    };
    if (shouldYield()) {
      el.hidden = true;
      el.textContent = "";
      setAttr("aria-expanded", "false");
      return;
    }
    const rec = todayRecord(now);
    const clock = clockOf(now);
    const copy = stampHTML(rec, clock);
    const open = shouldOpenOverlay(now);
    if (!copy) {
      el.hidden = true;
      el.textContent = "";
      setAttr("aria-expanded", "false");
      return;
    }
    el.hidden = false;
    el.textContent = copy;
    el.className = "pt-trend-stamp " + stampTone(rec, clock);
    setAttr("aria-expanded", open ? "true" : "false");
    setAttr("aria-controls", "trend-day-chip");
  }

  function toggleChecklist(now) {
    if (shouldYield()) return false;
    const rec = todayRecord(now);
    const clock = clockOf(now);
    const open = shouldOpenOverlay(now);
    if (!stampHTML(rec, clock) && !open) return false;
    noteUserChip(!open, now);
    paint(now);
    return !!chipOpen;
  }

  function paint(now) {
    if (shouldYield() || !shouldOpenOverlay(now)) {
      setOverlayOpen(false);
      paintStamp(now);
      return;
    }
    paintChip(now);
    setOverlayOpen(true);
    paintStamp(now);
  }

  function onEnterSize() {
    bind();
    if (shouldYield()) {
      setOverlayOpen(false);
      paintStamp();
      return false;
    }
    paint();
    hydrateAuto();
    scheduleAutoRefresh();
    return shouldOpenOverlay();
  }

  function onCheck(index, now) {
    const rec = todayRecord(now);
    if (settled(rec)) return rec;
    noteUserChip(true, now);
    const before = riskMultiplier(now);
    const next = rec.checks.slice();
    next[index] = !next[index];
    persistDraft(next, { userEdited: true }, now);
    if (riskMultiplier(now) !== before) refreshSizer();
    paint(now);
    return todayRecord(now);
  }

  function onChipClick(e) {
    const t = e.target && e.target.closest ? e.target.closest("[data-td-check], #td-apply, #td-skip, #td-quarter") : null;
    if (!t) return;
    if (t.closest && !t.closest("#trend-day-chip") && !t.closest("#trend-day-overlay")) return;
    if (e.type === "pointerup") lastPointerUp = Date.now();
    else if (e.type === "click" && lastPointerUp && (Date.now() - lastPointerUp) < 500) return;
    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
    if (t.id === "td-apply") {
      apply({ explicit: true });
      return;
    }
    if (t.id === "td-quarter") {
      apply({ quarter: true, explicit: true });
      return;
    }
    if (t.id === "td-skip") {
      skip("user");
      return;
    }
    const idx = t.getAttribute("data-td-check");
    if (idx != null) onCheck(+idx);
  }

  function chipControlTarget(node) {
    return node && node.closest ? node.closest("[data-td-check], #td-apply, #td-skip, #td-quarter") : null;
  }

  function eventHitsStamp(e) {
    const t = e && e.target;
    if (chipControlTarget(t)) return false;
    if (t && t.closest && t.closest("#pt-trend-stamp")) return true;
    const stamp = stampEl();
    if (!stamp || stamp.hidden) return false;
    if (typeof stamp.getBoundingClientRect !== "function") return false;
    const r = stamp.getBoundingClientRect();
    if (!r || !(r.width > 0) || !(r.height > 0)) return false;
    const x = Number(e.clientX);
    const y = Number(e.clientY);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  /* Capture-phase: the open chip sits above the strip. A tap on the chevron
     still toggles when the hit lands in the strip, including through the
     chip's non-control chrome. Checklist buttons keep their own clicks. */
  function onStampPointer(e, now) {
    if (!e || !eventHitsStamp(e)) return false;
    if (e.type === "pointerup") lastStampPointer = Date.now();
    else if (e.type === "click" && lastStampPointer && (Date.now() - lastStampPointer) < 500) return true;
    if (typeof e.preventDefault === "function") e.preventDefault();
    if (typeof e.stopPropagation === "function") e.stopPropagation();
    toggleChecklist(now);
    return true;
  }

  function onDocPointer(e) {
    if (onStampPointer(e)) return;
    onChipClick(e);
  }

  function bind() {
    if (bound || !global.document) return;
    bound = true;
    global.document.addEventListener("pointerup", onDocPointer, true);
    global.document.addEventListener("click", onDocPointer, true);
    const overlay = overlayEl();
    if (overlay) overlay.addEventListener("click", onDocPointer);
  }

  function resetForTests() {
    draftChecks = null;
    draftScope = "";
    autoInflight = null;
    if (autoTimer && typeof global.clearInterval === "function") {
      try { global.clearInterval(autoTimer); } catch (e0) {}
    }
    autoTimer = null;
    lastPointerUp = 0;
    lastStampPointer = 0;
    chipOpen = false;
    chipUserSet = false;
    chipUserDate = "";
    try {
      if (global.localStorage) {
        const drop = [KEY, AUTO_KEY, storageKey(), storageKey("sample"), storageKey("auth")];
        if (typeof localStorage.length === "number" && typeof localStorage.key === "function") {
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && (k.indexOf(KEY) === 0 || k.indexOf(AUTO_KEY) === 0)) drop.push(k);
          }
        }
        drop.forEach(function (k) {
          try { localStorage.removeItem(k); } catch (e1) {}
        });
      }
    } catch (e) {}
    try {
      const st = S();
      delete st.trendDay;
    } catch (e2) {}
  }

  const api = {
    KEY,
    AUTO_KEY,
    SCHEMA,
    TZ,
    CHECKS,
    etParts,
    clockOf,
    clockLabel,
    autoEligible,
    scoreOf,
    bandOf,
    multiplierOf,
    statusText,
    ctaLabel,
    sourceOf,
    chipHTML,
    stampHTML,
    todayRecord,
    persistDraft,
    apply,
    skip,
    riskMultiplier,
    planMeta,
    coachHint,
    shouldShowChip,
    shouldOpenOverlay,
    shouldYield,
    optionalClock,
    primaryAction,
    softLive,
    appliedQuiet,
    stampTone,
    toggleChecklist,
    onStampPointer,
    isAccidentalSit,
    migrateRecord,
    maybeAutoApply,
    isSampleDesk,
    isLoggedIn,
    bookScope,
    storageKey,
    onEnterSize,
    onCheck,
    paint,
    bind,
    resetForTests,
    parseChart,
    levelsFor,
    broke,
    breakSide,
    evaluateLevels,
    evaluateFromCharts,
    applyAutoSnapshot,
    hydrateAuto,
    shouldPollAuto,
    onChipClick,
    demoCharts,
    demoSnapshot,
    yahooChart,
    wantsFixture,
  };

  global.RunnrTrendDay = api;
})(typeof window !== "undefined" ? window : globalThis);
