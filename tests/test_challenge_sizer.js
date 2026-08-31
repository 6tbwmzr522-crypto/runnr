#!/usr/bin/env node
/** Challenge-book remaining limits + sizer TRADE BLOCKED (same idea as options gate). */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const baronSrc = fs.readFileSync(path.join(root, "js/baron.js"), "utf8");
const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");

function check(name, cond) {
  assert(cond, name);
}

const v = html.match(/var V = "(\d+)"/)[1];
const cache = sw.match(/CACHE = "runnr-v(\d+)"/)[1];
check("index.html V matches sw.js CACHE", v === cache);
check("baron.js cache-busted", html.includes("js/baron.js?v=30"));
check("personal book stays the default toggle", html.includes('id="sizer-book-personal"') && html.includes("Personal 1%"));
check("challenge book toggle exists", html.includes('id="sizer-book-challenge"'));
check("sizer reuses Trade Blocked gate", html.includes("id=\"cfd-challenge-gate\"") && html.includes("Trade Blocked"));
check("journal near-miss banner exists", html.includes("journal-challenge-banner"));
check("settings keep custom eval fields", html.includes("set-ch-daily") && html.includes("set-ch-dd") && html.includes("set-ch-target"));
check("consistency is a labeled setting", html.includes("id=\"set-ch-consistency\"") && html.includes("Best-day cap"));
check("home challenge card exists", html.includes('id="home-challenge-card"'));
check("guest shell hides home challenge card", html.includes("html.runnr-guest #home-challenge-card") || html.includes("html.runnr-guest .home-challenge-card"));
check("approaching warning lives on the challenge card", html.includes("id=\"ch-approach-warn\""));
check("sample journal still ships", html.includes("instr:'RACE'") && html.includes("instr:'AAPL CFD'"));
check("options 2% / 20% / 2R gate still present", html.includes("Max 2% portfolio risk per trade") && html.includes("Max 20% total options exposure") && html.includes("Minimum 2:1 reward-to-risk ratio"));

const ctx = { window: {}, document: { getElementById: () => null } };
ctx.window = ctx;
vm.runInNewContext(baronSrc, ctx);
const Baron = ctx.Baron;

check("personal is default", Baron.defaultChallenge().enabled === false);
check("saved configs default consistency off", Baron.defaultChallenge().consistencyPct === 0);
check("FTMO 100k-style preset", Baron.CHALLENGE_PRESETS[0].id === "ftmo100" && Baron.CHALLENGE_PRESETS[0].accountSize === 100000);
check("50k eval-style preset is generic", Baron.CHALLENGE_PRESETS.some((p) => p.id === "eval50" && p.accountSize === 50000));
check("presets carry a 30% best-day cap", Baron.CHALLENGE_PRESETS.every((p) => p.consistencyPct === 30));
check("old saved challenge stays consistency-off", Baron.normalizeChallenge({ enabled: true, accountSize: 100000 }).consistencyPct === 0);

const now = new Date("2026-08-28T15:00:00");
const cfg = Baron.normalizeChallenge({
  enabled: true,
  preset: "ftmo100",
  firm: "FTMO",
  accountSize: 100000,
  maxDailyLoss: 2000,
  maxTrailingDd: 5000,
  profitTarget: 10000,
});

const todayLoss = {
  id: 10,
  book: "challenge",
  dateKey: "2026-08-28",
  pnl: -1140,
  entry: 100,
  exit: 90,
  size: 1,
  dir: "long",
};
let rem = Baron.challengeRemaining(cfg, [todayLoss], now);
check("today's journal loss uses daily allowance", rem.dailyUsed === 1140 && rem.dailyLeft === 860);
check("sample-style personal trades are ignored", Baron.challengeRemaining(cfg, [
  { id: 1, instr: "RACE", pnl: 728, entry: 354, exit: 380, size: 28, dir: "long" },
], now).dailyUsed === 0);

const fill = Baron.evaluateChallengeFill(rem, 1260, 12);
check("1% size that exceeds remaining daily is blocked", fill.blocked === true && fill.reason === "daily");
check("max size is remaining daily / risk per contract", fill.maxSize === 8);
check("near-miss note names the numbers", Baron.challengeNearMissNote(fill, "contracts") === "12 contracts vs 8 max for daily loss left.");

const okFill = Baron.evaluateChallengeFill(rem, 800, 7);
check("size inside remaining daily is not blocked", okFill.blocked === false);

const personalBal = Baron.sizerBalance({ bal: 10000, risk: 1, challenge: { enabled: false, accountSize: 100000 } });
check("personal sizer still uses the 1% book balance", personalBal === 10000);
check("challenge sizer uses eval account size", Baron.sizerBalance({ bal: 10000, challenge: cfg }) === 100000);

