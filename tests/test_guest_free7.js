#!/usr/bin/env node
/** Free-7 guest desk: Sizer entry, no tour/video, wall only on day index 7+. */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
const gateSrc = fs.readFileSync(path.join(root, "js/guest-gate.js"), "utf8");
const sandboxSrc = fs.readFileSync(path.join(root, "js/demo-sandbox.js"), "utf8");
const tourSrc = fs.readFileSync(path.join(root, "js/tour.js"), "utf8");
const introSrc = fs.readFileSync(path.join(root, "js/intro.js"), "utf8");
const onboardingSrc = fs.readFileSync(path.join(root, "js/onboarding.js"), "utf8");
const pretradeSrc = fs.readFileSync(path.join(root, "js/pretrade.js"), "utf8");
const bootSrc = fs.readFileSync(path.join(root, "js/app-boot.js"), "utf8");
const navSrc = fs.readFileSync(path.join(root, "js/app-nav.js"), "utf8");
const stats = fs.readFileSync(path.join(root, "stats.html"), "utf8");

let n = 0;
function check(name, cond) {
  assert(cond, name);
  n += 1;
}

const v = html.match(/var V = "(\d+)"/)[1];
const cache = sw.match(/CACHE = "runnr-v(\d+)"/)[1];
check("index.html V matches sw.js CACHE", v === cache);
check("guest gate is loaded before the hook", html.indexOf("js/guest-gate.js?v=1") < html.indexOf("js/onboarding.js"));
check("first paint defaults to the free desk", html.includes("runnr-free-desk") && html.includes('!== "legacy"') && html.includes("runnr_guest_trial_v1"));
check("legacy first paint still has the hook and SAMPLE hero", html.includes("runnr-show-hook") && html.includes("runnr-sample-landing") && html.includes("runnr-ig-score"));
check("boot lands free guests on the desk", bootSrc.includes("enterFreeDesk"));
check("nav notes tool focus", navSrc.includes("RunnrGuestGate.noteFocus"));
check("stats documents rollback and free-7 events", stats.includes("?gate=legacy") && stats.includes("guest_hit_wall") && stats.includes("guest_land_bare") && stats.includes("trialday=7"));
check("sandbox keeps the legacy wall path", sandboxSrc.includes("function showKeepScore") && sandboxSrc.includes("email_wall_shown"));

function freshCtx(loc) {
  const store = {};
  const session = {};
  let cookie = "";
  const beacons = [];
  const ctx = {
    beacons,
    localStorage: {
      getItem(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
      setItem(k, v) { store[k] = String(v); },
      removeItem(k) { delete store[k]; },
    },
    sessionStorage: {
      getItem(k) { return Object.prototype.hasOwnProperty.call(session, k) ? session[k] : null; },
      setItem(k, v) { session[k] = String(v); },
      removeItem(k) { delete session[k]; },
    },
    location: loc || { hostname: "localhost", search: "", pathname: "/", hash: "", href: "http://localhost/" },
    navigator: {
      userAgent: "node",
      sendBeacon(url) { beacons.push(String(url)); return true; },
    },
    document: {
      readyState: "complete",
      get cookie() { return cookie; },
      set cookie(v) { cookie = String(v); },
      getElementById() { return null; },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      documentElement: { classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } }, dataset: {} },
      addEventListener() {},
    },
    setTimeout(fn) { return 1; },
    clearTimeout() {},
    console,
    Date,
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  ctx.store = store;
  return ctx;
}

function loadGate(loc, prime) {
  const ctx = freshCtx(loc);
  if (prime) prime(ctx);
  vm.runInNewContext(gateSrc, ctx);
  return ctx;
}

const bare = loadGate({ search: "", pathname: "/", hash: "" });
check("default gate is free7", bare.RunnrGuestGate.gateMode() === "free7" && bare.RunnrGuestGate.freeMode() === true);
check("bare land source", bare.RunnrGuestGate.landSource() === "bare");
check("first land is day 0 and the desk is open", bare.RunnrGuestGate.dayIndex() === 0 && bare.RunnrGuestGate.trialOpen() === true);
check("trial stamp is in localStorage", !!bare.store.runnr_guest_trial_v1);
check("trial stamp is in the cookie", bare.document.cookie.indexOf("runnr_guest_trial=") >= 0);
check("shared focus is Sizer", bare.RunnrGuestGate.sharedFocus() === "sizer");

