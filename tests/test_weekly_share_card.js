#!/usr/bin/env node
/** Weekly discipline share card — loud runnr.fyi footer, real journal numbers. */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
const coachSrc = fs.readFileSync(path.join(root, "js/coach.js"), "utf8");
const obSrc = fs.readFileSync(path.join(root, "js/onboarding.js"), "utf8");

let n = 0;
function check(name, cond) {
  assert(cond, name);
  n += 1;
}

const v = html.match(/var V = "(\d+)"/)[1];
const cache = sw.match(/CACHE = "runnr-v(\d+)"/)[1];
check("index.html V matches sw.js CACHE", v === cache);
check("cache is 124+", Number(v) >= 124);
check("coach.js cache-busted", html.includes("js/coach.js?v=27"));
check("onboarding.js cache-busted", html.includes("js/onboarding.js?v=31"));
check("weekly canvas is taller than the score card", html.includes('id="share-canvas" width="360" height="700"'));
check("weekly / score toggle exists", html.includes('data-share-variant="weekly"') && html.includes('data-share-variant="score"'));
check("handle redraws active card", html.includes("RunnrGrowth.redrawShareFromHandle(S)"));
check("default share is weekly report", html.includes("Share weekly report"));
check("no glacifraga on share card", !/glacifraga/i.test(obSrc) && !/glacifraga/i.test(coachSrc));

function mockCanvas() {
  const texts = [];
  const ctx = {
    fillStyle: "",
    strokeStyle: "",
    font: "10px sans-serif",
    lineWidth: 1,
    textAlign: "left",
    textBaseline: "alphabetic",
    lineCap: "butt",
    setTransform() {},
    scale() {},
    fillRect() {},
    strokeRect() {},
    beginPath() {},
    moveTo() {},
    arcTo() {},
    arc() {},
    closePath() {},
    fill() {},
    stroke() {},
    measureText(s) { return { width: String(s).length * 7 }; },
    fillText(s) {
      texts.push({ text: String(s), font: this.font, fill: this.fillStyle, align: this.textAlign });
    },
  };
  return { width: 0, height: 0, style: {}, getContext() { return ctx; }, texts, ctx };
}

const now = new Date("2026-09-07T12:00:00.000Z");
function filledAt(daysAgo) {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString();
}

const weekTrades = [
  { instr: "NVDA", date: "Sep 6", filledAt: filledAt(1), pnl: 100, stopOk: true, sizeOk: true },
  { instr: "AAPL", date: "Sep 5", filledAt: filledAt(2), pnl: 200, stopOk: true, sizeOk: true },
  { instr: "MSFT", date: "Sep 4", filledAt: filledAt(3), pnl: -50, stopOk: true, sizeOk: false },
  { instr: "EURUSD", date: "Sep 3", filledAt: filledAt(4), pnl: -80, stopOk: true, sizeOk: false },
  { instr: "TSLA", date: "Sep 2", filledAt: filledAt(5), pnl: -20, stopOk: true, sizeOk: true },
  { instr: "BE", date: "Sep 1", filledAt: filledAt(6), pnl: -30, stopOk: false, sizeOk: true },
];

