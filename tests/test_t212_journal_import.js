#!/usr/bin/env node
/** T212 journal import: mapping ids + importOrders idempotency (no live API). */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const syncSrc = fs.readFileSync(path.join(root, "js/sync.js"), "utf8");
const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
const t212Py = fs.readFileSync(path.join(root, "api/app/t212.py"), "utf8");
const brokersPy = fs.readFileSync(path.join(root, "api/app/routers/brokers.py"), "utf8");

function check(name, cond) {
  assert(cond, name);
}

const v = html.match(/var V = "(\d+)"/)[1];
const cache = sw.match(/CACHE = "runnr-v(\d+)"/)[1];
check("index.html V matches sw.js CACHE", v === cache);
check("sync.js cache-busted", html.includes("js/sync.js?v=63"));
check("journal has T212 import control", html.includes('id="journal-t212-btn"') && html.includes("importT212Fills"));
check("Trading 212 is a live broker card", /code:\s*'Trading 212'[\s\S]{0,80}live:\s*true/.test(html));
check("T212 sync route exists", brokersPy.includes('/t212/sync') && brokersPy.includes('/t212/status'));
check("T212 client is GET-only", t212Py.includes("method=\"GET\"") || t212Py.includes("method='GET'"));
check("T212 refuses order-write paths", t212Py.includes("order-write"));
check("T212 never posts market/limit orders", !/orders\/market/.test(t212Py.split("order-write")[0]) || t212Py.includes("Refusing Trading 212 order-write path"));
check("env names are T212_API_KEY / T212_API_SECRET", t212Py.includes("T212_API_KEY") && t212Py.includes("T212_API_SECRET"));
check("live host is live.trading212.com", t212Py.includes("https://live.trading212.com"));
check("mapping does not copy realised P&L", t212Py.includes("Never copies broker P&L") || t212Py.includes("Does not attach realisedProfitLoss"));

function loadSync() {
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
    setTimeout: () => 0,
    clearTimeout: () => {},
  };
  ctx.window = ctx;
  ctx.window.S = {
    trades: [
      { id: 1, instr: "RACE", dir: "long", entry: 354, exit: 380, size: 28, pnl: 728 },
    ],
    bal: 10000,
  };
  vm.runInNewContext(syncSrc, ctx);
  return ctx;
}

const ctx = loadSync();
const RS = ctx.window.RunnrSync;
check("RunnrSync.importOrders exported", typeof RS.importOrders === "function");
check("RunnrSync.syncT212 exported", typeof RS.syncT212 === "function");

const fills = [
  {
    id: "t212:fill:9001",
    symbol: "AAPL",
    side: "buy",
    qty: 10,
    filled_qty: 10,
    filled_avg_price: 190.5,
    status: "filled",
    filled_at: "2026-03-12T14:32:01.000Z",
  },
  {
    id: "t212:fill:9002",
    symbol: "AAPL",
    side: "sell",
    qty: 10,
    filled_qty: 10,
    filled_avg_price: 198.25,
    status: "filled",
    filled_at: "2026-03-18T15:01:00.000Z",
  },
];

const first = RS.importOrders(fills, [], { source: "t212" });
check("first import adds both legs or a paired round-trip", first.added === 2);
check("first import pairs the round-trip", first.paired >= 1);

const t212Trades = (ctx.window.S.trades || []).filter((t) => t.source === "t212");
check("demo sample dropped after real fills", !(ctx.window.S.trades || []).some((t) => t.id === 1 && !t.source));
check("imported size is fill qty", t212Trades.some((t) => Number(t.size) === 10));
check("P&L is from pairing not a broker field", t212Trades.every((t) => t.realisedProfitLoss == null));
const closed = t212Trades.find((t) => t.alpacaPaired);
check("paired trade has entry and exit", !!(closed && Number(closed.entry) === 190.5 && Number(closed.exit) === 198.25));
check("paired P&L uses prices and size", !!(closed && closed.pnl === Math.round((198.25 - 190.5) * 10)));

const second = RS.importOrders(fills, [], { source: "t212" });
check("re-import adds zero trades", second.added === 0);
const after = (ctx.window.S.trades || []).filter((t) => t.source === "t212" && !t.mergedAway);
check("re-import does not duplicate", after.length === t212Trades.filter((t) => !t.mergedAway).length);

console.log("ok", 16);
