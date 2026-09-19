#!/usr/bin/env node
/** Terminal MA200 overlay (warmup + red) and slower session-wave play. */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
const deskSrc = fs.readFileSync(path.join(root, "js/desk.js"), "utf8");
const waveSrc = fs.readFileSync(path.join(root, "js/wave.js"), "utf8");
const css = fs.readFileSync(path.join(root, "css/desk.css"), "utf8");

function check(name, cond) {
  assert(cond, name);
}

const v = html.match(/var V = "(\d+)"/)[1];
const cache = sw.match(/CACHE = "runnr-v(\d+)"/)[1];
check("index.html V matches sw.js CACHE", v === cache);
check("desk.js cache-busted", html.includes("js/desk.js?v=17"));
check("desk.css cache-busted", html.includes("css/desk.css?v=10"));
check("wave.js cache-busted", html.includes("js/wave.js?v=2"));

check("MA200 is red", /MA_COLORS = \{[^}]*200:\s*"#e85d6f"/.test(deskSrc));
check("MA50 is gold, not red", /MA_COLORS = \{[^}]*50:\s*"#E8C97A"/.test(deskSrc)
  && !/MA_COLORS = \{[^}]*50:\s*"#e85d6f"/.test(deskSrc));
check("MA20 is cyan, not gold", /MA_COLORS = \{[^}]*20:\s*"#7eb8e8"/.test(deskSrc)
  && !/MA_COLORS = \{[^}]*20:\s*"#C9A96E"/.test(deskSrc)
  && !/MA_COLORS = \{[^}]*20:\s*"#E8C97A"/.test(deskSrc));
check("MA9 is violet, not cyan/gold/red", /MA_COLORS = \{[^}]*9:\s*"#b5a0d4"/.test(deskSrc));
check("MA200 chip CSS is red", css.includes('.desk-chip[data-desk-ma="200"].on')
  && /data-desk-ma="200"\]\.on\{[^}]*color:#e85d6f/.test(css));
check("MA50 chip CSS is gold", /data-desk-ma="50"\]\.on\{[^}]*color:#E8C97A/.test(css));
check("MA20 chip CSS is cyan", /data-desk-ma="20"\]\.on\{[^}]*color:#7eb8e8/.test(css));
check("MA9 chip CSS is violet", /data-desk-ma="9"\]\.on\{[^}]*color:#b5a0d4/.test(css));
check("status labels use MA color classes", css.includes('.desk-ma-lab[data-n="20"]{color:#7eb8e8}')
  && css.includes('.desk-ma-lab[data-n="50"]{color:#E8C97A}'));
check("overlay uses full series then slices display window",
  deskSrc.includes("function maOverlay")
  && deskSrc.includes("sma(full, period).slice(offset)")
  && deskSrc.includes("displayBars(series)"));
check("chart still labels 60 sessions", deskSrc.includes('tf === "1D" ? "60 sessions"'));
check("wave play is 3× slower than 0.12", waveSrc.includes("const PLAY_RATE = 0.04")
  && !waveSrc.includes("dt * 0.12"));

function loadDesk() {
  const ctx = {
    localStorage: { getItem: () => null, setItem: () => {} },
    document: { getElementById: () => null },
    window: {},
    fetch: async () => ({ ok: true, json: async () => ({ rows: [], bars: [], source: "yahoo" }) }),
    setInterval: () => 1,
    clearInterval: () => {},
    requestAnimationFrame: (fn) => fn(),
    console,
  };
  ctx.window = ctx;
  ctx.window.RunnrSync = { isLoggedIn: () => false, isPro: () => false, apiBase: () => "" };
  vm.runInNewContext(deskSrc, ctx);
  return ctx.RunnrDesk._test;
}

function loadWave() {
  const ctx = {
    window: {},
    document: { getElementById: () => null, body: { classList: { contains: () => false } } },
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
    console,
  };
  ctx.window = ctx;
  vm.runInNewContext(waveSrc, ctx);
  return ctx.RunnrWave;
}

function bars(n, start) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const c = (start || 100) + i * 0.25;
    out.push({ d: "2025-01-01", o: c, h: c + 1, l: c - 1, c, v: 10 });
  }
  return out;
}

const T = loadDesk();
check("DISPLAY_BARS is 60", T.DISPLAY_BARS === 60);
check("MA200 color token is red", T.MA_COLORS[200] === "#e85d6f");
check("MA50 color token is gold", T.MA_COLORS[50] === "#E8C97A");
check("MA20 color token is cyan", T.MA_COLORS[20] === "#7eb8e8");
check("MA9 color token is violet", T.MA_COLORS[9] === "#b5a0d4");
check("default MA colors are all distinct",
  new Set(Object.values(T.MA_COLORS)).size === Object.keys(T.MA_COLORS).length);

const short = T.sma(bars(60), 200);
check("SMA200 is empty on a 60-bar window", short.every((v) => v == null));

const long = bars(259);
const sma200 = T.sma(long, 200);
check("SMA200 starts at index 199", sma200[198] == null && sma200[199] != null);
check("SMA200 has a value on every display bar after warmup",
  sma200.slice(-60).every((v) => v != null && Number.isFinite(v)));

const overlayShort = T.maOverlay(bars(60), { 50: true, 200: true });
const ma50s = overlayShort.find((m) => m.n === 50);
const ma200s = overlayShort.find((m) => m.n === 200);
check("60-bar overlay still computes MA50", ma50s && ma50s.arr.filter((v) => v != null).length === 11);
check("60-bar overlay cannot invent MA200", ma200s && ma200s.arr.every((v) => v == null));

const overlay = T.maOverlay(long, { 50: true, 200: true });
const ma50 = overlay.find((m) => m.n === 50);
const ma200 = overlay.find((m) => m.n === 200);
check("display overlay is 60 long", ma50.arr.length === 60 && ma200.arr.length === 60);
check("MA200 plots across the 60-session window with warmup",
  ma200.arr.every((v) => v != null && Number.isFinite(v)));
check("MA50 and MA200 colors stay distinct", ma50.color === "#E8C97A" && ma200.color === "#e85d6f");
const overlayStd = T.maOverlay(long, { 20: true, 50: true });
const ma20 = overlayStd.find((m) => m.n === 20);
const ma50std = overlayStd.find((m) => m.n === 50);
check("MA20 and MA50 colors stay distinct", ma20.color === "#7eb8e8" && ma50std.color === "#E8C97A");
check("displayBars keeps last 60", T.displayBars(long).length === 60);
check("status labels list toggled MAs", T.maLabels({ ma: { 50: true, 200: true } }) === "MA50 · MA200");
check("status markup colors MA20 and MA50",
  T.maLabelMarkup({ ma: { 20: true, 50: true } }) ===
    '<span class="desk-ma-lab" data-n="20">MA20</span> · <span class="desk-ma-lab" data-n="50">MA50</span>');
check("toggle handler refreshes chart meta", deskSrc.includes("maLabelMarkup(prefs)")
  && deskSrc.includes("desk-ma-status"));

const W = loadWave();
check("exported play rate is 0.04", W.PLAY_RATE === 0.04);
check("full sweep is ~25s at 0.04", Math.abs(1 / W.PLAY_RATE - 25) < 0.01);

console.log("test_desk_ma_wave: ok");