const peakThenGiveback = [
  { id: 21, book: "challenge", dateKey: "2026-08-20", pnl: 4210, entry: 1, exit: 2, size: 1, dir: "long" },
  { id: 22, book: "challenge", dateKey: "2026-08-27", pnl: -3200, entry: 2, exit: 1, size: 1, dir: "long" },
];
const ddRem = Baron.challengeRemaining(cfg, peakThenGiveback, now);
check("trailing DD from journal high-water", ddRem.ddUsed === 3200 && ddRem.ddLeft === 1800);
check("profit is net journal P&L", ddRem.profit === 1010);

const overrideCfg = Baron.normalizeChallenge({
  ...cfg,
  overrideDailyUsed: 1140,
  overrideDdUsed: 3200,
  overrideProfit: 4210,
});
const over = Baron.challengeRemaining(overrideCfg, [], now);
check("manual override when journal is incomplete", over.dailyLeft === 860 && over.ddLeft === 1800 && over.profit === 4210);
check("override does not invent live counters", over.dailyFromJournal === false);

const ddFill = Baron.evaluateChallengeFill({ dailyLeft: 5000, ddLeft: 400 }, 1260, 12);
check("trailing DD can also block", ddFill.blocked === true && ddFill.reason === "dd");
check("DD near-miss copy", Baron.challengeNearMissNote(ddFill, "contracts").includes("trailing DD left"));

const empty = Baron.challengeRemaining(cfg, [], now);
check("empty journal daily is 0 used, full remaining", empty.dailyUsed === 0 && empty.dailyLeft === 2000 && empty.emptyBook === true);
check("empty journal DD is 0 used, full remaining", empty.ddUsed === 0 && empty.ddLeft === 5000);
check("empty journal profit is 0, full target left", empty.profit === 0 && empty.profitLeft === 10000);
check("empty journal best day is 0", empty.bestDayPnl === 0 && empty.consistencyShare === 0);
check("used/left label is not an em-dash", Baron.usedLeftLabel(empty.dailyUsed, empty.dailyLeft) === "0 used · 2000 left");
check("profit-to-target label is not an em-dash", Baron.profitToTargetLabel(empty.profit, empty.profitTarget) === "0 · 10000 to target");
check("render always writes used/left, including zero", html.includes("used · ") && html.includes(" left") && html.includes(" to target"));

const approachOk = Baron.challengeApproaching(empty);
check("full remaining is not an approaching alert", approachOk.tight === false);

const tightRem = { dailyLeft: 340, dailyLimit: 2000, ddLeft: 1800, ddLimit: 5000 };
const approach = Baron.challengeApproaching(tightRem);
check("under 20% of daily cap left is approaching", approach.tight === true && approach.reasons.includes("daily"));
check("DD still healthy is not flagged", !approach.reasons.includes("dd"));
const wall = Baron.challengeApproaching({ dailyLeft: 0, dailyLimit: 2000, ddLeft: 0, ddLimit: 5000 });
check("zero remaining is the hard wall, not an approaching alert", wall.tight === false);

const consCfg = Baron.normalizeChallenge({
  ...cfg,
  consistencyPct: 30,
});
const priorGreen = [
  { id: 31, book: "challenge", dateKey: "2026-08-20", pnl: 4000, entry: 1, exit: 2, size: 1, dir: "long" },
  { id: 32, book: "challenge", dateKey: "2026-08-21", pnl: 3500, entry: 1, exit: 2, size: 1, dir: "long" },
];
const consRem = Baron.challengeRemaining(consCfg, priorGreen, now);
check("best day vs total profit", consRem.bestDayPnl === 4000 && consRem.profit === 7500);
check("consistency share is best/profit", Math.abs(consRem.consistencyShare - 4000 / 7500) < 1e-9);
const freshCons = Baron.challengeRemaining(consCfg, [], now);
check("first green day is not auto-blocked", Baron.evaluateChallengeFill(freshCons, 200, 2, 800).blocked === false);

const consFill = Baron.evaluateChallengeFill(consRem, 200, 10, 4000);
check("target that would put today over 30% is blocked", consFill.blocked === true && consFill.reason === "consistency");
check("consistency near-miss names the cap", Baron.challengeNearMissNote(consFill, "contracts") === "10 contracts vs 8 max for consistency cap.");
const consOk = Baron.evaluateChallengeFill(consRem, 200, 4, 800);
check("smaller target that stays under the cap is not blocked", consOk.blocked === false);
const consRiskOnly = Baron.evaluateChallengeFill(consRem, 200, 10, 0);
check("consistency is not guessed without a target P&L", consRiskOnly.blocked === false);

const consToday = Baron.challengeRemaining(consCfg, priorGreen.concat([
  { id: 33, book: "challenge", dateKey: "2026-08-28", pnl: 2800, entry: 1, exit: 2, size: 1, dir: "long" },
]), now);
check("today approaching the consistency cap warns", Baron.challengeApproaching(consToday).reasons.includes("consistency"));

console.log("ok " + module.filename);
