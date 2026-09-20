/**
 * Trend day size gate — checklist before the gold sizer.
 * SAMPLE guests and signed-in books. Size multiplier only. Not an entry system.
 */
(function (global) {
  "use strict";

  const KEY = "runnr_trend_day_v1";
  const TZ = "America/New_York";
  const RTH_OPEN = 9 * 60 + 30;
  const RTH_CLOSE = 16 * 60;
  const SCORE_OPEN = 10 * 60;
  const SCORE_CLOSE = 10 * 60 + 30;

  const CHECKS = [
    { id: "orb", label: "Outside first-hour range" },
    { id: "pm", label: "Broke premarket high/low" },
    { id: "yday", label: "Cleared yesterday’s H/L" },
    { id: "peers", label: "Peers same direction" },
  ];

  let bound = false;
  let draftChecks = null;
  let draftScope = "";

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
      if (!global.localStorage) return null;
      const scoped = parseRec(localStorage.getItem(storageKey()));
      if (scoped) return scoped;
      if (bookScope() === "sample") return parseRec(localStorage.getItem(KEY));
      return null;
    } catch (e) {
      return null;
    }
  }

  function storageSet(rec) {
    try {
      if (global.localStorage) localStorage.setItem(storageKey(), JSON.stringify(rec));
    } catch (e) {}
    try {
      const st = S();
      st.trendDay = rec;
    } catch (e2) {}
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
    if (c.phase === "after") return "After 10:30 ET — score once";
    if (c.phase === "before") return "Score window opens 10:00 ET";
    return "Outside RTH — gate is optional";
  }

  function emptyChecks() {
    return CHECKS.map(function () { return false; });
  }

  function normalizeChecks(raw) {
    const src = Array.isArray(raw) ? raw : [];
    return CHECKS.map(function (_, i) { return !!src[i]; });
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
    const label = band === "sit" ? "sit" : band === "half" ? "half size" : "full size";
    return score + " / 4 · " + label;
  }

  function ctaLabel(band) {
    if (band === "sit") return "Apply sit";
    if (band === "half") return "Apply half size";
    return "Apply full size";
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
    const rec = Object.assign(blankRecord(clock), saved);
    rec.date = clock.date;
    rec.checks = normalizeChecks(rec.checks);
    rec.score = scoreOf(rec.checks);
    rec.band = rec.applied ? (rec.band || bandOf(rec.score)) : bandOf(rec.score);
    if (!rec.applied && !rec.skipped) {
      rec.multiplier = multiplierOf(rec.score);
      rec.locked = false;
    } else {
      rec.locked = true;
    }
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

  function riskMultiplier(now) {
    const rec = todayRecord(now);
    if (!rec.applied || rec.skipped) return 1;
    const m = Number(rec.multiplier);
    return Number.isFinite(m) && m >= 0 ? m : 1;
  }

  function planMeta(now) {
    const rec = todayRecord(now);
    if (!rec.applied && !rec.skipped) return null;
    return {
      date: rec.date,
      score: rec.score,
      band: rec.band,
      multiplier: rec.skipped ? 1 : rec.multiplier,
      applied: !!rec.applied,
      skipped: !!rec.skipped,
      skipReason: rec.skipReason || "",
      checks: rec.checks.slice(),
    };
  }

  function coachHint(now) {
    const rec = todayRecord(now);
    if (!rec.skipped) return "";
    return "Sized without the trend day check";
  }

  function persistDraft(checks) {
    draftScope = bookScope();
    draftChecks = normalizeChecks(checks);
    const rec = todayRecord();
    if (settled(rec)) return rec;
    rec.checks = draftChecks;
    rec.score = scoreOf(rec.checks);
    rec.band = bandOf(rec.score);
    rec.multiplier = multiplierOf(rec.score);
    storageSet(rec);
    return rec;
  }

  function apply(opts, now) {
    const clock = clockOf(now);
    const rec = todayRecord(now);
    if (settled(rec)) return rec;
    const quarter = !!(opts && opts.quarter);
    rec.checks = draftChecks ? normalizeChecks(draftChecks) : rec.checks;
    rec.score = scoreOf(rec.checks);
    rec.band = bandOf(rec.score);
    rec.multiplier = multiplierOf(rec.score, { quarter: quarter && rec.band === "sit" });
    rec.applied = true;
    rec.skipped = false;
    rec.skipReason = "";
    rec.locked = true;
    rec.appliedAt = (now instanceof Date ? now : new Date()).toISOString();
    rec.date = clock.date;
    storageSet(rec);
    draftScope = bookScope();
    draftChecks = rec.checks.slice();
    if (typeof global.persist === "function") {
      try { global.persist(); } catch (e) {}
    }
    paint();
    refreshSizer();
    return rec;
  }

  function skip(reason, now) {
    const clock = clockOf(now);
    const rec = todayRecord(now);
    if (settled(rec)) return rec;
    rec.checks = draftChecks ? normalizeChecks(draftChecks) : rec.checks;
    rec.score = scoreOf(rec.checks);
    rec.band = bandOf(rec.score);
    rec.multiplier = 1;
    rec.applied = false;
    rec.skipped = true;
    rec.skipReason = reason || "user";
    rec.locked = true;
    rec.appliedAt = (now instanceof Date ? now : new Date()).toISOString();
    rec.date = clock.date;
    storageSet(rec);
    if (typeof global.persist === "function") {
      try { global.persist(); } catch (e) {}
    }
    paint();
    refreshSizer();
    return rec;
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

  function chipHTML(rec, clock, opts) {
    const o = opts || {};
    const score = rec.score;
    const band = rec.band;
    const label = clockLabel(clock);
    const locked = !!rec.locked || !!o.readonly;
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
    const quarter = band === "sit" && !locked
      ? '<button type="button" class="td-quarter" id="td-quarter">Use 0.25×</button>'
      : "";
    const skipBtn = locked
      ? ""
      : '<button type="button" class="td-skip" id="td-skip">Skip — size without gate</button>';
    const cta = locked
      ? ""
      : '<button type="button" class="td-cta" id="td-apply">' + ctaLabel(band) + "</button>";
    return (
      '<div class="td-title" id="trend-day-title">Trend day check</div>' +
      '<div class="td-status" id="trend-day-status">' + statusText(score, band) + "</div>" +
      (label ? '<div class="td-clock" id="trend-day-clock">' + label + "</div>" : '<div class="td-clock" id="trend-day-clock" hidden></div>') +
      '<div class="td-checks" role="group" aria-label="Trend day checks">' + checks + "</div>" +
      cta +
      quarter +
      skipBtn +
      '<p class="td-hint">Sit if 0–1 · half at 2 · full at 3–4</p>'
    );
  }

  function stampHTML(rec) {
    if (!rec) return "";
    if (rec.skipped) {
      return "Trend day check · skipped · sized without gate";
    }
    if (rec.applied) {
      const extra = rec.band === "sit" && rec.multiplier === 0.25 ? " · 0.25×" : "";
      return "Trend day check · " + statusText(rec.score, rec.band) + extra;
    }
    return "";
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

  function paintChip() {
    const rec = todayRecord();
    const clock = clockOf();
    const chip = chipEl();
    if (chip) chip.innerHTML = chipHTML(rec, clock);
    const mark = global.document && document.getElementById("trend-day-watermark");
    if (mark) mark.innerHTML = "Size<br>" + primedTicker();
  }

  function paintStamp() {
    const el = stampEl();
    if (!el) return;
    if (shouldYield()) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    const rec = todayRecord();
    const copy = stampHTML(rec);
    if (!copy) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    el.hidden = false;
    el.textContent = copy;
    el.className = "pt-trend-stamp" + (rec.skipped ? " skipped" : "");
  }

  function paint() {
    if (shouldYield() || !shouldShowChip()) {
      setOverlayOpen(false);
      paintStamp();
      return;
    }
    paintChip();
    setOverlayOpen(true);
    paintStamp();
  }

  function onEnterSize() {
    bind();
    if (shouldYield()) {
      setOverlayOpen(false);
      paintStamp();
      return false;
    }
    paint();
    return shouldShowChip();
  }

  function onCheck(index) {
    const rec = todayRecord();
    if (settled(rec)) return rec;
    const next = rec.checks.slice();
    next[index] = !next[index];
    persistDraft(next);
    paintChip();
    return todayRecord();
  }

  function bind() {
    if (bound || !global.document) return;
    const overlay = overlayEl();
    if (!overlay) return;
    bound = true;
    overlay.addEventListener("click", function (e) {
      const t = e.target && e.target.closest ? e.target.closest("[data-td-check], #td-apply, #td-skip, #td-quarter") : null;
      if (!t) return;
      e.preventDefault();
      if (t.id === "td-apply") {
        apply();
        return;
      }
      if (t.id === "td-quarter") {
        apply({ quarter: true });
        return;
      }
      if (t.id === "td-skip") {
        skip("user");
        return;
      }
      const idx = t.getAttribute("data-td-check");
      if (idx != null) onCheck(+idx);
    });
  }

  function resetForTests() {
    draftChecks = null;
    draftScope = "";
    try {
      if (global.localStorage) {
        const drop = [KEY, storageKey(), storageKey("sample"), storageKey("auth")];
        if (typeof localStorage.length === "number" && typeof localStorage.key === "function") {
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.indexOf(KEY) === 0) drop.push(k);
          }
        }
        drop.forEach(function (k) {
          try { localStorage.removeItem(k); } catch (e0) {}
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
    TZ,
    CHECKS,
    etParts,
    clockOf,
    clockLabel,
    scoreOf,
    bandOf,
    multiplierOf,
    statusText,
    ctaLabel,
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
    shouldYield,
    isSampleDesk,
    isLoggedIn,
    bookScope,
    storageKey,
    onEnterSize,
    paint,
    bind,
    resetForTests,
  };

  global.RunnrTrendDay = api;
})(typeof window !== "undefined" ? window : globalThis);
