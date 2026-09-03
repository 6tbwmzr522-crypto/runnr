#!/usr/bin/env node
/** Disciplined Replay v1 — eligibility, Baron-matched numbers, no journal write. */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
const baronSrc = fs.readFileSync(path.join(root, "js/baron.js"), "utf8");
const replaySrc = fs.readFileSync(path.join(root, "js/discipline-replay.js"), "utf8");
const limitSrc = fs.readFileSync(path.join(root, "js/trade-limit.js"), "utf8");

let n = 0;
function check(name, cond) {
  assert(cond, name);
  n += 1;
}

const v = html.match(/var V = "(\d+)"/)[1];
const cache = sw.match(/CACHE = "runnr-v(\d+)"/)[1];
check("index.html V matches sw.js CACHE", v === cache);
check("discipline-replay.js is loaded", html.includes("js/discipline-replay.js?v=2"));
check("replay modal exists", html.includes('id="modal-discipline-replay"'));
check("journal button copy", html.includes("Replay Disciplined"));
check("no new nav tab", !html.includes("switchPage('replay')") && !html.includes("page-replay"));
check("no candle UI in replay helper", !/candlestick|ohlc|replay-chart/i.test(replaySrc) && !html.includes('id="replay-chart"'));
check("copy never claims market would have", !/what the market would have done/i.test(replaySrc) && !/what the market would have done/i.test(html));
check("settings note copy", replaySrc.includes("using your current risk % / balance"));
check("fills copy", replaySrc.includes("same fills, corrected size/stop."));
check("empty-Δ copy stays in helper", replaySrc.includes("Process flag ≠ math.") && replaySrc.includes("process miss"));
check("missing-stop CTA", replaySrc.includes("Add a stop on this trade to replay"));
check("replay does not write journal rows", !/commitLog|canAddJournalTrade|S\.trades\.(unshift|push)/.test(replaySrc));
check("empty-Δ renderer exists", html.includes("replay-empty") && html.includes("Recorded") && html.includes("replayReasonHtml"));
check("journal banner dropped Confirm stop & size", !/Confirm stop &amp; size/i.test(html) && !/Confirm stop & size/i.test(html));

