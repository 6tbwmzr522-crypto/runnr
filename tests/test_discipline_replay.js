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
check("discipline-replay.js is loaded", html.includes("js/discipline-replay.js?v=6"));
check("replay modal exists", html.includes('id="modal-discipline-replay"'));
check("journal button copy", html.includes("Replay Disciplined"));
check("journal Replay is visually primary", html.includes('class="te-replay te-replay-primary"') && html.includes(".te-replay.te-replay-primary"));
check("journal button gated on canReplay", html.includes("DisciplineReplay.canReplay(t, S"));
check("journal render does not offer button via isEligible", !/DisciplineReplay\.isEligible\(t\) \?/.test(html));
check("openDisciplineReplay keeps isEligible safety net", /function openDisciplineReplay[\s\S]{0,400}isEligible\(t\)/.test(html));
check("no new nav tab", !html.includes("switchPage('replay')") && !html.includes("page-replay"));
check("no candle UI in replay helper", !/candlestick|ohlc|replay-chart/i.test(replaySrc) && !html.includes('id="replay-chart"'));
check("copy never claims market would have", !/what the market would have done/i.test(replaySrc) && !/what the market would have done/i.test(html));
check("settings note copy", replaySrc.includes("rules at time of trade") && !replaySrc.includes("using your current risk % / balance"));
check("fills copy", replaySrc.includes("same fills, corrected size/stop."));
check("missing snapshot copy", replaySrc.includes("no risk snapshot for this trade"));
check("stamp live CTA copy is explicit not silent history", replaySrc.includes("Use current risk % / balance for this trade")
  && replaySrc.includes("today's settings")
  && replaySrc.includes("trade-time rules were never saved"));
check("stamp live CTA is wired in modal", html.includes("stampReplayFromLiveSettings")
  && html.includes("onclick=\"stampReplayFromLiveSettings()\""));
check("stamp live CTA persist then rebuild", /function stampReplayFromLiveSettings[\s\S]{0,900}stampTrade[\s\S]{0,400}persist\(\)[\s\S]{0,250}buildView/.test(html));
check("does not auto-backfill all trades on load", !/trades\.forEach\([^)]*stampTrade/.test(html)
  && !/for\s*\([^)]*trades[^)]*\)[^;]*stampTrade/.test(html));
check("identical stop does not claim stop was the problem", !/Stop was flagged/.test(replaySrc));
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
const primaryBtn = (hintTpl.match(/<button type="button" class="btn"(?! btn-ghost)[\s\S]*?<\/button>/) || [])[0] || "";
check("journal banner primary is Review next incomplete", primaryBtn.includes("reviewNextIncompleteFill") && primaryBtn.includes("Review next incomplete"));
check("journal banner primary is not stamp-all", !primaryBtn.includes("applyDisciplineDefaultsToAll") && !/stopOk/.test(primaryBtn));
check("journal banner stamp-all is ghost secondary", hintTpl.includes("btn-ghost") && hintTpl.includes("Mark all as compliant (Stop ✓ Size ✓)") && hintTpl.includes("applyDisciplineDefaultsToAll"));
check("journal high-count uses calm hero not panic wall", hintTpl.includes("journal-incomplete-hero") && html.includes("journal-hint-calm") && html.includes(" of ") && html.includes(" reviewed"));
check("saveLog offers Replay after a miss", /function saveLog[\s\S]*offerDisciplineReplay/.test(html) && html.includes("function offerDisciplineReplay"));
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

function withSnap(trade, bal, risk, extra) {
  return Object.assign({}, trade, {
    riskSnapshot: Object.assign(
      { risk: risk == null ? 1 : risk, bal: bal == null ? 10000 : bal, at: "2026-04-15T00:00:00.000Z", sym: "€" },
      extra || {}
    ),
  });
}

const demo = [
  withSnap({ id: 1, isDemo: true, instr: "RACE", dir: "long", entry: 354, exit: 380, size: 28, pnl: 728, stopOk: true, sizeOk: true, type: "shares", date: "Apr 17" }),
  withSnap({ id: 2, isDemo: true, instr: "BE", dir: "long", entry: 137, exit: 151, size: 65, pnl: 910, stopOk: true, sizeOk: false, type: "shares", date: "Apr 15" }),
  withSnap({ id: 3, isDemo: true, instr: "USDJPY", dir: "short", entry: 159.37, exit: 157.93, size: 0.5, pnl: 720, stopOk: true, sizeOk: true, type: "cfd", date: "Apr 12" }),
  withSnap({ id: 4, isDemo: true, instr: "AAPL CFD", dir: "long", entry: 198, exit: 195, size: 15, pnl: -45, stopOk: false, sizeOk: true, type: "cfd", date: "Apr 10", incomplete: true }),
];

