#!/usr/bin/env node
/** FVG retrace — optional when/where strip on CFD / shares. 2% / stop math stays. */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
const fvgSrc = fs.readFileSync(path.join(root, "js/fvg-retrace.js"), "utf8");

let n = 0;
function check(name, cond) {
  assert(cond, name);
  n += 1;
}

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

const v = html.match(/var V = "(\d+)"/)[1];
const cache = sw.match(/CACHE = "runnr-v(\d+)"/)[1];
check("index.html V matches sw.js CACHE", v === cache);
check("cache is 122+", Number(v) >= 122);
check("fvg-retrace.js is loaded", html.includes("js/fvg-retrace.js?v=1"));
check("CFD strip is present", html.includes('id="cfd-fvg-strip"')
  && html.includes('id="cfd-fvg-high"')
  && html.includes('id="cfd-fvg-low"')
  && html.includes('id="cfd-fvg-confirm"'));
check("shares reuses the same strip", html.includes('id="sh-fvg-strip"')
  && html.includes('id="sh-fvg-high"')
  && html.includes('id="sh-fvg-confirm"'));
check("strip starts collapsed", /<details class="fvg-strip" id="cfd-fvg-strip">/.test(html)
  && !/<details[^>]*id="cfd-fvg-strip"[^>]*open/.test(html));
check("FVG fields are not required", !/id="cfd-fvg-high"[^>]*required/.test(html)
  && !/id="cfd-fvg-low"[^>]*required/.test(html));
check("primary CFD log CTA stays mint btn", /id="cfd-log-btn"[^>]*class="btn"/.test(html)
  || /class="btn"[^>]*id="cfd-log-btn"/.test(html));
check("CFD / shares log still goes through saveLogFromSizer", html.includes("saveLogFromSizer('cfd')")
  && html.includes("saveLogFromSizer('shares')"));
check("sizer log blocks when FVG gates fail", /function saveLogFromSizer[\s\S]*fvgCanLog === false[\s\S]*return/.test(html));
check("review-before-save also fail-closes", /function fillLogFromSizer[\s\S]*fvgCanLog === false[\s\S]*return/.test(html));
check("logged FVG setup is persisted", /if \(draft\.setup\) patch\.setup = draft\.setup/.test(html)
  && html.includes("t.setup === 'fvg'"));
