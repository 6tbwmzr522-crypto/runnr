#!/usr/bin/env node
/** SAMPLE-first TikTok landing: stable bio URL, first-15s hero, signup after aha. */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const { root, html, sw, css } = require("./app_src").loadAppSource();
const sandboxSrc = fs.readFileSync(path.join(root, "js/demo-sandbox.js"), "utf8");
const introSrc = fs.readFileSync(path.join(root, "js/intro.js"), "utf8");
const coachSrc = fs.readFileSync(path.join(root, "js/coach.js"), "utf8");
const baronSrc = fs.readFileSync(path.join(root, "js/baron.js"), "utf8");
const quietSrc = fs.readFileSync(path.join(root, "js/desk-quiet.js"), "utf8");
const limitSrc = fs.readFileSync(path.join(root, "js/trade-limit.js"), "utf8");
const replaySrc = fs.readFileSync(path.join(root, "js/discipline-replay.js"), "utf8");
const journalSrc = fs.readFileSync(path.join(root, "js/app-journal.js"), "utf8");
const navSrc = fs.readFileSync(path.join(root, "js/app-nav.js"), "utf8");
const onboardingSrc = fs.readFileSync(path.join(root, "js/onboarding.js"), "utf8");
const pretradeSrc = fs.readFileSync(path.join(root, "js/pretrade.js"), "utf8");
const bootSrc = fs.readFileSync(path.join(root, "js/app-boot.js"), "utf8");
const stats = fs.readFileSync(path.join(root, "stats.html"), "utf8");
const login = fs.readFileSync(path.join(root, "sign-in/index.html"), "utf8");
const sampleAlias = fs.readFileSync(path.join(root, "sample/index.html"), "utf8");
const pagesYml = fs.readFileSync(path.join(root, ".github/workflows/pages.yml"), "utf8");

let n = 0;
function check(name, cond) {
  assert(cond, name);
  n += 1;
}

const v = html.match(/var V = "(\d+)"/)[1];
const cache = sw.match(/CACHE = "runnr-v(\d+)"/)[1];
check("index.html V matches sw.js CACHE", v === cache);
check("cache is 139+", Number(v) >= 187);
check("demo-sandbox cache-bust", html.includes("js/demo-sandbox.js?v=34"));
check("pages.css cache-bust", html.includes("css/pages.css?v=26"));
check("intro.js cache-bust", html.includes("js/intro.js?v=8"));
check("onboarding.js cache-bust", html.includes("js/onboarding.js?v=43"));

check("stats Guest SAMPLE funnel section", stats.includes("Guest SAMPLE funnel") && stats.includes("email_wall") && stats.includes("guest-demo-view") && stats.includes("email_wall oauth") && stats.includes("email_wall_converted"));
check("stats last 90 days is a chart", stats.includes('id="traffic-chart"') && stats.includes('id="traffic-svg"') && stats.includes("function renderTrafficChart") && stats.includes("uniq-fill"));
check("stats chart has uniques, pageviews, and a trend", stats.includes("lg-u") && stats.includes("lg-v") && stats.includes("lg-t") && stats.includes("stroke-dasharray"));
check("stats table is the last 14 days", stats.includes("Last 14 days") && stats.includes("daysNewest.slice(0, 14)") && stats.includes("function renderDaysTable") && stats.includes('id="days-body"'));
check("stats clarifies signed-in accounts are not visits", stats.includes("Signed-in accounts (not visits)"));
check("sandbox beacons email wall on keep-score open", sandboxSrc.includes("email_wall_shown") && sandboxSrc.includes("email_wall_locked") && sandboxSrc.includes("WALL_SHOWN_KEY") && sandboxSrc.includes("WALL_LOCKED_KEY"));
check("sandbox beacons OAuth start and convert", sandboxSrc.includes("email_wall_oauth_start") && sandboxSrc.includes("email_wall_converted"));
check("locked never fires without shown", sandboxSrc.includes("fireEmailWallBeacons") && /never without shown/.test(sandboxSrc));
check("bio URL is documented on stats", stats.includes("https://runnr.fyi/?demo=1") && stats.includes("tiktok-bio-url"));
check("stats does not point TikTok bio at login.html", /TikTok bio[\s\S]{0,400}login\.html/.test(stats) === false || /not login\.html/.test(stats));
check("stats lists /sample and #sample aliases", stats.includes("https://runnr.fyi/sample") && stats.includes("https://runnr.fyi/#sample"));
check("/sample alias redirects to ?demo=1", sampleAlias.includes('url=/?demo=1') && sampleAlias.includes('location.replace("/?demo=1")'));
check("/sample explains the discipline product", sampleAlias.includes("Trading discipline, not a broker") && sampleAlias.includes("not a broker") && sampleAlias.includes("What SAMPLE is"));
check("/sample says the demo book is not yours", sampleAlias.includes("Those numbers are not yours") && sampleAlias.includes("not a customer testimonial"));
check("/sample canonical is itself", sampleAlias.includes('href="https://runnr.fyi/sample/"'));
check("/sample is more than the old one-liner", !/^[\s\S]*<p><a href="\/\?demo=1">Open SAMPLE desk/.test(sampleAlias) && sampleAlias.includes("Score a trade on the SAMPLE desk"));
check("Pages deploy copies sample/", pagesYml.includes("sample _site") || pagesYml.includes("cp -r") && pagesYml.includes("sample"));

check("first-paint detects demo=1 and #sample and /sample", html.includes("demo=1") && html.includes("sample") && html.includes("runnr-sample-landing"));
check("sample landing skips the signup hook", /runnr-sample-landing[\s\S]*runnr_hook_v1|runnr_hook_v1[\s\S]*runnr-sample-landing/.test(html));

