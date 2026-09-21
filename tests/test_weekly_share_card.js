#!/usr/bin/env node
/** Discipline share card — score hero, no dollar P&L flex, quiet runnr.fyi. */
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

function looksLikeMoney(text) {
  const s = String(text || "");
  return /[€$£]\s?\d/.test(s) || /^-?[€$£]\d/.test(s) || /DISCIPLINED P&L/i.test(s) || /UNDISCIPLINED P&L/i.test(s);
}

function largestPct(drawn) {
  const nums = drawn.filter((t) => /^\d+%$/.test(t.text) || t.text === "—");
  nums.sort((a, b) => {
    const ha = Number((a.font.match(/(\d+)px/) || [])[1] || 0);
    const hb = Number((b.font.match(/(\d+)px/) || [])[1] || 0);
    return hb - ha;
  });
  return nums[0] || null;
}

const v = html.match(/var V = "(\d+)"/)[1];
const cache = sw.match(/CACHE = "runnr-v(\d+)"/)[1];
check("index.html V matches sw.js CACHE", v === cache);
check("cache is 178+", Number(v) >= 178);
check("coach.js cache-busted", html.includes("js/coach.js?v=29"));
check("onboarding.js cache-busted", html.includes("js/onboarding.js?v=40"));
check("default canvas is the score card height", html.includes('id="share-canvas" width="360" height="500"'));
check("weekly / score toggle exists", html.includes('data-share-variant="weekly"') && html.includes('data-share-variant="score"'));
check("handle redraws active card", html.includes("RunnrGrowth.redrawShareFromHandle(S)"));
check("default share is discipline, not weekly P&L", html.includes("Share discipline") && !html.includes("Share weekly report"));
check("Score is the default variant tab", /data-share-variant="score"[^>]*class="share-variant active"/.test(html)
  || /class="share-variant active"[^>]*data-share-variant="score"/.test(html));
check("home / coach / journal open the score card", html.includes("openShareModal(S, 'score')")
  && html.includes('id="journal-share-btn"')
  && html.includes('id="home-share-btn"'));
check("coach copy is not a P&L flex", html.includes("Not a dollar P&amp;L flex") || html.includes("Not a dollar P&L flex"));
check("share preview unlocks with the in-app score", obSrc.includes("sharePreviewUnlocked") && obSrc.includes("isShareDemo"));
check("share card drawing does not headline P&L money", !/DISCIPLINED P&L/.test(obSrc) && !/card\.discPnlLabel/.test(obSrc));

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
  { instr: "NVDA", dir: "long", date: "Sep 6", filledAt: filledAt(1), pnl: 100, stopOk: true, sizeOk: true },
  { instr: "AAPL", dir: "long", date: "Sep 5", filledAt: filledAt(2), pnl: 200, stopOk: true, sizeOk: true },
  { instr: "MSFT", dir: "short", date: "Sep 4", filledAt: filledAt(3), pnl: -50, stopOk: true, sizeOk: false },
  { instr: "EURUSD", dir: "long", date: "Sep 3", filledAt: filledAt(4), pnl: -80, stopOk: true, sizeOk: false },
  { instr: "TSLA", dir: "long", date: "Sep 2", filledAt: filledAt(5), pnl: -20, stopOk: true, sizeOk: true },
  { instr: "BE", dir: "short", date: "Sep 1", filledAt: filledAt(6), pnl: -30, stopOk: false, sizeOk: true },
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
check("CoachEngine and RunnrGrowth loaded", !!(C && G && G.drawWeeklyDigestCard && G.drawShareCard && C.scoreShareModel));
check("default share variant is score", G.shareVariant === "score");
check("weekly canvas stays taller in JS", G.SHARE_WEEKLY.h > G.SHARE_SCORE.h && G.SHARE_WEEKLY.h === 700);

const empty = C.weeklyShareModel([], { now, sym: "€", riskPct: 1 });
check("empty week overall is blank", empty.overall === null && empty.overallLabel === "—");
check("empty week does not invent P&L", empty.discPnl === null && empty.undiscPnl === null && empty.discPnlLabel === "—");
check("empty week still brands runnr.fyi", empty.brandUrl === "runnr.fyi");
check("empty week is not the viral 82 / 2503 mock", empty.overall !== 82 && empty.discPnlLabel !== "€2,503");

const model = C.weeklyShareModel(weekTrades, { now, sym: "€", riskPct: 1, handle: "ada" });
check("week window used", model.hasWeek === true && model.tradeCount === 6);
check("overall is computed 70", model.overall === 70 && model.overallLabel === "70%");
check("stop / size match journal flags", model.stopPct === 83 && model.sizePct === 67);
check("followed plan is inferred from flags", model.followedLabel === "3 of 6" && model.followedPct === 50);
check("skipped sits default to zero", model.skippedLabel === "0");
check("process line is not a money flex", model.line === "Process beat P&L.");
check("focus is ticker + side only", model.focusLabel === "NVDA · LONG");
check("PF / win rate stay on the model, not the card", model.pfLabel === "1.7" && model.winLabel === "33%");
check("disciplined P&L is still computed internally", model.discPnl === 280 && model.discPnlLabel === "€280");
check("size leak label", model.leakLabel === "size leaks");
check("coach note from real leak", model.coachNote.includes("Size is the leak") && model.coachNote.includes("1%"));
check("progress uses all-time count", model.progress.detail === "6 / 20 trades with 80%+ stop confirmation");
check("secondary handle stays optional", model.handleUrl === "runnr.fyi/u/ada");
check("date range from this week", model.dateLabel.includes("SEP 2026"));

