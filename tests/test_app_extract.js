#!/usr/bin/env node
/** Slice 1 extract: inline app script moved to js/app-*.js, cache bump, globals kept. */
"use strict";

const assert = require("assert");
const { html, src, sw, scripts } = require("./app_src").loadAppSource();

let n = 0;
function check(name, cond) {
  assert(cond, name);
  n += 1;
}

const v = html.match(/var V = "(\d+)"/)[1];
const cache = sw.match(/CACHE = "runnr-v(\d+)"/)[1];
check("index.html V matches sw.js CACHE", v === cache);
check("cache is 131+", Number(v) >= 131);

const appFiles = [
  "js/app-state.js",
  "js/app-nav.js",
  "js/app-settings.js",
  "js/app-sizer.js",
  "js/app-journal.js",
  "js/app-watchlist.js",
  "js/app-quotes.js",
  "js/app-alerts.js",
  "js/app-portfolio.js",
  "js/app-sync-ui.js",
  "js/app-coach-page.js",
  "js/app-boot.js",
];
appFiles.forEach((f) => {
  check(f + " is loaded with cache-bust", html.includes(f + "?v=1"));
  check(f + " is in the script list", scripts.includes(f));
});

check("boot cache-bust script stays inline", html.includes('localStorage.getItem("runnr_app_v")'));
check("guest-hook boot script stays inline", html.includes("runnr-show-hook") && html.includes("runnr_hook_v1"));
check("hook dismiss helper stays inline", html.includes("window.__runnrDismissHook"));
check("existing modules still load before app files", html.indexOf("js/sync.js") < html.indexOf("js/app-state.js"));
check("boot script is last app file", html.indexOf("js/app-boot.js") > html.indexOf("js/app-state.js"));

const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
check("only tiny inline scripts remain", inline.length === 2 && inline.every((s) => s.length < 2500));
check("index.html is under 300KB after extract", Buffer.byteLength(html) < 300000);

check("S is still assigned on window", src.includes("window.S = S"));
check("seed trades still flagged isDemo", /id:\s*1,\s*isDemo:\s*true/.test(src) && /id:\s*4,\s*isDemo:\s*true/.test(src));
check("onclick globals still declared", /function switchPage\(/.test(src) && /function saveLog\(/.test(src) && /function persist\(/.test(src));
check("initApp still boots", /function initApp\(/.test(src) && /startMarketFeedsIfAllowed\(\)/.test(src));

console.log("ok", n);