const sandbox = {
  window: {},
  document: {
    getElementById: () => null,
    querySelectorAll: () => [],
    fonts: { ready: Promise.resolve() },
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
sandbox.window = sandbox;
sandbox.window.devicePixelRatio = 1;
sandbox.window.Baron = {
  resolveTradePnl: (t) => (t && t.pnl != null ? t.pnl : null),
  isOpenTrade: () => false,
};
vm.runInNewContext(coachSrc + "\n" + obSrc, sandbox);

const C = sandbox.CoachEngine;
const G = sandbox.RunnrGrowth;
check("CoachEngine and RunnrGrowth loaded", !!(C && G && G.drawWeeklyDigestCard && G.drawShareCard));

const empty = C.weeklyShareModel([], { now, sym: "€", riskPct: 1 });
check("empty week overall is blank", empty.overall === null && empty.overallLabel === "—");
check("empty week does not invent P&L", empty.discPnl === null && empty.undiscPnl === null && empty.discPnlLabel === "—");
check("empty week still brands runnr.fyi", empty.brandUrl === "runnr.fyi");
check("empty week is not the viral 82 / 2503 mock", empty.overall !== 82 && empty.discPnlLabel !== "€2,503");

const model = C.weeklyShareModel(weekTrades, { now, sym: "€", riskPct: 1, handle: "ada" });
check("week window used", model.hasWeek === true && model.tradeCount === 6);
check("overall is computed 70", model.overall === 70 && model.overallLabel === "70%");
check("stop / size match journal flags", model.stopPct === 83 && model.sizePct === 67);
check("PF / win rate from week P&L", model.pfLabel === "1.7" && model.winLabel === "33%");
check("disciplined P&L is 100+200-20", model.discPnl === 280 && model.discPnlLabel === "€280");
check("undisciplined P&L is -50-80-30", model.undiscPnl === -160 && model.undiscPnlLabel === "-€160");
check("size leak label", model.leakLabel === "size leaks");
check("coach note from real leak", model.coachNote.includes("Size is the leak") && model.coachNote.includes("1%"));
check("progress uses all-time count", model.progress.detail === "6 / 20 trades with 80%+ stop confirmation");
check("secondary handle stays optional", model.handleUrl === "runnr.fyi/u/ada");
check("date range from this week", model.dateLabel.includes("SEP 2026"));

const oldBook = C.weeklyShareModel([
  { instr: "RACE", date: "Apr 17", filledAt: "2026-04-17T00:00:00.000Z", pnl: 728, stopOk: true, sizeOk: true },
], { now, sym: "€" });
check("stale trades do not become this week's numbers", oldBook.hasWeek === false && oldBook.overall === null && oldBook.discPnl === null);

const canvas = mockCanvas();
G.drawWeeklyDigestCard({ trades: weekTrades, sym: "€", risk: 1, profileHandle: "ada", shareNow: now }, canvas);
const weeklyTexts = canvas.texts.map((t) => t.text);
check("weekly title drawn", weeklyTexts.includes("This week's") && weeklyTexts.includes("discipline report"));
check("weekly digest pill drawn", weeklyTexts.includes("WEEKLY DIGEST"));
check("loud runnr.fyi drawn", weeklyTexts.includes("runnr.fyi"));
const urlDraw = canvas.texts.find((t) => t.text === "runnr.fyi");
const urlSize = Number((urlDraw.font.match(/(\d+)px/) || [])[1] || 0);
check("runnr.fyi is large type", urlSize >= 28);
check("runnr.fyi is mint", /#00e5a0/i.test(urlDraw.fill));
check("tagline under URL", weeklyTexts.includes("Discipline OS · Process · not P&L"));
check("handle is secondary not the only URL", weeklyTexts.includes("runnr.fyi/u/ada"));
check("real week numbers on canvas", weeklyTexts.includes("70%") && weeklyTexts.includes("€280") && weeklyTexts.includes("-€160"));
check("viral mock numbers stay off the canvas", !weeklyTexts.includes("82%") && !weeklyTexts.some((t) => t.includes("2,503")));

const scoreCanvas = mockCanvas();
G.drawShareCard({ trades: weekTrades, profileHandle: "ada", shareNow: now }, scoreCanvas);
const scoreTexts = scoreCanvas.texts.map((t) => t.text);
check("score variant still exists", scoreTexts.includes("RUNNR · DISCIPLINE SCORE"));
check("score variant keeps handle URL", scoreTexts.includes("runnr.fyi/u/ada"));
check("score variant does not use the fat weekly title", !scoreTexts.includes("discipline report"));

console.log("test_weekly_share_card: " + n + " checks ok");
