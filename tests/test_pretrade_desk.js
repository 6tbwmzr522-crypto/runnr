#!/usr/bin/env node
/** Gold pre-trade desk: size → LOG TRADE → WIN/LOSS/BE, blocked drops score. */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const { html, sw, css, src } = require("./app_src").loadAppSource();
const pretradeSrc = fs.readFileSync(path.join(__dirname, "..", "js/pretrade.js"), "utf8");
const baronSrc = fs.readFileSync(path.join(__dirname, "..", "js/baron.js"), "utf8");
const coachSrc = fs.readFileSync(path.join(__dirname, "..", "js/coach.js"), "utf8");

let n = 0;
function check(name, cond) {
  assert(cond, name);
  n += 1;
}

const v = html.match(/var V = "(\d+)"/)[1];
const cache = sw.match(/CACHE = "runnr-v(\d+)"/)[1];
check("index.html V matches sw.js CACHE", v === cache);
check("cache is 142+", Number(v) >= 142);
check("pretrade.js is loaded", html.includes("js/pretrade.js?v=5"));
check("pretrade.css is loaded", html.includes("css/pretrade.css?v=2"));
check("gold mounts in pretrade-root, not desk-root hijack", html.includes('id="pretrade-root"') && src.includes('getElementById("pretrade-root")'));
check("legacy CFD sizer stays in the page, hidden", html.includes("CFD / Forex Position Sizer") && html.includes('id="legacy-sizer"') && css.includes("#legacy-sizer{display:none"));
check("desk still opens via RunnrDesk.open", html.includes('data-nav="desk" onclick="RunnrDesk.open()"'));
check("gold tokens stay on the desk", /--bg:\s*#080c12/.test(css) && /--gold:\s*#C9A96E/.test(css));
check("two-column sizer is form + computed output", css.includes(".pt-sizer") && css.includes("grid-template-columns:minmax(0,1fr) minmax(220px,0.92fr)"));
check("guardrails sit beside the sizer", css.includes(".pt-split") && css.includes("minmax(280px,0.9fr)"));
check("blocked banner keeps numbers visible", src.includes("pt-blocked") && src.includes("✕ BLOCKED"));
check("unified journal filters exist", html.includes('data-journal-filter="all"') && html.includes('data-journal-filter="approved"') && html.includes('data-journal-filter="blocked"'));
check("outcome buttons exist", src.includes('btn("win", "WIN")') && src.includes('btn("loss", "LOSS")') && src.includes('btn("be", "BE")') && src.includes('data-pt-out="reset"'));
check("SAMPLE visitors can open the header terminal", css.includes("html.runnr-demo #header .header-desk-btn"));
check("log job opens the gold sizer, not Terminal", /job\.id === 'log'[\s\S]{0,280}RunnrPretrade\.open/.test(src)
  && !/job\.id === 'log'[\s\S]{0,280}RunnrDesk\.open/.test(src));
check("sizer switchPage enters pretrade", /key === 'sizer'[\s\S]*RunnrPretrade\.enter/.test(src));
check("demo logs skip the journal cap", /if \(!draft\.isDemo && !canAddJournalTrade/.test(src));
check("#desk stays the market terminal", /hash === "desk" \|\| hash === "terminal"/.test(src) && src.includes("wantsMarketDesk"));
check("#pretrade and #sizer open gold", src.includes('hash === "pretrade"') && src.includes('hash === "sizer"'));
check("#desk-journal aliases to the unified journal", src.includes('hash === "desk-journal"') && src.includes("wantsUnifiedJournal") && src.includes("openUnifiedJournal"));

function load() {
  const store = {};
  const ctx = {
    window: {},
    localStorage: {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
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
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  ctx.window.S = {
    bal: 50000,
    risk: 2,
    sym: "$",
    trades: [],
    pretrade: { maxRiskPct: 2, maxDailyLossPct: 5, minRR: 1.5, propDailyDDPct: 5, propMaxDDPct: 10 },
  };
  ctx.persist = function () { ctx.persisted = true; };
  ctx.renderJournal = function () { ctx.journalRendered = true; };
  ctx.updateHomeStats = function () { ctx.home = true; };
  ctx.showToast = function (a, b) { ctx.toast = a + " " + b; };
  vm.runInNewContext(baronSrc, ctx);
  vm.runInNewContext(coachSrc, ctx);
  vm.runInNewContext(pretradeSrc, ctx);
  return ctx;
}

const ctx = load();
const PT = ctx.RunnrPretrade;
const rails = PT.normalizeRails(ctx.window.S.pretrade, ctx.window.S);
check("rails default to the gold mock percents", rails.maxRiskPct === 2 && rails.minRR === 1.5 && rails.maxDailyLossPct === 5);

const now = new Date("2026-09-14T12:00:00Z");
const aapl = PT.computePlan({
  ticker: "AAPL", dir: "long", entry: 200, stop: 190, target: 230,
}, rails, [], now);
check("2% of 50k sizes 100 shares at $10 risk", aapl.size === 100 && aapl.totalRisk === 1000);
check("AAPL 3R plan is approved", aapl.ready === true && aapl.blocked === false && Math.abs(aapl.rr - 3) < 1e-9);

const nvidia = PT.computePlan({
  ticker: "NVDA", dir: "long", entry: 220, stop: 210, target: 231,
}, rails, [], now);
check("NVDA numbers stay visible when blocked", nvidia.size === 100 && nvidia.totalRisk === 1000 && nvidia.rewardPerShare === 11);
check("R:R 1.10 is blocked below 1.50", nvidia.blocked === true && nvidia.reasons.some((r) => /1\.10/.test(r) && /1\.50/.test(r)));

const logged = PT.logPlan({
  ticker: "NVDA", dir: "long", entry: 220, stop: 210, target: 231,
}, rails, ctx.window.S.trades, now);
check("blocked plan still journals", logged.ok === true && logged.row.planStatus === "blocked" && logged.row.sizeOk === false);
check("blocked log is a SAMPLE/manual demo row for guests", logged.row.isDemo === true && logged.row.source === "pretrade");

const scoreAfter = ctx.CoachEngine.disciplineScore(ctx.window.S.trades);
check("blocked log drops size in the score", scoreAfter.sizePct === 0 && scoreAfter.overall < 100);

const okLog = PT.logPlan({
  ticker: "AAPL", dir: "long", entry: 200, stop: 190, target: 230,
}, rails, ctx.window.S.trades, now);
check("approved plan journals as APPROVED", okLog.ok === true && okLog.row.planStatus === "approved" && okLog.row.sizeOk === true);

PT.setOutcome(okLog.row.id, "win");
check("WIN uses the target as exit", okLog.row.outcome === "win" && okLog.row.exit === 230);
check("WIN is a closed trade", ctx.Baron.isOpenTrade(okLog.row) === false);

PT.setOutcome(logged.row.id, "loss");
check("LOSS uses the stop as exit", logged.row.outcome === "loss" && logged.row.exit === 210);

PT.setOutcome(okLog.row.id, "be");
check("BE keeps entry=exit without counting as open", okLog.row.outcome === "be" && okLog.row.exit === 200 && ctx.Baron.isOpenTrade(okLog.row) === false && okLog.row.pnl === 0);

PT.setOutcome(okLog.row.id, "reset");
check("RESET clears the outcome", !okLog.row.outcome && ctx.Baron.isOpenTrade(okLog.row) === true);

const mix = PT.disciplineMix(ctx.window.S.trades);
check("desk discipline is approved / total plans", mix.approved === 1 && mix.blocked === 1 && mix.total === 2 && mix.pct === 50);

const edge = PT.edgeFromTrades(ctx.window.S.trades);
check("edge waits for marked outcomes", edge.hasOutcomes === true && edge.losses === 1);

const factoryLeak = { id: 9, isDemo: true, instr: "BE", sizeOk: false, source: "manual" };
const book = [factoryLeak].concat(ctx.window.S.trades);
check("ALL journal keeps SAMPLE rows and plans", PT.filterJournalBook(book, "all").length === 3);
check("APPROVED filter is pre-trade plans only", PT.filterJournalBook(book, "approved").map((t) => t.instr).join() === "AAPL");
check("BLOCKED filter ignores SAMPLE size-fail rows", PT.filterJournalBook(book, "blocked").map((t) => t.instr).join() === "NVDA");
check("plan rows expose WIN/LOSS/BE", PT.outcomeButtonsHtml(okLog.row).includes(">WIN<") && PT.outcomeButtonsHtml(okLog.row).includes(">LOSS<") && PT.outcomeButtonsHtml(okLog.row).includes(">BE<"));
check("SAMPLE factory rows are not pre-trade plans", PT.isPretradeRow(factoryLeak) === false);

const daily = PT.computePlan({
  ticker: "TSLA", dir: "long", entry: 100, stop: 90, target: 160,
}, rails, ctx.window.S.trades, now);
check("today's logged risk can block the next plan", daily.blocked === true && daily.reasons.some((r) => /daily loss/i.test(r)));

const sampleToday = PT.todayRisked([
  { id: 1, isDemo: true, instr: "RACE", entry: 354, stop: 338, size: 28, dateKey: "2026-09-14" },
], now);
check("SAMPLE factory rows do not eat today's pretrade budget", sampleToday === 0);

check("factory rows without a target do not invent R:R", PT.rrOf({ instr: "RACE", entry: 354, stop: 338, size: 28 }) === 0);

check("#desk and ?desk=1 stay the market terminal", PT.wantsMarketDesk({ search: "?demo=1&desk=1", hash: "" }) === true);
check("#desk is not gold", PT.wantsGold({ search: "", hash: "#desk" }) === false);
check("#pretrade opens the gold desk", PT.wantsGold({ search: "?demo=1", hash: "#pretrade" }) === true);
check("#sizer opens gold", PT.wantsGold({ search: "", hash: "#sizer" }) === true);
check("#desk-journal is not a second gold journal", PT.wantsGold({ search: "", hash: "#desk-journal" }) === false);
check("#desk-journal aliases to the unified journal", PT.wantsUnifiedJournal({ search: "", hash: "#desk-journal" }) === true);
check("#pretrade-journal aliases to the unified journal", PT.wantsUnifiedJournal({ search: "", hash: "#pretrade-journal" }) === true);
check("#journal is the unified book", PT.wantsUnifiedJournal({ search: "", hash: "#journal" }) === true);
check("?pretrade=1 opens gold", PT.wantsGold({ search: "?demo=1&pretrade=1", hash: "" }) === true);

ctx.switchPage = function (key) { ctx.switched = key; };
PT.open();
check("pretrade open() switches to sizer, not desk", ctx.switched === "sizer");
PT.open("journal");
check("pretrade open(journal) lands on the unified journal", ctx.switched === "journal");

console.log("test_pretrade_desk: ok " + n);
