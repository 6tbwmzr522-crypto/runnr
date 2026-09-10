#!/usr/bin/env node
/** Broker-verified fills weigh more than manual journal rows. */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const { root, html, sw, src, css } = require("./app_src").loadAppSource();
const coachSrc = fs.readFileSync(path.join(root, "js/coach.js"), "utf8");
const sandboxSrc = fs.readFileSync(path.join(root, "js/demo-sandbox.js"), "utf8");
const baronSrc = fs.readFileSync(path.join(root, "js/baron.js"), "utf8");

let n = 0;
function check(name, cond) {
  assert(cond, name);
  n += 1;
}

const v = html.match(/var V = "(\d+)"/)[1];
const cache = sw.match(/CACHE = "runnr-v(\d+)"/)[1];
check("index.html V matches sw.js CACHE", v === cache);
check("cache is 136+", Number(v) >= 136);
check("coach.js cache-busted", html.includes("js/coach.js?v=28"));
check("weight hint in discipline card", html.includes("home.scoreWeightHint") && html.includes("confidence mix"));
check("journal hint explains weights", html.includes("journal.scoreHint") && html.includes("self-logged (half)"));
check("live + sample badge labels in journal", src.includes("Synced (sample)") && src.includes("Imported (sample)") && src.includes("Manual (sample)"));
check("badge helper is used for live fills", src.includes("fillEvidenceBadgeHtml(t)"));
check("source badges wrap on mobile", css.includes(".flags{display:flex;flex-wrap:wrap") && css.includes(".flag-src-synced") && css.includes(".flag-src-manual"));

function freshCtx() {
  const ctx = {
    window: {},
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
  ctx.window.Baron = {
    resolveTradePnl: (t) => (t && t.pnl != null ? t.pnl : null),
    isOpenTrade: () => false,
  };
  return ctx;
}

const ctx = freshCtx();
vm.runInNewContext(baronSrc, ctx);
vm.runInNewContext(coachSrc, ctx);
vm.runInNewContext(sandboxSrc, ctx);
const C = ctx.CoachEngine;

check("weight constants are the documented hypothesis", C.FILL_WEIGHT.synced === 1 && C.FILL_WEIGHT.imported === 0.85 && C.FILL_WEIGHT.manual === 0.5);
check("alpaca/ibkr/t212 are synced", C.fillEvidenceKind({ source: "alpaca" }) === "synced" && C.fillEvidenceKind({ source: "ibkr" }) === "synced" && C.fillEvidenceKind({ source: "t212" }) === "synced");
check("csv is imported", C.fillEvidenceKind({ source: "csv" }) === "imported");
check("bare journal row is manual", C.fillEvidenceKind({ instr: "AAPL", stopOk: true }) === "manual");
check("demo unlabeled defaults to synced preview", C.fillEvidenceKind({ isDemo: true, stopOk: true }) === "synced");
check("sampleOrigin wins for preview badges", C.fillEvidenceKind({ isDemo: true, sampleOrigin: "manual" }) === "manual" && C.fillEvidenceLabel({ isDemo: true, sampleOrigin: "imported" }) === "Imported (sample)");
check("live labels drop (sample)", C.fillEvidenceLabel({ source: "alpaca" }) === "Synced" && C.fillEvidenceLabel({ source: "csv" }) === "Imported" && C.fillEvidenceLabel({}) === "Manual");

const row = (over) => Object.assign({ stopOk: true, sizeOk: true, pnl: 10, incomplete: false, entry: 100, exit: 101, size: 1 }, over);

const allManual = C.disciplineScore([row({ stopOk: false }), row({ stopOk: true })]);
check("same-weight book stays 50/50 on stops", allManual.stopPct === 50 && allManual.evidence.manual === 2);

const syncedFail = C.disciplineScore([row({ source: "alpaca", stopOk: false }), row({ stopOk: true })]);
const manualFail = C.disciplineScore([row({ stopOk: false }), row({ source: "alpaca", stopOk: true })]);
check("synced stop-fail pulls stop% below 50", syncedFail.stopPct === 33);
check("manual stop-fail leaves stop% above 50", manualFail.stopPct === 67);
check("synced fail hurts more than manual fail", syncedFail.stopPct < manualFail.stopPct);
check("csv sits between synced and manual", (() => {
  const csvFail = C.disciplineScore([row({ source: "csv", stopOk: false }), row({ stopOk: true })]);
  return csvFail.stopPct > syncedFail.stopPct && csvFail.stopPct < allManual.stopPct;
})());

const sizeMix = C.disciplineScore([
  row({ source: "alpaca", sizeOk: false }),
  row({ sizeOk: true }),
  row({ sizeOk: true }),
]);
const sizeMixFlipped = C.disciplineScore([
  row({ sizeOk: false }),
  row({ source: "alpaca", sizeOk: true }),
  row({ source: "t212", sizeOk: true }),
]);
check("size component uses the same weights", sizeMix.sizePct < sizeMixFlipped.sizePct);

const clean = C.disciplineScore([row({ source: "alpaca" }), row({}), row({ source: "csv" })]);
check("all-clean book is 100 regardless of source", clean.overall === 100 && clean.stopPct === 100 && clean.sizePct === 100);

const lockedEmpty = C.disciplineScore([]);
check("empty book stays 0 / Novice", lockedEmpty.overall === 0 && lockedEmpty.tradeCount === 0 && lockedEmpty.tier === "Novice");

const metrics = C.metrics([row({ source: "alpaca", stopOk: false, pnl: -20 }), row({ stopOk: true, pnl: 10 })]);
check("metrics stop/size are fill-weighted", Math.round(metrics.stopPct) === 33);
check("P&L stays unweighted money", metrics.totalPnl === -10 && metrics.undiscPnl === -20);

const SB = ctx.RunnrDemoSandbox;
const book = SB.factoryTrades(new Date("2026-09-09T12:00:00.000Z"));
const demoScore = C.disciplineScore(book);
check("SAMPLE book stays in the public band", demoScore.overall >= 78 && demoScore.overall <= 85);
check("SAMPLE book still shows size as the leak", demoScore.stopPct > demoScore.sizePct);
check("SAMPLE book exposes synced + manual (+ imported)", demoScore.evidence.synced >= 1 && demoScore.evidence.manual >= 1 && demoScore.evidence.imported >= 1);
check("factory rows carry sampleOrigin for badges", book.every((t) => t.sampleOrigin === "synced" || t.sampleOrigin === "manual" || t.sampleOrigin === "imported"));

console.log("test_fill_weight: ok " + n);
