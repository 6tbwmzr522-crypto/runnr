#!/usr/bin/env node
/** One canonical broker catalog; chips show complete names, not Alpa/Schw. */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const { root, html, src, sw, css, scripts } = require("./app_src").loadAppSource();
const catalogSrc = fs.readFileSync(path.join(root, "js/brokers.js"), "utf8");
const syncUiSrc = fs.readFileSync(path.join(root, "js/app-sync-ui.js"), "utf8");

let n = 0;
function check(name, cond) {
  assert(cond, name);
  n += 1;
}

const v = html.match(/var V = "(\d+)"/)[1];
const cache = sw.match(/CACHE = "runnr-v(\d+)"/)[1];
check("index.html V matches sw.js CACHE", v === cache);
check("cache is 176+", Number(v) >= 176);
check("brokers.js is loaded before app-sync-ui", html.indexOf("js/brokers.js?v=1") < html.indexOf("js/app-sync-ui.js?v=3"));
check("brokers.js is in the script list", scripts.includes("js/brokers.js"));
check("available-brokers is not a hardcoded Alpaca stub", /id="available-brokers"\s*>\s*</.test(html));
check("HTML no longer ships Alpa truncation", !html.includes(">Alpa<") && !html.includes(">Schw<"));
check("sync UI does not slice broker names to 4 chars", !syncUiSrc.includes("code.slice(0,4)") && !syncUiSrc.includes(".slice(0,4)"));
check("sync UI reads the shared catalog", syncUiSrc.includes("catalogBrokers()") && syncUiSrc.includes("RunnrBrokers"));
check("home preview paints the shared parade", syncUiSrc.includes("brokerParadeHtml()") && syncUiSrc.includes("renderHomeBrokerPreview"));
check("chip CSS wraps and does not ellipsize", css.includes(".broker-chip-parade") && css.includes("white-space:normal") && /text-overflow:\s*clip/.test(css) && !/\.broker-chip\{[^}]*text-overflow:\s*ellipsis/.test(css.replace(/\s+/g, " ")));
check("logo marks are not overflow-hidden", /\.broker-card \.bk-logo\{[^}]*overflow:\s*visible/.test(css.replace(/\s+/g, " ")));

function loadCatalog() {
  const ctx = { window: {}, console };
  ctx.window = ctx;
  vm.runInNewContext(catalogSrc, ctx);
  return ctx.RunnrBrokers;
}

const RB = loadCatalog();
const list = RB.list();
const names = list.map((b) => b.name);
const expected = ["Alpaca", "IBKR", "Trading 212", "eToro", "Degiro", "Schwab"];
check("catalog has the six offered brokers", names.join("|") === expected.join("|"));
check("ids are stable", list.map((b) => b.id).join("|") === "alpaca|ibkr|t212|etoro|degiro|schwab");
check("Trading 212 stays live", RB.byCode("Trading 212").live === true && RB.byId("t212").csvPreset === "t212");
check("Alpaca and IBKR stay live", RB.byId("alpaca").live === true && RB.byId("ibkr").live === true && RB.byId("ibkr").kind === "flex");
check("CSV-only brokers are not live", !RB.byId("etoro").live && !RB.byId("degiro").live && !RB.byId("schwab").live);
check("CSV-only brokers keep presets", RB.byId("etoro").csvPreset === "etoro" && RB.byId("schwab").csvPreset === "schwab");
check("marks are complete words or known shorts", list.every((b) => b.mark === "ALP" || b.mark === "IBKR" || b.mark === "T212" || b.mark === b.name));
check("no mid-word marks", !list.some((b) => b.mark === "Alpa" || b.mark === "Schw" || b.mark === "Trad" || b.mark === "Degi"));

const parade = RB.paradeHtml({});
check("parade lists every catalog name", expected.every((name) => parade.includes(">" + name + "<")));
check("parade chips do not use truncated labels", !parade.includes(">Alpa<") && !parade.includes(">Schw<") && !parade.includes(">Trad<"));
check("connectBroker still routes live names", syncUiSrc.includes("name === 'Alpaca'") && syncUiSrc.includes("name === 'IBKR'") && syncUiSrc.includes("name === 'Trading 212'"));
check("CSV connect uses catalog presets, not a second map", syncUiSrc.includes("b.csvPreset") && !syncUiSrc.includes("csvMap"));
check("home empty state is not Alpaca-only", syncUiSrc.includes("Tap a name to connect or import CSV") && !syncUiSrc.includes("Connect Alpaca →"));

const t212 = list.find((b) => b.id === "t212");
check("src still flags Trading 212 live for older checks", t212 && t212.live === true && t212.code === "Trading 212");

console.log("ok", n);
