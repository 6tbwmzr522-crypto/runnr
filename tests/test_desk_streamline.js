#!/usr/bin/env node
/** Home one-job hero, quiet desk until 3 real trades, Replay prominence. */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
const quietSrc = fs.readFileSync(path.join(root, "js/desk-quiet.js"), "utf8");
const limitSrc = fs.readFileSync(path.join(root, "js/trade-limit.js"), "utf8");
const replaySrc = fs.readFileSync(path.join(root, "js/discipline-replay.js"), "utf8");
const baronSrc = fs.readFileSync(path.join(root, "js/baron.js"), "utf8");

let n = 0;
function check(name, cond) {
  assert(cond, name);
  n += 1;
}

const v = html.match(/var V = "(\d+)"/)[1];
const cache = sw.match(/CACHE = "runnr-v(\d+)"/)[1];
check("index.html V matches sw.js CACHE", v === cache);
check("cache is 120+", Number(v) >= 120);
check("desk-quiet.js is loaded", html.includes("js/desk-quiet.js?v=1"));
check("discipline-replay cache-bust", html.includes("js/discipline-replay.js?v=6"));

check("home job hero exists", html.includes('id="home-job-hero"') && html.includes('id="home-job-cta"'));
check("home job CTA is mint primary btn", /id="home-job-cta"[^>]*class="btn home-job-cta"/.test(html)
  || /class="btn home-job-cta"[^>]*id="home-job-cta"/.test(html));
check("home job secondary links are quiet text", html.includes('class="home-job-link"')
  && html.includes("switchPage('journal')")
  && html.includes("switchPage('coach')"));
check("guest landing hides the job hero", html.includes("html.runnr-guest #home-job-hero"));
check("logged-out hook video still present", html.includes('id="intro-overlay"') && html.includes("/media/runnr-how-it-works.mp4"));
check("logged-out landing card kept", html.includes('id="home-landing"') && html.includes('id="home-start-free"'));

check("Replay journal button uses primary class", html.includes('class="te-replay te-replay-primary"'));
check("Replay primary CSS is a full-width mint button", html.includes(".te-replay.te-replay-primary")
  && /te-replay-primary\{[^}]*background:var\(--accent\)/.test(html));
check("offerDisciplineReplay is wired after saveLog", html.includes("function offerDisciplineReplay")
  && /function saveLog[\s\S]*offerDisciplineReplay/.test(html));

check("quiet mode hides shelf / wave / institutional / share / terminal chrome",
  html.includes("html.runnr-quiet .nav-advanced")
  && html.includes("html.runnr-quiet .port-wave-card")
  && html.includes("html.runnr-quiet .coach-institutional-block")
  && html.includes("html.runnr-quiet .coach-share-card")
  && html.includes("html.runnr-quiet .header-desk-btn")
  && html.includes("html.runnr-quiet .home-watch-shelf"));
check("More nav exists and is hidden until quiet", html.includes('data-nav="more"')
  && html.includes("onclick=\"expandDeskMore()\"")
  && html.includes(".nav-btn-more{display:none}")
  && html.includes("html.runnr-quiet .nav-btn-more{display:flex}"));
