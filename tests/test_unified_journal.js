#!/usr/bin/env node
/** One Journal: gold plans + classic book, WIN/LOSS/BE on pre-trade rows. */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const { html, sw, src } = require("./app_src").loadAppSource();
const pretradeSrc = fs.readFileSync(path.join(__dirname, "..", "js/pretrade.js"), "utf8");
const baronSrc = fs.readFileSync(path.join(__dirname, "..", "js/baron.js"), "utf8");
const coachSrc = fs.readFileSync(path.join(__dirname, "..", "js/coach.js"), "utf8");
const journalSrc = fs.readFileSync(path.join(__dirname, "..", "js/app-journal.js"), "utf8");

let n = 0;
function check(name, cond) {
  assert(cond, name);
  n += 1;
}

const v = html.match(/var V = "(\d+)"/)[1];
const cache = sw.match(/CACHE = "runnr-v(\d+)"/)[1];
check("index.html V matches sw.js CACHE", v === cache);
check("cache is 143+", Number(v) >= 143);

check("bottom-nav journal page is the book", html.includes('id="page-journal"') && html.includes("switchPage('journal')"));
check("unified filters live on page-journal", /id="page-journal"[\s\S]*data-journal-filter="all"[\s\S]*data-journal-filter="approved"[\s\S]*data-journal-filter="blocked"/.test(html));
check("gold JOURNAL / view all go to the unified book", src.includes("openUnifiedJournal") && /#pt-open-journal[\s\S]{0,80}openUnifiedJournal/.test(src) && /#pt-view-all[\s\S]{0,80}openUnifiedJournal/.test(src));
check("no standalone gold trade.journal", !src.includes("trade.journal") && !src.includes("id=\"pt-j-list\"") && !src.includes("data-pt-filter="));
check("classic journal reuses pretrade outcome HTML", journalSrc.includes("outcomeButtonsHtml") && journalSrc.includes("setOutcome") && journalSrc.includes("isPretradeRow"));
check("#desk-journal aliases instead of opening gold", src.includes("wantsUnifiedJournal") && src.includes('hash === "desk-journal"') && src.includes('hash === "pretrade-journal"'));
check("boot routes journal hashes to the unified page", /wantsUnifiedJournal[\s\S]{0,180}openUnifiedJournal/.test(src));
check("incomplete review still lives on the classic journal", journalSrc.includes("reviewNextIncompleteFill") && journalSrc.includes("flag-incomplete"));

function load() {
  const store = {};
  const loc = { pathname: "/", search: "?demo=1", hash: "#pretrade" };
  const ctx = {
    window: {},
    localStorage: {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
    },
    location: loc,
    history: {
      replaceState: (_s, _t, url) => {
        const u = String(url || "");
        const hash = u.includes("#") ? "#" + u.split("#")[1] : "";
        loc.hash = hash;
        ctx.hashWrites = (ctx.hashWrites || []).concat(hash);
      },
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
    trades: [
      { id: 1, isDemo: true, instr: "RACE", dir: "long", entry: 354, exit: 372, size: 28, pnl: 504, stopOk: true, sizeOk: true, type: "shares", date: "Apr 12" },
      { id: 2, isDemo: true, instr: "BE", dir: "long", entry: 137, exit: 151, size: 65, pnl: 910, stopOk: true, sizeOk: false, type: "shares", date: "Apr 15" },
    ],
    pretrade: { maxRiskPct: 2, maxDailyLossPct: 5, minRR: 1.5, propDailyDDPct: 5, propMaxDDPct: 10 },
  };
  ctx.persist = function () { ctx.persisted = true; };
  ctx.renderJournal = function () { ctx.journalRendered = (ctx.journalRendered || 0) + 1; };
  ctx.updateHomeStats = function () { ctx.home = true; };
  ctx.showToast = function (a, b) { ctx.toast = a + " " + b; };
  ctx.switchPage = function (key) { ctx.switched = key; };
  vm.runInNewContext(baronSrc, ctx);
  vm.runInNewContext(coachSrc, ctx);
  vm.runInNewContext(pretradeSrc, ctx);
  return ctx;
}

const ctx = load();
const PT = ctx.RunnrPretrade;
const now = new Date("2026-09-14T12:00:00Z");
const rails = PT.normalizeRails(ctx.window.S.pretrade, ctx.window.S);

const blocked = PT.logPlan({
  ticker: "NVDA", dir: "long", entry: 220, stop: 210, target: 231,
}, rails, ctx.window.S.trades, now);
check("blocked plan still journals as BLOCKED", blocked.ok && blocked.row.planStatus === "blocked" && blocked.row.sizeOk === false);

const approved = PT.logPlan({
  ticker: "AAPL", dir: "long", entry: 200, stop: 190, target: 230,
}, rails, ctx.window.S.trades, now);
check("approved plan journals as APPROVED", approved.ok && approved.row.planStatus === "approved");

const all = PT.filterJournalBook(ctx.window.S.trades, "all");
check("ALL shows SAMPLE factory rows and pre-trade plans", all.some((t) => t.instr === "RACE") && all.some((t) => t.source === "pretrade"));
const onlyOk = PT.filterJournalBook(ctx.window.S.trades, "approved");
const onlyNo = PT.filterJournalBook(ctx.window.S.trades, "blocked");
check("APPROVED is the logged AAPL plan", onlyOk.length === 1 && onlyOk[0].instr === "AAPL");
check("BLOCKED is the logged NVDA plan, not SAMPLE BE", onlyNo.length === 1 && onlyNo[0].instr === "NVDA");

check("factory SAMPLE rows do not get WIN/LOSS/BE", PT.isPretradeRow(all.find((t) => t.instr === "RACE")) === false);

const planBtns = PT.outcomeButtonsHtml(approved.row);
check("pre-trade rows reuse WIN/LOSS/BE + RESET", planBtns.includes("WIN") && planBtns.includes("LOSS") && planBtns.includes("BE") && planBtns.includes("RESET") && planBtns.includes('data-pt-out="win"'));

PT.setOutcome(approved.row.id, "win");
check("WIN on the unified path uses the target", approved.row.outcome === "win" && approved.row.exit === 230);
check("setOutcome refreshes the classic journal", ctx.journalRendered >= 1);

PT.open("journal");
check("gold JOURNAL open() switches to page-journal", ctx.switched === "journal");
check("gold JOURNAL aliases hash to #journal", (ctx.hashWrites || []).includes("#journal") || ctx.location.hash === "#journal");

check("#desk-journal is an alias", PT.wantsUnifiedJournal({ search: "", hash: "#desk-journal" }) === true);
check("#desk-journal is not gold sizer", PT.wantsGold({ search: "", hash: "#desk-journal" }) === false);
check("?desk=journal aliases too", PT.wantsUnifiedJournal({ search: "?desk=journal", hash: "" }) === true);

const score = ctx.CoachEngine.disciplineScore(ctx.window.S.trades);
check("blocked log still drops the size score", score.sizePct < 100);

console.log("test_unified_journal: ok " + n);
