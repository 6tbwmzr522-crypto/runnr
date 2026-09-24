#!/usr/bin/env node
/** Light candies: one-tap Followed/Leaked/Skipped + consecutive-loss cool-down. */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const { html, sw, src } = require("./app_src").loadAppSource();
const root = path.join(__dirname, "..");
const pretradeSrc = fs.readFileSync(path.join(root, "js/pretrade.js"), "utf8");
const cooldownSrc = fs.readFileSync(path.join(root, "js/cooldown.js"), "utf8");
const baronSrc = fs.readFileSync(path.join(root, "js/baron.js"), "utf8");
const coachSrc = fs.readFileSync(path.join(root, "js/coach.js"), "utf8");
const journalSrc = fs.readFileSync(path.join(root, "js/app-journal.js"), "utf8");
const sandboxSrc = fs.readFileSync(path.join(root, "js/demo-sandbox.js"), "utf8");

let n = 0;
function check(name, cond) {
  assert(cond, name);
  n += 1;
}

const v = html.match(/var V = "(\d+)"/)[1];
const cache = sw.match(/CACHE = "runnr-v(\d+)"/)[1];
check("index.html V matches sw.js CACHE", v === cache);
check("cache is 156+", Number(v) >= 156);
check("cooldown.js is loaded before pretrade", html.indexOf("js/cooldown.js?v=2") < html.indexOf("js/pretrade.js?v=26"));
check("cool-down sheet markup exists", html.includes('id="modal-cooldown"') && html.includes("SIT ON HANDS") && html.includes("Stay flat") && html.includes("Override anyway (logs as broke cool-down)"));
check("cool-down copy is two losses", html.includes("Two losses in a row") && html.includes("SAMPLE warns softly"));
check("keep-score does not host process chips", !html.includes('id="sample-keep-process"') && !sandboxSrc.includes("sample-keep-process"));
check("keep-score email fallback still present", html.includes("Use email instead") && html.includes("/sign-in?keep=1"));
check("process chips are Followed/Leaked/Skipped", src.includes('btn("followed", "Followed")') && src.includes('btn("leaked", "Leaked")') && src.includes('btn("skipped", "Skipped")') && src.includes("HOW DID IT GO?"));
check("process caption matches mockup", src.includes("One tap. Notes optional."));
check("WIN/LOSS/BE stay on the journal path", src.includes('btn("win", "WIN")') && src.includes('btn("loss", "LOSS")'));
check("journal reuses process chips", journalSrc.includes("processButtonsHtml") && journalSrc.includes("processFlagHtml") && journalSrc.includes("data-pt-process"));
check("SAMPLE desk still paints process chips", pretradeSrc.includes("processButtonsHtml") && src.includes("HOW DID IT GO?"));
check("cool-down uses journal outcomes not broker fills", cooldownSrc.includes("consecutiveLoggedLosses") && cooldownSrc.includes("loggedOutcome") && !/alpaca|fillPrice/i.test(cooldownSrc));
check("SAMPLE is soft and signed-in is hard", cooldownSrc.includes('return "soft"') && cooldownSrc.includes('return "hard"') && cooldownSrc.includes("isLoggedIn"));