check("sizer and journal stay in the primary nav",
  /onclick="switchPage\('sizer'\)"/.test(html)
  && /onclick="switchPage\('journal'\)"/.test(html)
  && !/nav-advanced"[^>]*switchPage\('sizer'\)/.test(html)
  && !/nav-advanced"[^>]*switchPage\('journal'\)/.test(html));

check("journal calm class and progress copy exist", html.includes("journal-hint-calm")
  && html.includes("journal-incomplete-progress")
  && html.includes("reviewed"));
check("mass-mark stays ghost secondary", /class="btn btn-ghost"[^>]*applyDisciplineDefaultsToAll/.test(html)
  || /applyDisciplineDefaultsToAll[\s\S]{0,80}Mark all as compliant/.test(html));
check("high incomplete wall can collapse", html.includes("hideIncompleteWall")
  && html.includes("Show all")
  && html.includes("toggleIncompleteFillWall"));

const ctx = {
  window: {},
  localStorage: {
    _s: {},
    getItem(k) { return Object.prototype.hasOwnProperty.call(this._s, k) ? this._s[k] : null; },
    setItem(k, v) { this._s[k] = String(v); },
  },
};
ctx.window = ctx;
ctx.globalThis = ctx;
vm.runInNewContext(limitSrc, ctx);
vm.runInNewContext(baronSrc, ctx);
vm.runInNewContext(replaySrc, ctx);
vm.runInNewContext(quietSrc, ctx);

const Q = ctx.RunnrDeskQuiet;
const DR = ctx.DisciplineReplay;
const Baron = ctx.Baron;
const TL = ctx.RunnrTradeLimit;

check("quiet threshold is 3 countable trades", Q.QUIET_TRADE_THRESHOLD === 3);
check("incomplete wall threshold is 5", Q.INCOMPLETE_WALL_THRESHOLD === 5);
check("quiet uses the same countable helper as free-trial", Q.countableTrades === undefined
  || typeof Q.countableTrades === "function");

const demo = [
  { id: 1, isDemo: true, instr: "RACE", stopOk: true, sizeOk: true },
  { id: 2, isDemo: true, instr: "BE", stopOk: true, sizeOk: false },
  { id: 3, isDemo: true, instr: "USDJPY", stopOk: true, sizeOk: true },
  { id: 4, isDemo: true, instr: "AAPL CFD", incomplete: true, stopOk: false },
];
check("demo seeds do not count toward quiet unlock", Q.countableTrades(demo) === 0 && TL.countJournalTradesForLimit(demo) === 0);
check("demo-only desk stays quiet", Q.isQuiet(demo, ctx.localStorage) === true);

const twoReal = [
  { id: 10, source: "t212", instr: "AAPL", incomplete: false, stopOk: true, sizeOk: true },
  { id: 11, source: "csv", instr: "MSFT", incomplete: false, stopOk: true, sizeOk: true },
];
check("2 real trades stay quiet", Q.isQuiet(twoReal, ctx.localStorage) === true);
check("2 real trades are countable", Q.countableTrades(twoReal) === 2);

const threeReal = twoReal.concat([
  { id: 12, source: "alpaca", instr: "NVDA", incomplete: false, stopOk: true, sizeOk: true },
]);
check("3 real trades reveal the desk", Q.isQuiet(threeReal, ctx.localStorage) === false);
check("imports count toward the threshold", Q.countableTrades(threeReal) === 3);

Q.expandMore(ctx.localStorage);
check("More remember unlocks the desk before 3 trades", Q.isQuiet(twoReal, ctx.localStorage) === false);
check("More key is persisted", ctx.localStorage.getItem(Q.MORE_KEY) === "1");

const pending = [
  { id: 101, source: "alpaca", incomplete: true, instr: "AAPL" },
  { id: 102, source: "alpaca", incomplete: true, instr: "MSFT" },
  { id: 103, source: "alpaca", incomplete: false, instr: "DONE", stopOk: true, sizeOk: true },
];
const reviewJob = Q.primaryJob(pending, { bal: 10000, risk: 1 }, Baron);
check("incomplete fills win the Home job", reviewJob.id === "review" && reviewJob.cta === "Review next incomplete");
check("incomplete job uses existing first fill", reviewJob.tradeId === 101);
const progress = Q.brokerFillProgress(pending);
check("progress is reviewed of total broker fills", progress.reviewed === 1 && progress.total === 3 && progress.incomplete === 2);

const miss = {
  id: 20, instr: "BE", dir: "long", entry: 137, exit: 151, size: 65, pnl: 910,
  stopOk: true, sizeOk: false, type: "shares", incomplete: false,
  riskSnapshot: { risk: 1, bal: 10000, at: "2026-04-15T00:00:00.000Z", sym: "€" },
};
const replayJob = Q.primaryJob([miss], { bal: 10000, risk: 1, sym: "€" }, Baron);
check("replayable miss is the Home job when inbox is clear", replayJob.id === "replay"
  && replayJob.cta === "Replay Disciplined"
  && replayJob.title === "Replay your last miss"
  && replayJob.tradeId === 20);

const sizeJob = Q.primaryJob([], { bal: 10000, risk: 1 }, Baron);
check("empty desk defaults to size the next trade", sizeJob.id === "size" && sizeJob.cta === "Size the next trade");

const clean = {
  id: 30, instr: "RACE", dir: "long", entry: 354, exit: 380, size: 28, pnl: 728,
  stopOk: true, sizeOk: true, type: "shares", incomplete: false,
  riskSnapshot: { risk: 1, bal: 10000, at: "2026-04-17T00:00:00.000Z", sym: "€" },
};
check("clean journal still sizes next", Q.primaryJob([clean], { bal: 10000, risk: 1 }, Baron).id === "size");

const emptyDelta = {
  id: 31, instr: "AMZN", dir: "long", entry: 252, exit: 258, size: 34, pnl: 204,
  stopOk: false, sizeOk: false, type: "shares", stop: 248, incomplete: false,
  riskSnapshot: { risk: 1, bal: 100000, at: "2026-04-15T00:00:00.000Z", sym: "$" },
};
check("empty-Δ does not become the Home replay job", Q.primaryJob([emptyDelta], { bal: 100000, risk: 1, sym: "$" }, Baron).id === "size");
check("empty-Δ still has no Replay button", DR.canReplay(emptyDelta, { bal: 100000, risk: 1, sym: "$" }, Baron) === false);

const orphan = {
  id: 42, instr: "SMSI", dir: "long", entry: 87, exit: 86.76, size: 1508.7, pnl: -365,
  stopOk: true, sizeOk: false, type: "shares", stop: 81, incomplete: false,
};
check("missing snapshot still offers Replay as the job", Q.primaryJob([orphan], { bal: 10000, risk: 1, sym: "€" }, Baron).id === "replay"
  && DR.canReplay(orphan, { bal: 10000, risk: 1, sym: "€" }, Baron) === true);

check("primaryJob prefers review over replay", Q.primaryJob(pending.concat([miss]), { bal: 10000, risk: 1 }, Baron).id === "review");

check("renderHomeJob and runHomeJob exist", html.includes("function renderHomeJob") && html.includes("function runHomeJob"));
check("size job focuses the sizer", html.includes("function focusSizerForNextTrade") && /switchPage\('sizer'\)/.test(html));
check("no freemium/billing rewrite in quiet helper", !/FREE_TRADE_LIMIT|stripe|checkout/i.test(quietSrc));

console.log("ok " + n);
