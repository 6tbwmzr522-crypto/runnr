#!/usr/bin/env node
/** Options Coach — named modes on the existing sizer; 2% / 20% gates stay closed. */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
const coachSrc = fs.readFileSync(path.join(root, "js/options-coach.js"), "utf8");

let n = 0;
function check(name, cond) {
  assert(cond, name);
  n += 1;
}

const v = html.match(/var V = "(\d+)"/)[1];
const cache = sw.match(/CACHE = "runnr-v(\d+)"/)[1];
check("index.html V matches sw.js CACHE", v === cache);
check("cache is 121+", Number(v) >= 121);
check("options-coach.js is loaded", html.includes("js/options-coach.js?v=1"));
check("sizer-options still hosts the calculator", html.includes('id="sizer-options"') && html.includes("id=\"opt-portfolio\""));
check("mode picker has four named jobs", html.includes('data-opt-mode="leaps"')
  && html.includes('data-opt-mode="wheel"')
  && html.includes('data-opt-mode="putcredit"')
  && html.includes('data-opt-mode="review"'));
check("Options Coach kicker is on the Options tab", html.includes('id="opt-coach"') && html.includes("Options Coach"));
check("primary log CTA stays mint btn", /id="opt-log-btn"[^>]*class="btn"/.test(html) || /class="btn"[^>]*id="opt-log-btn"/.test(html));
check("options log still goes through saveLogFromSizer", html.includes("saveLogFromSizer('options')"));
check("calcOptions still paints Rule 1 / 2 / 3 cards", html.includes("id=\"rule1-card\"")
  && html.includes("Max 2% portfolio risk per trade")
  && html.includes("Max 20% total options exposure")
  && html.includes("Minimum 2:1 reward-to-risk ratio"));
check("calcOptions calls OptionsCoach.computePlan", /function calcOptions[\s\S]*computePlan/.test(html));
check("options draft cannot log when gates fail", /function saveLogFromSizer[\s\S]*type === 'options'[\s\S]*withinRules === false[\s\S]*return/.test(html));
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
const homeJobFn = extractTopFn(html, "runHomeJob") + extractTopFn(html, "focusSizerForNextTrade");
check("Home job does not open Options Coach", !/switchOptCoachMode|opt-mode-|Options Coach/.test(homeJobFn));
check("Home still sizes CFD by default", html.includes("function focusSizerForNextTrade")
  && /focusSizerForNextTrade[\s\S]*cfd-instr/.test(html));
check("no live options chain / Greeks scanner", !/options.?chain/i.test(coachSrc)
  && !/implied.?volatility|delta|theta|vega/i.test(coachSrc)
  && !/finnhub|yahoo.*option/i.test(coachSrc));
check("no strategist / guaranteed-income copy", !/\$500/.test(html + coachSrc)
  && !/guaranteed income/i.test(html + coachSrc)
  && !/JasonL/i.test(html + coachSrc));
check("CFD / shares / crypto sizers stay in the page", html.includes('id="sizer-cfd"')
  && html.includes('id="sizer-shares"')
  && html.includes("page-crypto"));
check("review reuses Replay / journal, not excursion stats", html.includes("openDisciplineReplay")
  && html.includes("openTradeEditor")
  && !/\bMFE\b|\bMAE\b/.test(coachSrc)
  && /no invented excursion stats/.test(coachSrc)
  && html.includes("function openOptionsFillReview"));

const ctx = { window: {}, document: { getElementById: () => null } };
ctx.window = ctx;
ctx.globalThis = ctx;
vm.runInNewContext(coachSrc, ctx);
const OC = ctx.OptionsCoach;

check("four named modes export", OC.MODE_IDS.join(",") === "leaps,wheel,putcredit,review");
check("rules are 2% and 20%", OC.RULE1_PCT === 0.02 && OC.RULE2_PCT === 0.20);

const leaps = OC.computePlan({
  mode: "leaps",
  optType: "call",
  strike: 50,
  spot: 48,
  prem: 5,
  target: 65,
  portfolio: 50000,
  existing: 0,
  sym: "€",
});
check("LEAPS ready", leaps.ready === true);
check("LEAPS sizes by debit (premium × 100)", leaps.contracts === 2 && leaps.totalRisk === 1000 && leaps.debit === true);
check("LEAPS Rule 1 / 2 pass at exactly 2%", leaps.rule1Pass === true && leaps.rule2Pass === true && leaps.allClear === true);
check("LEAPS Rule 3 uses 2:1 on the long", leaps.rule3Pass === true && leaps.rule3.rr >= 2);
check("LEAPS break-even is strike + premium", leaps.bePrice === 55);
check("LEAPS usesSameGates", OC.usesSameGates(leaps) === true);

const leapsFail = OC.computePlan({
  mode: "leaps",
  optType: "call",
  strike: 50,
  spot: 48,
  prem: 12,
  portfolio: 50000,
  existing: 0,
});
check("LEAPS one expensive contract fails Rule 1", leapsFail.shown === 1 && leapsFail.rule1Pass === false && leapsFail.allClear === false);