function load(opts) {
  const store = Object.assign({}, (opts && opts.store) || {});
  const ctx = {
    window: {},
    localStorage: {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
    },
    document: {
      documentElement: { dataset: {} },
      getElementById: () => null,
      addEventListener: () => {},
      readyState: "complete",
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
    setTimeout: (fn) => { ctx.timeouts = (ctx.timeouts || 0) + 1; return 0; },
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  ctx.window.S = {
    bal: 50000,
    risk: 2,
    sym: "$",
    trades: (opts && opts.trades) || [],
    pretrade: { maxRiskPct: 2, maxDailyLossPct: 5, minRR: 1.5, propDailyDDPct: 5, propMaxDDPct: 10 },
  };
  ctx.persist = function () { ctx.persisted = (ctx.persisted || 0) + 1; };
  ctx.renderJournal = function () { ctx.journalRendered = (ctx.journalRendered || 0) + 1; };
  ctx.updateHomeStats = function () { ctx.home = true; };
  ctx.showToast = function (a, b) { ctx.toast = a + " " + b; };
  ctx.sheets = [];
  ctx.openModal = function (id) { ctx.modals = (ctx.modals || []).concat(id); };
  if (opts && opts.loggedIn) {
    ctx.RunnrSync = { isLoggedIn: function () { return true; } };
    store.runnr_api_token = "t";
  }
  if (opts && opts.demo !== false) {
    ctx.RunnrDemoSandbox = {
      isDemoState: function () { return !opts.loggedIn; },
      isDemoTrade: function (t) { return !!(t && t.isDemo); },
      onSampleScored: function (row, o) { ctx.sampleScored = { row: row, opts: o }; return true; },
      onGoldScored: function () { return false; },
    };
  }
  vm.runInNewContext(baronSrc, ctx);
  vm.runInNewContext(coachSrc, ctx);
  vm.runInNewContext(cooldownSrc, ctx);
  vm.runInNewContext(pretradeSrc, ctx);
  ctx.RunnrCooldown.showSheet = function () {
    ctx.sheets.push("cooldown");
    return true;
  };
  return ctx;
}

const guest = load();
const PT = guest.RunnrPretrade;
const CD = guest.RunnrCooldown;
const now = new Date("2026-09-17T12:00:00Z");
const rails = PT.normalizeRails(guest.window.S.pretrade, guest.window.S);

const ready = PT.computePlan({
  ticker: "AAPL", dir: "long", entry: 200, stop: 190, target: 230,
}, rails, [], now);
check("ready gold plan still sizes", ready.ready === true && ready.size === 100);
const readyHtml = PT.outputHTML(ready, rails);
check("ready pending plan shows Followed/Leaked/Skipped", readyHtml.includes("Followed") && readyHtml.includes("Leaked") && readyHtml.includes("Skipped") && readyHtml.includes("HOW DID IT GO?") && readyHtml.includes("One tap. Notes optional."));
check("ready pending plan keeps sizing math", readyHtml.includes("Position Size") && readyHtml.includes("100 sh") && readyHtml.includes("Reward / Share"));
check("empty pending plan has no process chips", PT.outputHTML(PT.computePlan({ ticker: "" }, rails, [], now), rails).includes("Pending plan") && !PT.outputHTML(PT.computePlan({ ticker: "" }, rails, [], now), rails).includes("HOW DID IT GO?"));

const followed = PT.journalProcess("followed", {
  ticker: "AAPL", dir: "long", entry: 200, stop: 190, target: 230, notes: "optional",
}, rails, guest.window.S.trades, now);
check("Followed journals a plan without a long form", followed.ok && followed.row.processFlag === "followed" && followed.row.stopOk === true && followed.row.sizeOk === true && followed.row.incomplete === false);
check("Followed keeps optional notes", followed.row.notes === "optional");
check("Followed does not invent an exit fill", followed.row.exit == null && followed.row.pnl == null && !followed.row.outcome);

const sampleAapl = {
  id: 4, isDemo: true, instr: "AAPL CFD", dir: "long", entry: 198, exit: 195, size: 15,
  pnl: -45, stopOk: false, sizeOk: true, type: "cfd", date: "Apr 10", incomplete: true, seed: true,
};
const sample = load({ trades: [sampleAapl] });
const attached = sample.RunnrPretrade.journalProcess("leaked", {
  ticker: "AAPL", dir: "long", entry: 198, stop: 194, target: 214,
}, sample.RunnrPretrade.normalizeRails(sample.window.S.pretrade, sample.window.S), sample.window.S.trades, now);
check("SAMPLE Score this trade attaches to the incomplete AAPL row", attached.ok && attached.attached === true && attached.row.id === 4);
check("Leaked maps to size leak on existing flags", attached.row.processFlag === "leaked" && attached.row.sizeOk === false && attached.row.incomplete === false);
check("attach does not add a second SAMPLE log", sample.window.S.trades.length === 1);

const skipped = PT.journalProcess("skipped", {
  ticker: "MSFT", dir: "long", entry: 400, stop: 390, target: 430,
}, rails, guest.window.S.trades, now);
check("Skipped journals the pending plan without inventing a fill", skipped.ok && skipped.row.processFlag === "skipped" && skipped.row.exit == null && !skipped.row.outcome);

const losses = [
  { id: 11, outcome: "loss", instr: "NVDA" },
  { id: 12, outcome: "loss", instr: "AMD" },
  { id: 14, outcome: "win", instr: "AAPL" },
];
check("streak counts newest consecutive logged losses", CD.consecutiveLoggedLosses(losses) === 2);
check("threshold is two losses", CD.LOSS_STREAK === 2);
check("timer is mm:ss left", CD.formatLeft((14 * 60 + 32) * 1000) === "14:32 left");
check("factory P&L without outcome is not a loss streak", CD.consecutiveLoggedLosses([
  { id: 1, isDemo: true, pnl: -45, incomplete: true },
  { id: 2, isDemo: true, pnl: -120 },
  { id: 3, isDemo: true, pnl: -80 },
]) === 0);

const t0 = Date.parse("2026-09-17T12:00:00Z");
const demoCd = load({ trades: losses.slice() });
const soft = demoCd.RunnrCooldown.armIfNeeded(demoCd.window.S.trades, t0);
check("SAMPLE cool-down is warn-only", soft.mode === "soft" && soft.active === true && demoCd.RunnrCooldown.shouldBlockLog(demoCd.window.S.trades, t0) === false);
check("sheet copy is two losses for SAMPLE and signed-in", demoCd.RunnrCooldown.copyFor(soft) === "Two losses in a row. Cool-down 15 min so revenge size doesn't sneak in.");

const signed = load({ loggedIn: true, demo: false, trades: losses.slice() });
const hard = signed.RunnrCooldown.armIfNeeded(signed.window.S.trades, t0);
check("signed-in cool-down is a real gate", hard.mode === "hard" && hard.active === true && signed.RunnrCooldown.shouldBlockLog(signed.window.S.trades, t0) === true);

const blocked = signed.RunnrPretrade.logPlan({
  ticker: "META", dir: "long", entry: 500, stop: 490, target: 530,
}, signed.RunnrPretrade.normalizeRails(signed.window.S.pretrade, signed.window.S), signed.window.S.trades, now);
check("hard cool-down blocks a new log", blocked.ok === false && blocked.error === "cooldown");
check("hard cool-down opens the sheet", (signed.sheets || []).includes("cooldown"));

const over = signed.RunnrCooldown.override(t0);
check("override logs broke cool-down", over.broke === true && signed.RunnrCooldown.shouldBlockLog(signed.window.S.trades, t0) === false);
check("override stamps the latest loss", signed.window.S.trades[0].brokeCooldown === true && /broke cool-down/i.test(signed.window.S.trades[0].challengeNote));

const afterOver = signed.RunnrPretrade.logPlan({
  ticker: "META", dir: "long", entry: 500, stop: 490, target: 530,
}, signed.RunnrPretrade.normalizeRails(signed.window.S.pretrade, signed.window.S), signed.window.S.trades, now);
check("override lets them continue", afterOver.ok === true);

const two = load({ loggedIn: true, demo: false, trades: [
  { id: 21, outcome: "loss", instr: "A" },
  { id: 22, outcome: "loss", instr: "B" },
] });
const afterTwo = two.RunnrCooldown.afterOutcome(two.window.S.trades, t0);
check("second consecutive LOSS arms the sheet", afterTwo.active === true && (two.modals || []).includes("modal-cooldown"));

console.log("test_light_candies: ok " + n);
