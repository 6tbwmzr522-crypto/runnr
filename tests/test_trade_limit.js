#!/usr/bin/env node
/** Trial/Pro entitlement: countable trades still drive aha gates; no 10-trade cap. */
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
const i18nSrc = fs.readFileSync(path.join(root, "js/i18n.js"), "utf8");
const loginHtml = fs.readFileSync(path.join(root, "login.html"), "utf8");
const reportHtml = fs.readFileSync(path.join(root, "report/index.html"), "utf8");
const obSrc = fs.readFileSync(path.join(root, "js/onboarding.js"), "utf8");

let n = 0;
function check(name, cond) {
  assert(cond, name);
  n += 1;
}

const leftoverRe = /10 journal trades|5 journal trades|free 5-trade|free 10-trade|10-trade journal|10-trade cap|track 10 trades|Free plan limit reached/;
[
  ["index.html", html],
  ["i18n.js", i18nSrc],
  ["login.html", loginHtml],
  ["report/index.html", reportHtml],
  ["onboarding.js", obSrc],
  ["trade-limit.js", limitSrc],
].forEach(([name, src]) => {
  check("no leftover 10-trade copy in " + name, !leftoverRe.test(src) && !src.includes("FREE_TRADE_LIMIT"));
});

const v = html.match(/var V = "(\d+)"/)[1];
const cache = sw.match(/CACHE = "runnr-v(\d+)"/)[1];
check("index.html V matches sw.js CACHE", v === cache);
check("trade-limit.js is loaded", html.includes("js/trade-limit.js?v=4"));
check("sync.js cache-busted", html.includes("js/sync.js?v=70"));
check("count no longer excludes imported fills", !/!isImportedJournalTrade/.test(html));
check("profile PUT blocks growth after trial", profilePy.includes("would_grow_journal_without_access") && profilePy.includes("TRIAL_EXPIRED_DETAIL"));
check("user-facing copy is 7-day trial", html.includes("Start free · 7-day trial · then €19/month or €190/year"));
check("no leftover 10 journal / 10-trade copy", !/10 journal trades|5 journal trades|free 5-trade|free 10-trade|10-trade journal|10-trade cap|track 10 trades/.test(html));
check("no leftover 10 trades marketing in html", !html.includes("10 trades"));
check("remaining counter markup exists", html.includes("data-free-trade-counter"));
check("score lock copy in markup", html.includes("Log 3 trades to unlock your score") && html.includes('id="disc-unlock-note"'));
check("share modal has locked panel", html.includes('id="share-locked"'));
check("no FREE_TRADE_LIMIT entitlement", !limitSrc.includes("FREE_TRADE_LIMIT"));

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
const freeSync = { isPro: () => false, isLoggedIn: () => false, billing: () => ({ enabled: true }) };
const expiredSync = { isPro: () => false, isLoggedIn: () => true, billing: () => ({ enabled: true, trialActive: false, trialDaysLeft: 0 }) };
const trialSync = {
  isPro: () => true,
  isLoggedIn: () => true,
  billing: () => ({ enabled: true, trialActive: true, trialDaysLeft: 5, status: "free", plan: "free" }),
};
const paidProSync = {
  isPro: () => true,
  isLoggedIn: () => true,
  billing: () => ({ enabled: true, status: "active", plan: "monthly" }),
};
const billingOff = { isPro: () => false, billing: () => ({ enabled: false }) };

const demo = [
  { id: 1, isDemo: true, instr: "RACE", dir: "long", entry: 354, exit: 380, size: 28, pnl: 728 },
  { id: 2, isDemo: true, instr: "BE", dir: "long", entry: 137, exit: 151, size: 65, pnl: 910 },
  { id: 3, isDemo: true, instr: "USDJPY", dir: "short", entry: 159.37, exit: 157.93, size: 0.5, pnl: 720 },
  { id: 4, isDemo: true, instr: "AAPL CFD", dir: "long", entry: 198, exit: 195, size: 15, pnl: -45, incomplete: true },
];