const demo = loadGate({ search: "?demo=1", pathname: "/", hash: "" });
check("demo=1 is a demo land", demo.RunnrGuestGate.landSource() === "demo");
const ig = loadGate({ search: "?demo=1&ig=1", pathname: "/", hash: "" });
check("ig=1 is an ig land", ig.RunnrGuestGate.landSource() === "ig");
const utm = loadGate({ search: "?utm_source=instagram", pathname: "/", hash: "" });
check("utm instagram is an ig land", utm.RunnrGuestGate.landSource() === "ig");

const DAY = 86400000;
const aged = loadGate({ search: "", pathname: "/", hash: "" }, function (ctx) {
  const start = new Date(Date.now() - (6 * DAY + 1000)).toISOString();
  ctx.localStorage.setItem("runnr_guest_trial_v1", start);
});
check("day index 6 is still inside the 7 days", aged.RunnrGuestGate.dayIndex() === 6 && aged.RunnrGuestGate.trialOpen() === true);
const wallDay = loadGate({ search: "", pathname: "/", hash: "" }, function (ctx) {
  const start = new Date(Date.now() - 7 * DAY).toISOString();
  ctx.localStorage.setItem("runnr_guest_trial_v1", start);
});
check("day index 7 is the soft wall", wallDay.RunnrGuestGate.dayIndex() === 7 && wallDay.RunnrGuestGate.trialExpired() === true && wallDay.RunnrGuestGate.trialOpen() === false);

const qa = loadGate({ search: "?trialday=7", pathname: "/", hash: "" });
check("trialday=7 forces the wall day", qa.RunnrGuestGate.dayIndex() === 7 && qa.RunnrGuestGate.trialExpired() === true);
const cleared = loadGate({ search: "?trialday=off", pathname: "/", hash: "" }, function (ctx) {
  ctx.sessionStorage.setItem("runnr_trialday_v1", "7");
});
check("trialday=off clears the QA override", cleared.RunnrGuestGate.dayIndex() === 0 && cleared.RunnrGuestGate.trialOpen() === true);

const earlier = new Date(Date.now() - 3 * DAY).toISOString();
const later = new Date().toISOString();
const healed = loadGate({ search: "", pathname: "/", hash: "" }, function (ctx) {
  ctx.localStorage.setItem("runnr_guest_trial_v1", later);
  ctx.document.cookie = "runnr_guest_trial=" + encodeURIComponent(earlier);
});
check("cookie and storage keep the earlier land", healed.RunnrGuestGate.readStart() === Date.parse(earlier));
check("healed day index is 3", healed.RunnrGuestGate.dayIndex() === 3);

const legacy = loadGate({ search: "?gate=legacy", pathname: "/", hash: "" });
check("query gate=legacy persists", legacy.RunnrGuestGate.legacy() === true && legacy.store.runnr_guest_gate_v1 === "legacy");
check("legacy does not open the guest trial", legacy.RunnrGuestGate.trialOpen() === false);
const restored = loadGate({ search: "?gate=free7", pathname: "/", hash: "" }, function (ctx) {
  ctx.localStorage.setItem("runnr_guest_gate_v1", "legacy");
});
check("query gate=free7 restores the desk", restored.RunnrGuestGate.freeMode() === true && restored.store.runnr_guest_gate_v1 === "free7");

function loadStack(loc, prime) {
  const ctx = loadGate(loc, prime);
  ctx.S = { bal: 10000, risk: 1, sym: "€", trades: [], watchlist: [] };
  ctx.window.S = ctx.S;
  ctx._page = "home";
  ctx._primed = null;
  ctx._tour = 0;
  ctx.switchPage = function (key) { ctx._page = key; };
  ctx.RunnrPretrade = {
    prime(input) { ctx._primed = input; },
    open() { ctx._page = "sizer"; return true; },
  };
  ctx.RunnrTour = { maybeShow() { ctx._tour += 1; return true; }, shouldShow() { return false; }, isOpen() { return false; } };
  vm.runInNewContext(sandboxSrc, ctx);
  return ctx;
}