check("calcCFD still sizes from entry / stop / risk", /function calcCFD[\s\S]*Baron\.sizeForex[\s\S]*applyFvgStrip\('cfd'/.test(html));
check("empty strip does not gate vanilla CFD size", /function calcCFD[\s\S]*if \(!entry \|\| !stop\)/.test(html)
  && !/cfd-fvg-high/.test(extractTopFn(html, "calcCFD").split("applyFvgStrip")[0]));

const homeJobFn = extractTopFn(html, "runHomeJob") + extractTopFn(html, "focusSizerForNextTrade");
check("Home job does not open FVG strip", !/fvg|FVG|cfd-fvg/.test(homeJobFn));
check("Home still sizes CFD by default", html.includes("function focusSizerForNextTrade")
  && /focusSizerForNextTrade[\s\S]*cfd-instr/.test(homeJobFn));
check("Home job list is unchanged", html.includes("function runHomeJob")
  && !/job\.id === 'fvg'/.test(html));

const candleBingo = /harami|morning star|three (white )?soldiers|evening star|shooting star|doji|inverted hammer|piercing/i;
const confirmCopy = (html.match(/hammer \/ engulfing/g) || []).length;
check("no candle-name bingo picker", !candleBingo.test(html + fvgSrc)
  && !/data-candle|candle-pattern|pattern-pick/i.test(html + fvgSrc)
  && confirmCopy <= 1);
check("optional helper mentions one example once", html.includes("e.g. hammer / engulfing"));
check("no live chart / FVG scanner", !/fvg.?auto|detectFvg|fair.?value.?gap.?scan/i.test(html + fvgSrc)
  && !/chart\.js|tradingview|canvas.*candle|ohlc/i.test(fvgSrc)
  && !/finnhub|broker.?chart|screenshot/i.test(fvgSrc));
check("no JasonL / nsinghal / best-pattern copy", !/JasonL|nsinghal|best pattern/i.test(html + fvgSrc));
check("Options Coach file is untouched by this strip", html.includes("js/options-coach.js?v=1")
  && html.includes('id="opt-coach"')
  && !/FvgRetrace|fvg-retrace/.test(fs.readFileSync(path.join(root, "js/options-coach.js"), "utf8")));

const ctx = { window: {}, document: { getElementById: () => null } };
ctx.window = ctx;
ctx.globalThis = ctx;
vm.runInNewContext(fvgSrc, ctx);
const Fvg = ctx.FvgRetrace;

const unused = Fvg.evaluate({ high: "", low: "", confirm: "", stop: 1.0980, dir: "long" });
check("empty strip is unused and can log", unused.used === false && unused.canLog === true && !unused.setup);

const vanillaSize = { units: 100, withinRules: true };
check("unused evaluate does not invent a size", unused.canLog === true && vanillaSize.units === 100 && vanillaSize.withinRules === true);

const missingZone = Fvg.evaluate({ high: "", low: "", confirm: "yes", stop: 1.0980, dir: "long" });
check("missing zone numbers are not ready", missingZone.used === true && missingZone.ready === false && missingZone.canLog === false && missingZone.reason === "not-ready");

const noConfirm = Fvg.evaluate({ high: 1.1050, low: 1.1000, confirm: "no", stop: 1.0980, dir: "long" });
check("no-confirm fails closed", noConfirm.canLog === false && noConfirm.confirmOk === false && noConfirm.reason === "no-confirm");

const unsetConfirm = Fvg.evaluate({ high: 1.1050, low: 1.1000, confirm: "", stop: 1.0980, dir: "long" });
check("unset confirm also fails closed", unsetConfirm.canLog === false && unsetConfirm.reason === "no-confirm");

const stopInside = Fvg.evaluate({ high: 1.1050, low: 1.1000, confirm: "yes", stop: 1.1020, dir: "long" });
check("stop inside the zone fails", stopInside.canLog === false && stopInside.stopOk === false && stopInside.reason === "stop-inside");

const stopOnLow = Fvg.evaluate({ high: 1.1050, low: 1.1000, confirm: "yes", stop: 1.1000, dir: "long" });
check("stop on the zone edge is not beyond", stopOnLow.canLog === false && stopOnLow.reason === "stop-inside");

const missingStop = Fvg.evaluate({ high: 1.1050, low: 1.1000, confirm: "yes", stop: "", dir: "long" });
check("missing stop fails the beyond-zone check", missingStop.canLog === false && missingStop.reason === "stop-inside");

const longOk = Fvg.evaluate({ high: 1.1050, low: 1.1000, confirm: "yes", stop: 1.0980, dir: "long" });
check("confirm + stop below bullish FVG can log", longOk.canLog === true && longOk.setup === "fvg" && longOk.stopOk === true);

const shortInside = Fvg.evaluate({ high: 1.1050, low: 1.1000, confirm: "yes", stop: 1.1030, dir: "short" });
check("short stop inside the zone fails", shortInside.canLog === false && shortInside.reason === "stop-inside");

const shortOk = Fvg.evaluate({ high: 1.1050, low: 1.1000, confirm: "yes", stop: 1.1070, dir: "short" });
check("confirm + stop above bearish FVG can log", shortOk.canLog === true && shortOk.setup === "fvg");

const swapped = Fvg.evaluate({ high: 1.1000, low: 1.1050, confirm: "yes", stop: 1.0980, dir: "long" });
check("swapped high/low still forms a zone", swapped.canLog === true && swapped.zoneHigh === 1.1050 && swapped.zoneLow === 1.1000);

console.log("ok " + n);