const heroStart = html.indexOf('id="sample-hero"');
check("SAMPLE hero markup exists", heroStart > 0);
const hero = html.slice(heroStart, html.indexOf('id="intro-overlay"'));
check("hero headline is skip the stop", /They get paid when you skip the stop/.test(hero));
check("hero body is slip + weekly report bait", hero.includes("See your slip on one trade") && hero.includes("weekly discipline report"));
check("hero primary CTA is Score a trade", hero.includes('id="sample-score-cta"') && hero.includes("Score a trade"));
check("hero has quiet intro watch", hero.includes('id="sample-hero-watch"') && hero.includes("Watch how Runnr works"));
check("hero is one-screen pitch without proof card", !hero.includes("data-runnr-proof") && !/Sign up/.test(hero) && !/Connect broker/.test(hero) && !/href="\/login\.html"/.test(hero) && !/Alpaca/.test(hero) && !/T212/.test(hero));
check("hero does not invent score/P&amp;L", !/80%/.test(hero) && !/2,528/.test(hero) && !/2,503/.test(hero) && !/1,190/.test(hero));
check("keep-score sheet is gated after aha", html.includes('id="modal-sample-keep"') && html.includes("Continue with Google") && html.includes("Continue with Apple") && html.includes("/sign-in?keep=1"));
check("keep-score primary CTAs are Google and Apple", /id="sample-keep-google"[\s\S]*Continue with Google[\s\S]*id="sample-keep-apple"[\s\S]*Continue with Apple/.test(html.slice(html.indexOf('id="modal-sample-keep"'), html.indexOf('id="modal-share"'))));
const keepHtml = html.slice(html.indexOf('id="modal-sample-keep"'), html.indexOf('id="modal-share"'));
check("keep-score has no email form", !/<input|<form/i.test(keepHtml) && !/or email/i.test(keepHtml));
check("keep-score quiet email fallback", html.slice(html.indexOf('id="modal-sample-keep"'), html.indexOf('id="modal-share"')).includes("Use email instead") && html.includes("/sign-in?keep=1"));
check("keep-score offers returning-user login", /Already have an account\?[\s\S]*href="\/sign-in"/.test(html.slice(html.indexOf('id="modal-sample-keep"'), html.indexOf('id="modal-share"'))));
check("returning-user login is not keep=1 bait", /href="\/sign-in"(?!\?keep=1)/.test(html.slice(html.indexOf('id="modal-sample-keep"'), html.indexOf('id="modal-share"'))));
check("keep-score heading stays Keep this score", /id="modal-sample-keep"[\s\S]*Keep this score/.test(html));
check("lite wall is markup only until the flag paints it", keepHtml.includes('id="sample-keep-title"') && keepHtml.includes('id="sample-keep-lite-trust"') && !keepHtml.includes("Save your score") && !keepHtml.includes("Free. No card. Takes one tap."));
check("keep-score copy is score + weekly report bait", html.includes("Your score: ready.") && html.includes("undisciplined P&amp;L vs the clean one") && sandboxSrc.includes("undisciplined P&L vs the clean one"));
check("keep-score keeps 7-day no auto-bill", keepHtml.includes("Start free · 7-day trial") && keepHtml.includes("Nothing bills automatically.") && !keepHtml.includes("Keep this score — 7 days free") && !keepHtml.includes("Use Runnr free for 7 days"));
check("keep-score has no credit card note", keepHtml.includes("No credit card required for trial."));
check("keep-score Free/Pro delta is inline", keepHtml.includes("Free trial: full desk 7 days") && keepHtml.includes("€19/mo") && keepHtml.includes("€190/yr") && keepHtml.includes("journal, Coach, alerts"));
check("keep-score never-places-trades is inline", keepHtml.includes("Runnr never places trades") && keepHtml.includes("read-only"));
check("landing has quiet 3-step loop", html.includes('id="home-runnr-loop"') && html.includes("1 · Size") && html.includes("2 · Log") && html.includes("3 · Score") && html.includes("Process first, P&amp;L can wait"));
check("hook has quiet 3-step loop", /id="onboarding-overlay"[\s\S]*runnr-loop[\s\S]*1 · Size[\s\S]*id="sample-hero"/.test(html));
check("hook has no credit card note near trial", /ob-hook-price[\s\S]*runnr-trial-delta[\s\S]*runnr-no-card[\s\S]*No credit card required for trial/.test(html));
check("home landing has no credit card note", /home-landing[\s\S]*ob-hook-price[\s\S]*runnr-no-card[\s\S]*No credit card required for trial/.test(html));
check("demo chrome has no credit card note", /demo-chrome-cta[\s\S]*runnr-no-card[\s\S]*No credit card required for trial/.test(html));
check("onboarding hook mirrors no-card copy", onboardingSrc.includes("runnr-no-card") && onboardingSrc.includes("No credit card required for trial."));
check("ob-hook Free/Pro + no-card + read-only near price", /ob-hook-price[\s\S]*runnr-trial-delta[\s\S]*runnr-no-card[\s\S]*runnr-readonly[\s\S]*ob-hook-sample/.test(html));
check("Connect page leads with never-places-trades", html.includes('class="runnr-readonly sync-readonly"') && /page-sync[\s\S]*Runnr never places trades — broker sync is read-only/.test(html));
check("score meaning copy exists once", html.includes("Discipline Score = did you follow size, stop, and plan") && sandboxSrc.includes("SCORE_MEANING_KEY") && sandboxSrc.includes("runnr_score_meaning_v1") && sandboxSrc.includes("paintScoreMeaning"));
check("gold score schedules score meaning before the wall", /function onGoldScored[\s\S]*scheduleScoreMeaning[\s\S]*function onProofViewed/.test(sandboxSrc) && /function onSampleScored[\s\S]*scheduleScoreMeaning[\s\S]*showKeepScore/.test(sandboxSrc));
check("keep-score Google is white primary", /#modal-sample-keep \.sample-keep-google\{[^}]*background:#fff/.test(css.replace(/\s+/g, " ")));
check("keep-score Apple is solid black", /#modal-sample-keep \.sample-keep-apple\{[^}]*background:#000/.test(css.replace(/\s+/g, " ")));
check("keep-score card reuses tour-chip gold energy", /#modal-sample-keep \.modal\{[^}]*border:1px solid var\(--gold-light\)/.test(css.replace(/\s+/g, " ")) && /#modal-sample-keep \.modal\{[^}]*box-shadow:0 18px 50px rgba\(0,0,0,0\.45\)/.test(css.replace(/\s+/g, " ")) && /#modal-sample-keep \.modal-title\{[^}]*color:var\(--gold-light\)/.test(css.replace(/\s+/g, " ")));
check("keep-score has no extra eyebrow copy", !/SAVE YOUR SCORE/i.test(keepHtml));
check("OAuth returns to SAMPLE desk", sandboxSrc.includes('KEEP_RETURN = "/?demo=1"') && sandboxSrc.includes("resumeAfterKeepAuth") && bootSrc.includes("keepOAuthReturn"));
check("keep-score has no process chips", !keepHtml.includes("sample-keep-process") && !keepHtml.includes("HOW DID IT GO?") && !keepHtml.includes("Followed") && !keepHtml.includes("Leaked") && !keepHtml.includes("Skipped") && !sandboxSrc.includes("sample-keep-process"));
check("keep-score has no Watch CTA", !keepHtml.includes("sample-keep-replay") && !keepHtml.includes("Watch how Runnr works"));
check("landing watch plays intro then lands on Sizer / Beat 1", sandboxSrc.includes("sample-hero-watch") && sandboxSrc.includes("startWatchHow") && sandboxSrc.includes("landWatchOnSizer") && sandboxSrc.includes("playWatchThenSizer") && introSrc.includes("playWatchThenSizer") && !introSrc.includes("showKeepScore({ skipIntro: true })"));
check("Watch path never opens Keep as first destination", /function startWatchHow[\s\S]*playWatchThenSizer[\s\S]*landWatchOnSizer/.test(sandboxSrc) && /function landWatchOnSizer[\s\S]*forceHideKeepScore[\s\S]*openGoldSizer[\s\S]*RunnrTour\.start/.test(sandboxSrc));
check("Watch skip copy is size a trade not save score", introSrc.includes("Skip to size a trade") && introSrc.includes("WATCH_SKIP_LABEL"));
check("bare replay still avoids Keep wall", introSrc.includes("playBeforeKeepScore(null") && !introSrc.includes("showKeepScore({ skipIntro: true })"));
check("video plays before the wall", sandboxSrc.includes("playIntroThenKeep") && sandboxSrc.includes("shouldPlayBeforeKeepScore"));
check("chip tour stays optional on the wall", sandboxSrc.includes("tourWantsChipPath") && sandboxSrc.includes("tour=1"));
check("keep-score does not lead with Alpaca/T212", !/Alpaca|T212|Trading 212/.test(html.slice(html.indexOf('id="modal-sample-keep"'), html.indexOf('id="modal-share"'))));
check("login keep=1 copy", login.includes("keep=1") && login.includes("Your score: ready.") && login.includes("weekly report") && login.includes("undisciplined P&L vs the clean one") && login.includes("Nothing bills automatically"));
check("login keep=1 OAuth returns to SAMPLE", login.includes('keepScore ? "/?demo=1"') && login.includes("oauth_popup=1") && login.includes("runnr-oauth-done"));
check("SAMPLE desk URL stays on the live app", html.includes('href="/?demo=1"') && html.includes("runnr.fyi"));
check("share card is not the TikTok P&L bio pitch", !/TikTok bio is[\s\S]*demo=1/.test(html) && !html.includes("Process P&amp;L (followed vs leaks)"));

function freshCtx(loc) {
  const store = {};
  const session = {};
  const ctx = {
    window: {},
    localStorage: {
      getItem(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
      setItem(k, v) { store[k] = String(v); },
      removeItem(k) { delete store[k]; },
    },
    sessionStorage: {
      getItem(k) { return Object.prototype.hasOwnProperty.call(session, k) ? session[k] : null; },
      setItem(k, v) { session[k] = String(v); },
      removeItem(k) { delete session[k]; },
    },
    location: loc || { hostname: "localhost", search: "", pathname: "/", hash: "", href: "http://localhost/" },
    navigator: { userAgent: "node", sendBeacon() { return true; } },
    document: {
      readyState: "complete",
      getElementById() { return null; },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      documentElement: { classList: { toggle() {}, add() {}, remove() {} } },
      addEventListener() {},
    },
    console,
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  return ctx;
}

function loadSandbox(loc) {
  const ctx = freshCtx(loc);
  vm.runInNewContext(baronSrc, ctx);
  vm.runInNewContext(coachSrc, ctx);
  vm.runInNewContext(limitSrc, ctx);
  vm.runInNewContext(replaySrc, ctx);
  vm.runInNewContext(sandboxSrc, ctx);
  vm.runInNewContext(quietSrc, ctx);
  return ctx;
}

const bio = loadSandbox({ search: "?demo=1", pathname: "/", hash: "", href: "http://localhost/?demo=1" });
const SB = bio.RunnrDemoSandbox;
check("BIO_URL is the TikTok bio", SB.BIO_URL === "https://runnr.fyi/?demo=1");
check("ALIAS_PATH is /sample", SB.ALIAS_PATH === "/sample");
check("?demo=1 is a sample landing", SB.isSampleLandingLocation({ search: "?demo=1", pathname: "/", hash: "" }) === true);
check("#sample is a sample landing", SB.isSampleLandingLocation({ search: "", pathname: "/", hash: "#sample" }) === true);
check("/sample is a sample landing", SB.isSampleLandingLocation({ search: "", pathname: "/sample", hash: "" }) === true);
check("/sample/ is a sample landing", SB.isSampleLandingLocation({ search: "", pathname: "/sample/", hash: "" }) === true);
check("bare / is not a sample landing", SB.isSampleLandingLocation({ search: "", pathname: "/", hash: "" }) === false);
check("queryForce follows the same aliases", SB.queryForce() === true);

const hashCtx = loadSandbox({ search: "", pathname: "/", hash: "#sample", href: "http://localhost/#sample" });
check("#sample queryForce is true", hashCtx.RunnrDemoSandbox.queryForce() === true);

const pathCtx = loadSandbox({ search: "", pathname: "/sample", hash: "", href: "http://localhost/sample" });
check("/sample queryForce is true", pathCtx.RunnrDemoSandbox.queryForce() === true);

const book = SB.factoryTrades(new Date("2026-09-09T12:00:00.000Z"));
const row = SB.firstIncompleteSample({ trades: book });
check("first incomplete SAMPLE is AAPL CFD", row && row.instr === "AAPL CFD" && row.incomplete === true && row.isDemo === true);
check("AAPL CFD stays isDemo", row.isDemo === true);

const proof = SB.proofModel(new Date("2026-09-09T12:00:00.000Z"));
check("hero numbers come from the factory book", Number.isFinite(proof.discPnl) && Number.isFinite(proof.undiscPnl) && proof.overall >= 78);
check("do not invent the 2503/190 pair", proof.discPnl !== 2503 && proof.undiscPnl !== -190);

const guest = { bal: 10000, risk: 1, sym: "€", trades: book, watchlist: SB.factoryWatchlist() };
check("sample hero shows for forced guest demo", SB.shouldShowSampleHero(guest) === true);
check("aha starts gated", SB.hasAha() === false);

const real = { bal: 18400, trades: [{ id: 77, instr: "AAPL", pnl: 20, source: "csv" }], watchlist: [] };
check("real book is never a sample hero", SB.shouldShowSampleHero(real) === false);
check("real book is never overwritten", SB.shouldApply(real) === false);

const signed = loadSandbox({ search: "?demo=1", pathname: "/", hash: "" });
signed.localStorage.setItem("runnr_api_token", "tok");
const signedThin = { bal: 10000, trades: signed.RunnrDemoSandbox.classicSeeds(), watchlist: [] };
check("signed-in book is not hydrated", signed.RunnrDemoSandbox.shouldApply(signedThin) === false);
check("signed-in users skip sample hero", signed.RunnrDemoSandbox.shouldShowSampleHero(signedThin) === false);

const watchSrc = fs.readFileSync(path.join(root, "js/app-watchlist.js"), "utf8");
check("quiet instagram link opens the sample desk", html.includes('class="ob-hook-ig"') && html.includes("Coming from Instagram? Open the sample desk") && html.includes('href="/?demo=1"') && onboardingSrc.includes('class="ob-hook-ig"'));
check("instagram link is a readable gold chip, quieter than the kicker", /\.ob-hook-ig a\{[^}]*color:var\(--gold-light\)/.test(css) && /\.ob-hook-ig a\{[^}]*font-size:13px/.test(css) && /\.ob-hook-ig a\{[^}]*font-weight:400/.test(css) && !/\.ob-hook-ig a\{[^}]*var\(--text3\)/.test(css) && /\.ob-kicker\{[^}]*font-size:11px[^}]*font-weight:700/.test(css));
check("marketing wall still shows pricing", html.includes("€19/month or €190/year") && html.includes('id="ob-hook-start"'));
const enterFn = sandboxSrc.slice(sandboxSrc.indexOf("function enterFromHook"), sandboxSrc.indexOf("function landWatchOnSizer"));
check("hook skip enters the filled sample desk", onboardingSrc.includes("enterFromHook") && enterFn.includes('switchPage("home")') && enterFn.includes("maybeShow") && !enterFn.includes("openGoldSizer"));
check("hook skip does not force the tour when sample enter ran", /enterFromHook[\s\S]*if \(!entered\)/.test(onboardingSrc));
check("guest sample watch shows demo setups", watchSrc.includes("function guestSampleDesk") && watchSrc.includes("function visibleWatchItems") && watchSrc.includes("guestSampleDesk()"));
check("instagram variant assignment is unchanged", sandboxSrc.includes("igv=(prefill|empty)") && sandboxSrc.includes("function assignIgVariant") && sandboxSrc.includes("function variantFromRoll"));

function hookEnterCtx() {
  const ctx = loadSandbox({ search: "", pathname: "/", hash: "", href: "http://localhost/" });
  ctx.S = { bal: 10000, risk: 1, sym: "€", trades: [], watchlist: [] };
  ctx.window.S = ctx.S;
  ctx._page = "home";
  ctx._primed = null;
  ctx._tour = 0;
  ctx.switchPage = function (key) { ctx._page = key; };
  ctx.RunnrPretrade = {
    prime(input) { ctx._primed = input; },
    open() { ctx._page = "sizer"; return true; },
  };
  ctx.RunnrTour = { maybeShow() { ctx._tour += 1; return true; } };
  return ctx;
}
const hookEnter = hookEnterCtx();
check("bare skip seeds and enters", hookEnter.RunnrDemoSandbox.enterFromHook(hookEnter.S) === true);
check("bare skip lands on filled home, not the sizer", hookEnter._page === "home" && hookEnter._primed == null);
check("bare skip fills the sample book", hookEnter.S.trades.length >= 12 && hookEnter.S.watchlist.some((w) => w && w.sym === "AAPL" && w.isDemo === true));
check("bare skip starts the tour after the sample loads", hookEnter._tour === 1);
check("bare skip does not seal a score", hookEnter.RunnrDemoSandbox.hasAha() === false);

const hookSigned = hookEnterCtx();
hookSigned.localStorage.setItem("runnr_api_token", "tok");
const signedEmpty = { bal: 10000, risk: 1, sym: "€", trades: [], watchlist: [] };
check("signed-in skip does not seed a sample book", hookSigned.RunnrDemoSandbox.enterFromHook(signedEmpty) === false);
check("signed-in empty book stays empty", signedEmpty.trades.length === 0 && signedEmpty.watchlist.length === 0);

const hookReal = hookEnterCtx();
const realEmptyWatch = { bal: 18400, trades: [{ id: 9, instr: "NVDA", pnl: 10, source: "csv" }], watchlist: [] };
check("real book skip does not enter sample mode", hookReal.RunnrDemoSandbox.enterFromHook(realEmptyWatch) === false);
check("real book trades stay put", realEmptyWatch.trades.length === 1 && realEmptyWatch.trades[0].source === "csv");

SB.markAha("score");
check("aha is stored after one SAMPLE action", SB.hasAha() === true);
check("hero hides after aha", SB.shouldShowSampleHero(guest) === false);

const Q = bio.RunnrDeskQuiet;
const sampleJob = Q.primaryJob(book, guest, bio.Baron);
check("demo desk job is Score this trade", sampleJob.id === "sample-score" && sampleJob.cta === "Score this trade" && sampleJob.tradeId === row.id);

check("saveLog notifies SAMPLE aha", journalSrc.includes("onSampleScored"));
check("gold logPlan notifies SAMPLE aha", pretradeSrc.includes("onSampleScored"));
check("gold live score notifies SAMPLE aha", pretradeSrc.includes("onGoldScored") && pretradeSrc.includes("maybeSealGoldScore"));
check("3-plan cap wall also seals", /function showSampleCapWall[\s\S]*markSeal/.test(pretradeSrc));
check("nav runs sample-score job", navSrc.includes("sample-score") && navSrc.includes("openScoreTrade"));
check("onboarding skips wizard on sample aliases", onboardingSrc.includes("queryForce") && onboardingSrc.includes('get("demo") === "1"'));
check("keep-score href is email not broker", SB.KEEP_HREF === "/sign-in?keep=1");
check("keep-score lock CSS hides dismiss", css.includes("sample-keep-locked") && css.includes("sample-keep-dismiss"));
check("keep-score overlay is a light dim not a lockout", /#modal-sample-keep\{[^}]*rgba\(4,6,10,0\.46\)/.test(css.replace(/\s+/g, "")) && /#modal-sample-keep\{[^}]*backdrop-filter:blur\(2px\)/.test(css.replace(/\s+/g, "")));
check("closeModal holds sealed SAMPLE keep-score", bootSrc.includes("shouldHoldKeepScore") && bootSrc.includes("modal-sample-keep"));
check("score CTA source does not open the journal editor", /function openScoreTrade[\s\S]*function onSampleScored/.test(sandboxSrc) && !/function openScoreTrade[\s\S]*openTradeEditor/.test(sandboxSrc));

const primed = SB.sampleScorePrime({ trades: book, watchlist: SB.factoryWatchlist() });
check("score CTA primes AAPL from the SAMPLE row", primed.ticker === "AAPL" && Number(primed.entry) === 198 && Number(primed.stop) === 194 && primed.dir === "long");

const gold = loadSandbox({ search: "?demo=1", pathname: "/", hash: "", href: "http://localhost/?demo=1" });
gold.S = { trades: book, watchlist: SB.factoryWatchlist(), bal: 10000, risk: 1, sym: "€" };
gold.opened = [];
gold.primed = null;
gold.journalEditor = false;
gold.page = "";
gold.RunnrPretrade = {
  prime(input) { gold.primed = input; return input; },
  open(which) { gold.opened.push(which || "desk"); },
};
gold.openTradeEditor = function () { gold.journalEditor = true; };
gold.switchPage = function (k) { gold.page = k; };
const openedGold = gold.RunnrDemoSandbox.openScoreTrade(gold.S);
check("Home/hero Score a trade opens the gold sizer", openedGold === true && gold.opened[0] === "desk");
check("gold sizer is primed with AAPL SAMPLE numbers", gold.primed && gold.primed.ticker === "AAPL" && Number(gold.primed.entry) === 198 && Number(gold.primed.stop) === 194);
check("Score a trade does not open the journal editor", gold.journalEditor === false && gold.page !== "journal");
check("opening the gold sizer does not seal yet", gold.RunnrDemoSandbox.hasSeal() !== true);

check("seal starts off", SB.hasSeal() !== true);
check("pending gold plan is not a score", SB.isReadyGoldScore({ ready: false, size: 0, entry: 0, stop: 0 }) === false);
check("sample-locked plan is not a gold score", SB.isReadyGoldScore({ ready: false, size: 0, sampleLocked: true }) === false);
check("ready gold plan is a score", SB.isReadyGoldScore({ ready: true, size: 25, entry: 198, stop: 194 }) === true);
check("blocked-but-sized gold plan is still a score", SB.isReadyGoldScore({ ready: true, blocked: true, size: 100, entry: 220, stop: 210 }) === true);

const skipped = loadSandbox({ search: "?demo=1", pathname: "/", hash: "", href: "http://localhost/?demo=1" });
skipped.sessionStorage.setItem("runnr_sample_hero_v1", "done");
check("hero skip is not the aha seal", skipped.RunnrDemoSandbox.hasSeal() !== true && skipped.RunnrDemoSandbox.hasAha() === false);
check("hero skip source does not seal", /sample-hero-skip[\s\S]*markHeroDismissed/.test(sandboxSrc) && !/sample-hero-skip[\s\S]{0,400}markSeal/.test(sandboxSrc));

const scoredGuest = loadSandbox({ search: "?demo=1", pathname: "/", hash: "", href: "http://localhost/?demo=1" });
scoredGuest.S = { trades: book, watchlist: SB.factoryWatchlist(), bal: 10000, risk: 1, sym: "€" };
check("pending compute does not seal", scoredGuest.RunnrDemoSandbox.onGoldScored({ ready: false, size: 0 }) === false);
check("first SAMPLE gold score seals the guest", scoredGuest.RunnrDemoSandbox.onGoldScored({ ready: true, size: 25, entry: 198, stop: 194 }, { reason: "score" }) === true);
check("seal persists after gold score", scoredGuest.RunnrDemoSandbox.hasSeal() === true && scoredGuest.RunnrDemoSandbox.hasAha() === true);
check("sealed guest holds keep-score after gold score", scoredGuest.RunnrDemoSandbox.shouldHoldKeepScore() === true);
scoredGuest.RunnrDemoSandbox.hideKeepScore();
check("hideKeepScore cannot drop a gold-score seal", scoredGuest.RunnrDemoSandbox.hasSeal() === true && scoredGuest.RunnrDemoSandbox.shouldHoldKeepScore() === true);
check("later gold scores stay sealed without dropping the hold", scoredGuest.RunnrDemoSandbox.onGoldScored({ ready: true, size: 10, entry: 100, stop: 90 }) === true && scoredGuest.RunnrDemoSandbox.shouldHoldKeepScore() === true);

const liveScore = loadSandbox({ search: "?demo=1", pathname: "/", hash: "", href: "http://localhost/?demo=1" });
liveScore.S = { trades: book, watchlist: SB.factoryWatchlist(), bal: 10000, risk: 1, sym: "€" };
liveScore.wallOpens = 0;
liveScore.openModal = function () { liveScore.wallOpens += 1; };
check("live gold score seals without opening the wall", liveScore.RunnrDemoSandbox.onGoldScored({ ready: true, size: 50, entry: 198, stop: 194, totalRisk: 200 }, { reason: "score" }) === true && liveScore.wallOpens === 0);
check("live gold score still holds keep-score for a later save", liveScore.RunnrDemoSandbox.shouldHoldKeepScore() === true);
check("first gold score arms the meaning tip", liveScore.RunnrDemoSandbox.shouldShowScoreMeaning() === true);
check("score meaning copy is process not P&L", /follow size, stop, and plan/.test(liveScore.RunnrDemoSandbox.scoreMeaningCopy()) && /not how much you made/.test(liveScore.RunnrDemoSandbox.scoreMeaningCopy()));
liveScore.RunnrDemoSandbox.markScoreMeaningSeen();
liveScore.sessionStorage.removeItem("runnr_score_meaning_active_v1");
check("meaning tip does not nag after localStorage flag", liveScore.RunnrDemoSandbox.shouldShowScoreMeaning() === false && liveScore.RunnrDemoSandbox.scoreMeaningHtml() === "");

const slipOver = SB.slipLine({ ready: true, totalRisk: 200, size: 50 }, { bal: 10000, sym: "€" }, { risk: 1, sym: "€" });
check("slip uses this plan against the 1% rule", slipOver === "Risked 2% on a 1% rule — €100 over on this plan.");
const slipInside = SB.slipLine({ ready: true, totalRisk: 100, size: 25 }, { bal: 10000, sym: "€" }, { risk: 1, sym: "€" });
check("plan inside the rule does not invent a cost", slipInside === "");
const slipNoRule = SB.slipLine({ ready: true, totalRisk: 200, size: 50 }, { bal: 10000, sym: "€" }, {});
check("missing rule does not invent a percent", slipNoRule === "");
check("onGoldScored does not open keep-score", (function () {
  const fn = sandboxSrc.slice(sandboxSrc.indexOf("function onGoldScored"), sandboxSrc.indexOf("function onProofViewed"));
  return fn.includes("markSeal") && !fn.includes("showKeepScore");
})());
check("journal log still opens keep-score after the score", (function () {
  const fn = sandboxSrc.slice(sandboxSrc.indexOf("function onSampleScored"), sandboxSrc.indexOf("function onGoldScored"));
  return fn.includes("showKeepScore");
})());
check("proof and homepage hero do not mark aha", !sandboxSrc.includes('markAha("proof")') && !sandboxSrc.includes("onProofViewed();"));
check("aha beacon is once per guest per day", sandboxSrc.includes("AHA_DAY_KEY") && sandboxSrc.includes("onceLocalDay(AHA_DAY_KEY"));

const loggedGuest = loadSandbox({ search: "?demo=1", pathname: "/", hash: "", href: "http://localhost/?demo=1" });
loggedGuest.S = { trades: book, watchlist: SB.factoryWatchlist(), bal: 10000, risk: 1, sym: "€" };
const goldRow = { id: 99, isDemo: true, source: "pretrade", instr: "AAPL", incomplete: false };
check("first SAMPLE gold log seals the guest", loggedGuest.RunnrDemoSandbox.onSampleScored(goldRow, { prompt: false }) === true);
check("seal persists after gold log", loggedGuest.RunnrDemoSandbox.hasSeal() === true && loggedGuest.RunnrDemoSandbox.hasAha() === true);
check("sealed guest holds keep-score", loggedGuest.RunnrDemoSandbox.shouldHoldKeepScore() === true);
loggedGuest.RunnrDemoSandbox.hideKeepScore();
check("hideKeepScore cannot drop the seal", loggedGuest.RunnrDemoSandbox.hasSeal() === true && loggedGuest.RunnrDemoSandbox.shouldHoldKeepScore() === true);

check("signed-in score does not seal", signed.RunnrDemoSandbox.onSampleScored(goldRow) === false);
check("signed-in gold compute does not seal", signed.RunnrDemoSandbox.onGoldScored({ ready: true, size: 25, entry: 198, stop: 194 }) === false);
check("signed-in does not hold keep-score", signed.RunnrDemoSandbox.shouldHoldKeepScore() === false);

const realGuest = loadSandbox({ search: "?demo=1", pathname: "/", hash: "", href: "http://localhost/?demo=1" });
realGuest.localStorage.setItem("runnr_sample_seal_v1", "1");
check("real book does not hold keep-score", realGuest.RunnrDemoSandbox.shouldHoldKeepScore(real) === false);

function loadWall(loc, extra) {
  const ctx = loadSandbox(loc);
  const overlay = {
    className: "",
    attrs: { hidden: "" },
    classList: {
      items: new Set(),
      add(c) { this.items.add(c); overlay.className = [...this.items].join(" "); },
      remove(c) {
        String(c).split(/\s+/).forEach((x) => this.items.delete(x));
        overlay.className = [...this.items].join(" ");
      },
      toggle(c, on) { if (on) this.add(c); else this.remove(c); },
      contains(c) { return this.items.has(c); },
    },
    setAttribute(k, v) { this.attrs[k] = v; },
    getAttribute(k) { return this.attrs[k] || ""; },
    removeAttribute(k) { delete this.attrs[k]; },
    hasAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k); },
  };
  const video = {
    muted: true, src: "", paused: true, dataset: {}, currentTime: 0,
    setAttribute() {}, getAttribute(k) { return k === "src" ? this.src : ""; },
    play() { this.paused = false; return Promise.resolve(); },
    pause() { this.paused = true; },
    addEventListener() {},
  };
  const modal = {
    className: "",
    classList: {
      items: new Set(),
      add(c) { this.items.add(c); modal.className = [...this.items].join(" "); },
      remove(c) { this.items.delete(c); modal.className = [...this.items].join(" "); },
      toggle(c, on) { if (on) this.add(c); else this.remove(c); },
      contains(c) { return this.items.has(c); },
    },
    querySelector() { return null; },
  };
  const skip = { dataset: {}, textContent: "Skip", addEventListener() {} };
  const unmute = { dataset: {}, textContent: "", hidden: true, addEventListener() {} };
  const prevGet = ctx.document.getElementById;
  ctx.document.getElementById = function (id) {
    if (id === "intro-overlay") return overlay;
    if (id === "intro-video") return video;
    if (id === "intro-skip") return skip;
    if (id === "intro-unmute") return unmute;
    if (id === "intro-missing") return { hidden: true };
    if (id === "modal-sample-keep") return modal;
    if (id === "sample-keep-process") return { hidden: true, innerHTML: "" };
    return prevGet.call(ctx.document, id);
  };
  ctx.document.querySelector = function (sel) {
    if (sel === "#modal-sample-keep .sample-keep-copy") return { textContent: "" };
    return null;
  };
  vm.runInNewContext(introSrc, ctx);
  if (extra) extra(ctx);
  return { ctx, overlay, video, modal, skip, unmute };
}

const firstWall = loadWall({ search: "?demo=1", pathname: "/", hash: "", href: "http://localhost/?demo=1" });
firstWall.ctx.S = { trades: book, watchlist: SB.factoryWatchlist(), bal: 10000, risk: 1, sym: "€" };
check("intro still wants to play before the wall", firstWall.ctx.RunnrIntro.shouldPlayBeforeKeepScore({}) === true);
check("live gold score leaves the slip up", firstWall.ctx.RunnrDemoSandbox.onGoldScored({ ready: true, size: 25, entry: 198, stop: 194, totalRisk: 100 }, { reason: "score" }) === true);
check("video stays closed on the live score", firstWall.overlay.classList.contains("open") === false);
check("email wall stays closed on the live score", firstWall.modal.classList.contains("open") === false);
const goldRowWall = { id: 99, isDemo: true, source: "pretrade", instr: "AAPL", incomplete: false };
check("journal log opens the video before the wall", firstWall.ctx.RunnrDemoSandbox.onSampleScored(goldRowWall, { reason: "pretrade" }) === true);
check("video overlay is open before keep-score", firstWall.overlay.classList.contains("open") === true);
check("email wall stays closed during the video", firstWall.modal.classList.contains("open") === false);
firstWall.ctx.RunnrIntro.skip(firstWall.ctx.S);
check("skip closes the video", firstWall.overlay.classList.contains("open") === false);
check("skip then opens keep-score", firstWall.modal.classList.contains("open") === true);

const seenWall = loadWall({ search: "?demo=1", pathname: "/", hash: "", href: "http://localhost/?demo=1" });
seenWall.ctx.localStorage.setItem("runnr_intro_v1", "skipped");
seenWall.ctx.S = { trades: book, watchlist: SB.factoryWatchlist(), bal: 10000, risk: 1, sym: "€" };
check("returner gold score does not open the wall", seenWall.ctx.RunnrDemoSandbox.onGoldScored({ ready: true, size: 25, entry: 198, stop: 194 }) === true);
check("returner does not reopen the intro on the live score", seenWall.overlay.classList.contains("open") === false);
check("returner keep-score stays closed until the log", seenWall.modal.classList.contains("open") === false);
check("returner journal log opens the wall without video", seenWall.ctx.RunnrDemoSandbox.onSampleScored(goldRowWall, { reason: "pretrade" }) === true);
check("returner keep-score is open", seenWall.modal.classList.contains("open") === true);

const tourWall = loadWall({ search: "?demo=1&tour=1", pathname: "/", hash: "", href: "http://localhost/?demo=1&tour=1" });
tourWall.ctx.S = { trades: book, watchlist: SB.factoryWatchlist(), bal: 10000, risk: 1, sym: "€" };
check("?tour=1 skips video so chips are not stacked", tourWall.ctx.RunnrIntro.shouldPlayBeforeKeepScore({}) === false);
check("?tour=1 keep-score opens the wall directly", tourWall.ctx.RunnrDemoSandbox.showKeepScore({ reason: "score" }) === true);
check("?tour=1 does not open the intro overlay", tourWall.overlay.classList.contains("open") === false);
check("?tour=1 email wall is open", tourWall.modal.classList.contains("open") === true);

function loadWallBeacons(loc, extra) {
  const ctx = loadSandbox(loc);
  ctx.beacons = [];
  ctx.navigator.sendBeacon = function (url) {
    const m = String(url).match(/[?&]e=([^&]+)/);
    ctx.beacons.push(decodeURIComponent((m && m[1]) || ""));
    return true;
  };
  const modal = {
    className: "",
    classList: {
      items: new Set(),
      add(c) { this.items.add(c); modal.className = [...this.items].join(" "); },
      remove(c) { this.items.delete(c); modal.className = [...this.items].join(" "); },
      toggle(c, on) { if (on) this.add(c); else this.remove(c); },
      contains(c) { return this.items.has(c); },
    },
    querySelector() { return null; },
  };
  const google = { href: "#", attrs: {}, setAttribute(k, v) { this.attrs[k] = v; this.href = k === "href" ? v : this.href; }, getAttribute(k) { return this.attrs[k] || ""; } };
  const apple = { href: "#", attrs: {}, setAttribute(k, v) { this.attrs[k] = v; this.href = k === "href" ? v : this.href; }, getAttribute(k) { return this.attrs[k] || ""; } };
  const prevGet = ctx.document.getElementById;
  ctx.document.getElementById = function (id) {
    if (id === "modal-sample-keep") return modal;
    if (id === "sample-keep-google") return google;
    if (id === "sample-keep-apple") return apple;
    if (id === "sample-keep-process") return { hidden: true, innerHTML: "" };
    return prevGet.call(ctx.document, id);
  };
  ctx.document.querySelector = function (sel) {
    if (sel === "#modal-sample-keep .sample-keep-copy") return { textContent: "" };
    return null;
  };
  ctx.S = { trades: book, watchlist: SB.factoryWatchlist(), bal: 10000, risk: 1, sym: "€" };
  if (extra) extra(ctx, { modal, google, apple });
  return ctx;
}

const sealedWall = loadWallBeacons({ search: "?demo=1", pathname: "/", hash: "", href: "http://localhost/?demo=1" }, function (ctx) {
  ctx.localStorage.setItem("runnr_sample_seal_v1", "1");
});
check("sealed wall opens", sealedWall.RunnrDemoSandbox.showKeepScore({ skipIntro: true, reason: "score" }) === true);
check("sealed wall fires shown then locked", sealedWall.beacons[0] === "email_wall_shown" && sealedWall.beacons[1] === "email_wall_locked");
sealedWall.RunnrDemoSandbox.showKeepScore({ skipIntro: true });
check("wall beacons are once per day", sealedWall.beacons.filter((e) => e === "email_wall_shown").length === 1 && sealedWall.beacons.filter((e) => e === "email_wall_locked").length === 1);
sealedWall.sessionStorage.removeItem("runnr_email_wall_shown_v1");
sealedWall.sessionStorage.removeItem("runnr_email_wall_locked_v1");
sealedWall.RunnrDemoSandbox.showKeepScore({ skipIntro: true });
check("revisit does not re-fire shown or locked", sealedWall.beacons.filter((e) => e === "email_wall_shown").length === 1 && sealedWall.beacons.filter((e) => e === "email_wall_locked").length === 1);

const openWall = loadWallBeacons({ search: "?demo=1", pathname: "/", hash: "", href: "http://localhost/?demo=1" });
check("unsealed wall fires shown only", openWall.RunnrDemoSandbox.showKeepScore({ skipIntro: true }) === true && openWall.beacons[0] === "email_wall_shown" && openWall.beacons.indexOf("email_wall_locked") === -1);

const oauthWall = loadWallBeacons({ search: "?demo=1", pathname: "/", hash: "", href: "http://localhost/?demo=1" });
check("OAuth href returns to SAMPLE desk", /next=%2F%3Fdemo%3D1/.test(oauthWall.RunnrDemoSandbox.keepOAuthHref("google")));
check("this test UA does not open an OAuth popup", oauthWall.RunnrDemoSandbox.canUseOAuthPopup() === false);
check("OAuth start is redirect on this UA", oauthWall.RunnrDemoSandbox.startKeepOAuth("google") === "redirect");
check("OAuth start beacons email_wall_oauth_start", oauthWall.beacons.indexOf("email_wall_oauth_start") !== -1);
check("OAuth start marks a pending return", oauthWall.RunnrDemoSandbox.keepOAuthPending() === true);
oauthWall.localStorage.setItem("runnr_api_token", "tok");
check("OAuth complete beacons converted and clears pending", oauthWall.RunnrDemoSandbox.resumeAfterKeepAuth() === true && oauthWall.beacons.indexOf("email_wall_converted") !== -1 && oauthWall.RunnrDemoSandbox.keepOAuthPending() === false);

const ahaCtx = loadSandbox({ search: "?demo=1", pathname: "/", hash: "", href: "http://localhost/?demo=1" });
const ahaHits = [];
ahaCtx.navigator.sendBeacon = function (url) {
  const m = String(url).match(/[?&]e=([^&]+)/);
  ahaHits.push(decodeURIComponent((m && m[1]) || ""));
  return true;
};
ahaCtx.S = { trades: book, watchlist: SB.factoryWatchlist(), bal: 10000, risk: 1, sym: "€" };
check("proof view does not count as aha", ahaCtx.RunnrDemoSandbox.onProofViewed() === false && ahaHits.indexOf("demo_aha") === -1);
ahaCtx.RunnrDemoSandbox.markAha("proof");
check("homepage proof reason does not beacon aha", ahaHits.indexOf("demo_aha") === -1);
ahaCtx.RunnrDemoSandbox.markAha("score");
ahaCtx.RunnrDemoSandbox.markAha("score");
check("score aha fires once per guest per day", ahaHits.filter((e) => e === "demo_aha").length === 1);
check("score path does not open the share card", (function () {
  const fn = sandboxSrc.slice(sandboxSrc.indexOf("function onSampleScored"), sandboxSrc.indexOf("function onProofViewed"));
  return !fn.includes("openShareModal") && !fn.includes("modal-share");
})());

// Skip tour ≠ keep-score wall
check("sandbox wires Skip to desk helpers", sandboxSrc.includes("onTourSkipped") && sandboxSrc.includes("forceHideKeepScore") && sandboxSrc.includes("cancelPendingKeepAfterTour"));
check("boot holds keep while tour will show", sandboxSrc.includes("tourWillShow") && /shouldHoldKeepScore[\s\S]*tourIsOpen[\s\S]*tourWillShow/.test(sandboxSrc));

const skipTour = loadWall({ search: "?demo=1", pathname: "/", hash: "", href: "http://localhost/?demo=1" });
skipTour.ctx.S = { trades: book, watchlist: SB.factoryWatchlist(), bal: 10000, risk: 1, sym: "€" };
skipTour.ctx.localStorage.setItem("runnr_intro_v1", "skipped");
skipTour.ctx.openedSizer = [];
skipTour.ctx.RunnrPretrade = {
  prime() { return true; },
  open(which) { skipTour.ctx.openedSizer.push(which || "desk"); return true; },
};
skipTour.ctx.RunnrTour = { isOpen() { return true; }, shouldShow() { return true; }, allowsEmailWall() { return false; } };
skipTour.ctx.toasts = [];
skipTour.ctx.showToast = function (a, b) { skipTour.ctx.toasts.push([a, b]); };
const skipRow = { id: 101, isDemo: true, source: "pretrade", instr: "AAPL", incomplete: false };
check("mid-tour journal defers the wall", skipTour.ctx.RunnrDemoSandbox.onSampleScored(skipRow, { reason: "process" }) === true);
check("wall stays closed while tour is open", skipTour.modal.classList.contains("open") === false);
check("intro stays closed while tour is open", skipTour.overlay.classList.contains("open") === false);
check("showKeepScore is deferred mid-tour", skipTour.ctx.RunnrDemoSandbox.showKeepScore({ reason: "score" }) === false);
check("deferred keep is queued", skipTour.ctx.RunnrDemoSandbox.tourBlocksWall() === true);
skipTour.ctx.RunnrTour = { isOpen() { return false; }, shouldShow() { return false; }, allowsEmailWall() { return true; } };
skipTour.ctx.RunnrDemoSandbox.onTourSkipped();
check("Skip tour force-hides keep modal", skipTour.modal.classList.contains("open") === false);
check("Skip tour does not open intro video", skipTour.overlay.classList.contains("open") === false);
check("Skip tour opens gold Sizer", skipTour.ctx.openedSizer.indexOf("desk") !== -1);
check("Skip tour soft one-liner is optional toast", skipTour.ctx.toasts.length >= 1 && /save the score/i.test(String(skipTour.ctx.toasts[0][1] || "")));
check("Skip cancels deferred keep — finish does not reopen", skipTour.ctx.RunnrDemoSandbox.onTourFinished() === false);
check("keep modal still closed after cancelled flush", skipTour.modal.classList.contains("open") === false);

const finishTour = loadWall({ search: "?demo=1", pathname: "/", hash: "", href: "http://localhost/?demo=1" });
finishTour.ctx.S = { trades: book, watchlist: SB.factoryWatchlist(), bal: 10000, risk: 1, sym: "€" };
finishTour.ctx.localStorage.setItem("runnr_intro_v1", "skipped");
finishTour.ctx.RunnrTour = { isOpen() { return true; }, shouldShow() { return true; }, allowsEmailWall() { return true; } };
check("score-beat journal still defers while tour open", finishTour.ctx.RunnrDemoSandbox.onSampleScored(skipRow, { reason: "process" }) === true);
check("score-beat wall stays closed under tour", finishTour.modal.classList.contains("open") === false);
finishTour.ctx.RunnrTour = { isOpen() { return false; }, shouldShow() { return false; }, allowsEmailWall() { return true; } };
check("tour finish flushes keep after a real score", finishTour.ctx.RunnrDemoSandbox.onTourFinished() === true);
check("keep opens after finish — not after Skip", finishTour.modal.classList.contains("open") === true);

const bootHold = loadSandbox({ search: "?demo=1", pathname: "/", hash: "", href: "http://localhost/?demo=1" });
bootHold.localStorage.setItem("runnr_sample_seal_v1", "1");
bootHold.localStorage.setItem("runnr_intro_v1", "skipped");
bootHold.S = { trades: book, watchlist: SB.factoryWatchlist(), bal: 10000, risk: 1, sym: "€" };
bootHold.RunnrTour = { isOpen() { return false; }, shouldShow() { return true; }, allowsEmailWall() { return true; } };
const bootModal = {
  className: "",
  classList: {
    items: new Set(),
    add(c) { this.items.add(c); bootModal.className = [...this.items].join(" "); },
    remove(c) { this.items.delete(c); bootModal.className = [...this.items].join(" "); },
    toggle(c, on) { if (on) this.add(c); else this.remove(c); },
    contains(c) { return this.items.has(c); },
  },
  querySelector() { return null; },
};
const prevBootGet = bootHold.document.getElementById;
bootHold.document.getElementById = function (id) {
  if (id === "modal-sample-keep") return bootModal;
  return prevBootGet.call(bootHold.document, id);
};
bootHold.document.querySelector = function (sel) {
  if (sel === "#modal-sample-keep .sample-keep-copy") return { textContent: "" };
  return null;
};
bootHold.RunnrDemoSandbox.bootSampleLanding(bootHold.S);
check("sealed boot does not open keep when tour will show", bootModal.classList.contains("open") === false);

// Watch how Runnr works → video → Beat 1 / Sizer, never Keep first
const watchPath = loadWall({ search: "?demo=1", pathname: "/", hash: "", href: "http://localhost/?demo=1" });
watchPath.ctx.S = { trades: book, watchlist: SB.factoryWatchlist(), bal: 10000, risk: 1, sym: "€" };
watchPath.ctx.openedSizer = [];
watchPath.ctx.tourStarts = 0;
watchPath.ctx.RunnrPretrade = {
  prime() { return true; },
  open(which) { watchPath.ctx.openedSizer.push(which || "desk"); return true; },
};
watchPath.ctx.RunnrTour = {
  isOpen() { return false; },
  shouldShow() { return false; },
  allowsEmailWall() { return true; },
  start() { watchPath.ctx.tourStarts += 1; return true; },
};
const watchBtn = {
  dataset: {},
  addEventListener(type, fn) { if (type === "click") watchBtn._click = fn; },
};
const heroEl = { hidden: false, classList: { remove() {}, add() {}, contains() { return false; } } };
const prevWatchGet = watchPath.ctx.document.getElementById;
watchPath.ctx.document.getElementById = function (id) {
  if (id === "sample-hero-watch") return watchBtn;
  if (id === "sample-score-cta") return { dataset: {}, addEventListener() {} };
  if (id === "sample-hero-skip") return { dataset: {}, addEventListener() {} };
  if (id === "sample-hero") return heroEl;
  return prevWatchGet.call(watchPath.ctx.document, id);
};
watchPath.ctx.RunnrDemoSandbox.bootSampleLanding(watchPath.ctx.S);
check("Watch CTA is bound", typeof watchBtn._click === "function");
watchBtn._click({ preventDefault() {} });
check("Watch opens intro soft-gate first", watchPath.overlay.classList.contains("open") === true);
check("Watch does not open Keep while video plays", watchPath.modal.classList.contains("open") === false);
check("Watch skip copy points at sizer", watchPath.skip.textContent === "Skip to size a trade");
watchPath.ctx.RunnrIntro.finish(watchPath.ctx.S);
check("Watch finish closes intro", watchPath.overlay.classList.contains("open") === false);
check("Watch finish opens gold Sizer", watchPath.ctx.openedSizer.indexOf("desk") !== -1);
check("Watch finish starts Beat 1 tour", watchPath.ctx.tourStarts === 1);
check("Watch finish does not open Keep wall", watchPath.modal.classList.contains("open") === false);

const watchSkip = loadWall({ search: "?demo=1", pathname: "/", hash: "", href: "http://localhost/?demo=1" });
watchSkip.ctx.S = { trades: book, watchlist: SB.factoryWatchlist(), bal: 10000, risk: 1, sym: "€" };
watchSkip.ctx.openedSizer = [];
watchSkip.ctx.tourStarts = 0;
watchSkip.ctx.RunnrPretrade = {
  prime() { return true; },
  open(which) { watchSkip.ctx.openedSizer.push(which || "desk"); return true; },
};
watchSkip.ctx.RunnrTour = {
  isOpen() { return false; },
  shouldShow() { return false; },
  allowsEmailWall() { return true; },
  start() { watchSkip.ctx.tourStarts += 1; return true; },
};
check("startWatchHow plays video", watchSkip.ctx.RunnrDemoSandbox.startWatchHow() === true && watchSkip.overlay.classList.contains("open") === true);
watchSkip.ctx.RunnrIntro.skip(watchSkip.ctx.S);
check("Watch skip lands on Sizer", watchSkip.ctx.openedSizer.indexOf("desk") !== -1);
check("Watch skip starts Beat 1", watchSkip.ctx.tourStarts === 1);
check("Watch skip does not open Keep", watchSkip.modal.classList.contains("open") === false);

check("IG ad URL is the Meta destination", SB.IG_URL === "https://runnr.fyi/?demo=1&ig=1");
check("organic demo is not the ig card", SB.isIgScoreLanding({ search: "?demo=1", pathname: "/", hash: "" }) === false && SB.shouldShowIgScore(guest) === false);
check("ig=1 is a sample landing", SB.isSampleLandingLocation({ search: "?ig=1", pathname: "/", hash: "" }) === true && SB.isIgScoreLanding({ search: "?ig=1", pathname: "/", hash: "" }) === true);
check("utm instagram is the ig path", SB.isIgScoreLanding({ search: "?demo=1&utm_source=instagram&utm_medium=paid", pathname: "/", hash: "" }) === true);
check("utm facebook is not the ig path", SB.isIgScoreLanding({ search: "?utm_source=facebook", pathname: "/", hash: "" }) === false);
check("#score is the ig path", SB.isIgScoreLanding({ search: "", pathname: "/", hash: "#score" }) === true);
check("bare home is not the ig path", SB.isIgScoreLanding({ search: "", pathname: "/", hash: "" }) === false);

const igHtml = html.slice(html.indexOf('id="ig-score"'), html.indexOf('id="tour-overlay"'));
check("ig card headline is score your last trade", igHtml.includes("Score your last trade") && !igHtml.includes("Score this trade"));
check("ig card score CTA stays Score a trade", igHtml.includes('id="ig-score-cta"') && igHtml.includes("Score a trade") && !/Watch how/.test(igHtml) && !/>Skip</.test(igHtml));
check("empty variant markup has ticker and direction", igHtml.includes('id="ig-score-ticker"') && igHtml.includes('placeholder="AAPL"') && igHtml.includes('data-ig-dir="long"') && igHtml.includes('data-ig-dir="short"') && igHtml.includes('id="ig-score-setup"'));
check("ig card primes AAPL long fields", igHtml.includes('id="ig-score-entry"') && igHtml.includes('value="198"') && igHtml.includes('id="ig-score-stop"') && igHtml.includes('value="194"') && igHtml.includes('id="ig-score-target"') && igHtml.includes('value="214"') && igHtml.includes("AAPL"));
check("ig card has no watch or skip", !/Watch how/.test(igHtml) && !/Skip/.test(igHtml));
check("first paint opens the ig card instead of the pitch hero", html.includes("runnr-ig-score") && html.includes("ig=1") && html.includes("runnr_ig_score_v1"));
check("stats documents the Meta ads URL", stats.includes('id="ig-ad-url"') && stats.includes("demo=1") && stats.includes("ig=1") && stats.includes("demo_ig_land"));
check("stats has the IG A/B section", stats.includes("Instagram A/B") && stats.includes('id="ig-ab"') && stats.includes("Land → score") && stats.includes("Score → converted") && stats.includes("users_created"));
check("route bails while the ig card is up", bootSrc.includes("runnr-ig-score"));

const igClick = loadSandbox({ search: "?demo=1&ig=1", pathname: "/", hash: "", href: "http://localhost/?demo=1&ig=1" });
igClick.localStorage.setItem("runnr_ig_variant_v1", "prefill");
const igHits = [];
const igHitUrls = [];
igClick.navigator.sendBeacon = function (url) {
  igHitUrls.push(String(url));
  const m = String(url).match(/[?&]e=([^&]+)/);
  igHits.push(decodeURIComponent((m && m[1]) || ""));
  return true;
};
igClick.S = { trades: book, watchlist: SB.factoryWatchlist(), bal: 10000, risk: 1, sym: "€" };
igClick.primed = null;
igClick.opened = [];
igClick.RunnrPretrade = {
  prime(input) { igClick.primed = input; return input; },
  open(which) { igClick.opened.push(which || "desk"); return true; },
};
check("cold ig guest sees the score card", igClick.RunnrDemoSandbox.shouldShowIgScore(igClick.S) === true);
check("cold ig guest skips the pitch hero", igClick.RunnrDemoSandbox.shouldShowSampleHero(igClick.S) === false);
const igClasses = new Set();
igClick.document.documentElement.classList = {
  add(c) { igClasses.add(c); },
  remove(c) { igClasses.delete(c); },
  toggle() {},
  contains(c) { return igClasses.has(c); },
};
check("Score click opens the result payoff", igClick.RunnrDemoSandbox.activateIgScore(igClick.S) === true && igClick.opened[0] === "result");
check("Score click marks the result surface", igClasses.has("runnr-ig-result") === true && igClasses.has("runnr-ig-score") === false);
check("Score click beacons demo_score_trade", igHits.indexOf("demo_score_trade") !== -1);
check("Score click beacons demo_score_trade once", igHits.filter((e) => e === "demo_score_trade").length === 1);
check("Score click primes AAPL long 198/194/214", igClick.primed && igClick.primed.ticker === "AAPL" && igClick.primed.dir === "long" && Number(igClick.primed.entry) === 198 && Number(igClick.primed.stop) === 194 && Number(igClick.primed.target) === 214);
check("Score click does not seal before the plan renders", igClick.RunnrDemoSandbox.hasSeal() === false);
check("ready primed plan still beacons demo_aha", igClick.RunnrDemoSandbox.onGoldScored({ ready: true, size: 50, entry: 198, stop: 194 }, { reason: "score" }) === true && igHits.indexOf("demo_aha") !== -1);
check("demo_aha fires once for the ready paint", igHits.filter((e) => e === "demo_aha").length === 1);
igClick.RunnrDemoSandbox.onGoldScored({ ready: true, size: 50, entry: 198, stop: 194 }, { reason: "score" });
check("a second ready paint does not double demo_aha", igHits.filter((e) => e === "demo_aha").length === 1);
check("card stays down after Score", igClick.RunnrDemoSandbox.shouldShowIgScore(igClick.S) === false);
igClick.sessionStorage.removeItem("runnr_ig_land_v1");
igClick.RunnrDemoSandbox.noteIgLand();
igClick.RunnrDemoSandbox.noteIgLand();
check("ig land beacons once per session", igHits.filter((e) => e === "demo_ig_land").length === 1);
check("prefill land beacon is tagged prefill", igHitUrls.some((u) => /demo_ig_land/.test(u) && /[?&]v=prefill(?:&|$)/.test(u)));
check("prefill score beacon is tagged prefill", igHitUrls.some((u) => /demo_score_trade/.test(u) && /[?&]v=prefill(?:&|$)/.test(u)));

const scoreFn = sandboxSrc.slice(sandboxSrc.indexOf("function openScoreTrade"), sandboxSrc.indexOf("function markIgResult"));
check("organic score still opens the desk", scoreFn.includes("openGoldSizer(primed)") && !/focus:\s*"result"/.test(scoreFn));
const igFn = sandboxSrc.slice(sandboxSrc.indexOf("function activateIgScore"), sandboxSrc.indexOf("function bindIgScore"));
check("IG score uses the result path", igFn.includes("openIgScoreResult") && !igFn.includes("openScoreTrade"));
check("IG result focuses the output candy", /function openIgScoreResult[\s\S]*focus:\s*"result"/.test(sandboxSrc) && pretradeSrc.includes('which === "result"') && pretradeSrc.includes("initialOutputInner") && pretradeSrc.includes("Sample Trade Result"));
check("IG result CSS hides terminal chrome", css.includes("html.runnr-ig-result") && css.includes("#desk-clock") && css.includes(".desk-heat") && css.includes(".pt-form"));
check("IG result keeps the full output panel", !/html\.runnr-ig-result[^{]*\.pt-kv:not/.test(css) && !/html\.runnr-ig-result[^{]*\.pt-output-kicker/.test(css) && !/html\.runnr-ig-result[^{]*\.pt-cleared/.test(css));

const igCandy = loadSandbox({ search: "?demo=1&ig=1", pathname: "/", hash: "", href: "http://localhost/?demo=1&ig=1" });
igCandy.document.documentElement.dataset = {};
igCandy.document.addEventListener = function () {};
igCandy.S = { trades: book, watchlist: SB.factoryWatchlist(), bal: 10000, risk: 1, sym: "€" };
vm.runInNewContext(pretradeSrc, igCandy);
const candyRails = igCandy.RunnrPretrade.normalizeRails({ bal: 10000, sym: "€", maxRiskPct: 2 }, igCandy.S);
const candyPlan = igCandy.RunnrPretrade.computePlan({
  ticker: "AAPL", dir: "long", entry: 198, stop: 194, target: 214,
}, candyRails, igCandy.S.trades, new Date("2026-09-24T12:00:00Z"));
const candyHtml = igCandy.RunnrPretrade.outputHTML(candyPlan, candyRails);
check("IG sample sizes 50 shares at 2% of €10k", candyPlan.ready === true && candyPlan.size === 50 && candyPlan.totalRisk === 200);
check("IG sample output is the result candy", candyHtml.includes("Sample Trade Result") && candyHtml.includes("50 sh") && candyHtml.includes("Total Risk") && candyHtml.includes("HOW DID IT GO?") && candyHtml.includes("Followed") && candyHtml.includes("Leaked") && candyHtml.includes("Skipped") && candyHtml.includes("Keep this score") && candyHtml.includes("Risked 2% on a 1% rule") && candyHtml.includes("€100 over"));
check("IG sample output keeps every metric row", candyHtml.includes("PENDING PLAN") && candyHtml.includes("Risk / Share") && candyHtml.includes("Reward / Share") && candyHtml.includes("Total Reward") && candyHtml.includes("R:R Ratio") && candyHtml.includes("4.00 : 1") && candyHtml.includes("PENDING · APPROVED"));

const igSigned = loadSandbox({ search: "?demo=1&ig=1", pathname: "/", hash: "", href: "http://localhost/?demo=1&ig=1" });
igSigned.localStorage.setItem("runnr_api_token", "tok");
const igSignedBook = { bal: 10000, risk: 1, sym: "€", trades: book, watchlist: SB.factoryWatchlist() };
check("signed-in ad URL skips the score card", igSigned.RunnrDemoSandbox.shouldShowIgScore(igSignedBook) === false);
check("signed-in ad URL skips the pitch hero", igSigned.RunnrDemoSandbox.shouldShowSampleHero(igSignedBook) === false);
check("signed-in ad URL does not count as ig land", igSigned.RunnrDemoSandbox.noteIgLand() === false);

const igReal = loadSandbox({ search: "?demo=1&ig=1", pathname: "/", hash: "", href: "http://localhost/?demo=1&ig=1" });
check("real book on the ad URL skips the score card", igReal.RunnrDemoSandbox.shouldShowIgScore(real) === false);

function clsSet(initial) {
  const items = new Set(initial || []);
  return {
    add(c) { items.add(c); },
    remove(c) { items.delete(c); },
    contains(c) { return items.has(c); },
  };
}
function igInput(value) {
  return {
    value: value == null ? "" : String(value),
    placeholder: "",
    hidden: false,
    disabled: false,
    textContent: "",
    classList: clsSet(),
    dataset: {},
    setAttribute() {},
    removeAttribute() {},
  };
}
function mountIgFields(ctx, values) {
  const fields = {
    "ig-score": igInput(""),
    "ig-score-ticker": igInput(values.ticker || ""),
    "ig-score-entry": igInput(values.entry || ""),
    "ig-score-stop": igInput(values.stop || ""),
    "ig-score-target": igInput(values.target || ""),
    "ig-score-plan": igInput(""),
    "ig-score-meta": igInput(""),
    "ig-score-hint": igInput(""),
    "ig-score-cta": igInput(""),
    "ig-score-setup": igInput(""),
    "ig-dir-long": igInput(""),
    "ig-dir-short": igInput(""),
  };
  fields["ig-score"].classList = clsSet();
  fields["ig-dir-long"].classList = clsSet(values.dir === "short" ? [] : ["on"]);
  fields["ig-dir-short"].classList = clsSet(values.dir === "short" ? ["on"] : []);
  fields["ig-score-hint"].hidden = true;
  ctx.document.getElementById = function (id) { return fields[id] || null; };
  return fields;
}

check("roll under 0.5 is prefill", SB.variantFromRoll(0) === "prefill" && SB.variantFromRoll(0.49) === "prefill");
check("roll at 0.5 and above is empty", SB.variantFromRoll(0.5) === "empty" && SB.variantFromRoll(0.9) === "empty");

const igAssign = loadSandbox({ search: "?demo=1&ig=1", pathname: "/", hash: "", href: "http://localhost/?demo=1&ig=1" });
const igAssigned = igAssign.RunnrDemoSandbox.assignIgVariant();
check("first IG land assigns one variant", igAssigned === "prefill" || igAssigned === "empty");
check("assignment sticks in localStorage", igAssign.localStorage.getItem("runnr_ig_variant_v1") === igAssigned);
check("returning guest keeps that variant", igAssign.RunnrDemoSandbox.assignIgVariant() === igAssigned && igAssign.RunnrDemoSandbox.igVariant() === igAssigned);
igAssign.location.search = "?demo=1&ig=1&igv=" + (igAssigned === "empty" ? "prefill" : "empty");
const igOverridden = igAssigned === "empty" ? "prefill" : "empty";
check("igv override switches variant", igAssign.RunnrDemoSandbox.assignIgVariant() === igOverridden);
check("override is persisted", igAssign.localStorage.getItem("runnr_ig_variant_v1") === igOverridden);
igAssign.location.search = "?demo=1&ig=1&igv=nope";
check("bad igv keeps the stored variant", igAssign.RunnrDemoSandbox.assignIgVariant() === igOverridden);

const organicAssign = loadSandbox({ search: "?demo=1", pathname: "/", hash: "", href: "http://localhost/?demo=1" });
check("organic demo does not assign a variant", organicAssign.RunnrDemoSandbox.assignIgVariant() === "" && organicAssign.RunnrDemoSandbox.igVariant() === "");
check("organic demo does not write the variant key", organicAssign.localStorage.getItem("runnr_ig_variant_v1") == null);

check("empty gate wants a ticker", igAssign.RunnrDemoSandbox.igPlanGate({ ticker: "", dir: "long", entry: "198", stop: "194" }).ok === false);
check("empty gate wants entry and stop", igAssign.RunnrDemoSandbox.igPlanGate({ ticker: "TSLA", dir: "long", entry: "", stop: "" }).ok === false);
check("long stop must sit below entry", igAssign.RunnrDemoSandbox.igPlanGate({ ticker: "TSLA", dir: "long", entry: "250", stop: "260" }).ok === false);
check("short stop must sit above entry", igAssign.RunnrDemoSandbox.igPlanGate({ ticker: "TSLA", dir: "short", entry: "250", stop: "240" }).ok === false);
const noTarget = igAssign.RunnrDemoSandbox.igPlanGate({ ticker: "TSLA", dir: "short", entry: "250", stop: "260", target: "" });
check("target is optional when stop is on the right side", noTarget.ok === true && noTarget.hasTarget === false && /optional/i.test(noTarget.hint));
const withTarget = igAssign.RunnrDemoSandbox.igPlanGate({ ticker: "tsla", dir: "short", entry: "250", stop: "260", target: "220" });
check("filled short plan is ready", withTarget.ok === true && withTarget.ticker === "TSLA" && withTarget.dir === "short" && Math.abs(withTarget.rr - 3) < 1e-9);

const igEmptyClick = loadSandbox({ search: "?demo=1&ig=1&igv=empty", pathname: "/", hash: "", href: "http://localhost/?demo=1&ig=1&igv=empty" });
const igEmptyHits = [];
igEmptyClick.navigator.sendBeacon = function (url) {
  igEmptyHits.push(String(url));
  return true;
};
igEmptyClick.S = { trades: book, watchlist: SB.factoryWatchlist(), bal: 10000, risk: 1, sym: "€" };
igEmptyClick.primed = null;
igEmptyClick.opened = [];
igEmptyClick.RunnrPretrade = {
  prime(input) { igEmptyClick.primed = input; return input; },
  open(which) { igEmptyClick.opened.push(which || "desk"); return true; },
};
const badFields = mountIgFields(igEmptyClick, { ticker: "TSLA", dir: "long", entry: "250", stop: "260", target: "" });
check("wrong-side stop does not open the result", igEmptyClick.RunnrDemoSandbox.activateIgScore(igEmptyClick.S) === false && igEmptyClick.opened.length === 0);
check("wrong-side stop disables Score and shows a hint", badFields["ig-score-cta"].disabled === true && /below entry/i.test(badFields["ig-score-hint"].textContent));
mountIgFields(igEmptyClick, { ticker: "TSLA", dir: "short", entry: "250", stop: "260", target: "220" });
check("empty variant scores the typed plan", igEmptyClick.RunnrDemoSandbox.activateIgScore(igEmptyClick.S) === true && igEmptyClick.opened[0] === "result");
check("empty variant primes TSLA short 250/260/220", igEmptyClick.primed && igEmptyClick.primed.ticker === "TSLA" && igEmptyClick.primed.dir === "short" && Number(igEmptyClick.primed.entry) === 250 && Number(igEmptyClick.primed.stop) === 260 && Number(igEmptyClick.primed.target) === 220);
check("empty score beacon is tagged empty", igEmptyHits.some((u) => /demo_score_trade/.test(u) && /[?&]v=empty(?:&|$)/.test(u)));
igEmptyClick.sessionStorage.removeItem("runnr_ig_land_v1");
igEmptyClick.RunnrDemoSandbox.noteIgLand();
check("empty land beacon is tagged empty", igEmptyHits.some((u) => /demo_ig_land/.test(u) && /[?&]v=empty(?:&|$)/.test(u)));

const organicBeacon = loadSandbox({ search: "?demo=1", pathname: "/", hash: "", href: "http://localhost/?demo=1" });
const organicUrls = [];
organicBeacon.navigator.sendBeacon = function (url) { organicUrls.push(String(url)); return true; };
organicBeacon.S = { trades: book, watchlist: SB.factoryWatchlist(), bal: 10000, risk: 1, sym: "€" };
organicBeacon.RunnrPretrade = { prime() { return true; }, open() { return true; } };
organicBeacon.RunnrDemoSandbox.openScoreTrade(organicBeacon.S);
check("organic score beacon is not variant-tagged", organicUrls.some((u) => /demo_score_trade/.test(u)) && organicUrls.every((u) => !/[?&]v=/.test(u)));

const igWall = loadSandbox({ search: "?demo=1&ig=1&igv=empty", pathname: "/", hash: "", href: "http://localhost/?demo=1&ig=1&igv=empty" });
igWall.RunnrDemoSandbox.assignIgVariant();
igWall.location.search = "?demo=1";
const igWallUrls = [];
igWall.navigator.sendBeacon = function (url) { igWallUrls.push(String(url)); return true; };
igWall.RunnrDemoSandbox.fireEmailWallBeacons(true);
check("IG session wall beacons carry the variant after the URL changes", igWallUrls.some((u) => /email_wall_shown/.test(u) && /[?&]v=empty(?:&|$)/.test(u)) && igWallUrls.some((u) => /email_wall_locked/.test(u) && /[?&]v=empty(?:&|$)/.test(u)));

const tslaCtx = loadSandbox({ search: "?demo=1&ig=1&igv=empty", pathname: "/", hash: "", href: "http://localhost/?demo=1&ig=1&igv=empty" });
tslaCtx.S = { trades: book, watchlist: SB.factoryWatchlist(), bal: 10000, risk: 1, sym: "€" };
tslaCtx.document.documentElement.dataset = {};
tslaCtx.document.addEventListener = function () {};
tslaCtx.switchPage = function () {};
vm.runInNewContext(pretradeSrc, tslaCtx);
tslaCtx.RunnrPretrade.open("result");
const tslaRails = tslaCtx.RunnrPretrade.normalizeRails({ bal: 10000, sym: "€", maxRiskPct: 2 }, tslaCtx.S);
tslaCtx.RunnrPretrade.prime({ ticker: "TSLA", dir: "short", entry: "250", stop: "260", target: "" });
check("prime clears a missing target", tslaCtx.RunnrPretrade.prime().target === "" && tslaCtx.RunnrPretrade.prime().ticker === "TSLA");
const tslaBare = tslaCtx.RunnrPretrade.computePlan({ ticker: "TSLA", dir: "short", entry: 250, stop: 260 }, tslaRails, tslaCtx.S.trades, new Date("2026-09-24T12:00:00Z"));
const tslaBareHtml = tslaCtx.RunnrPretrade.outputHTML(tslaBare, tslaRails);
check("missing target still sizes off the 2% rail", tslaBare.ready === true && tslaBare.size === 20 && tslaBare.totalRisk === 200 && tslaBare.rewardPerShare === 0);
check("missing target reward rows are dashes", /Reward \/ Share<\/span><strong[^>]*>—</.test(tslaBareHtml) && /Total Reward<\/span><strong[^>]*>—</.test(tslaBareHtml) && tslaBareHtml.includes("PENDING · APPROVED"));
const tslaPlan = tslaCtx.RunnrPretrade.computePlan({ ticker: "TSLA", dir: "short", entry: 250, stop: 260, target: 220 }, tslaRails, tslaCtx.S.trades, new Date("2026-09-24T12:00:00Z"));
const tslaHtml = tslaCtx.RunnrPretrade.outputHTML(tslaPlan, tslaRails);
check("TSLA short uses the typed plan not the AAPL sample", tslaPlan.size === 20 && tslaPlan.riskPerShare === 10 && tslaPlan.totalReward === 600 && Math.abs(tslaPlan.rr - 3) < 1e-9);
check("TSLA result copy is not the AAPL card", tslaHtml.includes("TSLA · Short") && tslaHtml.includes("20 sh") && tslaHtml.includes("3.00 : 1") && tslaHtml.includes("Sample Trade Result") && tslaHtml.includes("HOW DID IT GO?") && tslaHtml.includes("Keep this score") && tslaHtml.includes("Risked 2% on a 1% rule") && !tslaHtml.includes("AAPL") && !tslaHtml.includes("50 sh") && !/>198</.test(tslaHtml) && !tslaHtml.includes("4.00 : 1"));

check("wall config defaults to the lite sheet", SB.WALL_DEFAULT === "lite");
check("lite wall CSS hides pricing and mutes the trust line", css.includes("#modal-sample-keep.sample-keep-lite .runnr-readonly{display:none}") && css.includes("#modal-sample-keep .sample-keep-lite-trust{display:none}") && /sample-keep-lite-trust\{[^}]*color:var\(--text3\)/.test(css.replace(/\s+/g, "")));

function mountKeep(ctx) {
  const modal = {
    className: "",
    classList: {
      items: new Set(),
      add(c) { this.items.add(c); },
      remove(c) { this.items.delete(c); },
      toggle(c, on) { if (on) this.add(c); else this.remove(c); },
      contains(c) { return this.items.has(c); },
    },
    querySelector() { return null; },
  };
  const title = { textContent: "Keep this score" };
  const copy = { textContent: "" };
  ctx.document.getElementById = function (id) {
    if (id === "modal-sample-keep") return modal;
    if (id === "sample-keep-title") return title;
    if (id === "sample-keep-dismiss") return { hidden: false };
    return null;
  };
  ctx.document.querySelector = function (sel) {
    if (sel === "#modal-sample-keep .sample-keep-copy") return copy;
    return null;
  };
  ctx.openModal = function () { modal.classList.add("open"); };
  return { modal, title, copy };
}

const fullKeep = loadSandbox({ search: "?demo=1&ig=1", pathname: "/", hash: "", href: "http://localhost/?demo=1&ig=1" });
const fullNodes = mountKeep(fullKeep);
check("default IG wall opens the lite sheet", fullKeep.RunnrDemoSandbox.showKeepScore({ skipIntro: true }) === true && fullNodes.title.textContent === "Save your score" && fullNodes.copy.textContent === "Free. No card. Takes one tap." && fullNodes.modal.classList.contains("sample-keep-lite") === true);
check("default IG land does not store a wall", fullKeep.localStorage.getItem("runnr_wall_v1") == null && fullKeep.localStorage.getItem("runnr_wall_override_v1") == null);
fullKeep.localStorage.setItem("runnr_wall_v1", "full");
check("stale stored full without an override still shows lite", fullKeep.RunnrDemoSandbox.wallVersion() === "lite" && fullKeep.RunnrDemoSandbox.showKeepScore({ skipIntro: true }) === true && fullNodes.title.textContent === "Save your score");
fullKeep.location.search = "?demo=1&ig=1&wall=nope";
check("bad wall param stays on the lite default", fullKeep.RunnrDemoSandbox.assignWallVersion() === "lite" && fullKeep.localStorage.getItem("runnr_wall_override_v1") == null);

const liteKeep = loadSandbox({ search: "?demo=1&ig=1&wall=lite", pathname: "/", hash: "", href: "http://localhost/?demo=1&ig=1&wall=lite" });
const liteNodes = mountKeep(liteKeep);
check("wall=lite paints Save your score", liteKeep.RunnrDemoSandbox.showKeepScore({ skipIntro: true }) === true && liteNodes.title.textContent === "Save your score" && liteNodes.copy.textContent === "Free. No card. Takes one tap." && liteNodes.modal.classList.contains("sample-keep-lite") === true);
check("wall=lite is persisted", liteKeep.localStorage.getItem("runnr_wall_v1") === "lite");
liteKeep.location.search = "?demo=1&ig=1";
check("stored lite survives the next IG land", liteKeep.RunnrDemoSandbox.showKeepScore({ skipIntro: true }) === true && liteNodes.title.textContent === "Save your score" && liteNodes.modal.classList.contains("sample-keep-lite") === true);
liteKeep.location.search = "?demo=1";
check("IG session keeps the lite wall after the URL drops ig", liteKeep.RunnrDemoSandbox.wallVersion() === "lite" && liteNodes.copy.textContent === "Free. No card. Takes one tap.");
liteKeep.location.search = "?demo=1&ig=1&wall=full";
check("wall=full restores the pricing wall", liteKeep.RunnrDemoSandbox.showKeepScore({ skipIntro: true }) === true && liteNodes.title.textContent === "Keep this score" && /Your score: ready/.test(liteNodes.copy.textContent) && liteNodes.modal.classList.contains("sample-keep-lite") === false && liteKeep.localStorage.getItem("runnr_wall_v1") === "full" && liteKeep.localStorage.getItem("runnr_wall_override_v1") === "1");
liteKeep.location.search = "?demo=1&ig=1";
check("explicit wall=full sticks after the param is gone", liteKeep.RunnrDemoSandbox.wallVersion() === "full" && liteKeep.RunnrDemoSandbox.showKeepScore({ skipIntro: true }) === true && liteNodes.title.textContent === "Keep this score");

const organicWall = loadSandbox({ search: "?demo=1", pathname: "/", hash: "", href: "http://localhost/?demo=1" });
check("organic demo does not assign a wall", organicWall.RunnrDemoSandbox.assignWallVersion() === "" && organicWall.localStorage.getItem("runnr_wall_v1") == null);
check("organic demo resolves the lite wall", organicWall.RunnrDemoSandbox.wallVersion() === "lite");
organicWall.localStorage.setItem("runnr_wall_v1", "full");
check("organic stale full does not override the lite default", organicWall.RunnrDemoSandbox.wallVersion() === "lite");

const liteBeacons = loadSandbox({ search: "?demo=1&ig=1&igv=empty&wall=lite", pathname: "/", hash: "", href: "http://localhost/?demo=1&ig=1&igv=empty&wall=lite" });
const liteUrls = [];
liteBeacons.navigator.sendBeacon = function (url) { liteUrls.push(String(url)); return true; };
liteBeacons.RunnrDemoSandbox.assignIgVariant();
liteBeacons.RunnrDemoSandbox.assignWallVersion();
liteBeacons.location.search = "?demo=1";
liteBeacons.RunnrDemoSandbox.fireEmailWallBeacons(true);
liteBeacons.RunnrDemoSandbox.noteKeepOAuthStart("google");
liteBeacons.RunnrDemoSandbox.beacon("email_wall_converted");
liteBeacons.RunnrDemoSandbox.beacon("demo_score_trade");
function tagged(event, wall) {
  return liteUrls.some((u) => new RegExp("[?&]e=" + event + "(?:&|$)").test(u) && new RegExp("[?&]w=" + wall + "(?:&|$)").test(u) && /[?&]v=empty(?:&|$)/.test(u));
}
check("lite wall shown and locked are tagged", tagged("email_wall_shown", "lite") && tagged("email_wall_locked", "lite"));
check("lite oauth start and converted are tagged", tagged("email_wall_oauth_start", "lite") && tagged("email_wall_converted", "lite"));
check("score beacon keeps the variant and skips the wall tag", liteUrls.some((u) => /demo_score_trade/.test(u) && /[?&]v=empty(?:&|$)/.test(u) && !/[?&]w=/.test(u)));

const organicWallBeacon = loadSandbox({ search: "?demo=1", pathname: "/", hash: "", href: "http://localhost/?demo=1" });
const organicWallUrls = [];
organicWallBeacon.navigator.sendBeacon = function (url) { organicWallUrls.push(String(url)); return true; };
organicWallBeacon.RunnrDemoSandbox.fireEmailWallBeacons(true);
check("organic wall beacons are lite and unvarianted", organicWallUrls.some((u) => /email_wall_shown/.test(u) && /[?&]w=lite(?:&|$)/.test(u)) && organicWallUrls.every((u) => !/[?&]v=/.test(u)));

console.log("test_sample_landing: ok " + n);