check("demo-only count is 0", TL.countJournalTradesForLimit(demo) === 0);
check("score share min is 3", TL.SCORE_SHARE_MIN_TRADES === 3);
check("trial days constant is 7", TL.TRIAL_DAYS === 7);
check("demo-only score is locked", TL.scoreShareUnlocked(demo, freeSync) === false);
check("demo lock copy pushes log", TL.scoreShareLockCopy(demo, freeSync).includes("Log 3 trades"));
check("2 real trades stay locked for trial", TL.scoreShareUnlocked([{ id: 10 }, { id: 11 }], trialSync) === false);
check("3 real trades unlock score/share", TL.scoreShareUnlocked([{ id: 10 }, { id: 11 }, { id: 12 }], trialSync) === true);
check("Paid Pro with 1 trade can share", TL.scoreShareUnlocked([{ id: 10 }], paidProSync) === true);
check("Trial with 1 trade stays locked", TL.scoreShareUnlocked([{ id: 10 }], trialSync) === false);
check("Paid Pro with 0 trades stays locked", TL.scoreShareUnlocked(demo, paidProSync) === false);
check("guest label asks to sign in", TL.freeSlotsLabel(demo, freeSync).includes("7-day trial"));
check("expired label", TL.freeSlotsLabel(demo, expiredSync) === "Trial ended — upgrade to keep Runnr");
check("trial days label", TL.freeSlotsLabel(demo, trialSync) === "5 days left in trial");
check("paid Pro has no slots label", TL.freeSlotsLabel(demo, paidProSync) === "");

check("guest cannot add a trade", TL.canAddJournalTrade(1, demo, freeSync) === false);
check("expired cannot add a trade", TL.canAddJournalTrade(1, demo, expiredSync) === false);
check("trial can add 100", TL.canAddJournalTrade(100, demo, trialSync) === true);
check("expired remaining is 0", TL.journalTradeSlotsRemaining(demo, expiredSync) === 0);

const craftedIds = [
  { id: 1, instr: "RACE" },
  { id: 2, instr: "BE" },
  { id: 3, instr: "USDJPY" },
  { id: 4, instr: "AAPL CFD" },
];
check("crafted ids 1–4 without isDemo count", TL.countJournalTradesForLimit(craftedIds) === 4);
check("seed:true also excluded", TL.countJournalTradesForLimit([{ id: 9, seed: true }]) === 0);

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

const mixed = demo.concat(t212Ten);
check("demos still ignored next to T212 fills", TL.countJournalTradesForLimit(mixed) === 10);

const withMerged = t212Ten.concat([{ id: 2000, source: "t212", mergedAway: true, instr: "MSFT" }]);
check("merged-away rows do not count", TL.countJournalTradesForLimit(withMerged) === 10);

