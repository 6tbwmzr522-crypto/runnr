#!/usr/bin/env node
/** SAMPLE trend-day size gate: chip before Size, multiplier map, skip log, ET clock, tour/intro stay out. */
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
check("cache is 168+", Number(v) >= 168);
check("trend-day.js is cache-busted", html.includes("js/trend-day.js?v=2"));
check("trend-day loads after tour and intro", html.indexOf("js/intro.js") < html.indexOf("js/trend-day.js") && html.indexOf("js/tour.js") < html.indexOf("js/trend-day.js"));
check("trend-day loads before pretrade", html.indexOf("js/trend-day.js") < html.indexOf("js/pretrade.js"));
check("pretrade cache-bust bumped", html.includes("js/pretrade.js?v=18"));
check("pretrade.css cache-bust bumped", html.includes("css/pretrade.css?v=9"));
check("overlay markup sits on the Size page", html.includes('id="trend-day-overlay"') && html.includes('id="trend-day-chip"') && html.includes('id="page-sizer"'));
check("overlay starts hidden", /id="trend-day-overlay"[^>]*hidden/.test(html));
check("copy is Trend day check", trendSrc.includes("Trend day check") && trendSrc.includes("Sit if 0–1 · half at 2 · full at 3–4"));
check("CTAs are sit / half / full", trendSrc.includes("Apply sit") && trendSrc.includes("Apply half size") && trendSrc.includes("Apply full size"));
check("no Ripster / EMA / cloud branding", !/ripster|ema cloud|ichimoku/i.test(trendSrc) && !/ripster|ema cloud/i.test(html));
check("localStorage key is runnr_trend_day_v1", trendSrc.includes('KEY = "runnr_trend_day_v1"') && trendSrc.includes("storageKey") && trendSrc.includes("bookScope"));
check("signed-in books are not SAMPLE-gated", !/function shouldShowChip[\s\S]*isSampleDesk\(\)\s*return false/.test(trendSrc.replace(/\n/g, " ")) && !pretradeSrc.includes("if (!isSampleDesk()) return null;"));
check("clock is America/New_York", trendSrc.includes("America/New_York") && !/Berlin|Europe\/Berlin/.test(trendSrc));
check("gold chip chrome lives in pretrade.css", css.includes("#trend-day-chip") && css.includes("pt-trend-gate") && css.includes(".td-cta"));
check("pretrade applies the gate multiplier", pretradeSrc.includes("trendDayGate") && pretradeSrc.includes("trendDayMult"));
check("skip persists on the plan", pretradeSrc.includes("sized without trend-day gate") && pretradeSrc.includes("row.trendDay"));
check("tour still opens Size", tourSrc.includes("openSizer") && tourSrc.includes('id === "size"'));
check("tour start/close yields the size gate", tourSrc.includes("yieldTrendDay"));
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
  const stamp = { hidden: true, textContent: "", className: "pt-trend-stamp" };
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
    location: o.location || { search: "?demo=1", hash: "" },
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
check("Friday 10:40 ET is after the window", TD.clockOf(friAfter).phase === "after" && TD.clockLabel(TD.clockOf(friAfter)).indexOf("After 10:30 ET") === 0);
check("Friday 9:45 ET waits for 10:00", TD.clockOf(friBefore).phase === "before" && /10:00 ET/.test(TD.clockLabel(TD.clockOf(friBefore))));
check("Friday after the close is Outside RTH", TD.clockOf(friOutside).outsideRth === true && /Outside RTH/.test(TD.clockLabel(TD.clockOf(friOutside))));
check("Saturday is Outside RTH — gate is optional", TD.clockOf(sat).weekend === true && TD.clockLabel(TD.clockOf(sat)) === "Outside RTH — gate is optional");

check("0 checks → sit / 0×", TD.bandOf(0) === "sit" && TD.multiplierOf(0) === 0 && TD.ctaLabel("sit") === "Apply sit");
check("1 check → sit / 0×", TD.bandOf(1) === "sit" && TD.multiplierOf(1) === 0);
check("1 check can take 0.25×", TD.multiplierOf(1, { quarter: true }) === 0.25);
check("2 checks → half / 0.5×", TD.bandOf(2) === "half" && TD.multiplierOf(2) === 0.5 && TD.ctaLabel("half") === "Apply half size");
check("3–4 checks → full / 1×", TD.bandOf(3) === "full" && TD.multiplierOf(4) === 1 && TD.ctaLabel("full") === "Apply full size");
check("status copy matches the mock", TD.statusText(2, "half") === "2 / 4 · half size" && TD.statusText(0, "sit") === "0 / 4 · sit");

const sample = load({ withPretrade: true });
sample.RunnrTrendDay.resetForTests();
check("SAMPLE shows the chip before Size", sample.RunnrTrendDay.shouldShowChip(friScore) === true);
check("onEnterSize opens the overlay on SAMPLE", sample.RunnrTrendDay.onEnterSize() === true && sample._els["page-sizer"].classList.contains("pt-trend-gate"));
check("chip HTML has the four checks and Apply sit", (function () {
  const rec = sample.RunnrTrendDay.todayRecord(friScore);
  const htmlChip = sample.RunnrTrendDay.chipHTML(rec, sample.RunnrTrendDay.clockOf(friScore));
  return htmlChip.includes("Trend day check")
    && htmlChip.includes("Outside first-hour range")
    && htmlChip.includes("Broke premarket high/low")
    && htmlChip.includes("Cleared yesterday’s H/L")
    && htmlChip.includes("Peers same direction")
    && htmlChip.includes("Apply sit")
    && htmlChip.includes("Skip — size without gate");
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
check("after 10:30 still allows a first score", after.RunnrTrendDay.shouldShowChip(friAfter) === true && afterChip.includes("After 10:30 ET — score once"));
after.RunnrTrendDay.apply({}, friAfter);
check("after 10:30 locks once applied", after.RunnrTrendDay.todayRecord(friAfter).locked === true && after.RunnrTrendDay.shouldShowChip(friAfter) === false);

const out = load();
const outHtml = out.RunnrTrendDay.chipHTML(out.RunnrTrendDay.todayRecord(sat), out.RunnrTrendDay.clockOf(sat));
check("weekend chip is optional, not Berlin", outHtml.includes("Outside RTH — gate is optional") && !/Berlin/.test(outHtml));

console.log("test_trend_day: " + n + " checks ok");
