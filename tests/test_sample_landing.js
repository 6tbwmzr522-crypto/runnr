#!/usr/bin/env node
/** SAMPLE-first TikTok landing: stable bio URL, first-15s hero, signup after aha. */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const { root, html, sw, css } = require("./app_src").loadAppSource();
const sandboxSrc = fs.readFileSync(path.join(root, "js/demo-sandbox.js"), "utf8");
const coachSrc = fs.readFileSync(path.join(root, "js/coach.js"), "utf8");
const baronSrc = fs.readFileSync(path.join(root, "js/baron.js"), "utf8");
const quietSrc = fs.readFileSync(path.join(root, "js/desk-quiet.js"), "utf8");
const limitSrc = fs.readFileSync(path.join(root, "js/trade-limit.js"), "utf8");
const replaySrc = fs.readFileSync(path.join(root, "js/discipline-replay.js"), "utf8");
const journalSrc = fs.readFileSync(path.join(root, "js/app-journal.js"), "utf8");
const navSrc = fs.readFileSync(path.join(root, "js/app-nav.js"), "utf8");
const onboardingSrc = fs.readFileSync(path.join(root, "js/onboarding.js"), "utf8");
const pretradeSrc = fs.readFileSync(path.join(root, "js/pretrade.js"), "utf8");
const bootSrc = fs.readFileSync(path.join(root, "js/app-boot.js"), "utf8");
const stats = fs.readFileSync(path.join(root, "stats.html"), "utf8");
const login = fs.readFileSync(path.join(root, "login.html"), "utf8");
const sampleAlias = fs.readFileSync(path.join(root, "sample/index.html"), "utf8");
const pagesYml = fs.readFileSync(path.join(root, ".github/workflows/pages.yml"), "utf8");

let n = 0;
function check(name, cond) {
  assert(cond, name);
  n += 1;
}

const v = html.match(/var V = "(\d+)"/)[1];
const cache = sw.match(/CACHE = "runnr-v(\d+)"/)[1];
check("index.html V matches sw.js CACHE", v === cache);
check("cache is 139+", Number(v) >= 139);
check("demo-sandbox cache-bust", html.includes("js/demo-sandbox.js?v=12"));
check("pages.css cache-bust", html.includes("css/pages.css?v=7"));

check("stats Guest SAMPLE funnel section", stats.includes("Guest SAMPLE funnel") && stats.includes("email_wall") && stats.includes("guest-demo-view"));
check("stats clarifies signed-in accounts are not visits", stats.includes("Signed-in accounts (not visits)"));
check("sandbox beacons email wall on keep-score open", sandboxSrc.includes("email_wall_shown") && sandboxSrc.includes("email_wall_locked") && sandboxSrc.includes("WALL_KEY"));
check("bio URL is documented on stats", stats.includes("https://runnr.fyi/?demo=1") && stats.includes("tiktok-bio-url"));
check("stats does not point TikTok bio at login.html", /TikTok bio[\s\S]{0,400}login\.html/.test(stats) === false || /not login\.html/.test(stats));
check("stats lists /sample and #sample aliases", stats.includes("https://runnr.fyi/sample") && stats.includes("https://runnr.fyi/#sample"));
check("/sample alias redirects to ?demo=1", sampleAlias.includes('url=/?demo=1') && sampleAlias.includes('location.replace("/?demo=1")'));
check("Pages deploy copies sample/", pagesYml.includes("sample _site") || pagesYml.includes("cp -r") && pagesYml.includes("sample"));

check("first-paint detects demo=1 and #sample and /sample", html.includes("demo=1") && html.includes("sample") && html.includes("runnr-sample-landing"));
check("sample landing skips the signup hook", /runnr-sample-landing[\s\S]*runnr_hook_v1|runnr_hook_v1[\s\S]*runnr-sample-landing/.test(html));

const heroStart = html.indexOf('id="sample-hero"');
check("SAMPLE hero markup exists", heroStart > 0);
const hero = html.slice(heroStart, html.indexOf('id="intro-overlay"'));
check("hero headline is discipline not P&L", /Discipline, not P&amp;L/.test(hero));
check("hero shows Alex Runner SAMPLE", hero.includes("Alex Runner") && hero.includes("SAMPLE"));
check("hero primary CTA is Score this trade", hero.includes('id="sample-score-cta"') && hero.includes("Score this trade"));
check("hero does not lead with Sign up or Connect broker", !/Sign up/.test(hero) && !/Connect broker/.test(hero) && !/href="\/login\.html"/.test(hero) && !/Alpaca/.test(hero) && !/T212/.test(hero));
check("hero proof does not invent score/P&amp;L", !/80%/.test(hero) && !/2,528/.test(hero) && !/2,503/.test(hero) && !/1,190/.test(hero));
check("keep-score sheet is gated after aha", html.includes('id="modal-sample-keep"') && html.includes("Keep this score — save with email") && html.includes("/login.html?keep=1"));
check("keep-score does not lead with Alpaca/T212", !/Alpaca|T212|Trading 212/.test(html.slice(html.indexOf('id="modal-sample-keep"'), html.indexOf('id="modal-share"'))));
check("login keep=1 copy", login.includes("keep=1") && login.includes("Keep this score — save with email"));
check("TikTok CTA copy points at SAMPLE URL", html.includes("runnr.fyi/?demo=1") && /TikTok bio is[\s\S]*demo=1/.test(html));