const cheapPut = {
  mode: "wheel",
  wheelKind: "csp",
  strike: 100,
  spot: 102,
  prem: 1,
  portfolio: 50000,
  existing: 0,
};
const wheel = OC.computePlan(cheapPut);
const naive = OC.premiumSizedContracts(50000, 1);
check("naive premium size would oversize the short put", naive === 10);
check("Wheel does not use premium as Rule 1 risk", wheel.riskPer === 9900 && wheel.contracts === 0 && wheel.shown === 1);
check("Wheel Rule 1 fails instead of 10-contract bypass", wheel.rule1Pass === false && wheel.allClear === false);
check("Wheel Rule 2 counts collateral not credit", wheel.exposurePer === 10000 && wheel.totalExposure === 10000);
check("Wheel credit is not the risk number", wheel.creditPer === 100 && wheel.riskPer > wheel.creditPer);
check("Wheel gate names Rule 1", wheel.gateFailures.some((f) => /Rule 1/.test(f)));
check("Wheel usesSameGates", OC.usesSameGates(wheel) === true);

const wheelOk = OC.computePlan({
  mode: "wheel",
  wheelKind: "csp",
  strike: 8,
  spot: 8.2,
  prem: 0.40,
  portfolio: 50000,
  existing: 0,
});
check("small CSP can pass 2% when max loss fits", wheelOk.riskPer === 760 && wheelOk.contracts >= 1 && wheelOk.rule1Pass === true);
check("small CSP still counts strike collateral toward 20%", wheelOk.exposurePer === 800 && wheelOk.rule2Pass === true);

const wheelLoaded = OC.computePlan({
  mode: "wheel",
  wheelKind: "csp",
  strike: 8,
  spot: 8.2,
  prem: 0.40,
  portfolio: 50000,
  existing: 9800,
});
check("Wheel Rule 2 still fires when book is already at 20%", wheelLoaded.rule2Pass === false && wheelLoaded.allClear === false);

const cc = OC.computePlan({
  mode: "wheel",
  wheelKind: "cc",
  strike: 50,
  spot: 48,
  prem: 1.5,
  portfolio: 50000,
  existing: 0,
});
check("Covered call sizes against share-to-zero max loss", cc.riskPer === 4650 && cc.exposurePer === 4800 && cc.rule1Pass === false);

const credit = OC.computePlan({
  mode: "putcredit",
  strike: 100,
  spot: 102,
  prem: 1.5,
  width: 5,
  portfolio: 50000,
  existing: 0,
});
const creditNaive = OC.premiumSizedContracts(50000, 1.5);
check("Put-credit naive premium size is 6", creditNaive === 6);
check("Put-credit sizes max loss (width − credit)", credit.definedRisk === true && credit.maxLossPer === 350 && credit.contracts === 2);
check("Put-credit does not emit 6 contracts", credit.shown === 2 && credit.totalRisk === 700);
check("Put-credit Rule 1 / 2 pass", credit.rule1Pass === true && credit.rule2Pass === true && credit.allClear === true);
check("Put-credit Rule 3 does not block", credit.rule3Blocks === false);
check("Put-credit usesSameGates", OC.usesSameGates(credit) === true);

const nakedCredit = OC.computePlan({
  mode: "putcredit",
  strike: 100,
  spot: 102,
  prem: 1.5,
  portfolio: 50000,
  existing: 0,
});
check("Put-credit without width is cash-secured, not premium-sized", nakedCredit.definedRisk === false
  && nakedCredit.riskPer === 9850
  && nakedCredit.shown === 1
  && nakedCredit.rule1Pass === false
  && nakedCredit.contracts < creditNaive);

const fatCredit = OC.computePlan({
  mode: "putcredit",
  strike: 50,
  spot: 51,
  prem: 1,
  width: 5,
  portfolio: 50000,
  existing: 9500,
});
check("Put-credit Rule 2 blocks when existing + max loss exceeds 20%", fatCredit.rule2Pass === false && fatCredit.allClear === false);

const review = OC.computePlan({ mode: "review", strike: 50, spot: 48, prem: 5, portfolio: 50000 });
check("Review mode does not invent a size", review.ready === false && review.mode === "review");

const trades = [
  { id: 1, type: "shares", instr: "AAPL", sizeOk: false },
  { id: 2, type: "options", instr: "RACE", sizeOk: false, stopOk: true, incomplete: false },
  { id: 3, type: "cfd", instr: "EURUSD", sizeOk: false },
];
check("isOptionsTrade keys off type", OC.isOptionsTrade(trades[1]) === true && OC.isOptionsTrade(trades[0]) === false);
check("flagged options skip CFD/shares", OC.flaggedOptionsTrades(trades).length === 1 && OC.flaggedOptionsTrades(trades)[0].id === 2);
check("firstReviewable returns the options row", OC.firstReviewable(trades).id === 2);
check("optMode also counts as options", OC.isOptionsTrade({ instr: "MSFT", optMode: "leaps" }) === true);

console.log("ok " + n);