const scoreModel = C.scoreShareModel(weekTrades, { handle: "ada" });
check("score model hero is percent", scoreModel.overall === 70 && scoreModel.overallLabel === "70%");
check("score model has stop / size / streak", scoreModel.stopLabel === "83%" && scoreModel.sizeLabel === "67%" && /d$/.test(scoreModel.streakLabel));
check("score model has no money fields", scoreModel.discPnl == null && scoreModel.discPnlLabel == null);
check("score model focus is ticker + side", scoreModel.focusLabel === "NVDA · LONG");

const sits = C.scoreShareModel([
  { instr: "SPY", dir: "long", date: "Sep 6", filledAt: filledAt(1), processFlag: "skipped", stopOk: true, sizeOk: true },
  { instr: "QQQ", dir: "short", date: "Sep 5", filledAt: filledAt(2), processFlag: "followed", stopOk: true, sizeOk: true },
], { handle: "ada" });
check("sit line when skipped and followed beat leaks", sits.line === "Sat when it was the plan.");
check("followed book says followed the plan", C.scoreShareModel([
  { instr: "AAPL", dir: "long", date: "Sep 6", filledAt: filledAt(1), processFlag: "followed", stopOk: true, sizeOk: true },
  { instr: "MSFT", dir: "long", date: "Sep 5", filledAt: filledAt(2), processFlag: "followed", stopOk: true, sizeOk: true },
  { instr: "NVDA", dir: "short", date: "Sep 4", filledAt: filledAt(3), processFlag: "followed", stopOk: true, sizeOk: true },
]).line === "Followed the plan.");

const oldBook = C.weeklyShareModel([
  { instr: "RACE", date: "Apr 17", filledAt: "2026-04-17T00:00:00.000Z", pnl: 728, stopOk: true, sizeOk: true },
], { now, sym: "€" });
check("stale trades do not become this week's numbers", oldBook.hasWeek === false && oldBook.overall === null && oldBook.discPnl === null);

const canvas = mockCanvas();
G.drawWeeklyDigestCard({ trades: weekTrades, sym: "€", risk: 1, profileHandle: "ada", shareNow: now }, canvas);
const weeklyTexts = canvas.texts.map((t) => t.text);
check("weekly title drawn", weeklyTexts.includes("This week's") && weeklyTexts.includes("discipline report"));
check("weekly pill is this week, not digest P&L", weeklyTexts.includes("THIS WEEK") && !weeklyTexts.includes("WEEKLY DIGEST"));
check("runnr.fyi drawn", weeklyTexts.includes("runnr.fyi"));
const urlDraw = canvas.texts.find((t) => t.text === "runnr.fyi");
const urlSize = Number((urlDraw.font.match(/(\d+)px/) || [])[1] || 0);
check("runnr.fyi is large type", urlSize >= 28);
check("runnr.fyi is gold, not mint blast", /#E8C97A/i.test(urlDraw.fill));
check("tagline under URL", weeklyTexts.includes("Process beat P&L"));
check("handle is secondary not the only URL", weeklyTexts.includes("runnr.fyi/u/ada"));
check("weekly hero is the score", weeklyTexts.includes("70%") && weeklyTexts.includes("FOLLOWED PLAN") && weeklyTexts.includes("SAT / SKIPPED"));
check("weekly canvas has no money hero", !weeklyTexts.some(looksLikeMoney));
check("viral mock numbers stay off the canvas", !weeklyTexts.includes("82%") && !weeklyTexts.some((t) => t.includes("2,503")));

const scoreCanvas = mockCanvas();
G.drawShareCard({ trades: weekTrades, profileHandle: "ada", shareNow: now }, scoreCanvas);
const scoreTexts = scoreCanvas.texts.map((t) => t.text);
const scoreHero = largestPct(scoreCanvas.texts);
check("score hero is the discipline percent", scoreHero && scoreHero.text === "70%");
check("score hero is large type", Number((scoreHero.font.match(/(\d+)px/) || [])[1] || 0) >= 48);
check("score hero is gold", /#E8C97A/i.test(scoreHero.fill));
check("score card kicker", scoreTexts.includes("DISCIPLINE SCORE") && scoreTexts.includes("SCORE"));
check("score card process line", scoreTexts.includes("Process beat P&L.") || scoreTexts.includes("Followed the plan."));
check("score card shows stop / size / streak", scoreTexts.includes("STOP") && scoreTexts.includes("SIZE") && scoreTexts.includes("STREAK"));
check("score card ticker + side only", scoreTexts.includes("NVDA · LONG"));
check("score card followed / sat counts", scoreTexts.some((t) => /followed/.test(t) && /sat/.test(t)));
check("score card keeps handle URL", scoreTexts.includes("runnr.fyi/u/ada") && scoreTexts.includes("runnr.fyi"));
check("score card does not use the fat weekly title", !scoreTexts.includes("discipline report"));
check("score canvas has no money hero", !scoreTexts.some(looksLikeMoney));
check("score card does not headline P&L dollars", !scoreTexts.some((t) => /P&L/i.test(t) && looksLikeMoney(t)));

sandbox.RunnrDemoSandbox = { isDemoState: () => true };
const sampleCanvas = mockCanvas();
G.drawShareCard({ trades: weekTrades, profileHandle: "ada", shareNow: now }, sampleCanvas);
check("SAMPLE desk stamps SAMPLE on the card", sampleCanvas.texts.map((t) => t.text).includes("SAMPLE"));
check("live book does not stamp SAMPLE", scoreTexts.includes("SCORE") && !scoreTexts.includes("SAMPLE"));
sandbox.RunnrDemoSandbox = { isDemoState: () => false };

console.log("test_weekly_share_card: " + n + " checks ok");