function extractTopFn(src, name) {
  const start = src.indexOf("function " + name + "(");
  if (start < 0) return "";
  let i = src.indexOf("{", start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return "";
}
const hintTpl = (html.match(/alpacaPending\.length[\s\S]*?hint\.innerHTML = `([\s\S]*?)`;/) || [])[1] || "";
const primaryBtn = (hintTpl.match(/<button type="button" class="btn btn-sm"(?! btn-ghost)[\s\S]*?<\/button>/) || [])[0] || "";
check("journal banner primary is Review next incomplete", primaryBtn.includes("reviewNextIncompleteFill") && primaryBtn.includes("Review next incomplete"));
check("journal banner primary is not stamp-all", !primaryBtn.includes("applyDisciplineDefaultsToAll") && !/stopOk/.test(primaryBtn));
check("journal banner stamp-all is ghost secondary", hintTpl.includes("btn-ghost") && hintTpl.includes("Mark all as compliant (Stop ✓ Size ✓)") && hintTpl.includes("applyDisciplineDefaultsToAll"));
const reviewFn = extractTopFn(html, "reviewNextIncompleteFill");
check("reviewNextIncompleteFill opens one trade", /openTradeEditor/.test(reviewFn));
check("batch primary path does not set all stopOk/sizeOk true", reviewFn.length > 0 && !/stopOk\s*=/.test(reviewFn) && !/sizeOk\s*=/.test(reviewFn));
const stampFn = extractTopFn(html, "applyDisciplineDefaultsToAll");
check("stamp-all confirm says Replay will not apply", /Replay will NOT apply/i.test(stampFn));
check("sizer log clears incomplete once flags are known", /function saveLogFromSizer[\s\S]{0,900}draft\.incomplete = false/.test(html));
check("demo 1 is a clean seed", html.includes("id:1, isDemo:true, instr:'RACE'") && /id:1, isDemo:true[\s\S]*?sizeOk:true/.test(html));
check("demo 2 is a size fail", html.includes("id:2, isDemo:true, instr:'BE'") && html.includes("sizeOk:false"));
check("demo 4 stays incomplete", html.includes("id:4, isDemo:true, instr:'AAPL CFD'") && html.includes("incomplete:true"));

const ctx = { window: {}, document: { getElementById: () => null } };
ctx.window = ctx;
ctx.globalThis = ctx;
vm.runInNewContext(baronSrc, ctx);
vm.runInNewContext(replaySrc, ctx);
const Baron = ctx.Baron;
const DR = ctx.DisciplineReplay;

const demo = [
  { id: 1, isDemo: true, instr: "RACE", dir: "long", entry: 354, exit: 380, size: 28, pnl: 728, stopOk: true, sizeOk: true, type: "shares", date: "Apr 17" },
  { id: 2, isDemo: true, instr: "BE", dir: "long", entry: 137, exit: 151, size: 65, pnl: 910, stopOk: true, sizeOk: false, type: "shares", date: "Apr 15" },
  { id: 3, isDemo: true, instr: "USDJPY", dir: "short", entry: 159.37, exit: 157.93, size: 0.5, pnl: 720, stopOk: true, sizeOk: true, type: "cfd", date: "Apr 12" },
  { id: 4, isDemo: true, instr: "AAPL CFD", dir: "long", entry: 198, exit: 195, size: 15, pnl: -45, stopOk: false, sizeOk: true, type: "cfd", date: "Apr 10", incomplete: true },
];

check("demo id 1 does not show replay", DR.isEligible(demo[0]) === false);
check("demo id 2 shows replay", DR.isEligible(demo[1]) === true);
check("demo id 3 clean does not show replay", DR.isEligible(demo[2]) === false);
check("demo id 4 incomplete does not show replay", DR.isEligible(demo[3]) === false);
check("incomplete broker fill waiting for flags is hidden", DR.isEligible({
  id: 9, incomplete: true, stopOk: null, sizeOk: null, instr: "AAPL",
}) === false);
check("completed size fail is eligible", DR.isEligible({
  id: 10, incomplete: false, sizeOk: false, stopOk: true, instr: "MSFT",
}) === true);
check("completed stop fail is eligible", DR.isEligible({
  id: 11, stopOk: false, sizeOk: true, instr: "NVDA",
}) === true);
check("challenge size fail is eligible", DR.isEligible({
  id: 12, sizeOk: false, stopOk: true, challengeFail: true, book: "challenge", instr: "ES",
}) === true);
check("clean challenge trade is hidden", DR.isEligible({
  id: 13, sizeOk: true, stopOk: true, book: "challenge", instr: "ES",
}) === false);

const settings = { bal: 10000, risk: 1, sym: "€" };
const be = demo[1];
const derivedStop = DR.disciplinedStop(be);
const expectedStop = 137 - 137 * 0.02;
check("demo 2 without stored stop uses 2% convention, not ATR", Math.abs(derivedStop - expectedStop) < 1e-9);
check("demo 2 does not invent ATR (5% 2x)", Math.abs(derivedStop - (137 - Baron.estimateAtr(137) * Baron.STRATEGY.atr_stop_mult)) > 1);

const baronSized = Baron.sizeShares(10000, 1, 137, derivedStop);
const expectedSize = Math.min(baronSized.shares, 65);
const expectedPnl = Math.round(Baron.tradePnl(null, 137, 151, expectedSize, "long"));
const view = DR.buildView(be, settings, Baron);
check("demo 2 numbers match Baron.sizeShares", view.disciplined.size === expectedSize);
check("demo 2 P&L matches Baron.tradePnl", view.disciplined.pnl === expectedPnl);
check("demo 2 prefers stored happened P&L", view.happened.pnl === 910);
check("demo 2 caps at actual if smaller is N/A here (oversized)", expectedSize < 65 && view.disciplined.size === expectedSize);
check("demo 2 takeaway uses €", view.takeaway.includes("€") && view.takeaway.includes("happened") && view.takeaway.includes("disciplined"));
check("demo 2 settings note", view.settingsNote === "using your current risk % / balance");
check("demo 2 fills note", view.fillsNote === "same fills, corrected size/stop.");
check("demo 2 does not need CTA", view.needsStop === false && view.cta == null);
check("demo 2 is a real Δ not empty-state", view.unchanged === false && view.disciplined.size !== 65 && view.delta !== 0);
check("demo 2 keeps side-by-side fills note", view.fillsNote === "same fills, corrected size/stop.");

const alreadySmall = {
  id: 20, instr: "BE", dir: "long", entry: 137, exit: 151, size: 2, pnl: 28,
  stopOk: true, sizeOk: false, type: "shares", stop: 130,
};
const smallView = DR.buildView(alreadySmall, settings, Baron);
const smallBaron = Baron.sizeShares(10000, 1, 137, 130);
check("already-smaller actual is capped, not inflated", smallBaron.shares > 2 && smallView.disciplined.size === 2);
check("already-smaller size flag uses empty-Δ", smallView.unchanged === true);
check("already-smaller sizeFits copy", smallView.emptyReasons.some((r) => r.id === "sizeFits" && /already fit/.test(r.text) && /Process flag/.test(r.text)));
check("already-smaller takeaway is Δ 0", smallView.delta === 0 && /no size or stop price to change/.test(smallView.takeaway));

const withStop = {
  id: 21, instr: "BE", dir: "long", entry: 137, exit: 151, size: 65, pnl: 910,
  stopOk: true, sizeOk: false, type: "shares", stop: 130,
};
const stopView = DR.buildView(withStop, settings, Baron);
const stopBaron = Baron.sizeShares(10000, 1, 137, 130);
check("recorded stop is used when present", stopView.disciplined.stop === 130);
check("recorded-stop size matches Baron", stopView.disciplined.size === Math.min(stopBaron.shares, 65));
check("recorded-stop P&L matches Baron", stopView.disciplined.pnl === Math.round(Baron.tradePnl(null, 137, 151, stopView.disciplined.size, "long")));

const missingStop = {
  id: 22, instr: "AAPL CFD", dir: "long", entry: 198, exit: 195, size: 15, pnl: -45,
  stopOk: false, sizeOk: true, type: "cfd",
};
const miss = DR.buildView(missingStop, settings, Baron);
check("missing stop + stopOk false does not invent ATR", miss.needsStop === true);
check("missing stop CTA", miss.cta === "Add a stop on this trade to replay");
check("missing stop does not fabricate size", miss.disciplined.size == null);
check("stop-fail disclaimer does not claim market path", miss.stopDisclaimer && !/would have done/i.test(miss.stopDisclaimer));

const fx = {
  id: 23, instr: "EURUSD", dir: "long", entry: 1.08, exit: 1.09, size: 50000, pnl: null,
  stopOk: true, sizeOk: false, type: "cfd", stop: 1.07, pair: Baron.parseForexPair("EURUSD"),
};
const fxView = DR.buildView(fx, settings, Baron);
const fxSized = Baron.sizeForex(10000, 1, 1.08, 1.07, "EURUSD");
const fxSize = Math.min(fxSized.units, 50000);
const fxPnl = Math.round(Baron.tradePnl(fx.pair, 1.08, 1.09, fxSize, "long"));
check("forex size matches Baron.sizeForex", fxView.disciplined.size === fxSize);
check("forex P&L matches Baron.tradePnl", fxView.disciplined.pnl === fxPnl);
check("missing stored P&L is recomputed", fxView.happened.pnl === Math.round(Baron.tradePnl(fx.pair, 1.08, 1.09, 50000, "long")));

const before = JSON.stringify(demo);
DR.buildView(demo[1], settings, Baron);
DR.isEligible(demo[3]);
check("replay does not mutate journal trades", JSON.stringify(demo) === before);

const limitCtx = { window: {}, globalThis: {} };
limitCtx.window = limitCtx;
limitCtx.globalThis = limitCtx;
vm.runInNewContext(limitSrc, limitCtx);
const TL = limitCtx.window.RunnrTradeLimit;
check("FREE_TRADE_LIMIT stays 10", TL.FREE_TRADE_LIMIT === 10);
check("demo seeds still do not burn the cap", TL.countJournalTradesForLimit(demo) === 0);
check("replay helper is not a countable trade source", TL.countJournalTradesForLimit(demo.concat([{
  id: 99, instr: "BE", sizeOk: false, stopOk: true, isDemo: true,
}])) === 0);

const pendingFills = [
  { id: 101, source: "alpaca", incomplete: true, stopOk: null, sizeOk: null, instr: "AAPL" },
  { id: 102, source: "alpaca", incomplete: true, stopOk: null, sizeOk: null, instr: "MSFT" },
  { id: 103, source: "manual", incomplete: true, stopOk: null, sizeOk: null, instr: "NVDA" },
];
const firstFill = DR.firstIncompleteBrokerFill(pendingFills);
const snapshot = JSON.stringify(pendingFills);
DR.firstIncompleteBrokerFill(pendingFills);
DR.incompleteBrokerFills(pendingFills);
check("primary path picks first incomplete broker fill", firstFill && firstFill.id === 101);
check("primary path skips non-broker incomplete", DR.incompleteBrokerFills(pendingFills).every((t) => t.source !== "manual"));
check("batch primary path does not set all stopOk/sizeOk true (runtime)", JSON.stringify(pendingFills) === snapshot
  && pendingFills.every((t) => t.stopOk == null && t.sizeOk == null && t.incomplete === true));

const amzn = {
  id: 30, instr: "AMZN", dir: "long", entry: 252, exit: 258, size: 34, pnl: 204,
  stopOk: false, sizeOk: false, type: "shares", stop: 248, incomplete: false,
};
const amznSettings = { bal: 100000, risk: 1, sym: "$" };
const amznSized = Baron.sizeShares(100000, 1, 252, 248);
const amznView = DR.buildView(amzn, amznSettings, Baron);
check("AMZN size already fits current risk", amznSized.shares >= 34 && amznView.disciplined.size === 34);
check("AMZN empty-Δ when size already compliant + stop process flag", amznView.unchanged === true && amznView.eligible === true);
check("AMZN sizeFits copy names current risk", amznView.emptyReasons.some((r) => r.id === "sizeFits" && r.text.includes("current") && r.text.includes("34 shares") && r.text.includes("Process flag ≠ math.")));
check("AMZN stop process copy", amznView.emptyReasons.some((r) => r.id === "stopProcess" && /process miss/.test(r.text) && /can't invent a different stop price/.test(r.text)));
check("AMZN recorded stop is reused, not invented", amznView.happened.stop === 248 && amznView.disciplined.stop === 248);
check("AMZN takeaway is Δ $0", amznView.delta === 0 && amznView.takeaway.includes("$204") && amznView.takeaway.includes("Δ $0"));
check("AMZN keeps current risk % / balance note", amznView.settingsNote === "using your current risk % / balance");
check("AMZN empty-Δ does not claim a correction", amznView.fillsNote.includes("no size or stop price change"));
check("AMZN does not use ATR for the stop", Math.abs(248 - (252 - Baron.estimateAtr(252) * Baron.STRATEGY.atr_stop_mult)) > 1);

console.log("ok " + n);
