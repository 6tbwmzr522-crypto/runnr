/**
 * Guest entry gate.
 *
 * Default "free7": bare runnr.fyi, ?demo=1, and Instagram params open a filled
 * SAMPLE desk on Sizer. No tour, no intro video, no email wall for 7 days.
 * Day index 0 is the first 24h after the first real land (localStorage + cookie).
 * Days 0–6 are the desk. Soft paywall when the index is 7+ (day 8+).
 *
 * Rollback to the previous SAMPLE hero + email wall + IG A/B + tour:
 *   1. Open https://runnr.fyi/?gate=legacy (saved on this device), or
 *   2. localStorage.setItem("runnr_guest_gate_v1", "legacy"), or
 *   3. Set DEFAULT below to "legacy" and ship.
 * Restore this mode: https://runnr.fyi/?gate=free7
 * QA the wall without waiting: ?trialday=7 (index 7 = day 8+). Clear with ?trialday=off.
 *
 * Signed-in auth and Pro are unchanged. This file only softens the guest path.
 */
(function (global) {
  "use strict";

  var DEFAULT = "free7";
  var GATE_KEY = "runnr_guest_gate_v1";
  var TRIAL_KEY = "runnr_guest_trial_v1";
  var TRIAL_COOKIE = "runnr_guest_trial";
  var TRIAL_DAYS = 7;
  var DAY_MS = 86400000;
  var COOKIE_MAX_AGE = 60 * 60 * 24 * 400;
  var OVERRIDE_KEY = "runnr_trialday_v1";

  var FOCUS = {
    sizer: "guest_focus_sizer",
    journal: "guest_focus_journal",
    home: "guest_focus_home",
    shelf: "guest_focus_shelf",
    coach: "guest_focus_coach",
    watchlist: "guest_focus_watchlist",
    sync: "guest_focus_sync",
    portfolio: "guest_focus_portfolio",
    desk: "guest_focus_desk",
    crypto: "guest_focus_crypto",
  };

  var LAND = {
    bare: "guest_land_bare",
    demo: "guest_land_demo",
    ig: "guest_land_ig",
    other: "guest_land_other",
  };

  var deskArmed = false;

  function storageGet(store, key) {
    try {
      if (!store) return "";
      return store.getItem(key) || "";
    } catch (e) {
      return "";
    }
  }

  function storageSet(store, key, value) {
    try {
      if (store) store.setItem(key, value);
    } catch (e) {}
  }

  function storageRemove(store, key) {
    try {
      if (store) store.removeItem(key);
    } catch (e) {}
  }

  function loggedIn() {
    try {
      if (global.RunnrSync && typeof RunnrSync.isLoggedIn === "function" && RunnrSync.isLoggedIn()) return true;
    } catch (e) {}
    try {
      if (global.localStorage && localStorage.getItem("runnr_api_token")) return true;
    } catch (e2) {}
    return false;
  }

  function privacyOptOut() {
    try {
      var nav = global.navigator;
      if (!nav) return false;
      return nav.doNotTrack === "1" || nav.globalPrivacyControl === true || global.doNotTrack === "1";
    } catch (e) {
      return false;
    }
  }

  function readCookie(name) {
    try {
      var parts = String(global.document && document.cookie || "").split("; ");
      for (var i = 0; i < parts.length; i++) {
        var pair = parts[i].split("=");
        if (pair[0] === name) {
          try {
            return decodeURIComponent(pair.slice(1).join("="));
          } catch (e) {
            return pair.slice(1).join("=");
          }
        }
      }
    } catch (e2) {}
    return "";
  }

  function writeCookie(name, value) {
    try {
      if (!global.document) return;
      var secure = "";
      try {
        if (global.location && location.protocol === "https:") secure = "; Secure";
      } catch (e) {}
      document.cookie = name + "=" + encodeURIComponent(value) + "; Path=/; Max-Age=" + COOKIE_MAX_AGE + "; SameSite=Lax" + secure;
    } catch (e2) {}
  }

  function parseStamp(raw) {
    var t = Date.parse(String(raw || ""));
    return isFinite(t) && t > 0 ? t : 0;
  }

  function gateMode(loc) {
    loc = loc || global.location || {};
    var search = "";
    try { search = String(loc.search || ""); } catch (e) {}
    var match = search.match(/(?:^|[?&])gate=(legacy|free7)(?:&|$)/i);
    if (match) {
      var chosen = match[1].toLowerCase();
      storageSet(global.localStorage, GATE_KEY, chosen);
      return chosen;
    }
    var stored = String(storageGet(global.localStorage, GATE_KEY) || "").toLowerCase();
    if (stored === "legacy" || stored === "free7") return stored;
    return DEFAULT;
  }

  function freeMode(loc) {
    return gateMode(loc) !== "legacy";
  }

  function legacy(loc) {
    return !freeMode(loc);
  }

  function readStart() {
    var local = parseStamp(storageGet(global.localStorage, TRIAL_KEY));
    var cookie = parseStamp(readCookie(TRIAL_COOKIE));
    var t = 0;
    if (local && cookie) t = Math.min(local, cookie);
    else t = local || cookie;
    if (!t) return 0;
    var iso = new Date(t).toISOString();
    if (!local || local !== t) storageSet(global.localStorage, TRIAL_KEY, iso);
    if (!cookie || cookie !== t) writeCookie(TRIAL_COOKIE, iso);
    return t;
  }

  function ensureTrial(now) {
    if (loggedIn() || !freeMode()) return 0;
    var existing = readStart();
    if (existing) return existing;
    var t = now || Date.now();
    var iso = new Date(t).toISOString();
    storageSet(global.localStorage, TRIAL_KEY, iso);
    writeCookie(TRIAL_COOKIE, iso);
    return t;
  }

  function dayOverride(loc) {
    loc = loc || global.location || {};
    var search = "";
    try { search = String(loc.search || ""); } catch (e) {}
    var match = search.match(/(?:^|[?&])trialday=(off|\d{1,2})(?:&|$)/i);
    if (match) {
      if (String(match[1]).toLowerCase() === "off") {
        storageRemove(global.sessionStorage, OVERRIDE_KEY);
        return null;
      }
      var n = Math.min(30, parseInt(match[1], 10));
      storageSet(global.sessionStorage, OVERRIDE_KEY, String(n));
      return n;
    }
    var saved = storageGet(global.sessionStorage, OVERRIDE_KEY);
    if (/^[0-9]+$/.test(saved)) return Math.min(30, parseInt(saved, 10));
    return null;
  }

  function dayIndex(now) {
    var forced = dayOverride();
    if (forced != null) return forced;
    var start = readStart();
    if (!start) return 0;
    var ms = (now || Date.now()) - start;
    if (!(ms >= 0)) return 0;
    return Math.floor(ms / DAY_MS);
  }

  function trialOpen() {
    if (!freeMode() || loggedIn()) return false;
    return dayIndex() < TRIAL_DAYS;
  }

  function trialExpired() {
    return freeMode() && !loggedIn() && !trialOpen();
  }

  function utcDay(now) {
    var d = now ? new Date(now) : new Date();
    return d.toISOString().slice(0, 10);
  }

  function onceSession(key, fn) {
    if (storageGet(global.sessionStorage, key) === "1") return false;
    storageSet(global.sessionStorage, key, "1");
    try { fn(); } catch (e) {}
    return true;
  }

  function onceLocalDay(key, fn, now) {
    var stamp = key + ":" + utcDay(now);
    if (storageGet(global.localStorage, key) === stamp) return false;
    storageSet(global.localStorage, key, stamp);
    try { fn(); } catch (e) {}
    return true;
  }

  function track(event) {
    if (!event || privacyOptOut()) return false;
    try {
      if (global.RunnrDemoSandbox && typeof RunnrDemoSandbox.beacon === "function") {
        RunnrDemoSandbox.beacon(event);
        return true;
      }
    } catch (e) {}
    try {
      var nav = global.navigator;
      if (!nav) return false;
      var base = "https://api.runnr.fyi";
      if (global.RunnrSync && typeof RunnrSync.apiBase === "function") base = RunnrSync.apiBase();
      var guest = "";
      try {
        if (global.RunnrVisit && typeof RunnrVisit.guestId === "function") guest = RunnrVisit.guestId() || "";
      } catch (err) {}
      var url = String(base).replace(/\/$/, "") + "/api/v1/stats/hit?e=" + encodeURIComponent(event) + (guest ? "&g=" + encodeURIComponent(guest) : "");
      if (nav.sendBeacon) {
        nav.sendBeacon(url);
        return true;
      }
      if (typeof global.fetch === "function") {
        global.fetch(url, { method: "POST", keepalive: true, mode: "cors", credentials: "omit" });
        return true;
      }
    } catch (e2) {}
    return false;
  }

  function landSource(loc) {
    loc = loc || global.location || {};
    var search = "";
    var hash = "";
    var path = "";
    try { search = String(loc.search || ""); } catch (e) {}
    try { hash = String(loc.hash || "").replace(/^#/, "").split(/[/?&]/)[0].toLowerCase(); } catch (e2) {}
    try { path = String(loc.pathname || "").replace(/\/+$/, "").toLowerCase(); } catch (e3) {}
    var ig = /(?:^|[?&])ig=1(?:&|$)/.test(search)
      || /(?:^|[?&])utm_source=(?:ig|instagram)(?:&|$)/i.test(search)
      || hash === "score";
    if (ig) return "ig";
    var demo = /(?:^|[?&])demo=1(?:&|$)/.test(search)
      || hash === "sample"
      || hash === "demo"
      || path === "/sample"
      || /\/sample$/.test(path);
    if (demo) return "demo";
    if ((path === "" || path === "/") && !search && !hash) return "bare";
    return "other";
  }

  function noteLand(source) {
    if (!freeMode() || loggedIn()) return false;
    var ev = LAND[source] || LAND.other;
    return onceSession("runnr_guest_land_v1", function () { track(ev); });
  }

  function noteFocus(tool) {
    if (!freeMode() || loggedIn()) return false;
    var ev = FOCUS[tool];
    if (!ev) return false;
    return onceLocalDay("runnr_focus_" + tool, function () { track(ev); });
  }

  function noteScore(signature) {
    if (!freeMode() || loggedIn()) return false;
    var sig = String(signature || "");
    if (sig && storageGet(global.sessionStorage, "runnr_guest_score_sig") === sig) return false;
    if (sig) storageSet(global.sessionStorage, "runnr_guest_score_sig", sig);
    track("guest_score");
    return true;
  }

  function noteTrialDay() {
    if (!freeMode() || loggedIn()) return false;
    var d = Math.min(TRIAL_DAYS, dayIndex());
    return onceLocalDay("runnr_trial_beacon_" + d, function () { track("guest_trial_d" + d); });
  }

  function noteHitWall() {
    if (!freeMode() || loggedIn()) return false;
    return onceLocalDay("runnr_guest_hit_wall_v1", function () { track("guest_hit_wall"); });
  }

  function noteConvertIntent() {
    if (loggedIn()) return false;
    storageSet(global.sessionStorage, "runnr_guest_convert_intent", "1");
    return true;
  }

  function noteConvert() {
    if (!loggedIn()) return false;
    return onceSession("runnr_guest_convert_v1", function () { track("guest_convert"); });
  }

  function maybeConvert() {
    if (!loggedIn()) return false;
    if (storageGet(global.sessionStorage, "runnr_guest_convert_intent") !== "1") return false;
    storageSet(global.sessionStorage, "runnr_guest_convert_intent", "0");
    return noteConvert();
  }

  function armDeskTime() {
    if (deskArmed || !freeMode() || loggedIn()) return false;
    deskArmed = true;
    var marks = [
      { ms: 30000, event: "guest_desk_30s", key: "runnr_desk_30s" },
      { ms: 120000, event: "guest_desk_2m", key: "runnr_desk_2m" },
      { ms: 300000, event: "guest_desk_5m", key: "runnr_desk_5m" },
    ];
    if (typeof global.setTimeout !== "function") return true;
    marks.forEach(function (mark) {
      if (storageGet(global.sessionStorage, mark.key) === "1") return;
      global.setTimeout(function () {
        if (storageGet(global.sessionStorage, mark.key) === "1") return;
        storageSet(global.sessionStorage, mark.key, "1");
        track(mark.event);
      }, mark.ms);
    });
    return true;
  }

  function sharedFocus(loc) {
    loc = loc || global.location || {};
    var hash = "";
    var search = "";
    try { hash = String(loc.hash || "").replace(/^#/, "").split(/[/?&]/)[0].toLowerCase(); } catch (e) {}
    try { search = String(loc.search || ""); } catch (e2) {}
    var tools = {
      journal: "journal",
      shelf: "shelf",
      coach: "coach",
      watchlist: "watchlist",
      portfolio: "portfolio",
      sync: "sync",
      desk: "desk",
      terminal: "desk",
      crypto: "crypto",
    };
    if (tools[hash]) return tools[hash];
    if (/(?:^|[?&])desk=1(?:&|$)/.test(search)) return "desk";
    if (/(?:^|[?&])(?:desk|pretrade)=journal(?:&|$)/.test(search)) return "journal";
    return "sizer";
  }

  var api = {
    DEFAULT: DEFAULT,
    GATE_KEY: GATE_KEY,
    TRIAL_KEY: TRIAL_KEY,
    TRIAL_COOKIE: TRIAL_COOKIE,
    TRIAL_DAYS: TRIAL_DAYS,
    gateMode: gateMode,
    freeMode: freeMode,
    legacy: legacy,
    loggedIn: loggedIn,
    readStart: readStart,
    ensureTrial: ensureTrial,
    dayIndex: dayIndex,
    trialOpen: trialOpen,
    trialExpired: trialExpired,
    landSource: landSource,
    noteLand: noteLand,
    noteFocus: noteFocus,
    noteScore: noteScore,
    noteTrialDay: noteTrialDay,
    noteHitWall: noteHitWall,
    noteConvertIntent: noteConvertIntent,
    noteConvert: noteConvert,
    maybeConvert: maybeConvert,
    armDeskTime: armDeskTime,
    sharedFocus: sharedFocus,
    track: track,
  };

  global.RunnrGuestGate = api;

  try {
    if (freeMode() && !loggedIn()) ensureTrial();
    maybeConvert();
  } catch (e) {}
})(typeof window !== "undefined" ? window : globalThis);