check("demo id 1 does not show replay", DR.isEligible(demo[0]) === false);
check("clean trade canReplay false", DR.canReplay(demo[0], { bal: 10000, risk: 1 }, Baron) === false);
check("clean trade shouldShowButton false", DR.shouldShowButton(demo[0], { bal: 10000, risk: 1 }, Baron) === false);
check("demo id 2 is eligible", DR.isEligible(demo[1]) === true);
check("demo id 3 clean does not show replay", DR.isEligible(demo[2]) === false);
check("demo id 3 canReplay false", DR.canReplay(demo[2], { bal: 10000, risk: 1 }, Baron) === false);
check("demo id 4 incomplete does not show replay", DR.isEligible(demo[3]) === false);
check("demo id 4 canReplay false", DR.canReplay(demo[3], { bal: 10000, risk: 1 }, Baron) === false);
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
check("demo 2 settings note", view.settingsNote.startsWith("rules at time of trade") && view.settingsNote.includes("1%") && /€10[,.]?000/.test(view.settingsNote));
check("demo 2 fills note", view.fillsNote === "same fills, corrected size/stop.");
check("demo 2 does not need CTA", view.needsStop === false && view.cta == null);
check("demo 2 is a real Δ not empty-state", view.unchanged === false && view.disciplined.size !== 65 && view.delta !== 0);
check("demo 2 keeps side-by-side fills note", view.fillsNote === "same fills, corrected size/stop.");
check("demo BE oversized canReplay true", DR.canReplay(be, settings, Baron) === true);
check("demo BE oversized shouldShowButton true", DR.shouldShowButton(be, settings, Baron) === true);
check("demo BE hasNumericSizeCut true", DR.hasNumericSizeCut(be, settings, Baron) === true);

const alreadySmall = withSnap({
  id: 20, instr: "BE", dir: "long", entry: 137, exit: 151, size: 2, pnl: 28,
  stopOk: true, sizeOk: false, type: "shares", stop: 130,
});
const smallView = DR.buildView(alreadySmall, settings, Baron);
const smallBaron = Baron.sizeShares(10000, 1, 137, 130);
check("already-smaller actual is capped, not inflated", smallBaron.shares > 2 && smallView.disciplined.size === 2);
check("already-smaller size flag uses empty-Δ", smallView.unchanged === true);
check("already-smaller sizeFits copy", smallView.emptyReasons.some((r) => r.id === "sizeFits" && /already fit/.test(r.text) && /Process flag/.test(r.text)));
check("already-smaller takeaway is Δ 0", smallView.delta === 0 && /no size or stop price to change/.test(smallView.takeaway));
check("already-smaller canReplay false", DR.canReplay(alreadySmall, settings, Baron) === false);
check("(c) sizeOk false + snapshot + size already fits canReplay false", DR.canReplay(alreadySmall, settings, Baron) === false
  && DR.hasNumericSizeCut(alreadySmall, settings, Baron) === false);

const withStop = withSnap({
  id: 21, instr: "BE", dir: "long", entry: 137, exit: 151, size: 65, pnl: 910,
  stopOk: true, sizeOk: false, type: "shares", stop: 130,
});
const stopView = DR.buildView(withStop, settings, Baron);
const stopBaron = Baron.sizeShares(10000, 1, 137, 130);
check("recorded stop is used when present", stopView.disciplined.stop === 130);
check("recorded-stop size matches Baron", stopView.disciplined.size === Math.min(stopBaron.shares, 65));
check("recorded-stop P&L matches Baron", stopView.disciplined.pnl === Math.round(Baron.tradePnl(null, 137, 151, stopView.disciplined.size, "long")));