const desk = loadStack({ search: "", pathname: "/", hash: "", href: "http://localhost/" });
check("bare entry opens the free desk", desk.RunnrDemoSandbox.enterFreeDesk(desk.S) === true);
check("bare entry focuses Sizer", desk._page === "sizer" && desk._primed && desk._primed.ticker);
check("bare entry fills the SAMPLE book", desk.S.trades.length >= 12 && desk.S.trades.every((t) => t.isDemo === true));
check("bare entry does not start the tour", desk._tour === 0);
check("bare entry skips the hero and the ig card", desk.RunnrDemoSandbox.shouldShowSampleHero(desk.S) === false && desk.RunnrDemoSandbox.shouldShowIgScore(desk.S) === false);
check("day 0 does not hold the email wall", desk.RunnrDemoSandbox.shouldHoldKeepScore(desk.S) === false);
check("day 0 showKeepScore stays down", desk.RunnrDemoSandbox.showKeepScore({ reason: "score" }) === false);
const urls = desk.beacons.join(" ");
check("bare land beacon", urls.indexOf("e=guest_land_bare") >= 0);
check("trial day 0 beacon", urls.indexOf("e=guest_trial_d0") >= 0);
check("sizer focus beacon", urls.indexOf("e=guest_focus_sizer") >= 0);
check("demo view still fires", urls.indexOf("e=demo_view") >= 0);

desk.RunnrDemoSandbox.onGoldScored({ ready: true, size: 10, entry: 100, stop: 90, ticker: "AAPL" });
desk.RunnrDemoSandbox.onGoldScored({ ready: true, size: 10, entry: 100, stop: 90, ticker: "AAPL" });
check("a score counts once per plan and skips the wall", desk.beacons.filter((u) => u.indexOf("e=guest_score") >= 0).length === 1 && desk.RunnrDemoSandbox.shouldHoldKeepScore(desk.S) === false);
desk.RunnrDemoSandbox.onGoldScored({ ready: true, size: 8, entry: 50, stop: 48, ticker: "NVDA" });
check("a different plan counts again", desk.beacons.filter((u) => u.indexOf("e=guest_score") >= 0).length === 2);

const demoDesk = loadStack({ search: "?demo=1", pathname: "/", hash: "" });
demoDesk.RunnrDemoSandbox.enterFreeDesk(demoDesk.S);
check("demo=1 lands on Sizer", demoDesk._page === "sizer" && demoDesk.beacons.join(" ").indexOf("e=guest_land_demo") >= 0);
check("demo=1 does not show the pitch hero", demoDesk.RunnrDemoSandbox.shouldShowSampleHero(demoDesk.S) === false);

const igDesk = loadStack({ search: "?demo=1&ig=1", pathname: "/", hash: "" });
igDesk.RunnrDemoSandbox.enterFreeDesk(igDesk.S);
check("ig params stay on Sizer", igDesk._page === "sizer" && igDesk.RunnrDemoSandbox.shouldShowIgScore(igDesk.S) === false);
check("ig land is attributed", igDesk.beacons.join(" ").indexOf("e=guest_land_ig") >= 0 && igDesk.beacons.join(" ").indexOf("e=demo_ig_land") >= 0);

const expired = loadStack({ search: "", pathname: "/", hash: "" }, function (ctx) {
  ctx.localStorage.setItem("runnr_guest_trial_v1", new Date(Date.now() - 8 * DAY).toISOString());
});
const title = { textContent: "" };
const copy = { textContent: "" };
const modal = { classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } }, querySelector() { return null; } };
expired.document.getElementById = function (id) {
  if (id === "modal-sample-keep") return modal;
  if (id === "sample-keep-title") return title;
  return null;
};
expired.document.querySelector = function (sel) {
  if (sel.indexOf("sample-keep-copy") >= 0) return copy;
  return null;
};
expired.openModal = function () { expired._wall = true; };
check("day 8+ opens the soft wall", expired.RunnrDemoSandbox.showKeepScore({ reason: "trial-ended" }) === true && expired._wall === true);
check("day 8+ holds the wall", expired.RunnrDemoSandbox.shouldHoldKeepScore(expired.S) === true);
check("day 8+ wall copy is the 7-day close", title.textContent === "7 days on the desk" && /7 days/.test(copy.textContent));
check("hit-wall beacon", expired.beacons.join(" ").indexOf("e=guest_hit_wall") >= 0);
check("hit-wall still counts as email_wall_shown", expired.beacons.join(" ").indexOf("e=email_wall_shown") >= 0);

const signed = loadStack({ search: "", pathname: "/", hash: "" }, function (ctx) {
  ctx.localStorage.setItem("runnr_api_token", "tok");
});
check("signed-in users are not put on the guest desk", signed.RunnrDemoSandbox.enterFreeDesk(signed.S) === false);
check("signed-in users do not get the guest wall hold", signed.RunnrDemoSandbox.shouldHoldKeepScore({ trades: [] }) === false);

