#!/usr/bin/env node
/** Logged-out Terminal opens a public preview; Pro keeps the personal desk. */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const deskSrc = fs.readFileSync(path.join(root, "js/desk.js"), "utf8");
const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");

function check(name, cond) {
  assert(cond, name);
}

const v = html.match(/var V = "(\d+)"/)[1];
const cache = sw.match(/CACHE = "runnr-v(\d+)"/)[1];
check("index.html V matches sw.js CACHE", v === cache);
check("desk.js cache-busted", html.includes("js/desk.js?v=12"));
check("desk.css cache-busted", html.includes("css/desk.css?v=8"));

check("open() does not requirePro-gate Terminal", !/requirePro\(\s*["']Terminal["']/.test(deskSrc));
check("preview universe is public ETFs", deskSrc.includes('PREVIEW_UNIVERSE = ["SPY", "QQQ", "GLD", "SLV", "USO", "AAPL"]'));
check("preview skips personal levels", /function levelsFor\(sym\) \{\s*if \(isPreview\(\)\) return \[\];/.test(deskSrc));
check("preview does not send auth", /function authHeaders\(\) \{[\s\S]*?if \(isPreview\(\)\) return h;/.test(deskSrc));
check("upgrade CTA is on the desk, not the feature", deskSrc.includes("desk-preview-cta") && deskSrc.includes('openUpgrade("Your Terminal")'));
check("sample heatmap label", deskSrc.includes("Sample heatmap"));
check("watchlist heatmap stays for Pro", deskSrc.includes("Watchlist heatmap"));
check("nav still opens RunnrDesk.open", html.includes('data-nav="desk" onclick="RunnrDesk.open()"'));

function loadDesk(opts) {
  const store = {};
  const timers = [];
  const ctx = {
    localStorage: {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
    },
    document: {
      getElementById: () => null,
    },
    window: {},
    fetch: async () => ({ ok: true, json: async () => ({ rows: [], bars: [], source: "yahoo" }) }),
    setInterval: (fn) => { timers.push(fn); return timers.length; },
    clearInterval: () => {},
    requestAnimationFrame: (fn) => fn(),
    console,
  };
  ctx.window = ctx;
  ctx.window.S = opts.S || {};
  ctx.window.RunnrSync = opts.RunnrSync || {
    isLoggedIn: () => false,
    isPro: () => false,
    apiBase: () => "http://localhost:8090",
  };
  ctx.window.requirePro = async () => {
    ctx.requireProCalled = true;
    return false;
  };
  ctx.window.switchPage = (key) => { ctx.switched = key; };
  ctx.window.openUpgrade = (label) => { ctx.upgraded = label; };
  vm.runInNewContext(deskSrc, ctx);
  return ctx;
}

(async () => {
  const loggedOut = loadDesk({});
  check("logged-out is preview", loggedOut.RunnrDesk.isPreview() === true);
  await loggedOut.RunnrDesk.open();
  check("logged-out open ignores requirePro false", loggedOut.switched === "desk");
  check("logged-out open does not call requirePro", loggedOut.requireProCalled !== true);

  const freeUser = loadDesk({
    RunnrSync: {
      isLoggedIn: () => true,
      isPro: () => false,
      apiBase: () => "http://localhost:8090",
    },
    S: { watchlist: [{ id: 9, quoteSym: "NVDA", entry: 100, stop: 90, target: 120 }] },
  });
  check("logged-in free is preview", freeUser.RunnrDesk.isPreview() === true);
  await freeUser.RunnrDesk.open();
  check("logged-in free still opens desk", freeUser.switched === "desk");

  const pro = loadDesk({
    RunnrSync: {
      isLoggedIn: () => true,
      isPro: () => true,
      apiBase: () => "http://localhost:8090",
      terminalTitle: (n) => (n ? n + "'s terminal" : "Terminal"),
    },
    S: { firstName: "Ada", watchlist: [{ id: 9, quoteSym: "NVDA", entry: 100, stop: 90, target: 120 }] },
  });
  check("Pro is not preview", pro.RunnrDesk.isPreview() === false);
  await pro.RunnrDesk.open();
  check("Pro still opens desk", pro.switched === "desk");

  console.log("test_desk_preview: ok");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