function freshCtx(loc) {
  const store = {};
  const session = {};
  const ctx = {
    window: {},
    localStorage: {
      getItem(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
      setItem(k, v) { store[k] = String(v); },
      removeItem(k) { delete store[k]; },
    },
    sessionStorage: {
      getItem(k) { return Object.prototype.hasOwnProperty.call(session, k) ? session[k] : null; },
      setItem(k, v) { session[k] = String(v); },
    },
    location: loc || { hostname: "localhost", search: "", pathname: "/", hash: "", href: "http://localhost/" },
    navigator: { userAgent: "node", sendBeacon() { return true; } },
    document: {
      readyState: "complete",
      getElementById() { return null; },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      documentElement: { classList: { toggle() {}, add() {}, remove() {} } },
      addEventListener() {},
    },
    console,
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  return ctx;
}

function loadSandbox(loc) {
  const ctx = freshCtx(loc);
  vm.runInNewContext(baronSrc, ctx);
  vm.runInNewContext(coachSrc, ctx);
  vm.runInNewContext(limitSrc, ctx);
  vm.runInNewContext(replaySrc, ctx);
  vm.runInNewContext(sandboxSrc, ctx);
  vm.runInNewContext(quietSrc, ctx);
  return ctx;
}

const bio = loadSandbox({ search: "?demo=1", pathname: "/", hash: "", href: "http://localhost/?demo=1" });
const SB = bio.RunnrDemoSandbox;
check("BIO_URL is the TikTok bio", SB.BIO_URL === "https://runnr.fyi/?demo=1");
check("ALIAS_PATH is /sample", SB.ALIAS_PATH === "/sample");
check("?demo=1 is a sample landing", SB.isSampleLandingLocation({ search: "?demo=1", pathname: "/", hash: "" }) === true);
check("#sample is a sample landing", SB.isSampleLandingLocation({ search: "", pathname: "/", hash: "#sample" }) === true);
check("/sample is a sample landing", SB.isSampleLandingLocation({ search: "", pathname: "/sample", hash: "" }) === true);
check("/sample/ is a sample landing", SB.isSampleLandingLocation({ search: "", pathname: "/sample/", hash: "" }) === true);
check("bare / is not a sample landing", SB.isSampleLandingLocation({ search: "", pathname: "/", hash: "" }) === false);
check("queryForce follows the same aliases", SB.queryForce() === true);

const hashCtx = loadSandbox({ search: "", pathname: "/", hash: "#sample", href: "http://localhost/#sample" });
check("#sample queryForce is true", hashCtx.RunnrDemoSandbox.queryForce() === true);

const pathCtx = loadSandbox({ search: "", pathname: "/sample", hash: "", href: "http://localhost/sample" });
check("/sample queryForce is true", pathCtx.RunnrDemoSandbox.queryForce() === true);

const book = SB.factoryTrades(new Date("2026-09-09T12:00:00.000Z"));
const row = SB.firstIncompleteSample({ trades: book });
check("first incomplete SAMPLE is AAPL CFD", row && row.instr === "AAPL CFD" && row.incomplete === true && row.isDemo === true);
check("AAPL CFD stays isDemo", row.isDemo === true);

const proof = SB.proofModel(new Date("2026-09-09T12:00:00.000Z"));
check("hero numbers come from the factory book", Number.isFinite(proof.discPnl) && Number.isFinite(proof.undiscPnl) && proof.overall >= 78);
check("do not invent the 2503/190 pair", proof.discPnl !== 2503 && proof.undiscPnl !== -190);

const guest = { bal: 10000, risk: 1, sym: "€", trades: book, watchlist: SB.factoryWatchlist() };
check("sample hero shows for forced guest demo", SB.shouldShowSampleHero(guest) === true);
check("aha starts gated", SB.hasAha() === false);

const real = { bal: 18400, trades: [{ id: 77, instr: "AAPL", pnl: 20, source: "csv" }], watchlist: [] };
check("real book is never a sample hero", SB.shouldShowSampleHero(real) === false);
check("real book is never overwritten", SB.shouldApply(real) === false);

const signed = loadSandbox({ search: "?demo=1", pathname: "/", hash: "" });
signed.localStorage.setItem("runnr_api_token", "tok");
const signedThin = { bal: 10000, trades: signed.RunnrDemoSandbox.classicSeeds(), watchlist: [] };
check("signed-in book is not hydrated", signed.RunnrDemoSandbox.shouldApply(signedThin) === false);
check("signed-in users skip sample hero", signed.RunnrDemoSandbox.shouldShowSampleHero(signedThin) === false);

SB.markAha("score");
check("aha is stored after one SAMPLE action", SB.hasAha() === true);
check("hero hides after aha", SB.shouldShowSampleHero(guest) === false);

const Q = bio.RunnrDeskQuiet;
const sampleJob = Q.primaryJob(book, guest, bio.Baron);
check("demo desk job is Score this trade", sampleJob.id === "sample-score" && sampleJob.cta === "Score this trade" && sampleJob.tradeId === row.id);

check("saveLog notifies SAMPLE aha", journalSrc.includes("onSampleScored"));
check("gold logPlan notifies SAMPLE aha", pretradeSrc.includes("onSampleScored"));
check("gold live score notifies SAMPLE aha", pretradeSrc.includes("onGoldScored") && pretradeSrc.includes("maybeSealGoldScore"));
check("3-plan cap wall also seals", /function showSampleCapWall[\s\S]*markSeal/.test(pretradeSrc));
check("nav runs sample-score job", navSrc.includes("sample-score") && navSrc.includes("openScoreTrade"));
check("onboarding skips wizard on sample aliases", onboardingSrc.includes("queryForce") && onboardingSrc.includes('get("demo") === "1"'));
check("keep-score href is email not broker", SB.KEEP_HREF === "/login.html?keep=1");
check("keep-score lock CSS hides dismiss", css.includes("sample-keep-locked") && css.includes("sample-keep-dismiss"));
check("closeModal holds sealed SAMPLE keep-score", bootSrc.includes("shouldHoldKeepScore") && bootSrc.includes("modal-sample-keep"));
check("score CTA source does not open the journal editor", /function openScoreTrade[\s\S]*function onSampleScored/.test(sandboxSrc) && !/function openScoreTrade[\s\S]*openTradeEditor/.test(sandboxSrc));

const primed = SB.sampleScorePrime({ trades: book, watchlist: SB.factoryWatchlist() });
check("score CTA primes AAPL from the SAMPLE row", primed.ticker === "AAPL" && Number(primed.entry) === 198 && Number(primed.stop) === 194 && primed.dir === "long");

const gold = loadSandbox({ search: "?demo=1", pathname: "/", hash: "", href: "http://localhost/?demo=1" });
gold.S = { trades: book, watchlist: SB.factoryWatchlist(), bal: 10000, risk: 1, sym: "€" };
gold.opened = [];
gold.primed = null;
gold.journalEditor = false;
gold.page = "";
gold.RunnrPretrade = {
  prime(input) { gold.primed = input; return input; },
  open(which) { gold.opened.push(which || "desk"); },
};
gold.openTradeEditor = function () { gold.journalEditor = true; };
gold.switchPage = function (k) { gold.page = k; };
const openedGold = gold.RunnrDemoSandbox.openScoreTrade(gold.S);
check("Home/hero Score this trade opens the gold sizer", openedGold === true && gold.opened[0] === "desk");
check("gold sizer is primed with AAPL SAMPLE numbers", gold.primed && gold.primed.ticker === "AAPL" && Number(gold.primed.entry) === 198 && Number(gold.primed.stop) === 194);
check("Score this trade does not open the journal editor", gold.journalEditor === false && gold.page !== "journal");
check("opening the gold sizer does not seal yet", gold.RunnrDemoSandbox.hasSeal() !== true);

check("seal starts off", SB.hasSeal() !== true);
check("pending gold plan is not a score", SB.isReadyGoldScore({ ready: false, size: 0, entry: 0, stop: 0 }) === false);
check("sample-locked plan is not a gold score", SB.isReadyGoldScore({ ready: false, size: 0, sampleLocked: true }) === false);
check("ready gold plan is a score", SB.isReadyGoldScore({ ready: true, size: 25, entry: 198, stop: 194 }) === true);
check("blocked-but-sized gold plan is still a score", SB.isReadyGoldScore({ ready: true, blocked: true, size: 100, entry: 220, stop: 210 }) === true);

const skipped = loadSandbox({ search: "?demo=1", pathname: "/", hash: "", href: "http://localhost/?demo=1" });
skipped.sessionStorage.setItem("runnr_sample_hero_v1", "done");
check("hero skip is not the aha seal", skipped.RunnrDemoSandbox.hasSeal() !== true && skipped.RunnrDemoSandbox.hasAha() === false);
check("hero skip source does not seal", /sample-hero-skip[\s\S]*markHeroDismissed/.test(sandboxSrc) && !/sample-hero-skip[\s\S]{0,400}markSeal/.test(sandboxSrc));

const scoredGuest = loadSandbox({ search: "?demo=1", pathname: "/", hash: "", href: "http://localhost/?demo=1" });
scoredGuest.S = { trades: book, watchlist: SB.factoryWatchlist(), bal: 10000, risk: 1, sym: "€" };
check("pending compute does not seal", scoredGuest.RunnrDemoSandbox.onGoldScored({ ready: false, size: 0 }) === false);
check("first SAMPLE gold score seals the guest", scoredGuest.RunnrDemoSandbox.onGoldScored({ ready: true, size: 25, entry: 198, stop: 194 }, { reason: "score" }) === true);
check("seal persists after gold score", scoredGuest.RunnrDemoSandbox.hasSeal() === true && scoredGuest.RunnrDemoSandbox.hasAha() === true);
check("sealed guest holds keep-score after gold score", scoredGuest.RunnrDemoSandbox.shouldHoldKeepScore() === true);
scoredGuest.RunnrDemoSandbox.hideKeepScore();
check("hideKeepScore cannot drop a gold-score seal", scoredGuest.RunnrDemoSandbox.hasSeal() === true && scoredGuest.RunnrDemoSandbox.shouldHoldKeepScore() === true);
check("later gold scores stay sealed without dropping the hold", scoredGuest.RunnrDemoSandbox.onGoldScored({ ready: true, size: 10, entry: 100, stop: 90 }) === true && scoredGuest.RunnrDemoSandbox.shouldHoldKeepScore() === true);

const delayed = loadSandbox({ search: "?demo=1", pathname: "/", hash: "", href: "http://localhost/?demo=1" });
delayed.S = { trades: book, watchlist: SB.factoryWatchlist(), bal: 10000, risk: 1, sym: "€" };
const delays = [];
delayed.setTimeout = function (fn, ms) { delays.push(ms); delayed.queuedKeep = fn; return 1; };
check("first gold score can delay the wall paint", delayed.RunnrDemoSandbox.onGoldScored({ ready: true, size: 25, entry: 198, stop: 194 }, { delayMs: 900 }) === true);
check("delay does not wait to seal", delayed.RunnrDemoSandbox.hasSeal() === true && delays[0] === 900 && delayed.RunnrDemoSandbox.shouldHoldKeepScore() === true);

const loggedGuest = loadSandbox({ search: "?demo=1", pathname: "/", hash: "", href: "http://localhost/?demo=1" });
loggedGuest.S = { trades: book, watchlist: SB.factoryWatchlist(), bal: 10000, risk: 1, sym: "€" };
const goldRow = { id: 99, isDemo: true, source: "pretrade", instr: "AAPL", incomplete: false };
check("first SAMPLE gold log seals the guest", loggedGuest.RunnrDemoSandbox.onSampleScored(goldRow, { prompt: false }) === true);
check("seal persists after gold log", loggedGuest.RunnrDemoSandbox.hasSeal() === true && loggedGuest.RunnrDemoSandbox.hasAha() === true);
check("sealed guest holds keep-score", loggedGuest.RunnrDemoSandbox.shouldHoldKeepScore() === true);
loggedGuest.RunnrDemoSandbox.hideKeepScore();
check("hideKeepScore cannot drop the seal", loggedGuest.RunnrDemoSandbox.hasSeal() === true && loggedGuest.RunnrDemoSandbox.shouldHoldKeepScore() === true);

check("signed-in score does not seal", signed.RunnrDemoSandbox.onSampleScored(goldRow) === false);
check("signed-in gold compute does not seal", signed.RunnrDemoSandbox.onGoldScored({ ready: true, size: 25, entry: 198, stop: 194 }) === false);
check("signed-in does not hold keep-score", signed.RunnrDemoSandbox.shouldHoldKeepScore() === false);

const realGuest = loadSandbox({ search: "?demo=1", pathname: "/", hash: "", href: "http://localhost/?demo=1" });
realGuest.localStorage.setItem("runnr_sample_seal_v1", "1");
check("real book does not hold keep-score", realGuest.RunnrDemoSandbox.shouldHoldKeepScore(real) === false);

console.log("test_sample_landing: ok " + n);
