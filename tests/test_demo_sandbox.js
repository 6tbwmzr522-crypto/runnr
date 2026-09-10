#!/usr/bin/env node
/** Populated SAMPLE desk: real score/PnL, demo excluded from caps, merge never clobbers. */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const { root, html, src, sw, css } = require("./app_src").loadAppSource();
const sandboxSrc = fs.readFileSync(path.join(root, "js/demo-sandbox.js"), "utf8");
const coachSrc = fs.readFileSync(path.join(root, "js/coach.js"), "utf8");
const baronSrc = fs.readFileSync(path.join(root, "js/baron.js"), "utf8");
const limitSrc = fs.readFileSync(path.join(root, "js/trade-limit.js"), "utf8");
const replaySrc = fs.readFileSync(path.join(root, "js/discipline-replay.js"), "utf8");
const syncSrc = fs.readFileSync(path.join(root, "js/sync.js"), "utf8");
const onboardingSrc = fs.readFileSync(path.join(root, "js/onboarding.js"), "utf8");

let n = 0;
function check(name, cond) {
  assert(cond, name);
  n += 1;
}

const v = html.match(/var V = "(\d+)"/)[1];
const cache = sw.match(/CACHE = "runnr-v(\d+)"/)[1];
check("index.html V matches sw.js CACHE", v === cache);
check("cache is 135+", Number(v) >= 135);
check("demo-sandbox.js is loaded before app-state", html.indexOf("js/demo-sandbox.js") < html.indexOf("js/app-state.js"));
check("demo-sandbox.js is loaded before sync", html.indexOf("js/demo-sandbox.js") < html.indexOf("js/sync.js"));
check("persistent SAMPLE chrome + trial CTA", html.includes('id="demo-chrome"') && html.includes("SAMPLE · not your book") && html.includes('id="demo-chrome-cta"') && html.includes("Start free · 7-day trial"));
check("journal rows badge SAMPLE", src.includes("demo-row-badge") && src.includes("SAMPLE"));
check("optional synced/manual sample badges", src.includes("Synced (sample)") && src.includes("Manual (sample)"));
check("guest chrome CSS is persistent", css.includes("#demo-chrome.show{display:flex}"));
check("quiet desk does not apply on demo state", src.includes("!demo && window.RunnrDeskQuiet"));
check("discipline card unlocks for demo state", onboardingSrc.includes("const unlocked = demo || this.scoreShareUnlocked(state)"));
check("scoreTrades includes demo rows in demo state", /if \(demo\) return all\.filter/.test(onboardingSrc));
check("sync merge uses isDemo flag not id set", /isDemoJournalTrade/.test(syncSrc) && !/DEMO_TRADE_IDS/.test(syncSrc));
check("hydrate refuses signed-in books", sandboxSrc.includes("if (isLoggedIn()) return false") && sandboxSrc.includes("looksLikeRealBook"));
check("demo apply completes onboarding so the analyse wizard stays closed", sandboxSrc.includes("state.onboardingComplete = true"));
check("demo=1 skips the analyse wizard", onboardingSrc.includes('get("demo") === "1"') && onboardingSrc.includes("completeOnboarding(state)"));