const legacyDesk = loadStack({ search: "?demo=1&gate=legacy", pathname: "/", hash: "" });
check("legacy demo still wants the SAMPLE hero", legacyDesk.RunnrDemoSandbox.shouldShowSampleHero(legacyDesk.S) === true);
check("legacy does not auto-enter the free desk", legacyDesk.RunnrDemoSandbox.enterFreeDesk(legacyDesk.S) === false);
const legacyIg = loadStack({ search: "?demo=1&ig=1&gate=legacy", pathname: "/", hash: "" });
check("legacy ig still wants the score card", legacyIg.RunnrDemoSandbox.shouldShowIgScore(legacyIg.S) === true);

function loadTour(opts) {
  const ctx = loadGate(opts.location || { search: "", hash: "", pathname: "/" }, opts.prime);
  ctx.RunnrSync = opts.RunnrSync || { isLoggedIn: () => !!opts.loggedIn };
  ctx.RunnrDemoSandbox = { isDemoState: () => true };
  ctx.S = { trades: [] };
  vm.runInNewContext(tourSrc, ctx);
  return ctx;
}
const tourGuest = loadTour({});
check("free7 guest does not get the chip tour", tourGuest.RunnrTour.shouldShow(tourGuest.S) === false);
const tourForced = loadTour({ location: { search: "?tour=1", hash: "", pathname: "/" } });
check("tour=1 does not override free7", tourForced.RunnrTour.shouldShow({}) === false);
const tourLegacy = loadTour({ location: { search: "?gate=legacy", hash: "", pathname: "/" } });
check("legacy guest still gets the tour", tourLegacy.RunnrTour.shouldShow({}) === true);
const tourSigned = loadTour({ loggedIn: true, RunnrSync: { isLoggedIn: () => true } });
check("signed-in visit still gets the tour", tourSigned.RunnrTour.shouldShow({}) === true);

function loadIntro(opts) {
  const ctx = loadGate(opts.location || { search: "", hash: "", pathname: "/" });
  ctx.RunnrSync = { isLoggedIn: () => !!opts.loggedIn };
  vm.runInNewContext(introSrc, ctx);
  return ctx;
}
check("free7 skips the email-wall video", loadIntro({}).RunnrIntro.shouldPlayBeforeKeepScore({}) === false);
check("free7 playBeforeKeepScore does not open video", loadIntro({}).RunnrIntro.playBeforeKeepScore(function () {}) === false);
check("legacy still wants the email-wall video", loadIntro({ location: { search: "?gate=legacy", hash: "", pathname: "/" } }).RunnrIntro.shouldPlayBeforeKeepScore({}) === true);

function loadGrowth(loc) {
  const ctx = loadGate(loc || { search: "", hash: "", pathname: "/" });
  ctx.RunnrSync = { isLoggedIn: () => false, isDemoState: () => true };
  vm.runInNewContext(onboardingSrc, ctx);
  return ctx;
}
check("free7 skips the marketing hook", loadGrowth().RunnrGrowth.shouldShowHook({ trades: [{ id: 1 }, { id: 2 }] }) === false);
check("legacy still shows the marketing hook", loadGrowth({ search: "?gate=legacy", hash: "", pathname: "/" }).RunnrGrowth.shouldShowHook({ trades: [{ id: 1 }] }) === true);

const capCtx = loadGate({ search: "", pathname: "/", hash: "" });
capCtx.S = { trades: [], bal: 10000, risk: 1, sym: "€" };
capCtx.window.S = capCtx.S;
vm.runInNewContext(pretradeSrc, capCtx);
const logs = [1, 2, 3].map(function (i) {
  return { id: i, isDemo: true, source: "pretrade", instr: "AAPL", mergedAway: false };
});
check("open trial lifts the 3-plan SAMPLE cap", capCtx.RunnrPretrade.SampleQuota.atCap(logs) === false);
const capLegacy = loadGate({ search: "?gate=legacy", pathname: "/", hash: "" });
capLegacy.S = { trades: logs, bal: 10000, risk: 1, sym: "€" };
capLegacy.window.S = capLegacy.S;
vm.runInNewContext(pretradeSrc, capLegacy);
check("legacy keeps the 3-plan SAMPLE cap", capLegacy.RunnrPretrade.SampleQuota.atCap(logs) === true);

console.log("test_guest_free7: ok " + n);
