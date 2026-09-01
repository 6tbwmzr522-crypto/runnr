#!/usr/bin/env node
/** Free-plan journal cap: imported fills count; demo rows do not. */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
const limitSrc = fs.readFileSync(path.join(root, "js/trade-limit.js"), "utf8");
const syncSrc = fs.readFileSync(path.join(root, "js/sync.js"), "utf8");
const profilePy = fs.readFileSync(path.join(root, "api/app/routers/profile.py"), "utf8");

let n = 0;
function check(name, cond) {
  assert(cond, name);
  n += 1;
}

const v = html.match(/var V = "(\d+)"/)[1];
const cache = sw.match(/CACHE = "runnr-v(\d+)"/)[1];
check("index.html V matches sw.js CACHE", v === cache);
check("trade-limit.js is loaded", html.includes("js/trade-limit.js?v=1"));
check("sync.js cache-busted", html.includes("js/sync.js?v=67"));
check("count no longer excludes imported fills", !/!isImportedJournalTrade/.test(html));
check("hint copy says manual + imports", html.includes("trades logged (manual + imports)"));
check("limit-reached copy mentions imports", html.includes("including imports"));
check("profile PUT enforces the cap", profilePy.includes("would_exceed_free_limit") && profilePy.includes("FREE_LIMIT_DETAIL"));