const missingStop = withSnap({
  id: 22, instr: "AAPL CFD", dir: "long", entry: 198, exit: 195, size: 15, pnl: -45,
  stopOk: false, sizeOk: true, type: "cfd",
});
const miss = DR.buildView(missingStop, settings, Baron);
check("missing stop + stopOk false does not invent ATR", miss.needsStop === true);
check("missing stop CTA", miss.cta === "Add a stop on this trade to replay");
check("missing stop does not fabricate size", miss.disciplined.size == null);
check("stop-fail disclaimer does not claim market path", miss.stopDisclaimer && !/would have done/i.test(miss.stopDisclaimer));
check("missing stop canReplay true (CTA path)", DR.canReplay(missingStop, settings, Baron) === true);
check("missing stop shouldShowButton true", DR.shouldShowButton(missingStop, settings, Baron) === true);

const fx = withSnap({
  id: 23, instr: "EURUSD", dir: "long", entry: 1.08, exit: 1.09, size: 50000, pnl: null,
  stopOk: true, sizeOk: false, type: "cfd", stop: 1.07, pair: Baron.parseForexPair("EURUSD"),
});
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
DR.canReplay(demo[1], settings, Baron);
DR.canReplay(demo[3], settings, Baron);
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

const amzn = withSnap({
  id: 30, instr: "AMZN", dir: "long", entry: 252, exit: 258, size: 34, pnl: 204,
  stopOk: false, sizeOk: false, type: "shares", stop: 248, incomplete: false,
}, 100000, 1, { sym: "$" });
const amznSettings = { bal: 100000, risk: 1, sym: "$" };
const amznSized = Baron.sizeShares(100000, 1, 252, 248);
const amznView = DR.buildView(amzn, amznSettings, Baron);
check("AMZN size already fits recorded risk", amznSized.shares >= 34 && amznView.disciplined.size === 34);
check("AMZN empty-Δ when size already compliant + stop process flag", amznView.unchanged === true && amznView.eligible === true);
check("AMZN sizeFits copy names recorded risk", amznView.emptyReasons.some((r) => r.id === "sizeFits" && r.text.includes("recorded") && !r.text.includes("current") && r.text.includes("34 shares") && r.text.includes("Process flag ≠ math.")));
check("AMZN stop process copy", amznView.emptyReasons.some((r) => r.id === "stopProcess" && /process miss/.test(r.text) && /can't invent a different stop price/.test(r.text)));
check("AMZN recorded stop is reused, not invented", amznView.happened.stop === 248 && amznView.disciplined.stop === 248);
check("AMZN takeaway is Δ $0", amznView.delta === 0 && amznView.takeaway.includes("$204") && amznView.takeaway.includes("Δ $0"));
check("AMZN keeps rules-at-trade note", amznView.settingsNote.startsWith("rules at time of trade") && !/current risk/.test(amznView.settingsNote));
check("AMZN empty-Δ does not claim a correction", amznView.fillsNote.includes("no size or stop price change"));
check("AMZN does not use ATR for the stop", Math.abs(248 - (252 - Baron.estimateAtr(252) * Baron.STRATEGY.atr_stop_mult)) > 1);
check("firstReplayableTrade skips incomplete then picks a miss", DR.firstReplayableTrade([
  { id: 201, incomplete: true, stopOk: false, sizeOk: false, instr: "WAIT" },
  demo[1],
  demo[0],
], settings, Baron) === demo[1]);
check("firstReplayableTrade empty-Δ is skipped", DR.firstReplayableTrade([amzn], amznSettings, Baron) == null);
check("AMZN canReplay false (empty-Δ, no button)", DR.canReplay(amzn, amznSettings, Baron) === false);
check("AMZN shouldShowButton false", DR.shouldShowButton(amzn, amznSettings, Baron) === false);
check("AMZN hasNumericSizeCut false", DR.hasNumericSizeCut(amzn, amznSettings, Baron) === false);
check("AMZN remains eligible so empty-Δ panel still works if opened", amznView.eligible === true && amznView.unchanged === true);

const processStopOnly = withSnap({
  id: 31, instr: "MSFT", dir: "long", entry: 400, exit: 410, size: 10, pnl: 100,
  stopOk: false, sizeOk: true, type: "shares", stop: 390, incomplete: false,
}, 100000, 1, { sym: "$" });
const processSettings = { bal: 100000, risk: 1, sym: "$" };
check("process-stop with stored stop canReplay false", DR.canReplay(processStopOnly, processSettings, Baron) === false);
check("process-stop stays eligible (✗ flag, Coach still sees it)", DR.isEligible(processStopOnly) === true);
check("(b) process-stop only + sizeOk true + stored stop canReplay false", DR.canReplay({
  id: 31, instr: "MSFT", dir: "long", entry: 400, exit: 410, size: 10, pnl: 100,
  stopOk: false, sizeOk: true, type: "shares", stop: 390, incomplete: false,
}, { bal: 100000, risk: 1, sym: "$" }, Baron) === false);

const liveTiny = { bal: 200, risk: 0.25, sym: "$" };
const smsiOversize = withSnap({
  id: 40, instr: "SMSI", dir: "long", entry: 87, exit: 86.758, size: 1508.7, pnl: -365,
  stopOk: false, sizeOk: false, type: "shares", stop: 81, incomplete: false,
}, 10000, 1, { sym: "€" });
const smsiLive = DR.buildView(smsiOversize, liveTiny, Baron);
const smsiExpected = Baron.sizeShares(10000, 1, 87, 81);
check("genuine 100x oversize keeps snapshot size, not live tiny settings", smsiViewMatches(smsiLive, smsiExpected));
function smsiViewMatches(view, expected) {
  return view.disciplined.size === expected.shares
    && view.disciplined.size < 1508.7
    && (1508.7 / view.disciplined.size) > 80
    && view.settingsNote.startsWith("rules at time of trade")
    && !/current risk/.test(view.settingsNote)
    && view.happened.stop === 81
    && view.disciplined.stop === 81;
}
check("genuine 100x canReplay true", DR.canReplay(smsiOversize, liveTiny, Baron) === true);
check("identical stop copy mentions size only", /Size was over your risk budget/.test(smsiLive.ruleNote)
  && /recorded stop/.test(smsiLive.ruleNote)
  && !/Stop was flagged/.test(smsiLive.ruleNote)
  && !/Stop price was corrected/.test(smsiLive.ruleNote));
check("identical stop numbers stay equal", smsiLive.happened.stop === smsiLive.disciplined.stop);

const inBudgetSize = Baron.sizeShares(10000, 1, 137, 130).shares;
const inBudget = withSnap({
  id: 41, instr: "BE", dir: "long", entry: 137, exit: 151, size: inBudgetSize, pnl: 14 * inBudgetSize,
  stopOk: true, sizeOk: false, type: "shares", stop: 130, incomplete: false,
});
const inBudgetView = DR.buildView(inBudget, liveTiny, Baron);
check("1% risk trade stays ~1x against snapshot, not live tiny settings", inBudgetView.disciplined.size === inBudgetSize
  && inBudgetView.unchanged === true
  && DR.canReplay(inBudget, liveTiny, Baron) === false
  && DR.hasNumericSizeCut(inBudget, liveTiny, Baron) === false);
check("1x in-budget ignores live settings that would fake a cut", Baron.sizeShares(200, 0.25, 137, 130).shares < inBudgetSize);

const orphan = {
  id: 42, instr: "SMSI", dir: "long", entry: 87, exit: 86.76, size: 1508.7, pnl: -365,
  stopOk: true, sizeOk: false, type: "shares", stop: 81, incomplete: false,
};
const orphanLive = { bal: 10000, risk: 1, sym: "€", riskHistory: [] };
const orphanView = DR.buildView(orphan, orphanLive, Baron);
check("missing snapshot does not silently use live settings", orphanView.missingSnapshot === true
  && orphanView.disciplined.size == null
  && orphanView.settingsNote === "no risk snapshot for this trade"
  && /will not invent a disciplined size/.test(orphanView.ruleNote)
  && DR.hasNumericSizeCut(orphan, orphanLive, Baron) === false);
check("(a) sizeOk false + no snapshot canReplay true", DR.canReplay(orphan, orphanLive, Baron) === true
  && orphanView.stampCta === "Use current risk % / balance for this trade"
  && /today's settings/.test(orphanView.stampExplain)
  && /never saved/.test(orphanView.stampExplain));
check("LCTX-like T212 row shows Replay without snapshot", DR.canReplay({
  id: 50, instr: "LCTX", dir: "long", entry: 1.71, exit: 1.65, size: 612.18, pnl: -36.73,
  stopOk: false, sizeOk: false, type: "shares", stop: 1.60, incomplete: false, source: "t212",
}, orphanLive, Baron) === true);

const histTrade = {
  id: 43, instr: "AMZN", dir: "long", entry: 252, exit: 258, size: 34, pnl: 204,
  stopOk: false, sizeOk: false, type: "shares", stop: 248, incomplete: false,
  filledAt: "2025-06-01T12:00:00.000Z",
};
const histSettings = {
  bal: 500, risk: 0.2, sym: "$",
  riskHistory: [
    { at: "2025-01-01T00:00:00.000Z", risk: 1, bal: 100000, sym: "$" },
    { at: "2025-07-01T00:00:00.000Z", risk: 0.2, bal: 500, sym: "$" },
  ],
};
const histView = DR.buildView(histTrade, histSettings, Baron);
const histSized = Baron.sizeShares(100000, 1, 252, 248);
check("dated history reconstructs trade-time rules, not live", histView.basisSource === "history"
  && histView.bal === 100000
  && histView.riskPct === 1
  && histView.disciplined.size === Math.min(histSized.shares, 34)
  && /nearest saved rules/.test(histView.settingsNote)
  && !/current risk/.test(histView.settingsNote));

const stamped = { id: 44, instr: "MSFT", type: "shares" };
DR.stampTrade(stamped, { bal: 8000, risk: 2, sym: "€" }, Baron);
const firstSnap = JSON.stringify(stamped.riskSnapshot);
DR.stampTrade(stamped, { bal: 999, risk: 0.1, sym: "$" }, Baron);
check("stampTrade captures risk % and balance once", stamped.riskSnapshot
  && stamped.riskSnapshot.bal === 8000
  && stamped.riskSnapshot.risk === 2
  && JSON.stringify(stamped.riskSnapshot) === firstSnap);

const stampThenCut = {
  id: 45, instr: "SMSI", dir: "long", entry: 87, exit: 86.76, size: 1508.7, pnl: -365,
  stopOk: true, sizeOk: false, type: "shares", stop: 81, incomplete: false,
};
const stampThenCutLive = { bal: 10000, risk: 1, sym: "€", riskHistory: [] };
check("pre-stamp oversized still has no numeric cut without snapshot", DR.hasNumericSizeCut(stampThenCut, stampThenCutLive, Baron) === false
  && DR.canReplay(stampThenCut, stampThenCutLive, Baron) === true
  && DR.buildView(stampThenCut, stampThenCutLive, Baron).settingsNote === "no risk snapshot for this trade");
DR.stampTrade(stampThenCut, stampThenCutLive, Baron);
const stampedCutView = DR.buildView(stampThenCut, stampThenCutLive, Baron);
check("(d) CTA stamp then hasNumericSizeCut can become true for an oversized row", stampThenCut.riskSnapshot
  && stampThenCut.riskSnapshot.bal === 10000
  && stampThenCut.riskSnapshot.risk === 1
  && DR.hasNumericSizeCut(stampThenCut, stampThenCutLive, Baron) === true
  && DR.canReplay(stampThenCut, stampThenCutLive, Baron) === true
  && stampedCutView.missingSnapshot === false
  && stampedCutView.settingsNote.startsWith("rules at time of trade")
  && stampedCutView.stampCta == null
  && stampedCutView.disciplined.size != null
  && stampedCutView.disciplined.size < 1508.7);

const histState = { bal: 10000, risk: 1, riskHistory: [] };
DR.stampHistory(histState);
DR.stampHistory(histState);
check("stampHistory records a change once", histState.riskHistory.length === 1
  && histState.riskHistory[0].bal === 10000
  && histState.riskHistory[0].risk === 1);
histState.risk = 2;
DR.stampHistory(histState);
check("stampHistory appends when risk changes", histState.riskHistory.length === 2 && histState.riskHistory[1].risk === 2);

check("commitLog stamps new trades", /DisciplineReplay\.stampTrade\(row, S/.test(html));
check("persist records risk history", /DisciplineReplay\.stampHistory\(S\)/.test(html));
check("demo seeds carry riskSnapshot", /id:2, isDemo:true[\s\S]*?riskSnapshot:\{ risk:1, bal:10000/.test(html));

console.log("ok " + n);
