#!/usr/bin/env node
/** Smoke + gate tests for the first-minute homepage hook. */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const ob = fs.readFileSync(path.join(root, "js/onboarding.js"), "utf8");
const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");

function check(name, cond) {
  assert(cond, name);
}

const v = html.match(/var V = "(\d+)"/)[1];
const cache = sw.match(/CACHE = "runnr-v(\d+)"/)[1];
check("index.html V matches sw.js CACHE", v === cache);
check("onboarding.js cache-busted", html.includes("js/onboarding.js?v=29"));
check("headline present", html.includes("Trading discipline, not a broker"));
check("hook names Terminal", html.includes("<dt>Terminal</dt>"));
check("hook Terminal pill is look-without-paying", html.includes("Session clocks, heatmap, chart — look without paying"));
check("not-a-broker kicker", html.includes("You do not trade here"));
check("primary CTA", html.includes('id="ob-hook-start"') && html.includes("Start free"));
check("sample is secondary", html.includes('id="ob-hook-enter">View sample'));
check("report secondary", html.includes('href="/report/"') && html.includes("Score one trade"));
check("pricing copy", html.includes("Start free · 10 journal trades · then €19/month or €190/year"));
check("sample disclaimer", html.includes("Sample journal is labeled SAMPLE. Those numbers are not yours."));
check("first-paint class", html.includes("runnr-show-hook"));
check("guest first-paint class", html.includes("runnr-guest"));
check("hook key", html.includes("runnr_hook_v1") && ob.includes("runnr_hook_v1"));
check("meta description", html.includes('name="description"') && html.includes("Not a broker"));
check("demo trades no longer auto-complete onboarding", /state\.trades && state\.trades\.length >= 3/.test(ob) === false);

const store = {};
const classList = { items: new Set(), add(c) { this.items.add(c); }, remove(c) { this.items.delete(c); } };
const ctx = {
  localStorage: {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
  },
  document: {
    documentElement: { classList },
    getElementById: () => null,
  },
  window: {},
  console,
};
ctx.window = ctx;
vm.runInNewContext(ob, ctx);
const G = ctx.RunnrGrowth;

const demoState = { trades: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }] };
check("unsigned sample journal sees hook", G.shouldShowHook(demoState) === true);
check("sample journal does not auto-complete analyse wizard", G.shouldShowOnboarding(demoState) === true);

store.runnr_hook_v1 = "done";
check("dismissed hook stays dismissed", G.shouldShowHook(demoState) === false);
delete store.runnr_hook_v1;

ctx.RunnrSync = { isLoggedIn: () => true, isDemoState: () => true };
check("signed-in users skip hook", G.shouldShowHook(demoState) === false);

ctx.RunnrSync = { isLoggedIn: () => false, isDemoState: () => false };
check("real journal skips hook", G.shouldShowHook({ trades: [{ id: 9, source: "csv" }] }) === false);

ctx.RunnrSync = { isLoggedIn: () => false, isDemoState: () => true };
check("unsigned demo still sees hook", G.shouldShowHook(demoState) === true);

console.log("test_first_minute_hook: ok");
