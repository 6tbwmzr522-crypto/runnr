#!/usr/bin/env node
/** Janis Saturday review: brokers stack, live AI reads, coach ask, keep-score login, parked intro. */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const { root, html, sw, css, src } = require("./app_src").loadAppSource();
const watchSrc = fs.readFileSync(path.join(root, "js/app-watchlist.js"), "utf8");
const coachSrc = fs.readFileSync(path.join(root, "js/coach.js"), "utf8");
const coachPageSrc = fs.readFileSync(path.join(root, "js/app-coach-page.js"), "utf8");
const introSrc = fs.readFileSync(path.join(root, "js/intro.js"), "utf8");

let n = 0;
function check(name, cond) {
  assert(cond, name);
  n += 1;
}

const v = html.match(/var V = "(\d+)"/)[1];
const cache = sw.match(/CACHE = "runnr-v(\d+)"/)[1];
check("index.html V matches sw.js CACHE", v === cache);
check("cache is 157+", Number(v) >= 157);

check("commodities sit before brokers in markup", html.indexOf('class="card home-commodities-card') < html.indexOf('class="card home-brokers-card'));
check("markets sit before brokers in markup", html.indexOf('class="card home-markets-card') < html.indexOf('class="card home-brokers-card'));
check("desktop brokers stay full-width", css.includes("#page-home .home-frame > .home-brokers-card"));
check("desktop market cards are content-sized", css.includes(".home-commodities-card") && css.includes("min-height:min-content"));

check("AI brief sends live price", watchSrc.includes("params.set('price'") && watchSrc.includes("watchLivePrice"));
check("AI brief invalidates on price drift", watchSrc.includes("WATCH_BRIEF_PRICE_PCT") && watchSrc.includes("watchBriefPriceDrift"));
check("AI brief TTL is live-cadence not 15m", /WATCH_BRIEF_MS = 3 \* 60 \* 1000/.test(watchSrc) && !/WATCH_BRIEF_MS = 15 \* 60 \* 1000/.test(watchSrc));
check("AI read tap still force-refreshes", watchSrc.includes("fetchWatchBriefForItem(w, true)"));
check("expand refreshes stale AI read", /function selectWatch[\s\S]*refreshWatchBriefForItem/.test(watchSrc));
check("stale and loading remark states exist", watchSrc.includes("watchBriefStale") && css.includes(".remark-src.stale") && css.includes("wcr-remark-loading"));

function loadWatch() {
  const ctx = {
    window: {},
    S: { watchlist: [], selectedWatchId: null },
    persist() {},
    liveprices: {},
    BARON_THESIS_PLACEHOLDER: "…",
    URLSearchParams,
    Date,
    Number,
    Math,
    isFinite,
    parseFloat,
    JSON,
    console,
    document: { getElementById() { return null; } },
  };
  ctx.window = ctx;
  vm.runInNewContext(watchSrc, ctx);
  return ctx;
}

const W = loadWatch();
const now = Date.now();
W.liveprices.GDX = { price: 95.48 };
const fresh = { sym: "GDX", autoRemark: "long at 95", autoRemarkAt: now - 30 * 1000, autoRemarkPrice: 95.4 };
const aged = { sym: "GDX", autoRemark: "long at 88.74", autoRemarkAt: now - 10 * 60 * 1000, autoRemarkPrice: 88.74 };
const drifted = { sym: "GDX", autoRemark: "long at 88.74", autoRemarkAt: now - 20 * 1000, autoRemarkPrice: 88.74 };
check("fresh remark tied to live print stays fresh", W.watchBriefFresh(fresh) === true);
check("aged remark is stale", W.watchBriefFresh(aged) === false && W.watchBriefStale(aged) === true);
check("price-drifted remark is stale", W.watchBriefFresh(drifted) === false && W.watchBriefPriceDrift(drifted) === true);
const staleHtml = W.renderRemarkHtml(aged);
check("stale remark paints a stale badge", staleHtml.includes("stale") && staleHtml.includes("long at 88.74"));
const loadingHtml = W.renderRemarkHtml({ sym: "GDX", autoRemarkLoading: true });
check("loading remark paints fetching copy", loadingHtml.includes("Fetching market read"));

check("coach free-ask is a styled form field", html.includes('id="coach-free-ask"') && html.includes('class="coach-free-ask"') && html.includes('class="coach-ask-row"'));
check("coach free-ask is not a naked white input", /id="coach-free-ask"[^>]*class="coach-free-ask"/.test(html));
check("coach ask CSS uses Runnr surface not white", css.includes(".coach-free-ask{") && css.includes("background:var(--surface2)") && css.includes("caret-color:var(--gold)"));
check("coach pills remain", html.includes("Why do I cut winners early?") && html.includes('onclick="askCoach(this)"'));

const coachCtx = { window: {}, CoachEngine: null };
coachCtx.window = coachCtx;
vm.runInNewContext(coachSrc, coachCtx);
const custom = coachCtx.CoachEngine.answerQuestion(
  [{ instr: "AAPL", pnl: 12, stopOk: true, sizeOk: true, dir: "long" }],
  "what is my process telling me",
  "€",
  10000,
  1
);
check("custom coach questions get a data answer", typeof custom === "string" && custom.length > 20);
check("askCoachFree still requires Pro", /async function askCoachFree[\s\S]{0,500}requirePro\(\s*['"]Coach['"]\)/.test(coachPageSrc));
const errorHtml = W.renderRemarkHtml({ sym: "GDX", autoRemarkError: "Market read timed out — tap ↻ AI read" });
check("failed remark paints error not a spinner", errorHtml.includes("timed out") && !errorHtml.includes("Fetching market read"));
const idleHtml = W.renderRemarkHtml({ sym: "GDX" });
check("idle remark is empty not a spinner", idleHtml === "");

const keep = html.slice(html.indexOf('id="modal-sample-keep"'), html.indexOf('id="modal-share"'));
check("keep-score bait CTA stays", keep.includes("Continue with Google") && keep.includes("Continue with Apple") && keep.includes("/login.html?keep=1") && keep.includes("Keep this score") && keep.includes("Use email instead"));
check("keep-score returning login is secondary", keep.includes("Already have an account?") && keep.includes('href="/sign-in"'));
check("keep-score has no chips host", !keep.includes('id="sample-keep-process"') && !keep.includes("HOW DID IT GO?"));
check("keep-score has no Watch CTA", !keep.includes("Watch how Runnr works") && !keep.includes("sample-keep-replay"));
check("keep-score light scrim stays", /#modal-sample-keep\{[^}]*rgba\(4,6,10,0\.46\)/.test(css.replace(/\s+/g, "")));
check("keep-score card is gold-lit not funeral flat", /#modal-sample-keep \.modal\{[^}]*var\(--gold-light\)/.test(css.replace(/\s+/g, " ")) && /#modal-sample-keep \.modal-title\{[^}]*var\(--gold-light\)/.test(css.replace(/\s+/g, " ")));

check("intro stays in the tree", html.includes('id="intro-overlay"') && html.includes("/media/runnr-intro-email-wall.mp4"));
check("homepage intro autoplay stays off", introSrc.includes("ENABLED: false") && /id="intro-overlay"[^>]*hidden/.test(html));
check("intro CSS hides until opened", css.includes("#intro-overlay[hidden]"));
check("intro skip is always visible copy", html.includes("Skip to save your score"));

console.log("ok " + n);
