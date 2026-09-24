#!/usr/bin/env node
/** Trend-day size gate: chip before Size, auto SPY/QQQ hygiene, skip log, ET clock. */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const root = path.join(__dirname, "..");
const { html, sw, css, src } = require("./app_src").loadAppSource();
const trendSrc = fs.readFileSync(path.join(root, "js/trend-day.js"), "utf8");
const pretradeSrc = fs.readFileSync(path.join(root, "js/pretrade.js"), "utf8");
const tourSrc = fs.readFileSync(path.join(root, "js/tour.js"), "utf8");
const introSrc = fs.readFileSync(path.join(root, "js/intro.js"), "utf8");

let n = 0;
function check(name, cond) {
  assert(cond, name);
  n += 1;
}

const v = html.match(/var V = "(\d+)"/)[1];
const cache = sw.match(/CACHE = "runnr-v(\d+)"/)[1];
check("index.html V matches sw.js CACHE", v === cache);
check("cache is 180+", Number(v) >= 180);
check("trend-day.js is cache-busted", html.includes("js/trend-day.js?v=8"));
check("trend-day loads after tour and intro", html.indexOf("js/intro.js") < html.indexOf("js/trend-day.js") && html.indexOf("js/tour.js") < html.indexOf("js/trend-day.js"));
check("trend-day loads before pretrade", html.indexOf("js/trend-day.js") < html.indexOf("js/pretrade.js"));
check("pretrade cache-bust bumped", html.includes("js/pretrade.js?v=25"));
check("pretrade.css cache-bust bumped", html.includes("css/pretrade.css?v=21"));
check("soft auto-apply does not settle the chip", trendSrc.includes("function softLive") && trendSrc.includes("Applied · full size") && trendSrc.includes("Applied · half size") && !/function maybeAutoApply[\s\S]{0,400}applied\s*=\s*true/.test(trendSrc));
check("trend strip is a button that opens the checklist", pretradeSrc.includes('type="button" class="pt-trend-stamp"') && pretradeSrc.includes('aria-controls="trend-day-chip"') && trendSrc.includes("toggleChecklist") && trendSrc.includes("aria-expanded"));
check("live strip is a gold control", css.includes(".pt-trend-stamp.live") && css.includes(".pt-trend-stamp:focus-visible") && css.includes("cursor:pointer"));
check("auto is labeled SPY/QQQ, not Ripster", trendSrc.includes("Auto · SPY/QQQ") && !/ripster/i.test(trendSrc));
check("auto snapshot key is isolated from the book key", trendSrc.includes('AUTO_KEY = "runnr_trend_day_auto_v1"'));
check("overlay markup sits on the Size page", html.includes('id="trend-day-overlay"') && html.includes('id="trend-day-chip"') && html.includes('id="page-sizer"'));
check("overlay starts hidden", /id="trend-day-overlay"[^>]*hidden/.test(html));
check("copy is Trend day check", trendSrc.includes("Trend day check") && trendSrc.includes("Sit if 0–1 · half at 2 · full at 3–4"));
check("CTAs are sit / half / full", trendSrc.includes("Sit — no trade (0 size)") && trendSrc.includes("Apply half size") && trendSrc.includes("Apply full size"));
check("optional hours do not block Size", trendSrc.includes("shouldOpenOverlay") && css.includes("pointer-events:auto") && trendSrc.includes("size not gated"));
check("accidental sit records migrate", trendSrc.includes("isAccidentalSit") && trendSrc.includes("migratedSit"));
check("no Ripster / EMA / cloud branding", !/ripster|ema cloud|ichimoku/i.test(trendSrc) && !/ripster|ema cloud/i.test(html));
check("localStorage key is runnr_trend_day_v1", trendSrc.includes('KEY = "runnr_trend_day_v1"') && trendSrc.includes("storageKey") && trendSrc.includes("bookScope"));
check("signed-in books are not SAMPLE-gated", !/function shouldShowChip[\s\S]*isSampleDesk\(\)\s*return false/.test(trendSrc.replace(/\n/g, " ")) && !pretradeSrc.includes("if (!isSampleDesk()) return null;"));
check("clock is America/New_York", trendSrc.includes("America/New_York") && !/Berlin|Europe\/Berlin/.test(trendSrc));
check("gold chip chrome lives in pretrade.css", css.includes("#trend-day-chip") && css.includes("pt-trend-gate") && css.includes(".td-cta") && css.includes(".td-auto"));
check("pretrade applies the gate multiplier", pretradeSrc.includes("trendDayGate") && pretradeSrc.includes("trendDayMult"));
check("skip persists on the plan", pretradeSrc.includes("sized without trend-day gate") && pretradeSrc.includes("row.trendDay"));
check("tour still opens Size", tourSrc.includes("openSizer") && tourSrc.includes('id === "size"'));
check("tour start/close yields the size gate", tourSrc.includes("yieldTrendDay") && tourSrc.includes("onEnterSize"));
check("chip clicks bind on document capture", trendSrc.includes('addEventListener("click", onDocPointer, true)') && trendSrc.includes('addEventListener("pointerup", onDocPointer, true)') && trendSrc.includes("onChipClick") && trendSrc.includes("onStampPointer"));
check("open chip does not eat the strip", /#trend-day-chip\{[^}]*pointer-events:\s*none/.test(css) && css.includes(".pt-trend-stamp[hidden]{display:none !important}") && css.includes(".pt-trend-stamp[aria-expanded=\"true\"]::after"));
check("signed-in desk stacks under the chip", css.includes("position:fixed") && css.includes("z-index:80") && css.includes("z-index:81"));
check("sizer quote refresh nudges trend-day", pretradeSrc.includes("RunnrTrendDay.hydrateAuto"));
check("intro key is still runnr_intro_v1", introSrc.includes('KEY: "runnr_intro_v1"'));
check("tour query still yields the chip path", trendSrc.includes("tour=1") && trendSrc.includes("shouldYield") && src.includes("tourWantsChipPath"));

function fakeClassList(on) {
  const set = new Set(on || []);
  return {
    add(c) { String(c).split(/\s+/).forEach((x) => set.add(x)); },
    remove(c) { String(c).split(/\s+/).forEach((x) => set.delete(x)); },
    contains(c) { return set.has(c); },
    toggle(c, yes) { if (yes) this.add(c); else this.remove(c); },
    _has: set,
  };
}

function load(opts) {
  const o = opts || {};
  const store = o.store || {};
  const pageSizer = {
    className: "page active pt-live",
    classList: fakeClassList(["page", "active", "pt-live"]),
    hidden: false,
    addEventListener() {},
  };
  const overlay = {
    hidden: true,
    className: "",
    classList: fakeClassList(),
    setAttribute() {},
    getAttribute() { return ""; },
    addEventListener() {},
  };
  const chip = { innerHTML: "" };
  const stampAttrs = {};
  const stamp = {
    hidden: true,
    textContent: "",
    className: "pt-trend-stamp",
    setAttribute(k, v) { stampAttrs[k] = String(v); },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(stampAttrs, k) ? stampAttrs[k] : null; },
    removeAttribute(k) { delete stampAttrs[k]; },
  };
  const mark = { innerHTML: "" };
  const ticker = { value: "AAPL" };
  const els = {
    "page-sizer": pageSizer,
    "trend-day-overlay": overlay,
    "trend-day-chip": chip,
    "pt-trend-stamp": stamp,
    "trend-day-watermark": mark,
    "pt-ticker": ticker,
    "intro-overlay": { hidden: true, classList: fakeClassList() },
  };
  const ctx = {
    localStorage: {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
      get length() { return Object.keys(store).length; },
      key(i) { return Object.keys(store)[i] || null; },
    },
    location: o.location || { search: o.search || "?demo=1", hash: "" },
    fetch: o.fetch || function () { return Promise.reject(new Error("no fetch")); },
    Promise,
    document: {
      documentElement: { classList: fakeClassList(o.htmlClass || []), dataset: {} },
      getElementById(id) { return els[id] || null; },
      querySelector() { return null; },
      addEventListener() {},
    },
    console,
    Date,
    Math,
    Number,
    String,
    Boolean,
    Array,
    Object,
    parseFloat,
    parseInt,
    isNaN,
    Infinity,
    JSON,
    Intl,
    setTimeout,
    clearTimeout,
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  ctx.window.S = o.state || { bal: 50000, risk: 2, sym: "$", trades: [], pretrade: { maxRiskPct: 2, maxDailyLossPct: 5, minRR: 1.5 } };
  ctx.persist = function () { ctx.persisted = true; };
  if (o.loggedIn) {
    const email = o.email || "janis@example.com";
    store.runnr_api_token = "tok";
    store.runnr_api_email = email;
    ctx.RunnrSync = {
      isLoggedIn() { return true; },
      sessionEmail() { return email; },
    };
    ctx.window.S.ownerEmail = email;
  }
  if (o.tourOpen) {
    ctx.RunnrTour = { isOpen() { return true; }, queryForce() { return false; } };
  }
  if (o.tourForce) {
    ctx.location = { search: "?demo=1&tour=1", hash: "" };
    ctx.RunnrTour = { isOpen() { return false; }, queryForce() { return true; } };
  }
  if (o.introOpen) {
    ctx.RunnrIntro = { isOpen() { return true; } };
  }
  vm.runInNewContext(trendSrc, ctx);
  if (o.withPretrade) {
    ctx.renderJournal = function () {};
    ctx.updateHomeStats = function () {};
    ctx.showToast = function () {};
    vm.runInNewContext(pretradeSrc, ctx);
  }
  ctx._store = store;
  ctx._els = els;
  return ctx;
}

const friScore = new Date("2026-09-18T14:10:00Z");
const friAfter = new Date("2026-09-18T14:40:00Z");
const friBefore = new Date("2026-09-18T13:45:00Z");
const friOutside = new Date("2026-09-18T21:15:00Z");
const sat = new Date("2026-09-19T14:10:00Z");

const clock = load();
const TD = clock.RunnrTrendDay;
check("Friday 10:10 ET is the score window", TD.clockOf(friScore).phase === "score" && TD.clockOf(friScore).inScoreWindow === true);
check("Friday 10:40 ET is after the window", TD.clockOf(friAfter).phase === "after" && /Live SPY\/QQQ/.test(TD.clockLabel(TD.clockOf(friAfter))));
check("Friday 9:45 ET waits for 10:00", TD.clockOf(friBefore).phase === "before" && /10:00 ET/.test(TD.clockLabel(TD.clockOf(friBefore))));
check("Friday after the close is Outside RTH", TD.clockOf(friOutside).outsideRth === true && /Outside RTH/.test(TD.clockLabel(TD.clockOf(friOutside))));
check("Saturday is Outside RTH — gate is optional", TD.clockOf(sat).weekend === true && TD.clockLabel(TD.clockOf(sat)) === "Outside RTH — gate is optional");

check("0 checks → sit / 0×", TD.bandOf(0) === "sit" && TD.multiplierOf(0) === 0 && TD.ctaLabel("sit") === "Sit — no trade (0 size)");
check("1 check → sit / 0×", TD.bandOf(1) === "sit" && TD.multiplierOf(1) === 0);
check("1 check can take 0.25×", TD.multiplierOf(1, { quarter: true }) === 0.25);
check("2 checks → half / 0.5×", TD.bandOf(2) === "half" && TD.multiplierOf(2) === 0.5 && TD.ctaLabel("half") === "Apply half size");
check("3–4 checks → full / 1×", TD.bandOf(3) === "full" && TD.multiplierOf(4) === 1 && TD.ctaLabel("full") === "Apply full size");
check("status copy matches the mock", TD.statusText(2, "half") === "2 / 4 · half size" && TD.statusText(0, "sit") === "0 / 4 · sit");

const sample = load({ withPretrade: true });
sample.RunnrTrendDay.resetForTests();
check("SAMPLE shows the chip before Size", sample.RunnrTrendDay.shouldShowChip(friScore) === true);
check("score window opens the overlay", sample.RunnrTrendDay.shouldOpenOverlay(friScore) === true);
check("outside RTH does not open a blocking overlay", sample.RunnrTrendDay.shouldOpenOverlay(sat) === false && sample.RunnrTrendDay.optionalClock(sample.RunnrTrendDay.clockOf(sat)) === true);
check("chip HTML has the four checks and explicit sit", (function () {
  const rec = sample.RunnrTrendDay.todayRecord(friScore);
  const htmlChip = sample.RunnrTrendDay.chipHTML(rec, sample.RunnrTrendDay.clockOf(friScore));
  return htmlChip.includes("Trend day check")
    && htmlChip.includes("Outside first-hour range")
    && htmlChip.includes("Broke premarket high/low")
    && htmlChip.includes("Cleared yesterday’s H/L")
    && htmlChip.includes("Peers same direction")
    && htmlChip.includes("Sit — no trade (0 size)")
    && htmlChip.includes("Skip — size without gate")
    && !htmlChip.includes("Apply sit");
})());

sample.RunnrTrendDay.persistDraft([true, true, false, false]);
const half = sample.RunnrTrendDay.apply({}, friScore);
check("apply half stores today’s ET date + 0.5×", half.applied === true && half.score === 2 && half.multiplier === 0.5 && half.date === "2026-09-18");
check("refresh keeps the applied multiplier", sample.RunnrTrendDay.todayRecord(friScore).multiplier === 0.5 && sample.RunnrTrendDay.riskMultiplier(friScore) === 0.5);
check("chip hides after apply", sample.RunnrTrendDay.shouldShowChip(friScore) === false);
check("stamp remembers half size", /2 \/ 4 · half size/.test(sample.RunnrTrendDay.stampHTML(half)));

const PT = sample.RunnrPretrade;
const rails = PT.normalizeRails(sample.window.S.pretrade, sample.window.S);
const sized = PT.computePlan({ ticker: "AAPL", dir: "long", entry: 200, stop: 190, target: 230 }, rails, [], friScore);
check("half size cuts 2% of 50k from 100 to 50 shares", sized.size === 50 && sized.totalRisk === 500 && sized.trendDayMult === 0.5);
const logged = PT.logPlan({ ticker: "AAPL", dir: "long", entry: 200, stop: 190, target: 230 }, rails, sample.window.S.trades, friScore);
check("logged plan keeps trend-day metadata", logged.ok && logged.row.trendDay && logged.row.trendDay.score === 2 && logged.row.trendDay.multiplier === 0.5);
check("cannot re-score the same ET day to inflate size", sample.RunnrTrendDay.apply({ quarter: true }, friAfter).multiplier === 0.5 && sample.RunnrTrendDay.todayRecord(friAfter).locked === true);

const skipCtx = load({ withPretrade: true });
skipCtx.RunnrTrendDay.resetForTests();
const skipped = skipCtx.RunnrTrendDay.skip("user", friScore);
check("skip is persisted", skipped.skipped === true && skipped.skipReason === "user" && String(skipCtx._store[skipCtx.RunnrTrendDay.storageKey()] || "").indexOf("skipped") >= 0);
check("SAMPLE storage is scoped as sample", skipCtx.RunnrTrendDay.bookScope() === "sample" && skipCtx.RunnrTrendDay.storageKey() === "runnr_trend_day_v1:sample");
check("skip does not apply a multiplier", skipCtx.RunnrTrendDay.riskMultiplier(friScore) === 1);
check("skip band is not sit", skipped.band === "skip" && skipCtx.RunnrTrendDay.planMeta(friScore).band === "skip");
check("Coach can read the skip", skipCtx.RunnrTrendDay.coachHint(friScore) === "Sized without the trend day check");
const skipLog = skipCtx.RunnrPretrade.logPlan({ ticker: "AAPL", dir: "long", entry: 200, stop: 190, target: 230 }, rails, skipCtx.window.S.trades, friScore);
check("skip lands on the journal row", skipLog.ok && skipLog.row.trendDay.skipped === true && /sized without trend-day gate/.test(skipLog.row.notes));
check("skip stamp is explicit", /skipped · sized without gate/.test(skipCtx.RunnrTrendDay.stampHTML(skipped)));

const sitCtx = load({ withPretrade: true });
sitCtx.RunnrTrendDay.resetForTests();
sitCtx.RunnrTrendDay.persistDraft([true, false, false, false]);
sitCtx.RunnrTrendDay.apply({}, friScore);
const sitPlan = sitCtx.RunnrPretrade.computePlan({ ticker: "AAPL", dir: "long", entry: 200, stop: 190, target: 230 }, rails, [], friScore);
check("sit is 0× and not a rails block", sitPlan.trendDaySit === true && sitPlan.size === 0 && sitPlan.blocked === false && sitPlan.ready === false);
check("sit output names the sit", sitCtx.RunnrPretrade.outputHTML(sitPlan, rails).includes("SIT — trend day check"));

const qCtx = load({ withPretrade: true });
qCtx.RunnrTrendDay.resetForTests();
qCtx.RunnrTrendDay.persistDraft([false, false, false, false]);
qCtx.RunnrTrendDay.apply({ quarter: true }, friScore);
const qPlan = qCtx.RunnrPretrade.computePlan({ ticker: "AAPL", dir: "long", entry: 200, stop: 190, target: 230 }, rails, [], friScore);
check("0.25× secondary sizes 25 shares", qPlan.size === 25 && qPlan.trendDayMult === 0.25 && qPlan.trendDaySit === false);

const signed = load({ loggedIn: true, email: "janis@example.com", withPretrade: true });
signed.RunnrTrendDay.resetForTests();
check("signed-in books see the chip before Size", signed.RunnrTrendDay.shouldShowChip(friScore) === true && signed.RunnrTrendDay.isSampleDesk() === false);
check("signed-in storage is scoped by email", signed.RunnrTrendDay.bookScope() === "janis@example.com" && signed.RunnrTrendDay.storageKey() === "runnr_trend_day_v1:janis@example.com");
signed.RunnrTrendDay.persistDraft([true, true, false, false]);
signed.RunnrTrendDay.apply({}, friScore);
const signedPlan = signed.RunnrPretrade.computePlan({ ticker: "AAPL", dir: "long", entry: 200, stop: 190, target: 230 }, rails, [], friScore);
check("signed-in Apply half size cuts 100 shares to 50", signedPlan.size === 50 && signedPlan.trendDayMult === 0.5);
const signedLog = signed.RunnrPretrade.logPlan({ ticker: "AAPL", dir: "long", entry: 200, stop: 190, target: 230 }, rails, signed.window.S.trades, friScore);
check("signed-in log keeps trend-day metadata", signedLog.ok && signedLog.row.trendDay && signedLog.row.trendDay.score === 2 && !signedLog.row.isDemo);

const signedIdle = load({ loggedIn: true, email: "janis@example.com", withPretrade: true });
signedIdle.RunnrTrendDay.resetForTests();
const signedOutHtml = signedIdle.RunnrTrendDay.chipHTML(signedIdle.RunnrTrendDay.todayRecord(sat), signedIdle.RunnrTrendDay.clockOf(sat));
check("signed-in weekend chip is optional like SAMPLE", signedOutHtml.includes("Size without gate") && signedIdle.RunnrTrendDay.shouldOpenOverlay(sat) === false);
const signedIdlePlan = signedIdle.RunnrPretrade.computePlan({ ticker: "AAPL", dir: "long", entry: 200, stop: 190, target: 230 }, rails, [], sat);
check("signed-in off-hours unsettled does not zero size", signedIdlePlan.size > 0 && signedIdlePlan.trendDaySit === false);

const signedTrap = load({ loggedIn: true, email: "janis@example.com", withPretrade: true });
signedTrap.RunnrTrendDay.resetForTests();
signedTrap._store["runnr_trend_day_v1:janis@example.com"] = JSON.stringify({
  date: "2026-09-19",
  checks: [false, false, false, false],
  score: 0,
  band: "sit",
  multiplier: 0,
  applied: true,
  skipped: false,
  source: "manual",
  userEdited: false,
  scope: "janis@example.com",
});
const signedTrapRec = signedTrap.RunnrTrendDay.todayRecord(sat);
check("signed-in leftover Apply sit migrates off 0×", signedTrapRec.applied === false && signedTrapRec.migratedSit === true && signedTrap.RunnrTrendDay.riskMultiplier(sat) === 1);
const signedTrapPlan = signedTrap.RunnrPretrade.computePlan({ ticker: "AAPL", dir: "long", entry: 200, stop: 190, target: 230 }, rails, [], sat);
check("migrated signed-in book gets size", signedTrapPlan.size > 0 && signedTrapPlan.trendDaySit === false);

const leak = load({ loggedIn: true, email: "janis@example.com", withPretrade: true });
leak.RunnrTrendDay.resetForTests();
leak.window.S.trendDay = {
  date: "2026-09-18",
  checks: [false, false, false, false],
  score: 0,
  band: "sit",
  multiplier: 0,
  applied: true,
  skipped: false,
  scope: "sample",
};
check("SAMPLE trendDay on S does not freeze the signed-in chip", leak.RunnrTrendDay.shouldShowChip(friScore) === true && leak.RunnrTrendDay.todayRecord(friScore).applied !== true);

const cloudBook = load({ loggedIn: true, email: "janis@example.com" });
cloudBook.RunnrTrendDay.resetForTests();
cloudBook.window.S.trendDay = {
  date: "2026-09-18",
  checks: [true, true, false, false],
  score: 2,
  band: "half",
  applied: false,
  skipped: false,
  scope: "janis@example.com",
};
check("signed-in book hydrates from matching-scope S.trendDay", cloudBook.RunnrTrendDay.todayRecord(friScore).score === 2 && cloudBook.RunnrTrendDay.todayRecord(friScore).applied !== true);

const signedClick = load({ loggedIn: true, email: "janis@example.com" });
signedClick.RunnrTrendDay.resetForTests();
signedClick.RunnrTrendDay.bind();
const fakeCheck = {
  id: "",
  getAttribute() { return "0"; },
  closest(sel) {
    if (sel.indexOf("data-td-check") >= 0) return fakeCheck;
    if (sel === "#trend-day-chip") return { id: "trend-day-chip" };
    if (sel === "#trend-day-overlay") return { id: "trend-day-overlay" };
    return null;
  },
};
signedClick.RunnrTrendDay.onChipClick({ target: fakeCheck, preventDefault() {}, stopPropagation() {} });
const clicked = signedClick.RunnrTrendDay.todayRecord();
check("signed-in chip click toggles a check", clicked.checks[0] === true && clicked.userEdited === true && clicked.applied !== true);
check("signed-in after 10:30 still polls while Size is open", signedClick.RunnrTrendDay.shouldPollAuto(friAfter) === true);
check("weekend does not poll auto", signedClick.RunnrTrendDay.shouldPollAuto(sat) === false);
signedClick.RunnrTrendDay.resetForTests();
signedClick.RunnrTrendDay.onChipClick({ type: "pointerup", target: fakeCheck, preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {} });
const afterPointer = signedClick.RunnrTrendDay.todayRecord();
signedClick.RunnrTrendDay.onChipClick({ type: "click", target: fakeCheck, preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {} });
check("pointerup+click does not double-toggle", signedClick.RunnrTrendDay.todayRecord().checks[0] === afterPointer.checks[0] && afterPointer.checks[0] === true);

const sharedStore = {};
const sampleBook = load({ withPretrade: true, store: sharedStore });
sampleBook.RunnrTrendDay.resetForTests();
sampleBook.RunnrTrendDay.persistDraft([true, true, true, true]);
sampleBook.RunnrTrendDay.apply({}, friScore);
const authBook = load({ loggedIn: true, email: "janis@example.com", withPretrade: true, store: sharedStore });
check("SAMPLE apply does not settle the signed-in book", authBook.RunnrTrendDay.shouldShowChip(friScore) === true && authBook.RunnrTrendDay.riskMultiplier(friScore) === 1);
authBook.RunnrTrendDay.skip("user", friScore);
check("SAMPLE and signed-in keys do not clobber",
  /"score":4/.test(String(sharedStore["runnr_trend_day_v1:sample"] || ""))
  && /"skipped":true/.test(String(sharedStore["runnr_trend_day_v1:janis@example.com"] || ""))
  && !sharedStore["runnr_trend_day_v1:janis@example.com"].includes('"score":4'));
const other = load({ loggedIn: true, email: "other@example.com", withPretrade: true, store: sharedStore });
check("a second signed-in book has its own empty gate", other.RunnrTrendDay.shouldShowChip(friScore) === true && other.RunnrTrendDay.storageKey() === "runnr_trend_day_v1:other@example.com");

const tourOpen = load({ tourOpen: true });
check("open chip tour does not steal Size", tourOpen.RunnrTrendDay.shouldYield() === true && tourOpen.RunnrTrendDay.shouldShowChip(friScore) === false);

const tourQ = load({ tourForce: true });
check("?tour=1 leaves Size to the tour", tourQ.RunnrTrendDay.shouldYield() === true && tourQ.RunnrTrendDay.shouldShowChip(friScore) === false);

const intro = load({ introOpen: true });
check("email-wall intro is not covered by the gate", intro.RunnrTrendDay.shouldYield() === true && intro.RunnrTrendDay.shouldShowChip(friScore) === false);

const signedTour = load({ loggedIn: true, email: "janis@example.com", tourForce: true });
check("signed-in ?tour=1 still yields Size to the tour", signedTour.RunnrTrendDay.shouldYield() === true && signedTour.RunnrTrendDay.shouldShowChip(friScore) === false);

const after = load();
after.RunnrTrendDay.resetForTests();
const afterChip = after.RunnrTrendDay.chipHTML(after.RunnrTrendDay.todayRecord(friAfter), after.RunnrTrendDay.clockOf(friAfter));
check("after 10:30 still allows a first score", after.RunnrTrendDay.shouldShowChip(friAfter) === true && afterChip.includes("Live SPY/QQQ — still updating"));
after.RunnrTrendDay.apply({}, friAfter);
check("after 10:30 locks once applied", after.RunnrTrendDay.todayRecord(friAfter).locked === true && after.RunnrTrendDay.shouldShowChip(friAfter) === false);

const out = load();
const outHtml = out.RunnrTrendDay.chipHTML(out.RunnrTrendDay.todayRecord(sat), out.RunnrTrendDay.clockOf(sat));
check("weekend chip is optional, not Berlin", outHtml.includes("Outside RTH — gate is optional") && !/Berlin/.test(outHtml));
check("weekend gold CTA is Size without gate, not Apply sit", outHtml.includes('id="td-skip">Size without gate') && outHtml.includes("Sit — no trade (0 size)") && outHtml.includes("td-sit") && !outHtml.includes("Apply sit"));
check("weekend optional stamp does not gate size", /optional · Outside RTH/.test(out.RunnrTrendDay.stampHTML(out.RunnrTrendDay.todayRecord(sat), out.RunnrTrendDay.clockOf(sat))));

const rules = load();
const Auto = rules.RunnrTrendDay;
const demo = Auto.demoSnapshot(friScore);
check("demo fixture is a Friday 4/4 full-size tape", demo.date === "2026-09-18" && demo.score === 4 && demo.band === "full" && demo.sides.SPY === "up" && demo.sides.QQQ === "up");
check("check 1 — stamp outside first-hour range", demo.checks[0] === true && demo.levels.SPY.stamp === 570 && demo.levels.SPY.firstHourHigh === 568 && demo.levels.SPY.firstHourLow === 564);
check("check 2 — stamp broke premarket high", demo.checks[1] === true && demo.levels.SPY.pmHigh === 567 && demo.levels.SPY.pmLow === 562);
check("check 3 — stamp cleared yesterday high", demo.checks[2] === true && demo.levels.SPY.ydayHigh === 565 && demo.levels.SPY.ydayLow === 560);
check("check 4 — SPY and QQQ both up", demo.checks[3] === true);

const inside = Auto.evaluateLevels(
  { stamp: 566, firstHourHigh: 568, firstHourLow: 564, pmHigh: 570, pmLow: 560, ydayHigh: 575, ydayLow: 550 },
  { stamp: 490, firstHourHigh: 491, firstHourLow: 488, pmHigh: 495, pmLow: 480, ydayHigh: 500, ydayLow: 470 }
);
check("inside all ranges is 0 / sit", inside.score === 0 && inside.band === "sit" && inside.sides.SPY === "flat" && inside.checks.every((x) => x === false));

const onlyOrb = Auto.evaluateLevels(
  { stamp: 569, firstHourHigh: 568, firstHourLow: 564, pmHigh: 575, pmLow: 550, ydayHigh: 580, ydayLow: 550 },
  { stamp: 490, firstHourHigh: 491, firstHourLow: 488, pmHigh: 495, pmLow: 480, ydayHigh: 500, ydayLow: 470 }
);
check("only ORB break scores 1 / sit", onlyOrb.checks[0] === true && onlyOrb.score === 1 && onlyOrb.band === "sit" && onlyOrb.sides.SPY === "up" && onlyOrb.sides.QQQ === "flat" && onlyOrb.checks[3] === false);

const onlyPm = Auto.evaluateLevels(
  { stamp: 566, firstHourHigh: 568, firstHourLow: 564, pmHigh: 565, pmLow: 560, ydayHigh: 580, ydayLow: 550 },
  { stamp: 490, firstHourHigh: 491, firstHourLow: 488, pmHigh: 495, pmLow: 480, ydayHigh: 500, ydayLow: 470 }
);
check("only premarket break scores 1", onlyPm.checks[1] === true && onlyPm.score === 1 && onlyPm.checks[0] === false && onlyPm.checks[2] === false);

const onlyYday = Auto.evaluateLevels(
  { stamp: 566, firstHourHigh: 568, firstHourLow: 564, pmHigh: 570, pmLow: 560, ydayHigh: 565, ydayLow: 550 },
  { stamp: 490, firstHourHigh: 491, firstHourLow: 488, pmHigh: 495, pmLow: 480, ydayHigh: 500, ydayLow: 470 }
);
check("only yesterday break scores 1", onlyYday.checks[2] === true && onlyYday.score === 1 && onlyYday.sides.SPY === "up");

const bothDown = Auto.evaluateLevels(
  { stamp: 550, firstHourHigh: 568, firstHourLow: 564, pmHigh: 567, pmLow: 562, ydayHigh: 565, ydayLow: 560 },
  { stamp: 470, firstHourHigh: 491, firstHourLow: 488, pmHigh: 488, pmLow: 483, ydayHigh: 485, ydayLow: 480 }
);
check("both down is full size + peers", bothDown.score === 4 && bothDown.sides.SPY === "down" && bothDown.sides.QQQ === "down" && bothDown.checks[3] === true);

const disagree = Auto.evaluateLevels(
  { stamp: 570, firstHourHigh: 568, firstHourLow: 564, pmHigh: 567, pmLow: 562, ydayHigh: 565, ydayLow: 560 },
  { stamp: 470, firstHourHigh: 491, firstHourLow: 488, pmHigh: 488, pmLow: 483, ydayHigh: 485, ydayLow: 480 }
);
check("SPY up + QQQ down fails peers", disagree.sides.SPY === "up" && disagree.sides.QQQ === "down" && disagree.checks[3] === false && disagree.score === 3);

const orbWins = Auto.evaluateLevels(
  { stamp: 556, firstHourHigh: 555, firstHourLow: 550, pmHigh: 570, pmLow: 540, ydayHigh: 570, ydayLow: 560 },
  { stamp: 490, firstHourHigh: 491, firstHourLow: 488, pmHigh: 495, pmLow: 480, ydayHigh: 500, ydayLow: 470 }
);
check("first-hour break beats yesterday for side", orbWins.sides.SPY === "up" && orbWins.checks[0] === true && orbWins.checks[2] === true);

const missing = Auto.evaluateLevels(
  { stamp: 570, firstHourHigh: null, firstHourLow: null, pmHigh: null, pmLow: null, ydayHigh: 565, ydayLow: 560 },
  { stamp: 493, firstHourHigh: 491, firstHourLow: 488, pmHigh: 488, pmLow: 483, ydayHigh: 485, ydayLow: 480 }
);
check("missing first-hour / PM levels do not pass those checks", missing.checks[0] === false && missing.checks[1] === false && missing.checks[2] === true);

check("weekend is not auto-eligible", Auto.autoEligible(Auto.clockOf(sat)) === false);
check("Friday 10:10 is auto-eligible", Auto.autoEligible(Auto.clockOf(friScore)) === true);
check("Friday 9:45 is not auto-eligible yet", Auto.autoEligible(Auto.clockOf(friBefore)) === false);
check("Friday after hours is auto-eligible so the stamp can lock", Auto.autoEligible(Auto.clockOf(friOutside)) === true);

const autoChip = load();
autoChip.RunnrTrendDay.resetForTests();
const filled = autoChip.RunnrTrendDay.applyAutoSnapshot(demo, friScore);
check("auto snapshot prefills 4/4 without settling", filled.score === 4 && filled.source === "auto" && filled.applied !== true && filled.locked !== true && filled.autoChecks[0] === true);
const filledClock = autoChip.RunnrTrendDay.clockOf(friScore);
const filledHtml = autoChip.RunnrTrendDay.chipHTML(filled, filledClock);
check("chip names Auto · SPY/QQQ and already applied full size", filledHtml.includes("Auto · SPY/QQQ") && filledHtml.includes("Applied · full size") && !filledHtml.includes("Apply full size") && !filledHtml.includes("disabled"));
check("soft full is already 1× and the strip explains it", autoChip.RunnrTrendDay.riskMultiplier(friScore) === 1 && autoChip.RunnrTrendDay.softLive(filled, filledClock) === true && /4 \/ 4 · full size · auto/.test(autoChip.RunnrTrendDay.stampHTML(filled, filledClock)) && autoChip.RunnrTrendDay.stampTone(filled, filledClock) === "live");
check("soft full rests on the strip instead of a forced gate", autoChip.RunnrTrendDay.shouldShowChip(friScore) === true && autoChip.RunnrTrendDay.shouldOpenOverlay(friScore) === false && autoChip.RunnrTrendDay.shouldPollAuto(friScore) === true);
check("opening the strip shows why it is 4/4", autoChip.RunnrTrendDay.toggleChecklist(friScore) === true && autoChip.RunnrTrendDay.shouldOpenOverlay(friScore) === true);
const openedHtml = autoChip.RunnrTrendDay.chipHTML(autoChip.RunnrTrendDay.todayRecord(friScore), filledClock);
check("opened checklist keeps the checks and the size key", openedHtml.includes("Outside first-hour range") && openedHtml.includes("Peers same direction") && openedHtml.includes("Sit if 0–1 · half at 2 · full at 3–4") && openedHtml.includes("Applied · full size") && !openedHtml.includes("disabled"));
check("closing the strip returns to the desk", autoChip.RunnrTrendDay.toggleChecklist(friScore) === false && autoChip.RunnrTrendDay.shouldOpenOverlay(friScore) === false);
const flipped = autoChip.RunnrTrendDay.onCheck(3, friScore);
check("manual flip marks mixed source", flipped.source === "mixed" && flipped.userEdited === true && flipped.checks[3] === false && flipped.score === 3);
const mixedHtml = autoChip.RunnrTrendDay.chipHTML(flipped, autoChip.RunnrTrendDay.clockOf(friScore));
check("edited chip keeps Auto · SPY/QQQ · edited", mixedHtml.includes("Auto · SPY/QQQ · edited"));
const appliedMixed = autoChip.RunnrTrendDay.apply({}, friScore);
check("apply persists mixed for Coach", appliedMixed.source === "mixed" && autoChip.RunnrTrendDay.planMeta(friScore).source === "mixed");
check("stamp mentions edited", /edited/.test(autoChip.RunnrTrendDay.stampHTML(appliedMixed)));

const autoApply = load({ withPretrade: true });
autoApply.RunnrTrendDay.resetForTests();
autoApply.RunnrTrendDay.applyAutoSnapshot(demo, friScore);
const autoRec = autoApply.RunnrTrendDay.apply({}, friScore);
check("untouched auto apply stores source auto", autoRec.source === "auto" && autoApply.RunnrTrendDay.planMeta(friScore).source === "auto");
check("auto apply still multiplies size", autoApply.RunnrPretrade.computePlan({ ticker: "AAPL", dir: "long", entry: 200, stop: 190, target: 230 }, rails, [], friScore).size === 100);

const skipAuto = load();
skipAuto.RunnrTrendDay.resetForTests();
skipAuto.RunnrTrendDay.applyAutoSnapshot(demo, friScore);
const skippedAuto = skipAuto.RunnrTrendDay.skip("user", friScore);
check("skip still works after auto fill", skippedAuto.skipped === true && skipAuto.RunnrTrendDay.riskMultiplier(friScore) === 1 && skipAuto.RunnrTrendDay.shouldShowChip(friScore) === false);

const lockAuto = load();
lockAuto.RunnrTrendDay.resetForTests();
const firstSnap = lockAuto.RunnrTrendDay.applyAutoSnapshot(Object.assign({}, demo, { locked: true }), friAfter);
const later = lockAuto.RunnrTrendDay.evaluateLevels(
  { stamp: 500, firstHourHigh: 568, firstHourLow: 564, pmHigh: 567, pmLow: 562, ydayHigh: 565, ydayLow: 560 },
  { stamp: 400, firstHourHigh: 491, firstHourLow: 488, pmHigh: 488, pmLow: 483, ydayHigh: 485, ydayLow: 480 }
);
lockAuto.RunnrTrendDay.applyAutoSnapshot(Object.assign({}, later, { date: "2026-09-18", locked: true, checks: later.checks }), friAfter);
check("after 10:30 user-unedited auto can refresh only via hydrate cache, not by clobbering edits", firstSnap.score === 4);
lockAuto.RunnrTrendDay.onCheck(0, friAfter);
const editedLock = lockAuto.RunnrTrendDay.applyAutoSnapshot(Object.assign({}, later, { date: "2026-09-18", locked: true, checks: later.checks }), friAfter);
check("user override survives a second auto snapshot", editedLock.userEdited === true && editedLock.checks[0] === false && editedLock.source === "mixed");
check("tapped chip still polls live SPY/QQQ", lockAuto.RunnrTrendDay.shouldPollAuto(friAfter) === true);

const isoStore = {};
const iso = load({ store: isoStore, withPretrade: true });
iso.RunnrTrendDay.resetForTests();
iso.RunnrTrendDay.applyAutoSnapshot(demo, friScore);
iso.RunnrTrendDay.apply({}, friScore);
const isoSigned = load({ loggedIn: true, email: "janis@example.com", store: isoStore, withPretrade: true });
check("auto apply on SAMPLE does not fill the signed-in book", isoSigned.RunnrTrendDay.shouldShowChip(friScore) === true && isoSigned.RunnrTrendDay.todayRecord(friScore).source === "");
isoSigned.RunnrTrendDay.applyAutoSnapshot(demo, friScore);
check("both books can hold auto without clobber",
  /"source":"auto"/.test(String(isoStore["runnr_trend_day_v1:sample"] || ""))
  && /"source":"auto"/.test(String(isoStore["runnr_trend_day_v1:janis@example.com"] || ""))
  && !!isoStore["runnr_trend_day_auto_v1"]);

const weekendAuto = load({ location: { search: "?demo=1", hash: "" } });
weekendAuto.RunnrTrendDay.resetForTests();
check("Sunday without fixture does not auto-fill", weekendAuto.RunnrTrendDay.autoEligible(weekendAuto.RunnrTrendDay.clockOf(sat)) === false);

const softHalf = load({
  withPretrade: true,
  loggedIn: true,
  email: "janis@example.com",
});
softHalf.RunnrTrendDay.resetForTests();
const halfSnap = Object.assign({}, demo, { checks: [true, true, false, false] });
const halfRec = softHalf.RunnrTrendDay.applyAutoSnapshot(halfSnap, friAfter);
const halfClock = softHalf.RunnrTrendDay.clockOf(friAfter);
const halfHtml = softHalf.RunnrTrendDay.chipHTML(halfRec, halfClock);
const halfRails = softHalf.RunnrPretrade.normalizeRails(softHalf.window.S.pretrade, softHalf.window.S);
const halfPlan = softHalf.RunnrPretrade.computePlan({ ticker: "AAPL", dir: "long", entry: 200, stop: 190, target: 230 }, halfRails, [], friAfter);
check("signed-in auto half soft-applies 0.5× without Apply", halfRec.applied !== true && halfRec.score === 2 && halfRec.locked !== true && softHalf.RunnrTrendDay.riskMultiplier(friAfter) === 0.5 && halfPlan.size === 50 && halfPlan.trendDayMult === 0.5 && halfPlan.trendDaySit === false);
check("auto half strip is quiet applied and still skippable", halfHtml.includes("Applied · half size") && halfHtml.includes("Skip — size without gate") && !halfHtml.includes("Apply half size") && !halfHtml.includes("disabled") && /2 \/ 4 · half size · auto/.test(softHalf.RunnrTrendDay.stampHTML(halfRec, halfClock)));
check("auto half log keeps the soft score", (function () {
  const loggedHalf = softHalf.RunnrPretrade.logPlan({ ticker: "AAPL", dir: "long", entry: 200, stop: 190, target: 230 }, halfRails, softHalf.window.S.trades, friAfter);
  return loggedHalf.ok && loggedHalf.row.trendDay && loggedHalf.row.trendDay.soft === true && loggedHalf.row.trendDay.applied === false && loggedHalf.row.trendDay.multiplier === 0.5;
})());
softHalf.RunnrTrendDay.toggleChecklist(friAfter);
const overridden = softHalf.RunnrTrendDay.onCheck(1, friAfter);
check("toggle to sit does not force 0 shares", overridden.userEdited === true && overridden.score === 1 && overridden.applied !== true && softHalf.RunnrTrendDay.riskMultiplier(friAfter) === 1);
const sitOverrideHtml = softHalf.RunnrTrendDay.chipHTML(overridden, halfClock);
check("sit after an override asks before zeroing", sitOverrideHtml.includes("Sit — no trade (0 size)") && sitOverrideHtml.includes("Skip — size without gate") && !sitOverrideHtml.includes("Applied ·"));
const sitOverridePlan = softHalf.RunnrPretrade.computePlan({ ticker: "AAPL", dir: "long", entry: 200, stop: 190, target: 230 }, halfRails, [], friAfter);
check("sit score still sizes until Apply sit", sitOverridePlan.size === 100 && sitOverridePlan.trendDaySit === false);
const kept = softHalf.RunnrTrendDay.applyAutoSnapshot(demo, friAfter);
check("user tap wins over a later 4/4 refresh", kept.userEdited === true && kept.checks[1] === false && kept.score === 1 && softHalf.RunnrTrendDay.riskMultiplier(friAfter) === 1 && softHalf.RunnrTrendDay.shouldShowChip(friAfter) === true);

const softFullDesk = load({ withPretrade: true, loggedIn: true, email: "janis@example.com" });
softFullDesk.RunnrTrendDay.resetForTests();
const fullRec = softFullDesk.RunnrTrendDay.applyAutoSnapshot(demo, friAfter);
const fullRails = softFullDesk.RunnrPretrade.normalizeRails(softFullDesk.window.S.pretrade, softFullDesk.window.S);
const fullPlan = softFullDesk.RunnrPretrade.computePlan({ ticker: "AAPL", dir: "long", entry: 338.83, stop: 330, target: 360 }, fullRails, [], friAfter);
check("signed-in auto 4/4 sizes without Apply", fullRec.score === 4 && fullRec.applied !== true && fullPlan.size > 0 && fullPlan.trendDayMult === 1 && fullPlan.trendDaySit === false && softFullDesk.RunnrTrendDay.shouldOpenOverlay(friAfter) === false);
check("4/4 strip reopens an interactive checklist", softFullDesk.RunnrTrendDay.toggleChecklist(friAfter) === true && !softFullDesk.RunnrTrendDay.chipHTML(softFullDesk.RunnrTrendDay.todayRecord(friAfter), softFullDesk.RunnrTrendDay.clockOf(friAfter)).includes("disabled"));

const manualHalf = load({ withPretrade: true });
manualHalf.RunnrTrendDay.resetForTests();
manualHalf.RunnrTrendDay.persistDraft([true, true, false, false], { userEdited: true }, friScore);
const manualHtml = manualHalf.RunnrTrendDay.chipHTML(manualHalf.RunnrTrendDay.todayRecord(friScore), manualHalf.RunnrTrendDay.clockOf(friScore));
check("manual half still waits for Apply", manualHalf.RunnrTrendDay.riskMultiplier(friScore) === 1 && manualHalf.RunnrTrendDay.softLive(manualHalf.RunnrTrendDay.todayRecord(friScore), manualHalf.RunnrTrendDay.clockOf(friScore)) === false && manualHtml.includes("Apply half size"));

const offHalf = load({ withPretrade: true });
offHalf.RunnrTrendDay.resetForTests();
offHalf.RunnrTrendDay.applyAutoSnapshot(halfSnap, friOutside);
const offHtml = offHalf.RunnrTrendDay.chipHTML(offHalf.RunnrTrendDay.todayRecord(friOutside), offHalf.RunnrTrendDay.clockOf(friOutside));
check("after the close auto half stays optional 1×", offHalf.RunnrTrendDay.riskMultiplier(friOutside) === 1 && offHalf.RunnrTrendDay.shouldOpenOverlay(friOutside) === false && /size without gate/i.test(offHtml) && !offHtml.includes("Applied · half size"));

const weekHalf = load({
  withPretrade: true,
  state: { bal: 10000, risk: 1, sym: "€", trades: [], pretrade: { maxRiskPct: 2, maxDailyLossPct: 5, minRR: 1.5 } },
});
weekHalf.RunnrTrendDay.resetForTests();
weekHalf.RunnrTrendDay.applyAutoSnapshot(halfSnap, sat);
const weekRails = { bal: 10000, maxRiskPct: 2, maxDailyLossPct: 5, minRR: 1.5, propDailyDDPct: 5, propMaxDDPct: 10, sym: "€" };
const weekPlan = weekHalf.RunnrPretrade.computePlan({ ticker: "AAPL", dir: "long", entry: 336.13, stop: 326, target: 367 }, weekRails, [], sat);
check("weekend visitor is not silently halved or zeroed", weekHalf.RunnrTrendDay.riskMultiplier(sat) === 1 && weekPlan.size > 0 && weekPlan.trendDayMult === 1 && weekPlan.trendDaySit === false);

const reopen = load();
reopen.RunnrTrendDay.resetForTests();
reopen.RunnrTrendDay.applyAutoSnapshot(demo, friScore);
reopen.RunnrTrendDay.apply({}, friScore);
check("explicit apply still collapses to the strip", reopen.RunnrTrendDay.shouldShowChip(friScore) === false && reopen.RunnrTrendDay.shouldOpenOverlay(friScore) === false && /4 \/ 4 · full size · auto/.test(reopen.RunnrTrendDay.stampHTML(reopen.RunnrTrendDay.todayRecord(friScore), reopen.RunnrTrendDay.clockOf(friScore))));
check("explicit apply strip still opens the checklist", reopen.RunnrTrendDay.toggleChecklist(friScore) === true && reopen.RunnrTrendDay.shouldOpenOverlay(friScore) === true);
check("explicit apply strip still closes the checklist", reopen.RunnrTrendDay.toggleChecklist(friScore) === false && reopen.RunnrTrendDay.shouldOpenOverlay(friScore) === false);
const reopenHtml = reopen.RunnrTrendDay.chipHTML(reopen.RunnrTrendDay.todayRecord(friScore), reopen.RunnrTrendDay.clockOf(friScore));
check("reopened checklist still explains the four checks", reopenHtml.includes("Outside first-hour range") && reopenHtml.includes("Sit if 0–1 · half at 2 · full at 3–4"));

function chevronEvent(target, x, y, type) {
  return {
    type: type || "click",
    target,
    clientX: x,
    clientY: y,
    preventDefault() { this.defaulted = true; },
    stopPropagation() { this.stopped = true; },
  };
}

function runStripToggle(label, opts) {
  const ctx = load(opts);
  ctx.RunnrTrendDay.resetForTests();
  const stamp = ctx._els["pt-trend-stamp"];
  const overlay = ctx._els["trend-day-overlay"];
  stamp.getBoundingClientRect = function () {
    return { left: 16, top: 420, right: 370, bottom: 468, width: 354, height: 48 };
  };
  const rec0 = ctx.RunnrTrendDay.todayRecord(friScore);
  check(label + " score-window strip names the sit score", /Trend day check · 0 \/ 4 · sit/.test(ctx.RunnrTrendDay.stampHTML(rec0, ctx.RunnrTrendDay.clockOf(friScore))));
  check(label + " score window still auto-opens", ctx.RunnrTrendDay.shouldOpenOverlay(friScore) === true);
  ctx.RunnrTrendDay.paint(friScore);
  check(
    label + " expanded strip is the collapse chevron",
    stamp.hidden === false && stamp.getAttribute("aria-expanded") === "true" && /0 \/ 4 · sit/.test(stamp.textContent) && overlay.hidden === false
  );
  const chipChrome = {
    closest(sel) {
      const s = String(sel);
      if (s === "#trend-day-chip" || s === "#trend-day-overlay") return chipChrome;
      return null;
    },
  };
  check(
    label + " chevron under the open panel collapses",
    ctx.RunnrTrendDay.onStampPointer(chevronEvent(chipChrome, 340, 444), friScore) === true
      && ctx.RunnrTrendDay.shouldOpenOverlay(friScore) === false
      && overlay.hidden === true
      && stamp.getAttribute("aria-expanded") === "false"
      && ctx.RunnrTrendDay.riskMultiplier(friScore) === 1
  );
  check(
    label + " chevron reopens the checklist",
    ctx.RunnrTrendDay.onStampPointer(chevronEvent(chipChrome, 340, 444), friScore) === true
      && ctx.RunnrTrendDay.shouldOpenOverlay(friScore) === true
      && stamp.getAttribute("aria-expanded") === "true"
      && overlay.hidden === false
  );
  const direct = {
    closest(sel) { return String(sel).indexOf("pt-trend-stamp") >= 0 ? direct : null; },
  };
  check(label + " strip body toggles too", ctx.RunnrTrendDay.onStampPointer(chevronEvent(direct, 80, 440), friScore) === true && ctx.RunnrTrendDay.shouldOpenOverlay(friScore) === false);
  ctx.RunnrTrendDay.onStampPointer(chevronEvent(chipChrome, 340, 444, "pointerup"), friScore);
  const afterPointer = ctx.RunnrTrendDay.shouldOpenOverlay(friScore);
  ctx.RunnrTrendDay.onStampPointer(chevronEvent(chipChrome, 340, 444, "click"), friScore);
  check(label + " pointerup+click does not double-toggle the strip", afterPointer === true && ctx.RunnrTrendDay.shouldOpenOverlay(friScore) === true);
  const sitBtn = {
    id: "td-apply",
    closest(sel) {
      const s = String(sel);
      if (s.indexOf("#td-apply") >= 0 || s.indexOf("data-td-check") >= 0) return sitBtn;
      if (s === "#trend-day-chip") return { id: "trend-day-chip" };
      return null;
    },
  };
  check(label + " sit button is not stolen by the strip", ctx.RunnrTrendDay.onStampPointer(chevronEvent(sitBtn, 340, 444)) === false && ctx.RunnrTrendDay.shouldOpenOverlay(friScore) === true);
  ctx.RunnrTrendDay.paint(sat);
  check(
    label + " outside RTH stays collapsed and optional",
    ctx.RunnrTrendDay.shouldOpenOverlay(sat) === false && stamp.getAttribute("aria-expanded") === "false" && /size not gated/.test(stamp.textContent)
  );
  const rails = ctx.RunnrPretrade.normalizeRails(ctx.window.S.pretrade, ctx.window.S);
  const plan = ctx.RunnrPretrade.computePlan({ ticker: "AAPL", dir: "long", entry: 200, stop: 190, target: 230 }, rails, [], sat);
  check(label + " outside RTH does not sit-trap", plan.size > 0 && plan.trendDaySit === false && plan.trendDayMult === 1);
}

runStripToggle("guest", { withPretrade: true });
runStripToggle("signed-in", { withPretrade: true, loggedIn: true, email: "janis@example.com" });

(async function () {
  const tdfix = load({ location: { search: "?demo=1&tdfix=1", hash: "" } });
  tdfix.RunnrTrendDay.resetForTests();
  const rec = await tdfix.RunnrTrendDay.hydrateAuto(sat);
  check("?tdfix=1 dry-run prefills Sunday from the Friday fixture", rec && rec.score === 4 && rec.autoFixture === true && rec.source === "auto");
  const fixHtml = tdfix.RunnrTrendDay.chipHTML(rec, tdfix.RunnrTrendDay.clockOf(sat));
  check("fixture chip stays optional + labeled", fixHtml.includes("Outside RTH — gate is optional") && fixHtml.includes("Auto · SPY/QQQ · fixture"));

  let fetches = 0;
  const fail = load({
    fetch() {
      fetches += 1;
      return Promise.resolve({ ok: false, json: async () => ({}) });
    },
  });
  fail.RunnrTrendDay.resetForTests();
  const failed = await fail.RunnrTrendDay.hydrateAuto(friScore);
  check("feed fail leaves an empty manual chip", failed.score === 0 && failed.autoError === "Auto unavailable" && failed.checks.every((x) => x === false));
  const failHtml = fail.RunnrTrendDay.chipHTML(failed, fail.RunnrTrendDay.clockOf(friScore));
  check("feed fail is a quiet Auto unavailable line", failHtml.includes("Auto unavailable") && failHtml.includes("Sit — no trade (0 size)") && failHtml.includes("Skip — size without gate"));
  check("feed fail still allows Size", fail.RunnrTrendDay.shouldShowChip(friScore) === true && fail.RunnrTrendDay.riskMultiplier(friScore) === 1 && fetches >= 1);

  const live = load({
    fetch(url) {
      const href = String(url || "");
      if (href.indexOf("/api/v1/quotes/trend-day") >= 0) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            date: "2026-09-18",
            eligible: true,
            locked: false,
            checks: demo.checks,
            levels: demo.levels,
            sides: demo.sides,
            stampAt: demo.stampAt,
          }),
        });
      }
      return Promise.reject(new Error("unexpected " + href));
    },
  });
  live.RunnrTrendDay.resetForTests();
  const liveRec = await live.RunnrTrendDay.hydrateAuto(friScore);
  check("RTH hydrate prefills from /quotes/trend-day", liveRec.score === 4 && liveRec.source === "auto" && liveRec.autoError === "");
  check("score-window auto fill stays interactive", liveRec.applied !== true && live.RunnrTrendDay.shouldShowChip(friScore) === true);
  check("score-window auto full rests on the strip", live.RunnrTrendDay.shouldOpenOverlay(friScore) === false && live.RunnrTrendDay.riskMultiplier(friScore) === 1 && /4 \/ 4 · full size · auto/.test(live.RunnrTrendDay.stampHTML(liveRec, live.RunnrTrendDay.clockOf(friScore))));
  const flippedLive = live.RunnrTrendDay.onCheck(3, friScore);
  check("score-window toggle still works after auto fill", flippedLive.userEdited === true && flippedLive.checks[3] === false && flippedLive.applied !== true);

  let afterFetches = 0;
  const liveAfter = load({
    loggedIn: true,
    email: "janis@example.com",
    fetch(url) {
      afterFetches += 1;
      const href = String(url || "");
      if (href.indexOf("/api/v1/quotes/trend-day") >= 0) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            date: "2026-09-18",
            eligible: true,
            locked: true,
            checks: demo.checks,
            levels: demo.levels,
            sides: demo.sides,
            stampAt: demo.stampAt,
          }),
        });
      }
      return Promise.reject(new Error("unexpected " + href));
    },
  });
  liveAfter.RunnrTrendDay.resetForTests();
  const firstAfter = await liveAfter.RunnrTrendDay.hydrateAuto(friAfter);
  check("signed-in after 10:30 prefills and stays unlocked", firstAfter.score === 4 && firstAfter.applied !== true && liveAfter.RunnrTrendDay.shouldShowChip(friAfter) === true);
  const autoRow = JSON.parse(String(liveAfter._store["runnr_trend_day_auto_v1"] || "{}"));
  autoRow.fetchedAt = Date.now() - 60000;
  liveAfter._store["runnr_trend_day_auto_v1"] = JSON.stringify(autoRow);
  await liveAfter.RunnrTrendDay.hydrateAuto(friAfter);
  check("after 10:30 stale cache refetches like a live quote", afterFetches >= 2);
  const signedFlip = liveAfter.RunnrTrendDay.onCheck(0, friAfter);
  check("signed-in can toggle after live auto fill", signedFlip.userEdited === true && signedFlip.checks[0] === false);

  const guestRails = { bal: 10000, maxRiskPct: 2, maxDailyLossPct: 5, minRR: 1.5, propDailyDDPct: 5, propMaxDDPct: 10, sym: "€" };
  const janis = { ticker: "AAPL", dir: "long", entry: 336.13, stop: 326, target: 367 };

  const guestSkip = load({
    withPretrade: true,
    state: { bal: 10000, risk: 1, sym: "€", trades: [], pretrade: { maxRiskPct: 2, maxDailyLossPct: 5, minRR: 1.5 } },
  });
  guestSkip.RunnrTrendDay.resetForTests();
  guestSkip.RunnrTrendDay.skip("user", sat);
  const guestSkipPlan = guestSkip.RunnrPretrade.computePlan(janis, guestRails, [], sat);
  check("visitor skip → SAMPLE size is non-zero", guestSkipPlan.size > 0 && guestSkipPlan.totalRisk > 0 && guestSkipPlan.trendDaySit === false && guestSkipPlan.trendDayMult === 1);
  const skipHtml = guestSkip.RunnrPretrade.outputHTML(guestSkipPlan, guestRails);
  check("visitor skip plan does not say sit", !/<span>Trend day<\/span><strong class="gold">sit<\/strong>/.test(skipHtml) && !skipHtml.includes("SIT —"));
  const guestSkipLog = guestSkip.RunnrPretrade.logPlan(janis, guestRails, guestSkip.window.S.trades, sat);
  check("visitor skip can log a sized SAMPLE plan", guestSkipLog.ok && guestSkipLog.row.size === guestSkipPlan.size);

  const guestIdle = load({
    withPretrade: true,
    state: { bal: 10000, risk: 1, sym: "€", trades: [], pretrade: { maxRiskPct: 2, maxDailyLossPct: 5, minRR: 1.5 } },
  });
  guestIdle.RunnrTrendDay.resetForTests();
  const idlePlan = guestIdle.RunnrPretrade.computePlan(janis, guestRails, [], sat);
  check("outside RTH unsettled does not zero size", idlePlan.size > 0 && idlePlan.trendDaySit === false && idlePlan.trendDayMult === 1 && guestIdle.RunnrTrendDay.shouldOpenOverlay(sat) === false);

  const trap = load({
    withPretrade: true,
    state: { bal: 10000, risk: 1, sym: "€", trades: [], pretrade: { maxRiskPct: 2, maxDailyLossPct: 5, minRR: 1.5 } },
  });
  trap.RunnrTrendDay.resetForTests();
  trap._store["runnr_trend_day_v1:sample"] = JSON.stringify({
    date: "2026-09-19",
    checks: [false, false, false, false],
    score: 0,
    band: "sit",
    multiplier: 0,
    applied: true,
    skipped: false,
    source: "manual",
    userEdited: false,
  });
  const trapRec = trap.RunnrTrendDay.todayRecord(sat);
  check("leftover Apply sit migrates off 0×", trapRec.applied === false && trapRec.migratedSit === true && trap.RunnrTrendDay.riskMultiplier(sat) === 1);
  const trapPlan = trap.RunnrPretrade.computePlan(janis, guestRails, [], sat);
  check("migrated visitor gets SAMPLE size", trapPlan.size > 0 && trapPlan.trendDaySit === false);

  const bare = load({
    withPretrade: true,
    state: { bal: 10000, risk: 1, sym: "€", trades: [], pretrade: { maxRiskPct: 2, maxDailyLossPct: 5, minRR: 1.5 } },
  });
  bare.RunnrTrendDay.resetForTests();
  bare._store["runnr_trend_day_v1"] = JSON.stringify({
    date: "2026-09-19",
    checks: [false, false, false, false],
    score: 0,
    band: "sit",
    multiplier: 0,
    applied: true,
    skipped: false,
    source: "manual",
  });
  const bareRec = bare.RunnrTrendDay.todayRecord(sat);
  check("unscoped v1 sit migrates to scoped sample key", bareRec.migratedSit === true && bareRec.applied === false && !bare._store["runnr_trend_day_v1"] && /"applied":false/.test(String(bare._store["runnr_trend_day_v1:sample"] || "")));

  const explicitSit = load({ withPretrade: true });
  explicitSit.RunnrTrendDay.resetForTests();
  const satSit = explicitSit.RunnrTrendDay.apply({ explicit: true }, sat);
  check("sit is explicit and zeros only after Apply", satSit.explicit === true && satSit.sitChosen === true && explicitSit.RunnrTrendDay.riskMultiplier(sat) === 0);
  const satSitPlan = explicitSit.RunnrPretrade.computePlan(janis, guestRails, [], sat);
  check("explicit sit is the 0-share path", satSitPlan.trendDaySit === true && satSitPlan.size === 0);
  const satSitLog = explicitSit.RunnrPretrade.logPlan(janis, guestRails, [], sat);
  check("explicit sit log names the sit, not a missing ticker", !satSitLog.ok && /Sit — no trade/.test(satSitLog.error));

  const halfGuest = load({
    withPretrade: true,
    state: { bal: 10000, risk: 1, sym: "€", trades: [], pretrade: { maxRiskPct: 2, maxDailyLossPct: 5, minRR: 1.5 } },
  });
  halfGuest.RunnrTrendDay.resetForTests();
  halfGuest.RunnrTrendDay.persistDraft([true, true, false, false], { userEdited: true }, sat);
  halfGuest.RunnrTrendDay.apply({ explicit: true }, sat);
  const halfPlan = halfGuest.RunnrPretrade.computePlan(janis, guestRails, [], sat);
  const fullShares = Math.floor(10000 * 0.02 / Math.abs(336.13 - 326));
  check("half apply still scales SAMPLE size", halfPlan.size === Math.floor(fullShares / 2) && halfPlan.trendDayMult === 0.5 && halfPlan.size > 0);

  let sitFetches = 0;
  const autoSit = load({
    withPretrade: true,
    fetch(url) {
      sitFetches += 1;
      const href = String(url || "");
      if (href.indexOf("/api/v1/quotes/trend-day") >= 0) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            date: "2026-09-18",
            eligible: true,
            locked: false,
            checks: [false, false, false, false],
            levels: {
              SPY: { stamp: 566, firstHourHigh: 568, firstHourLow: 564, pmHigh: 570, pmLow: 560, ydayHigh: 575, ydayLow: 550, ok: true },
              QQQ: { stamp: 490, firstHourHigh: 491, firstHourLow: 488, pmHigh: 495, pmLow: 480, ydayHigh: 500, ydayLow: 470, ok: true },
            },
            sides: { SPY: "flat", QQQ: "flat" },
          }),
        });
      }
      return Promise.reject(new Error("unexpected " + href));
    },
  });
  autoSit.RunnrTrendDay.resetForTests();
  const autoSitRec = await autoSit.RunnrTrendDay.hydrateAuto(friScore);
  check("auto sit does not auto-apply 0×", autoSitRec.applied !== true && autoSitRec.score === 0 && autoSit.RunnrTrendDay.riskMultiplier(friScore) === 1 && sitFetches >= 1);
  const autoSitPlan = autoSit.RunnrPretrade.computePlan({ ticker: "AAPL", dir: "long", entry: 200, stop: 190, target: 230 }, rails, [], friScore);
  check("auto sit leaves Size usable until confirm", autoSitPlan.size > 0 && autoSitPlan.trendDaySit === false);

  console.log("test_trend_day: " + n + " checks ok");
})().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