function freshCtx() {
  const store = {};
  const ctx = {
    window: {},
    localStorage: {
      getItem(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
      setItem(k, v) { store[k] = String(v); },
      removeItem(k) { delete store[k]; },
      get length() { return Object.keys(store).length; },
      key(i) { return Object.keys(store)[i]; },
    },
    sessionStorage: {
      _s: {},
      getItem(k) { return Object.prototype.hasOwnProperty.call(this._s, k) ? this._s[k] : null; },
      setItem(k, v) { this._s[k] = String(v); },
    },
    location: { hostname: "localhost", search: "", pathname: "/", href: "http://localhost/" },
    navigator: { userAgent: "node", sendBeacon() { return true; } },
    document: { getElementById() { return null; }, documentElement: { classList: { toggle() {}, add() {}, remove() {} } } },
    console,
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  return ctx;
}

const scoreCtx = freshCtx();
vm.runInNewContext(baronSrc, scoreCtx);
vm.runInNewContext(coachSrc, scoreCtx);
vm.runInNewContext(limitSrc, scoreCtx);
vm.runInNewContext(replaySrc, scoreCtx);
vm.runInNewContext(sandboxSrc, scoreCtx);

const SB = scoreCtx.RunnrDemoSandbox;
const Coach = scoreCtx.CoachEngine;
const TL = scoreCtx.RunnrTradeLimit;
const DR = scoreCtx.DisciplineReplay;
const Baron = scoreCtx.Baron;
const now = new Date();
const book = SB.factoryTrades(now);
const settings = { bal: 10000, risk: 1, sym: "€", trades: book };

check("factory ships 12–22 Alex fills", book.length >= 12 && book.length <= 22);
check("every factory fill is isDemo", book.every((t) => t.isDemo === true));
check("classic RACE/BE/AAPL CFD seeds remain", book[0].instr === "RACE" && book[1].instr === "BE" && book[3].instr === "AAPL CFD" && book[3].incomplete === true);
check("at least one incomplete Replay-teaching row", book.filter((t) => t.incomplete).length >= 1);
check("riskSnapshot present on every fill", book.every((t) => t.riskSnapshot && Number(t.riskSnapshot.bal) === 10000));

const score = Coach.disciplineScore(book);
check("score comes from CoachEngine not a DOM literal", score.overall >= 78 && score.overall <= 85);
check("Consistent Runner / Disciplined band", score.tier === "Consistent Runner" || score.tier === "Disciplined");
check("stop held above size (size is the leak)", score.stopPct > score.sizePct && score.stopPct >= 70 && score.sizePct >= 60 && score.sizePct <= 80);
check("trade count looks real", score.tradeCount >= 10);
check("streak is non-zero on a current book", score.streak >= 1);

const metrics = Coach.metrics(book);
check("disciplined P&L is non-zero", metrics.discPnl !== 0);
check("undisciplined / size-leak P&L is non-zero", metrics.undiscPnl !== 0);
check("disciplined P&L >> leak P&L", metrics.discPnl > metrics.undiscPnl && metrics.discPnl - metrics.undiscPnl > 500);
check("stop vs size split cards have values", metrics.stopPct > 0 && metrics.sizePct > 0);

const replayable = book.filter((t) => DR.canReplay(t, settings, Baron));
check("at least one demo fill is openable in Replay", replayable.length >= 1 && replayable.some((t) => t.riskSnapshot));

check("demo book is excluded from journal/trial caps", TL.countJournalTradesForLimit(book) === 0);
check("demo book does not unlock the real share gate", TL.scoreShareUnlocked(book, { isLoggedIn: () => false, billing: () => ({}) }) === false);

const realFill = { id: 9001, instr: "NVDA", source: "alpaca", pnl: 12, stopOk: true, sizeOk: true };
check("mixed book counts only the real fill", TL.countJournalTradesForLimit(book.concat([realFill])) === 1);

const thin = { bal: 10000, risk: 1, sym: "€", trades: SB.classicSeeds(), watchlist: SB.factoryWatchlist().slice(0, 3) };
check("thin guest demo should upgrade", SB.shouldApply(thin) === true);
const upgraded = Object.assign({}, thin, { trades: thin.trades.slice(), watchlist: thin.watchlist.slice() });
check("apply upgrades the thin book", SB.apply(upgraded) === true && upgraded.trades.length >= 12 && upgraded.demoSandboxRev === SB.REV);

const realState = { bal: 18400, risk: 1, trades: [{ id: 77, instr: "AAPL", pnl: 20 }], watchlist: [] };
check("real book is never overwritten", SB.shouldApply(realState) === false && SB.apply(realState) === false && realState.trades.length === 1);

const signedIn = freshCtx();
signedIn.localStorage.setItem("runnr_api_token", "tok");
vm.runInNewContext(limitSrc, signedIn);
vm.runInNewContext(sandboxSrc, signedIn);
const signedThin = { bal: 10000, trades: signedIn.RunnrDemoSandbox.classicSeeds(), watchlist: [] };
check("signed-in empty/demo is not clobbered by sandbox", signedIn.RunnrDemoSandbox.shouldApply(signedThin) === false);

const mergeCtx = freshCtx();
vm.runInNewContext(limitSrc, mergeCtx);
vm.runInNewContext(sandboxSrc, mergeCtx);
vm.runInNewContext(syncSrc, mergeCtx);
const RS = mergeCtx.RunnrSync;
check("mergeTrades is exported", typeof RS.mergeTrades === "function");

const demoLocal = SB.factoryTrades(now);
const remoteReal = [
  { id: 501, instr: "IBM", source: "csv", pnl: 40, stopOk: true, sizeOk: true },
  { id: 502, instr: "ORCL", source: "alpaca", pnl: -15, stopOk: true, sizeOk: false },
];
const merged = RS.mergeTrades(demoLocal, remoteReal);
check("merge drops every demo row when a real book exists", merged.every((t) => !t.isDemo) && merged.length === 2);
check("merge keeps both real fills", merged.some((t) => t.id === 501) && merged.some((t) => t.id === 502));

const localReal = [{ id: 880, instr: "MSFT", pnl: 9 }];
const remoteDemo = SB.factoryTrades(now);
const mergedLocalWins = RS.mergeTrades(localReal, remoteDemo);
check("local real fills survive a demo remote", mergedLocalWins.some((t) => t.id === 880) && mergedLocalWins.every((t) => !t.isDemo));

const emptyRemote = RS.mergeTrades(demoLocal, []);
check("demo-only merge keeps the sample when neither side is real", emptyRemote.length === demoLocal.length && emptyRemote.every((t) => t.isDemo));

check("isDemoState is true for the factory book", RS.isDemoState({ trades: demoLocal, watchlist: SB.factoryWatchlist(), bal: 10000 }) === true);
check("isDemoState is false once a real fill lands", RS.isDemoState({ trades: demoLocal.concat([realFill]), watchlist: SB.factoryWatchlist(), bal: 10000 }) === false);
check("hasMeaningfulState ignores a demo-only book", RS.hasMeaningfulState({ trades: demoLocal, watchlist: SB.factoryWatchlist(), bal: 10000 }) === false);
check("hasMeaningfulState sees a real fill", RS.hasMeaningfulState({ trades: [realFill], bal: 10000 }) === true);

const wl = SB.factoryWatchlist();
check("watchlist is seeded from the sample symbols", wl.length >= 4 && wl.every((w) => w.isDemo === true) && wl.some((w) => w.sym === "NVDA"));

console.log("test_demo_sandbox: ok " + n);
