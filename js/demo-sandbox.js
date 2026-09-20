/**
 * Populated SAMPLE desk for logged-out visitors.
 * Alex Runner — €10k, 1% risk, stops held, size leaked.
 * Demo rows are isDemo:true so they never count toward trial/journal caps
 * and never merge into a signed-in real book.
 */
(function (global) {
  "use strict";

  const REV = 1;
  const MIN_BOOK = 12;
  const VIEW_KEY = "runnr_demo_viewed";
  const WALL_SHOWN_KEY = "runnr_email_wall_shown_v1";
  const WALL_LOCKED_KEY = "runnr_email_wall_locked_v1";
  const WALL_OAUTH_KEY = "runnr_email_wall_oauth_v1";
  const WALL_CONVERTED_KEY = "runnr_email_wall_converted_v1";
  const AHA_KEY = "runnr_sample_aha_v1";
  const HERO_KEY = "runnr_sample_hero_v1";
  const KEEP_KEY = "runnr_sample_keep_v1";
  const SEAL_KEY = "runnr_sample_seal_v1";
  const BIO_URL = "https://runnr.fyi/?demo=1";
  const ALIAS_PATH = "/sample";
  const KEEP_HREF = "/login.html?keep=1";
  const KEEP_RETURN = "/?demo=1";
  const KEEP_OAUTH_POPUP = "/login.html?keep=1&oauth_popup=1";

  function snap(at) {
    return { risk: 1, bal: 10000, at: at || "2026-04-15T00:00:00.000Z", sym: "€" };
  }

  function isDemoTrade(t) {
    if (global.RunnrTradeLimit && typeof RunnrTradeLimit.isDemoJournalTrade === "function") {
      return RunnrTradeLimit.isDemoJournalTrade(t);
    }
    return !!(t && (t.isDemo === true || t.seed === true));
  }

  function isFactoryWatch(w) {
    if (!w) return false;
    const id = Number(w.id);
    const sym = String(w.sym || "").toUpperCase();
    return (id === 1 || id === 2 || id === 3) && (sym === "RACE" || sym === "ASTS" || sym === "EURUSD");
  }

  function isDemoWatch(w) {
    if (!w) return false;
    if (w.isDemo === true || w.seed === true) return true;
    return isFactoryWatch(w);
  }

  function isBrokerOrCsvSource(src) {
    const s = String(src || "").toLowerCase();
    return s === "alpaca" || s === "ibkr" || s === "t212" || s === "csv";
  }

  function isOwnTrade(t) {
    if (!t || isDemoTrade(t)) return false;
    if (t.mergedAway) return false;
    return isBrokerOrCsvSource(t.source) || t.id != null;
  }

  function looksLikeRealBook(s) {
    if (!s) return false;
    if (s.balFromAlpaca || s.brokerSync?.alpaca?.connected) return true;
    if (Number(s.journalBaseBal) > 0) return true;
    if (Number(s.bal) > 0 && Number(s.bal) !== 10000) return true;
    const trades = s.trades || [];
    if (trades.some(isOwnTrade)) return true;
    const wl = s.watchlist || [];
    if (wl.some((w) => w && !isDemoWatch(w))) return true;
    return false;
  }

  function isLoggedIn() {
    try {
      if (global.RunnrSync && typeof RunnrSync.isLoggedIn === "function" && RunnrSync.isLoggedIn()) {
        return true;
      }
    } catch (e) {}
    try {
      if (global.localStorage && localStorage.getItem("runnr_api_token")) return true;
    } catch (e) {}
    return false;
  }

  function isSampleLandingLocation(loc) {
    loc = loc || (global.location || {});
    try {
      if (/(?:^|[?&])demo=1(?:&|$)/.test(String(loc.search || ""))) return true;
    } catch (e) {}
    try {
      const hash = String(loc.hash || "").replace(/^#/, "").split(/[/?&]/)[0].toLowerCase();
      if (hash === "sample" || hash === "demo") return true;
    } catch (e) {}
    try {
      const path = String(loc.pathname || "").replace(/\/+$/, "").toLowerCase();
      if (path === "/sample" || path.endsWith("/sample")) return true;
    } catch (e) {}
    return false;
  }

  function queryForce() {
    return isSampleLandingLocation();
  }

  function dayIso(now, daysAgo) {
    const d = new Date(now.getTime());
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString();
  }

  function dayLabel(iso) {
    return new Date(iso).toLocaleDateString("en-GB", { month: "short", day: "numeric" });
  }

  function classicSeeds() {
    return [
      { id:1, isDemo:true, instr:'RACE', dir:'long', entry:354, exit:380, size:28, pnl:728, stopOk:true, sizeOk:true, type:'shares', date:'Apr 17', stop:338, sampleOrigin:'synced', riskSnapshot:{ risk:1, bal:10000, at:'2026-04-17T00:00:00.000Z', sym:'€' } },
      { id:2, isDemo:true, instr:'BE', dir:'long', entry:137, exit:151, size:65, pnl:910, stopOk:true, sizeOk:false, type:'shares', date:'Apr 15', stop:135, sampleOrigin:'manual', riskSnapshot:{ risk:1, bal:10000, at:'2026-04-15T00:00:00.000Z', sym:'€' } },
      { id:3, isDemo:true, instr:'USDJPY', dir:'short', entry:159.37, exit:157.93, size:0.5, pnl:720, stopOk:true, sizeOk:true, type:'cfd', date:'Apr 12', stop:160.2, sampleOrigin:'synced', riskSnapshot:{ risk:1, bal:10000, at:'2026-04-12T00:00:00.000Z', sym:'€' } },
      { id:4, isDemo:true, instr:'AAPL CFD', dir:'long', entry:198, exit:195, size:15, pnl:-45, stopOk:false, sizeOk:true, type:'cfd', date:'Apr 10', incomplete:true, sampleOrigin:'manual', riskSnapshot:{ risk:1, bal:10000, at:'2026-04-10T00:00:00.000Z', sym:'€' } },
    ];
  }

  function extraSeeds() {
    return [
      { id:5, isDemo:true, instr:'NVDA', dir:'long', entry:120, exit:126, size:50, pnl:300, stop:118, stopOk:true, sizeOk:true, type:'shares', sampleOrigin:'synced' },
      { id:6, isDemo:true, instr:'MSFT', dir:'long', entry:415, exit:422, size:20, pnl:140, stop:410, stopOk:true, sizeOk:true, type:'shares', sampleOrigin:'imported' },
      { id:7, isDemo:true, instr:'TSLA', dir:'long', entry:175, exit:168, size:20, pnl:-140, stop:170, stopOk:true, sizeOk:true, type:'shares', sampleOrigin:'synced' },
      { id:8, isDemo:true, instr:'AMD', dir:'long', entry:155, exit:162, size:25, pnl:175, stop:151, stopOk:true, sizeOk:true, type:'shares', sampleOrigin:'synced' },
      { id:9, isDemo:true, instr:'AAPL', dir:'long', entry:198, exit:204, size:25, pnl:150, stop:194, stopOk:true, sizeOk:true, type:'shares', sampleOrigin:'manual' },
      { id:10, isDemo:true, instr:'META', dir:'long', entry:510, exit:498, size:10, pnl:-120, stop:500, stopOk:true, sizeOk:true, type:'shares', sampleOrigin:'synced' },
      { id:11, isDemo:true, instr:'AMZN', dir:'long', entry:185, exit:191, size:25, pnl:150, stop:181, stopOk:true, sizeOk:true, type:'shares', sampleOrigin:'synced' },
      { id:12, isDemo:true, instr:'GOOGL', dir:'long', entry:165, exit:171, size:25, pnl:150, stop:161, stopOk:true, sizeOk:true, type:'shares', sampleOrigin:'synced' },
      { id:13, isDemo:true, instr:'EURUSD', dir:'short', entry:1.142, exit:1.128, size:12500, pnl:175, stop:1.150, stopOk:true, sizeOk:true, type:'cfd', sampleOrigin:'synced' },
      { id:14, isDemo:true, instr:'GBPUSD', dir:'long', entry:1.270, exit:1.278, size:12500, pnl:100, stop:1.262, stopOk:true, sizeOk:true, type:'cfd', sampleOrigin:'imported' },
      { id:15, isDemo:true, instr:'SPY', dir:'long', entry:520, exit:526, size:20, pnl:120, stop:515, stopOk:true, sizeOk:true, type:'shares', sampleOrigin:'synced' },
      { id:16, isDemo:true, instr:'NFLX', dir:'long', entry:620, exit:608, size:10, pnl:-120, stop:610, stopOk:true, sizeOk:true, type:'shares', sampleOrigin:'synced' },
      { id:17, isDemo:true, instr:'NVDA', dir:'long', entry:118, exit:112, size:80, pnl:-480, stop:114, stopOk:true, sizeOk:false, type:'shares', sampleOrigin:'synced' },
      { id:18, isDemo:true, instr:'TSLA', dir:'long', entry:180, exit:172, size:70, pnl:-560, stop:176, stopOk:true, sizeOk:false, type:'shares', sampleOrigin:'synced' },
      { id:19, isDemo:true, instr:'AMD', dir:'long', entry:160, exit:154, size:60, pnl:-360, stop:156, stopOk:true, sizeOk:false, type:'shares', sampleOrigin:'synced' },
      { id:20, isDemo:true, instr:'META', dir:'long', entry:500, exit:490, size:40, pnl:-400, stop:494, stopOk:true, sizeOk:false, type:'shares', sampleOrigin:'synced' },
      { id:21, isDemo:true, instr:'AMZN', dir:'long', entry:190, exit:184, size:50, pnl:-300, stop:188, stopOk:false, sizeOk:false, type:'shares', sampleOrigin:'synced' },
      { id:22, isDemo:true, instr:'MSFT CFD', dir:'long', entry:420, exit:415, size:8, pnl:-40, stop:412, stopOk:false, sizeOk:false, type:'cfd', incomplete:true, sampleOrigin:'imported' },
    ];
  }

  function stampBook(trades, now) {
    const offsets = [0, 1, 2, 3, 4, 5, 8, 9, 10, 12, 13, 15, 16, 18, 20, 21, 23, 25, 27, 28, 30, 32];
    return trades.map((t, i) => {
      const iso = dayIso(now, offsets[i] != null ? offsets[i] : (i + 1));
      const row = Object.assign({}, t, {
        date: dayLabel(iso),
        filledAt: iso,
        riskSnapshot: Object.assign({}, snap(iso), t.riskSnapshot || {}, { at: iso }),
      });
      return row;
    });
  }

  function factoryTrades(now) {
    const when = now instanceof Date ? now : new Date();
    return stampBook(classicSeeds().concat(extraSeeds()), when);
  }

  function factoryWatchlist() {
    return [
      { id:1, isDemo:true, sym:'RACE', dir:'long', entry:354, stop:338, target:420, thesis:'Post-selloff recovery, 52-week range support, buyback programme active', rr:3.9, urgent:false },
      { id:2, isDemo:true, sym:'ASTS', dir:'long', entry:18, stop:15.5, target:28, thesis:'LEO satellite revenue inflection, institutional accumulation', rr:4.0, urgent:true },
      { id:3, isDemo:true, sym:'EURUSD', dir:'short', entry:1.142, stop:1.150, target:1.110, thesis:'ECB dovish pivot signals, USD strength on rate divergence', rr:4.0, urgent:false },
      { id:4, isDemo:true, sym:'NVDA', dir:'long', entry:120, stop:118, target:138, thesis:'Sized from the 1% book — wait for the next pullback', rr:9.0, urgent:false },
      { id:5, isDemo:true, sym:'BE', dir:'long', entry:137, stop:135, target:160, thesis:'Size leak in the journal — next one stays at 1%', rr:11.5, urgent:true },
      { id:6, isDemo:true, sym:'AAPL', dir:'long', entry:198, stop:194, target:214, thesis:'Manual (sample) setup from the desk', rr:4.0, urgent:false },
    ];
  }

  function demoTradeCount(s) {
    return ((s && s.trades) || []).filter(isDemoTrade).length;
  }

  function shouldApply(state, opts) {
    const force = !!(opts && opts.force) || queryForce();
    if (isLoggedIn()) return false;
    if (looksLikeRealBook(state)) return false;
    if (force) return true;
    if ((state && state.demoSandboxRev || 0) < REV) return true;
    if (demoTradeCount(state) < MIN_BOOK) return true;
    return false;
  }

  function apply(state, opts) {
    if (!state || !shouldApply(state, opts)) return false;
    const book = factoryTrades();
    state.trades = book;
    state.watchlist = factoryWatchlist();
    if (!state.bal || Number(state.bal) === 10000) state.bal = 10000;
    if (!state.risk) state.risk = 1;
    if (!state.sym) state.sym = "€";
    state.demoSandboxRev = REV;
    state.onboardingComplete = true;
    try { localStorage.setItem("runnr_onboarding_v1", "done"); } catch (e) {}
    if (queryForce() || (opts && opts.force)) {
      try { localStorage.setItem("runnr_hook_v1", "done"); } catch (e) {}
    }
    return true;
  }

  function hydrate(state, opts) {
    const applied = apply(state, opts);
    if (applied || isDemoState(state)) paintChrome(state);
    paintProof();
    bindProof();
    bootSampleLanding(state);
    if (applied) beacon("demo_view");
    return applied;
  }

  function isDemoState(s) {
    if (global.RunnrSync && typeof RunnrSync.isDemoState === "function" && RunnrSync !== api) {
      try { return !!RunnrSync.isDemoState(s); } catch (e) {}
    }
    s = s || global.S;
    if (!s) return true;
    if (s.balFromAlpaca || s.brokerSync?.alpaca?.connected) return false;
    const trades = s.trades || [];
    if (trades.some((t) => t && (isBrokerOrCsvSource(t.source) || !isDemoTrade(t)))) return false;
    const wl = s.watchlist || [];
    if (wl.some((w) => w && !isDemoWatch(w))) return false;
    return true;
  }

  function paintChrome(state) {
    const demo = isDemoState(state || global.S);
    try {
      if (global.document && document.documentElement) {
        document.documentElement.classList.toggle("runnr-demo", !!demo);
      }
    } catch (e) {}
    const chrome = global.document && document.getElementById("demo-chrome");
    if (chrome) {
      chrome.hidden = !demo;
      chrome.classList.toggle("show", !!demo);
    }
    const cta = global.document && document.getElementById("demo-chrome-cta");
    if (cta && demo && !isLoggedIn()) {
      if (!hasAha()) {
        cta.hidden = true;
      } else {
        cta.hidden = false;
        cta.textContent = "Keep this score";
        cta.setAttribute("href", "#keep-score");
      }
    } else if (cta) {
      cta.hidden = !demo;
    }
    return demo;
  }

  function bindChrome() {
    const cta = global.document && document.getElementById("demo-chrome-cta");
    if (cta && !cta.dataset.demoBound) {
      cta.dataset.demoBound = "1";
      cta.addEventListener("click", function (ev) {
        if (ev && ev.preventDefault) ev.preventDefault();
        beacon("demo_cta_start");
        showKeepScore({ reason: "chrome" });
      });
    }
    paintProof();
    bindProof();
    bootSampleLanding(global.S);
  }

  function moneyLabel(n, sym) {
    const Coach = global.CoachEngine;
    if (Coach && typeof Coach.fmtCardMoney === "function") {
      return Coach.fmtCardMoney(sym || "€", n);
    }
    const r = Math.round(Number(n) || 0);
    return (r < 0 ? "-" : "") + (sym || "€") + Math.abs(r).toLocaleString("en-GB");
  }

  /**
   * Public SAMPLE case — numbers come from the factory book + CoachEngine.
   * Do not hard-code score / P&L in the DOM.
   */
  function proofModel(now) {
    const Coach = global.CoachEngine;
    const trades = factoryTrades(now);
    const score = Coach && typeof Coach.disciplineScore === "function"
      ? Coach.disciplineScore(trades)
      : { overall: 0, stopPct: 0, sizePct: 0, tier: "—", tradeCount: 0 };
    const metrics = Coach && typeof Coach.metrics === "function"
      ? Coach.metrics(trades)
      : { discPnl: 0, undiscPnl: 0 };
    const leak = Coach && typeof Coach.leakLabel === "function"
      ? Coach.leakLabel(score, metrics)
      : "size leaks";
    return {
      name: "Alex Runner",
      badge: "SAMPLE",
      kicker: "Alex Runner · SAMPLE",
      story: "Stops held, size leaked.",
      disclaimer: "Illustrative demo book — not a customer testimonial, not live AUM.",
      brand: "runnr.fyi",
      deskHref: "/?demo=1",
      trialHref: "/login.html",
      trialLabel: "Start free · 7-day trial",
      deskLabel: "Score one trade",
      overall: score.overall,
      overallLabel: Number.isFinite(Number(score.overall)) && score.tradeCount
        ? Math.round(score.overall) + "%"
        : "—",
      tier: score.tier || "—",
      stopPct: score.stopPct,
      sizePct: score.sizePct,
      stopLabel: Number.isFinite(Number(score.stopPct)) && score.tradeCount
        ? Math.round(score.stopPct) + "%"
        : "—",
      sizeLabel: Number.isFinite(Number(score.sizePct)) && score.tradeCount
        ? Math.round(score.sizePct) + "%"
        : "—",
      discPnl: metrics.discPnl,
      undiscPnl: metrics.undiscPnl,
      discPnlLabel: moneyLabel(metrics.discPnl, "€"),
      undiscPnlLabel: moneyLabel(metrics.undiscPnl, "€"),
      leakLabel: leak,
      tradeCount: score.tradeCount,
    };
  }

  function proofCardHtml() {
    return (
      '<article class="runnr-proof" data-runnr-proof aria-label="Alex Runner SAMPLE case">' +
        '<header class="runnr-proof-head">' +
          '<div class="runnr-proof-who">' +
            '<div class="runnr-proof-kicker">Alex Runner · <span class="runnr-proof-badge">SAMPLE</span></div>' +
            '<p class="runnr-proof-tier" data-proof="tier">—</p>' +
            '<p class="runnr-proof-story">Stops held, size leaked.</p>' +
          '</div>' +
          '<div class="runnr-proof-score">' +
            '<strong data-proof="overall">—</strong>' +
          '</div>' +
        '</header>' +
        '<dl class="runnr-proof-split">' +
          '<div><dt>Stop</dt><dd data-proof="stop">—</dd></div>' +
          '<div><dt>Size</dt><dd data-proof="size">—</dd></div>' +
        '</dl>' +
        '<div class="runnr-proof-pnl">' +
          '<div><span>Disciplined</span><strong class="runnr-proof-up" data-proof="disc">—</strong></div>' +
          '<div><span>Size leak</span><strong class="runnr-proof-dn" data-proof="leak">—</strong></div>' +
        '</div>' +
        '<p class="runnr-proof-note">Illustrative demo book — not a customer testimonial, not live AUM.</p>' +
      '</article>'
    );
  }

  function fillProofCard(card, model) {
    if (!card || !model) return;
    const set = (key, value) => {
      card.querySelectorAll('[data-proof="' + key + '"]').forEach((el) => {
        el.textContent = value;
      });
    };
    set("overall", model.overallLabel);
    set("tier", model.tier);
    set("stop", model.stopLabel);
    set("size", model.sizeLabel);
    set("disc", model.discPnlLabel);
    set("leak", model.undiscPnlLabel);
    const ring = card.querySelector(".runnr-proof-score");
    if (ring) {
      const pct = Math.max(0, Math.min(100, Number(model.overall) || 0));
      ring.style.setProperty("--proof-pct", String(pct));
    }
  }

  function paintProof(root) {
    const doc = (root && root.querySelectorAll) ? root : (global.document || null);
    if (!doc) return null;
    const model = proofModel();
    const hosts = doc.querySelectorAll("[data-runnr-proof-host]");
    hosts.forEach((host) => {
      if (!host.querySelector("[data-runnr-proof]")) {
        host.innerHTML = proofCardHtml();
      }
    });
    const cards = doc.querySelectorAll("[data-runnr-proof]");
    cards.forEach((card) => fillProofCard(card, model));
    return model;
  }

  function bindProof() {
    const doc = global.document;
    if (!doc) return;
    doc.querySelectorAll(".runnr-proof-cta-start").forEach((el) => {
      if (el.dataset.proofBound) return;
      el.dataset.proofBound = "1";
      el.addEventListener("click", function () {
        beacon("demo_cta_start");
      });
    });
    doc.querySelectorAll(".runnr-proof-cta-desk").forEach((el) => {
      if (el.dataset.proofBound) return;
      el.dataset.proofBound = "1";
      el.addEventListener("click", function () {
        beacon("demo_view");
      });
    });
  }

  function storageGet(store, key) {
    try {
      if (!store) return null;
      return store.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function storageSet(store, key, value) {
    try {
      if (store) store.setItem(key, value);
    } catch (e) {}
  }

  function hasAha() {
    return storageGet(global.localStorage, AHA_KEY) === "1";
  }

  function hasSeal() {
    return storageGet(global.localStorage, SEAL_KEY) === "1";
  }

  function shouldHoldKeepScore(state) {
    if (isLoggedIn()) return false;
    if (!hasSeal()) return false;
    const s = state || global.S;
    if (s && looksLikeRealBook(s)) return false;
    return true;
  }

  function isReadyGoldScore(computed) {
    if (!computed || computed.sampleLocked) return false;
    if (computed.ready) return true;
    const size = Number(computed.size) || 0;
    const entry = Number(computed.entry) || 0;
    const stop = Number(computed.stop) || 0;
    return size > 0 && entry > 0 && stop > 0;
  }

  function markSeal() {
    storageSet(global.localStorage, SEAL_KEY, "1");
    markAha("score");
  }

  function heroDismissed() {
    return storageGet(global.sessionStorage, HERO_KEY) === "done";
  }

  function markHeroDismissed() {
    storageSet(global.sessionStorage, HERO_KEY, "done");
    try {
      if (global.document && document.documentElement) {
        document.documentElement.classList.remove("runnr-sample-landing");
      }
    } catch (e) {}
  }

  function markAha(reason) {
    storageSet(global.localStorage, AHA_KEY, "1");
    storageSet(global.sessionStorage, KEEP_KEY, reason || "1");
    paintChrome(global.S);
    beacon("demo_aha");
  }

  function firstIncompleteSample(state) {
    const trades = ((state && state.trades) || []).length
      ? state.trades
      : factoryTrades();
    const aapl = trades.find((t) => t && isDemoTrade(t) && t.incomplete && /AAPL\s*CFD/i.test(String(t.instr || "")));
    if (aapl) return aapl;
    return trades.find((t) => t && isDemoTrade(t) && t.incomplete) || null;
  }

  function sampleHeroEl() {
    return global.document && document.getElementById("sample-hero");
  }

  function showSampleHero() {
    const el = sampleHeroEl();
    if (!el) return false;
    el.hidden = false;
    el.classList.add("open");
    try {
      if (global.document && document.documentElement) {
        document.documentElement.classList.add("runnr-sample-landing");
      }
    } catch (e) {}
    paintProof(el);
    return true;
  }

  function hideSampleHero() {
    const el = sampleHeroEl();
    if (el) {
      el.classList.remove("open");
      el.hidden = true;
    }
    try {
      if (global.document && document.documentElement) {
        document.documentElement.classList.remove("runnr-sample-landing");
      }
    } catch (e) {}
    try {
      if (global.RunnrTour && typeof RunnrTour.maybeShow === "function") {
        RunnrTour.maybeShow(global.S);
      }
    } catch (e) {}
  }

  function shouldShowSampleHero(state) {
    if (isLoggedIn()) return false;
    if (looksLikeRealBook(state)) return false;
    if (!queryForce() && !isDemoState(state)) return false;
    if (!queryForce()) return false;
    if (hasAha() || heroDismissed()) return false;
    return true;
  }

  function sampleTicker(t) {
    return String((t && (t.instr || t.sym)) || "AAPL").replace(/\s*CFD\s*$/i, "").trim().toUpperCase() || "AAPL";
  }

  function sampleWatchFor(state, t) {
    const ticker = sampleTicker(t);
    const wl = ((state && state.watchlist) || []).length ? state.watchlist : factoryWatchlist();
    return wl.find((w) => w && String(w.sym || "").toUpperCase() === ticker) || null;
  }

  function sampleScorePrime(state) {
    const book = state || global.S;
    const t = firstIncompleteSample(book);
    const watch = sampleWatchFor(book, t || { instr: "AAPL" });
    const src = t || watch || { instr: "AAPL", dir: "long", entry: 198, stop: 194, target: 214 };
    return {
      ticker: sampleTicker(src),
      dir: src.dir || (watch && watch.dir) || "long",
      entry: src.entry != null && src.entry !== "" ? src.entry : (watch && watch.entry),
      stop: src.stop != null && src.stop !== "" ? src.stop : (watch && watch.stop),
      target: src.target != null && src.target !== "" ? src.target : (watch && watch.target),
    };
  }

  function openGoldSizer(primeInput) {
    const PT = global.RunnrPretrade;
    if (PT && typeof PT.prime === "function" && primeInput) {
      try { PT.prime(primeInput); } catch (e) {}
    }
    if (PT && typeof PT.open === "function") {
      try { PT.open("desk"); return true; } catch (e) {}
    }
    if (typeof global.switchPage === "function") {
      try { global.switchPage("sizer"); return true; } catch (e) {}
    }
    return false;
  }

  function openScoreTrade(state) {
    markHeroDismissed();
    hideSampleHero();
    const book = state || global.S;
    try {
      if (book && !isLoggedIn() && !looksLikeRealBook(book)) {
        if (!firstIncompleteSample(book) || demoTradeCount(book) < MIN_BOOK) {
          apply(book, { force: true });
          if (typeof global.persist === "function") global.persist();
        }
      }
    } catch (e) {}
    const primed = sampleScorePrime(book);
    beacon("demo_score_trade");
    return openGoldSizer(primed);
  }

  function tourBlocksWall() {
    try {
      return !!(global.RunnrTour && RunnrTour.isOpen && RunnrTour.isOpen() && RunnrTour.allowsEmailWall && !RunnrTour.allowsEmailWall());
    } catch (e) {
      return false;
    }
  }

  function onSampleScored(trade, opts) {
    if (isLoggedIn()) return false;
    if (!isDemoState(global.S)) return false;
    if (trade && !isDemoTrade(trade)) return false;
    markSeal();
    if (tourBlocksWall()) return true;
    showKeepScore({ reason: (opts && opts.reason) || "score" });
    return true;
  }

  /**
   * First ready gold-sizer score (computed size / R:R / blocked).
   * Distinct from opening the sizer and from the skippable SAMPLE hero.
   * LOG TRADE still seals via onSampleScored.
   */
  function onGoldScored(computed, opts) {
    if (isLoggedIn()) return false;
    if (!isDemoState(global.S)) return false;
    if (!isReadyGoldScore(computed)) return false;
    const first = !hasSeal();
    markSeal();
    if (first) {
      const reason = (opts && opts.reason) || "score";
      const delay = opts && Number.isFinite(Number(opts.delayMs)) ? Math.max(0, Number(opts.delayMs)) : 0;
      const show = function () {
        if (isLoggedIn()) return;
        if (tourBlocksWall()) return;
        showKeepScore({ reason: reason });
      };
      if (delay > 0 && typeof global.setTimeout === "function") {
        global.setTimeout(show, delay);
      } else {
        show();
      }
    }
    return true;
  }

  function onProofViewed() {
    if (isLoggedIn()) return false;
    if (!isDemoState(global.S) && !queryForce()) return false;
    markAha("proof");
    showKeepScore();
    return true;
  }

  // Wall bait is saved score + weekly discipline report. Quiet 7-day / no auto-bill line
  // stays under the copy so TikTok guests do not think one-tap OAuth starts a paid plan.
  const DEFAULT_KEEP_COPY = "Your score: ready. Save it — plus the weekly report that shows undisciplined P&L vs the clean one.";
  const CAP_KEEP_COPY = "3 SAMPLE plans used — save your score to keep sizing & logging. SAMPLE stays SAMPLE — it never merges into a real book.";

  function onceSessionFlag(key, fn) {
    try {
      if (global.sessionStorage && sessionStorage.getItem(key) === "1") return false;
      if (global.sessionStorage) sessionStorage.setItem(key, "1");
    } catch (e) {}
    if (typeof fn === "function") fn();
    return true;
  }

  function fireEmailWallBeacons(locked) {
    // Always record shown first. Locked is a later hold — never fire locked without shown.
    onceSessionFlag(WALL_SHOWN_KEY, function () {
      beacon("email_wall_shown");
    });
    if (locked) {
      onceSessionFlag(WALL_LOCKED_KEY, function () {
        beacon("email_wall_locked");
      });
    }
    return true;
  }

  function keepOAuthHref(provider, nextPath) {
    const Sync = global.RunnrSync;
    const next = nextPath || KEEP_RETURN;
    if (Sync && typeof Sync.oauthStartUrl === "function") {
      return Sync.oauthStartUrl(provider, next);
    }
    const p = provider === "apple" ? "apple" : "google";
    return "https://api.runnr.fyi/api/v1/auth/oauth/" + p + "/start?next=" + encodeURIComponent(next);
  }

  function paintKeepOAuth() {
    const google = global.document && document.getElementById("sample-keep-google");
    const apple = global.document && document.getElementById("sample-keep-apple");
    if (google) google.setAttribute("href", keepOAuthHref("google", KEEP_RETURN));
    if (apple) apple.setAttribute("href", keepOAuthHref("apple", KEEP_RETURN));
    return !!(google && apple);
  }

  function persistKeepBook() {
    try {
      if (typeof global.persist === "function") global.persist();
    } catch (e) {}
  }

  function markKeepOAuth(provider) {
    const val = provider === "apple" ? "apple" : (provider === "google" ? "google" : "1");
    storageSet(global.sessionStorage, WALL_OAUTH_KEY, val);
    storageSet(global.localStorage, WALL_OAUTH_KEY, val);
  }

  function keepOAuthPending() {
    return storageGet(global.sessionStorage, WALL_OAUTH_KEY) === "google"
      || storageGet(global.sessionStorage, WALL_OAUTH_KEY) === "apple"
      || storageGet(global.sessionStorage, WALL_OAUTH_KEY) === "1"
      || storageGet(global.localStorage, WALL_OAUTH_KEY) === "google"
      || storageGet(global.localStorage, WALL_OAUTH_KEY) === "apple"
      || storageGet(global.localStorage, WALL_OAUTH_KEY) === "1";
  }

  function clearKeepOAuth() {
    try { if (global.sessionStorage) sessionStorage.removeItem(WALL_OAUTH_KEY); } catch (e) {}
    try { if (global.localStorage) localStorage.removeItem(WALL_OAUTH_KEY); } catch (e) {}
  }

  function noteKeepOAuthStart(provider) {
    persistKeepBook();
    markKeepOAuth(provider);
    beacon("email_wall_oauth_start");
    return keepOAuthHref(provider, KEEP_RETURN);
  }

  function watchKeepOAuthPopup(popup) {
    if (!popup || typeof global.addEventListener !== "function") return false;
    let done = false;
    const origin = (global.location && global.location.origin) || "";
    function finish() {
      if (done) return;
      done = true;
      try { global.removeEventListener("message", onMsg); } catch (e) {}
      try { if (timer && typeof global.clearInterval === "function") global.clearInterval(timer); } catch (e2) {}
      resumeAfterKeepAuth();
    }
    function onMsg(ev) {
      try {
        if (origin && ev.origin !== origin) return;
        if (!ev.data || ev.data.type !== "runnr-oauth-done") return;
      } catch (e) {
        return;
      }
      try { popup.close(); } catch (e2) {}
      finish();
    }
    global.addEventListener("message", onMsg);
    const timer = typeof global.setInterval === "function"
      ? global.setInterval(function () {
        try {
          if (popup.closed) finish();
        } catch (e) {}
      }, 400)
      : null;
    return true;
  }

  function canUseOAuthPopup() {
    try {
      const ua = String((global.navigator && navigator.userAgent) || "");
      if (/TikTok|Instagram|FBAN|FBAV|Line\/|Twitter|Bytedance/i.test(ua)) return false;
      if (/iPhone|iPad|Android/i.test(ua)) return false;
      if (global.matchMedia && global.matchMedia("(max-width: 800px)").matches) return false;
    } catch (e) {}
    return typeof global.open === "function";
  }

  function startKeepOAuth(provider, ev) {
    const p = provider === "apple" ? "apple" : "google";
    noteKeepOAuthStart(p);
    let popup = null;
    try {
      if (canUseOAuthPopup()) {
        popup = global.open(keepOAuthHref(p, KEEP_OAUTH_POPUP), "runnr_oauth", "popup=yes,width=480,height=720");
      }
    } catch (e) {}
    if (popup && !popup.closed) {
      if (ev && ev.preventDefault) ev.preventDefault();
      watchKeepOAuthPopup(popup);
      return "popup";
    }
    const link = ev && ev.currentTarget;
    if (link && link.setAttribute) {
      link.setAttribute("href", keepOAuthHref(p, KEEP_RETURN));
    }
    return "redirect";
  }

  function resumeAfterKeepAuth() {
    if (!isLoggedIn()) return false;
    onceSessionFlag(WALL_CONVERTED_KEY, function () {
      beacon("email_wall_converted");
    });
    clearKeepOAuth();
    try { hideKeepScore(); } catch (e) {}
    try {
      if (typeof global.applyGuestShell === "function") global.applyGuestShell();
    } catch (e) {}
    try {
      if (typeof global.routeDeskOrGold === "function") global.routeDeskOrGold();
    } catch (e) {}
    return true;
  }

  function paintKeepLock(modal) {
    const el = modal || (global.document && document.getElementById("modal-sample-keep"));
    if (!el) return false;
    const locked = shouldHoldKeepScore();
    if (el.classList && typeof el.classList.toggle === "function") {
      el.classList.toggle("sample-keep-locked", locked);
    }
    const closeBtn = el.querySelector ? el.querySelector(".modal-close") : null;
    if (closeBtn) closeBtn.hidden = !!locked;
    const dismiss = global.document && document.getElementById("sample-keep-dismiss");
    if (dismiss) dismiss.hidden = !!locked;
    return locked;
  }

  function tourWantsChipPath() {
    try {
      const loc = global.location || {};
      if (/(?:^|[?&])tour=1(?:&|$)/.test(String(loc.search || ""))) return true;
      if (/^#tour\b/i.test(String(loc.hash || ""))) return true;
      if (global.RunnrTour && typeof RunnrTour.queryForce === "function" && RunnrTour.queryForce()) return true;
    } catch (e) {}
    return false;
  }

  function playIntroThenKeep(opts) {
    const Intro = global.RunnrIntro;
    if (!Intro || typeof Intro.playBeforeKeepScore !== "function") return false;
    if (typeof Intro.isOpen === "function" && Intro.isOpen()) return true;
    return !!Intro.playBeforeKeepScore(function () {
      showKeepScore(Object.assign({}, opts || {}, { skipIntro: true }));
    }, opts);
  }

  function showKeepScore(opts) {
    if (isLoggedIn()) return false;
    const o = opts || {};
    if (!o.skipIntro) {
      const Intro = global.RunnrIntro;
      if (Intro && typeof Intro.isOpen === "function" && Intro.isOpen()) return true;
      const wantsIntro = Intro && typeof Intro.shouldPlayBeforeKeepScore === "function"
        ? Intro.shouldPlayBeforeKeepScore(o)
        : false;
      if (wantsIntro && !tourWantsChipPath() && playIntroThenKeep(o)) return true;
    }
    const copy = global.document && document.querySelector("#modal-sample-keep .sample-keep-copy");
    if (copy) {
      copy.textContent = (opts && opts.reason === "sample-log-cap") ? CAP_KEEP_COPY : DEFAULT_KEEP_COPY;
    }
    const processHost = global.document && document.getElementById("sample-keep-process");
    if (processHost) {
      const PT = global.RunnrPretrade;
      if (PT && typeof PT.processButtonsHtml === "function") {
        processHost.innerHTML = PT.processButtonsHtml(null);
        processHost.hidden = false;
      }
    }
    const modal = global.document && document.getElementById("modal-sample-keep");
    paintKeepLock(modal);
    paintKeepOAuth();
    let opened = false;
    if (modal && typeof global.openModal === "function") {
      global.openModal("modal-sample-keep");
      opened = true;
    } else if (modal) {
      modal.classList.add("open");
      opened = true;
    }
    if (opened) fireEmailWallBeacons(shouldHoldKeepScore());
    return opened;
  }

  function hideKeepScore() {
    if (shouldHoldKeepScore()) {
      showKeepScore();
      return false;
    }
    const modal = global.document && document.getElementById("modal-sample-keep");
    if (modal && typeof global.closeModal === "function") {
      global.closeModal("modal-sample-keep");
      return true;
    }
    if (modal) modal.classList.remove("open");
    return true;
  }

  function bindSampleHero() {
    const doc = global.document;
    if (!doc) return;
    const score = doc.getElementById("sample-score-cta");
    if (score && !score.dataset.sampleBound) {
      score.dataset.sampleBound = "1";
      score.addEventListener("click", function (ev) {
        if (ev) ev.preventDefault();
        openScoreTrade(global.S);
      });
    }
    const skip = doc.getElementById("sample-hero-skip");
    if (skip && !skip.dataset.sampleBound) {
      skip.dataset.sampleBound = "1";
      skip.addEventListener("click", function () {
        markHeroDismissed();
        hideSampleHero();
        beacon("demo_view");
        try {
          if (typeof global.routeDeskOrGold === "function") {
            global.routeDeskOrGold();
          } else {
            const PT = global.RunnrPretrade;
            if (PT && typeof PT.wantsUnifiedJournal === "function" && PT.wantsUnifiedJournal()) {
              if (PT.openUnifiedJournal) PT.openUnifiedJournal();
              else if (typeof global.switchPage === "function") global.switchPage("journal");
            } else {
              const gold = PT && typeof PT.wantsGold === "function" && PT.wantsGold();
              if (gold && PT.open) PT.open("desk");
              else if (PT && typeof PT.wantsMarketDesk === "function" && PT.wantsMarketDesk() && global.RunnrDesk) {
                RunnrDesk.open();
              }
            }
          }
        } catch (e) {}
      });
    }
    doc.querySelectorAll("#sample-hero [data-runnr-proof]").forEach((card) => {
      if (card.dataset.sampleProofBound) return;
      card.dataset.sampleProofBound = "1";
      card.addEventListener("click", function (ev) {
        if (ev && ev.target && ev.target.closest && ev.target.closest("button, a")) return;
        onProofViewed();
      });
    });
  }

  function bindKeepScore() {
    const doc = global.document;
    if (!doc) return;
    const dismiss = doc.getElementById("sample-keep-dismiss");
    if (dismiss && !dismiss.dataset.sampleBound) {
      dismiss.dataset.sampleBound = "1";
      dismiss.addEventListener("click", function (ev) {
        if (shouldHoldKeepScore()) {
          if (ev && ev.preventDefault) ev.preventDefault();
          showKeepScore();
          return;
        }
        hideKeepScore();
      });
    }
    const replay = doc.getElementById("sample-keep-replay");
    if (replay && !replay.dataset.sampleBound) {
      replay.dataset.sampleBound = "1";
      replay.addEventListener("click", function (ev) {
        if (ev && ev.preventDefault) ev.preventDefault();
        try {
          if (global.RunnrIntro && typeof RunnrIntro.replay === "function") RunnrIntro.replay();
        } catch (e) {}
      });
    }
    doc.querySelectorAll("[data-sample-keep-cta]").forEach((el) => {
      if (el.dataset.sampleBound) return;
      el.dataset.sampleBound = "1";
      el.addEventListener("click", function () {
        persistKeepBook();
        beacon("demo_cta_start");
      });
    });
    doc.querySelectorAll("[data-sample-keep-oauth]").forEach((el) => {
      if (el.dataset.sampleBound) return;
      el.dataset.sampleBound = "1";
      el.addEventListener("click", function (ev) {
        startKeepOAuth(el.getAttribute("data-sample-keep-oauth"), ev);
      });
    });
  }

  function bootSampleLanding(state) {
    bindSampleHero();
    bindKeepScore();
    if (shouldShowSampleHero(state || global.S)) {
      showSampleHero();
    } else {
      hideSampleHero();
    }
    paintChrome(state || global.S);
    if (shouldHoldKeepScore(state || global.S)) showKeepScore();
  }

  function beacon(event) {
    try {
      const nav = global.navigator;
      if (!nav) return;
      if (nav.doNotTrack === "1" || nav.globalPrivacyControl) return;
      if (event === "demo_view") {
        try {
          if (global.sessionStorage && sessionStorage.getItem(VIEW_KEY) === "1") return;
          if (global.sessionStorage) sessionStorage.setItem(VIEW_KEY, "1");
        } catch (e) {}
      }
      let base = "https://api.runnr.fyi";
      if (global.RunnrSync && typeof RunnrSync.apiBase === "function") {
        base = RunnrSync.apiBase();
      }
      const url = String(base).replace(/\/$/, "") + "/api/v1/stats/hit?e=" + encodeURIComponent(event || "demo_view");
      if (nav.sendBeacon) {
        nav.sendBeacon(url);
        return;
      }
      if (typeof global.fetch === "function") {
        global.fetch(url, { method: "POST", keepalive: true, mode: "cors", credentials: "omit" });
      }
    } catch (e) {}
  }

  const api = {
    REV,
    MIN_BOOK,
    BIO_URL,
    ALIAS_PATH,
    KEEP_HREF,
    KEEP_RETURN,
    KEEP_OAUTH_POPUP,
    AHA_KEY,
    HERO_KEY,
    SEAL_KEY,
    factoryTrades,
    factoryWatchlist,
    classicSeeds,
    isDemoTrade,
    isDemoWatch,
    isFactoryWatch,
    isOwnTrade,
    looksLikeRealBook,
    shouldApply,
    apply,
    hydrate,
    isDemoState,
    paintChrome,
    bindChrome,
    beacon,
    queryForce,
    isSampleLandingLocation,
    proofModel,
    proofCardHtml,
    paintProof,
    bindProof,
    hasAha,
    hasSeal,
    markAha,
    markSeal,
    shouldHoldKeepScore,
    isReadyGoldScore,
    firstIncompleteSample,
    sampleScorePrime,
    openScoreTrade,
    onSampleScored,
    onGoldScored,
    onProofViewed,
    showKeepScore,
    hideKeepScore,
    fireEmailWallBeacons,
    keepOAuthHref,
    paintKeepOAuth,
    keepOAuthPending,
    markKeepOAuth,
    clearKeepOAuth,
    noteKeepOAuthStart,
    startKeepOAuth,
    canUseOAuthPopup,
    resumeAfterKeepAuth,
    tourWantsChipPath,
    shouldShowSampleHero,
    bootSampleLanding,
    showSampleHero,
    hideSampleHero,
  };

  global.RunnrDemoSandbox = api;

  if (global.document) {
    const bootProof = function () {
      try {
        paintProof();
        bindProof();
        bootSampleLanding(global.S);
      } catch (e) {}
    };
    if (global.document.readyState === "loading") {
      global.document.addEventListener("DOMContentLoaded", bootProof);
    } else {
      bootProof();
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