check("Paid Pro is unlimited", TL.canAddJournalTrade(100, t212Ten, paidProSync) === true);
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
  if (opts.pro) {
    ctx.window.RunnrSync.isPro = () => true;
    ctx.window.RunnrSync.billing = () => ({ enabled: true, pro: true, status: "active" });
  } else if (opts.trial) {
    ctx.window.RunnrSync.isPro = () => true;
    ctx.window.RunnrSync.billing = () => ({ enabled: true, pro: true, trialActive: true, trialDaysLeft: 6, status: "free" });
  } else if (opts.free) {
    ctx.window.RunnrSync.isPro = () => false;
    ctx.window.RunnrSync.billing = () => ({ enabled: true, trialActive: false });
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
check("importOrders adds zero when paywalled", eleventh.added === 0);
check("importOrders reports limited when paywalled", eleventh.limited === true);

const demoCtx = loadSync({
  free: true,
  trades: demo,
});
const firstTen = demoCtx.window.RunnrSync.importOrders(
  [fill("t212:fill:100", "2026-03-01T00:00:00.000Z")],
  [],
  { source: "t212" }
);
check("paywalled journal cannot import the first fill", firstTen.added === 0 && firstTen.limited === true);

const trialImport = loadSync({
  trial: true,
  trades: t212Ten,
});
const trialExtra = trialImport.window.RunnrSync.importOrders(
  [fill("t212:fill:trial-extra", "2026-06-01T00:00:00.000Z")],
  [],
  { source: "t212" }
);
check("trial import is not capped", trialExtra.added === 1 && !trialExtra.limited);

const unlimited = loadSync({
  pro: true,
  trades: t212Ten,
});
const proImport = unlimited.window.RunnrSync.importOrders(
  [fill("t212:fill:pro-extra", "2026-06-01T00:00:00.000Z")],
  [],
  { source: "t212" }
);
check("Pro import is not capped", proImport.added === 1 && !proImport.limited);

const failClosed = loadSync({ trades: t212Ten });
check("default billing cache is not Pro", failClosed.window.RunnrSync.isPro() === false);
check("default billing.enabled is on (fail closed)", failClosed.window.RunnrSync.billing().enabled === true);
check("default billing.pro is false", failClosed.window.RunnrSync.billing().pro === false);
const failClosedImport = failClosed.window.RunnrSync.importOrders(
  [fill("t212:fill:fail-closed", "2026-07-01T00:00:00.000Z")],
  [],
  { source: "t212" }
);
check("fail-closed default caps import", failClosedImport.added === 0 && failClosedImport.limited === true);

function loadSyncBilling(opts) {
  const store = Object.assign({}, opts && opts.store);
  let meCalls = 0;
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
    atob: (s) => Buffer.from(s, "base64").toString("binary"),
    setTimeout: () => 0,
    clearTimeout: () => {},
    AbortController: class {
      constructor() { this.signal = {}; }
      abort() {}
    },
    fetch: async (url) => {
      const u = String(url);
      if (opts && opts.me && u.includes("/auth/me") && meCalls++ === 0) {
        return {
          ok: true,
          statusText: "OK",
          json: async () => opts.me,
        };
      }
      throw new Error("network");
    },
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  ctx.window.S = { trades: [], bal: 10000 };
  vm.runInNewContext(limitSrc, ctx);
  vm.runInNewContext(syncSrc, ctx);
  return ctx;
}

const loggedFail = loadSyncBilling({ store: { runnr_api_token: "tok" } });
check("logged-in isPro false before /me", loggedFail.window.RunnrSync.isPro() === false);

(async () => {
  const afterFail = await loggedFail.window.RunnrSync.refreshBilling();
  check("refresh failure does not grant Pro", afterFail.pro === false);
  check("refresh failure keeps billing on", afterFail.enabled === true);
  check("isPro still false after failed refresh", loggedFail.window.RunnrSync.isPro() === false);

  const boss = loadSyncBilling({
    store: { runnr_api_token: "tok" },
    me: {
      pro: true,
      billing_enabled: true,
      plan: "boss",
      subscription_status: "active",
      house: true,
      email_verified: true,
    },
  });
  const firstMe = await boss.window.RunnrSync.refreshBilling();
  check("successful /me boss is Pro", firstMe.pro === true && boss.window.RunnrSync.isPro() === true);
  const kept = await boss.window.RunnrSync.refreshBilling();
  check("failed refresh preserves known Pro", kept.pro === true && boss.window.RunnrSync.isPro() === true);

  const trialMe = loadSyncBilling({
    store: { runnr_api_token: "tok" },
    me: {
      pro: true,
      billing_enabled: true,
      plan: "free",
      subscription_status: "free",
      trial_active: true,
      trial_days_left: 4,
      trial_ends_at: "2099-01-01T00:00:00Z",
      email_verified: true,
    },
  });
  const trialBill = await trialMe.window.RunnrSync.refreshBilling();
  check("successful /me trial is Pro", trialBill.pro === true && trialMe.window.RunnrSync.isPro() === true);
  check("trial days land on billing cache", trialMe.window.RunnrSync.billing().trialDaysLeft === 4);
  check("trial active lands on billing cache", trialMe.window.RunnrSync.billing().trialActive === true);

  check("shipped seed trades have isDemo", /id:\s*1,\s*isDemo:\s*true/.test(html));
  check("limit helper no longer uses DEMO_TRADE_IDS", !/DEMO_TRADE_IDS/.test(limitSrc));

  console.log("ok", n);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