function loadLimit() {
  const ctx = {
    window: {},
    console,
    Set,
    Map,
    Number,
    String,
    Object,
    Array,
    Math,
    JSON,
    Date,
    Infinity,
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.runInNewContext(limitSrc, ctx);
  return ctx.window.RunnrTradeLimit;
}

const TL = loadLimit();
const freeSync = { isPro: () => false, billing: () => ({ enabled: true }) };
const proSync = { isPro: () => true, billing: () => ({ enabled: true }) };
const billingOff = { isPro: () => false, billing: () => ({ enabled: false }) };

const demo = [
  { id: 1, instr: "RACE", dir: "long", entry: 354, exit: 380, size: 28, pnl: 728 },
  { id: 2, instr: "BE", dir: "long", entry: 137, exit: 151, size: 65, pnl: 910 },
  { id: 3, instr: "USDJPY", dir: "short", entry: 159.37, exit: 157.93, size: 0.5, pnl: 720 },
  { id: 4, instr: "AAPL CFD", dir: "long", entry: 198, exit: 195, size: 15, pnl: -45, incomplete: true },
];

check("demo-only count is 0", TL.countJournalTradesForLimit(demo) === 0);
check("demo-only user can add 10", TL.canAddJournalTrade(10, demo, freeSync) === true);
check("demo-only user cannot add 11", TL.canAddJournalTrade(11, demo, freeSync) === false);
check("10 slots remaining with only demos", TL.journalTradeSlotsRemaining(demo, freeSync) === 10);

const t212Ten = [];
for (let i = 0; i < 10; i++) {
  t212Ten.push({
    id: 1000 + i,
    instr: "AAPL",
    dir: "long",
    source: "t212",
    externalId: "t212:fill:" + (9000 + i),
    size: 1,
  });
}
check("10 T212 fills count as 10", TL.countJournalTradesForLimit(t212Ten) === 10);
check("10 T212 fills block an 11th", TL.canAddJournalTrade(1, t212Ten, freeSync) === false);
check("0 slots remaining at 10 T212 fills", TL.journalTradeSlotsRemaining(t212Ten, freeSync) === 0);

const mixed = demo.concat(t212Ten);
check("demos still ignored next to T212 fills", TL.countJournalTradesForLimit(mixed) === 10);

const withMerged = t212Ten.concat([{ id: 2000, source: "t212", mergedAway: true, instr: "MSFT" }]);
check("merged-away rows do not count", TL.countJournalTradesForLimit(withMerged) === 10);

const csvEight = Array.from({ length: 8 }, (_, i) => ({
  id: 3000 + i,
  source: "csv",
  instr: "NVDA",
  externalId: "csv:" + i,
}));
check("CSV fills count", TL.countJournalTradesForLimit(csvEight) === 8);
check("8 CSV + 2 more ok", TL.canAddJournalTrade(2, csvEight, freeSync) === true);
check("8 CSV + 3 blocked", TL.canAddJournalTrade(3, csvEight, freeSync) === false);

check("Pro is unlimited", TL.canAddJournalTrade(100, t212Ten, proSync) === true);
check("billing.enabled false is unlimited", TL.canAddJournalTrade(100, t212Ten, billingOff) === true);

function loadSync(opts) {
  const store = {};
  const ctx = {
    localStorage: {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
      get length() { return Object.keys(store).length; },
      key: (i) => Object.keys(store)[i] || null,
    },
    location: { hostname: "localhost" },
    window: {},
    console,
    Date,
    Math,
    JSON,
    Set,
    Map,
    Number,
    String,
    Object,
    Array,
    parseInt,
    isNaN: Number.isNaN,
    Infinity,
    setTimeout: () => 0,
    clearTimeout: () => {},
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  ctx.window.S = {
    trades: (opts.trades || []).map((t) => ({ ...t })),
    bal: 10000,
  };
  vm.runInNewContext(limitSrc, ctx);
  vm.runInNewContext(syncSrc, ctx);
  if (opts.free) {
    ctx.window.RunnrSync.isPro = () => false;
    ctx.window.RunnrSync.billing = () => ({ enabled: true });
  }
  return ctx;
}

function fill(id, at) {
  return {
    id,
    symbol: "AAPL",
    side: "buy",
    qty: 1,
    filled_qty: 1,
    filled_avg_price: 190,
    status: "filled",
    filled_at: at || "2026-03-12T14:32:01.000Z",
  };
}

const seeded = loadSync({
  free: true,
  trades: t212Ten,
});
const eleventh = seeded.window.RunnrSync.importOrders(
  [fill("t212:fill:9999", "2026-04-01T10:00:00.000Z")],
  [],
  { source: "t212" }
);
check("importOrders adds zero when already at 10", eleventh.added === 0);
check("importOrders reports limited at cap", eleventh.limited === true);
check("existing T212 rows stay", seeded.window.S.trades.filter((t) => t.source === "t212" && !t.mergedAway).length === 10);

const demoCtx = loadSync({
  free: true,
  trades: demo,
});
const tenFills = Array.from({ length: 10 }, (_, i) =>
  fill("t212:fill:" + (100 + i), "2026-03-01T00:00:0" + i + ".000Z")
);
const firstTen = demoCtx.window.RunnrSync.importOrders(tenFills, [], { source: "t212" });
check("demo journal can import 10 fills", firstTen.added === 10);
check("first 10 fills not limited", firstTen.limited !== true);
const extra = demoCtx.window.RunnrSync.importOrders(
  [fill("t212:fill:overflow", "2026-05-01T00:00:00.000Z")],
  [],
  { source: "t212" }
);
check("11th fill after demo+10 is blocked", extra.added === 0 && extra.limited === true);

const room = loadSync({
  free: true,
  trades: csvEight,
});
const batch = room.window.RunnrSync.importOrders(
  [
    fill("alpaca:1", "2026-01-01T00:00:00.000Z"),
    fill("alpaca:2", "2026-01-02T00:00:00.000Z"),
    fill("alpaca:3", "2026-01-03T00:00:00.000Z"),
  ],
  [],
  { source: "alpaca" }
);
check("import uses remaining slots only", batch.added === 2 && batch.limited === true);
check(
  "journal stays at 10 after partial import",
  room.window.RunnrSync && TL.countJournalTradesForLimit(room.window.S.trades) === 10
);

const unlimited = loadSync({
  free: false,
  trades: t212Ten,
});
const proImport = unlimited.window.RunnrSync.importOrders(
  [fill("t212:fill:pro-extra", "2026-06-01T00:00:00.000Z")],
  [],
  { source: "t212" }
);
check("Pro import is not capped", proImport.added === 1 && !proImport.limited);

console.log("ok", n);
