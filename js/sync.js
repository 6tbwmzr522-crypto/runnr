/**
 * Runnr API client — login, Alpaca connect, read-only sync.
 */
const RunnrSync = (() => {
  const TOKEN_KEY = "runnr_api_token";
  const EMAIL_KEY = "runnr_api_email";
  const URL_KEY = "runnr_api_url";
  const ALPACA_LOCAL_KEY = "runnr_alpaca_device";

  function apiBase() {
    const saved = localStorage.getItem(URL_KEY);
    if (saved) return saved.replace(/\/$/, "");
    if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
      return "http://localhost:8090";
    }
    return "https://api.runnr.fyi";
  }

  function ensureApiUrl() {
    try {
      const current = localStorage.getItem(URL_KEY);
      if (!current || /railway\.app/i.test(current)) {
        localStorage.setItem(URL_KEY, "https://api.runnr.fyi");
      }
    } catch (e) {}
  }
  ensureApiUrl();

  function storageOk() {
    try {
      const k = "__runnr_storage_test__";
      localStorage.setItem(k, "1");
      localStorage.removeItem(k);
      return true;
    } catch (e) {
      return false;
    }
  }

  function isAuthError(msg) {
    return /session expired|user not found|invalid token|missing bearer/i.test(String(msg || ""));
  }

  function token() {
    return localStorage.getItem(TOKEN_KEY) || "";
  }

  const HOUSE_EMAILS = [
    "info@thinicedigital.com",
    "janis.berzins.liepins@gmail.com",
    "berzins.j@inbox.lv",
  ];

  function snapshotStateForEmail(email) {
    const e = String(email || "").trim().toLowerCase();
    if (!e) return;
    try {
      const raw = localStorage.getItem("runnr_state");
      if (raw) localStorage.setItem("runnr_state:" + e, raw);
    } catch (err) {}
  }

  function loadStateForEmail(email) {
    const e = String(email || "").trim().toLowerCase();
    try {
      const raw = e ? localStorage.getItem("runnr_state:" + e) : null;
      if (raw) localStorage.setItem("runnr_state", raw);
      else localStorage.removeItem("runnr_state");
    } catch (err) {}
  }

  function setToken(t, email) {
    try {
      if (t) {
        const prev = (localStorage.getItem(EMAIL_KEY) || "").trim().toLowerCase();
        const next = String(email || "").trim().toLowerCase();
        if (prev && next && prev !== next) snapshotStateForEmail(prev);
        else if (prev && !next) snapshotStateForEmail(prev);
        if (next) {
          loadStateForEmail(next);
          if (!prev || prev !== next) {
            localStorage.removeItem(ALPACA_LOCAL_KEY);
            try { sessionStorage.setItem("runnr_account_switched", "1"); } catch (e) {}
          }
        }
        localStorage.setItem(TOKEN_KEY, t);
        if (email) localStorage.setItem(EMAIL_KEY, email);
      } else {
        snapshotStateForEmail(localStorage.getItem(EMAIL_KEY));
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(EMAIL_KEY);
        localStorage.removeItem(ALPACA_LOCAL_KEY);
        localStorage.removeItem("runnr_state");
      }
    } catch (e) {
      throw new Error("Safari blocked saving your login — turn off Private Browsing or allow site data for runnr.fyi");
    }
  }

  function sessionEmail() {
    const saved = localStorage.getItem(EMAIL_KEY);
    if (saved) return saved;
    const t = token();
    if (!t) return "";
    try {
      const payload = JSON.parse(atob(t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      return payload.email || "";
    } catch (e) {
      return "";
    }
  }

  function isLoggedIn() {
    return !!token();
  }

  function tradeNeedsPriceFix(t) {
    if (!t || !isFillSource(t)) return false;
    if (t.source === "csv" && !t.alpacaSide) return false;
    const price = Number(t.fillPrice || t.entry || t.exit || 0);
    return !price;
  }

  async function request(path, options = {}, timeoutMs = 20000) {
    ensureApiUrl();
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    if (token()) headers.Authorization = "Bearer " + token();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res;
    try {
      res = await fetch(apiBase() + path, { ...options, headers, signal: ctrl.signal });
    } catch (e) {
      const msg = String(e.message || e);
      if (e.name === "AbortError") throw new Error("Request timed out — check your connection and try again");
      if (/failed to fetch|load failed|networkerror|network error/i.test(msg)) {
        throw new Error("Cannot reach Runnr server — check Wi‑Fi or mobile data");
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      data = null;
    }
    if (!res.ok) {
      let msg = (data && data.detail) || res.statusText || "Request failed";
      if (Array.isArray(msg)) {
        msg = msg.map((e) => e.msg || JSON.stringify(e)).join("; ");
      } else if (typeof msg !== "string") {
        msg = JSON.stringify(msg);
      }
      throw new Error(msg);
    }
    return data;
  }

  async function register(email, password) {
    const creds = normalizeAuth(email, password);
    const data = await request("/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify(creds),
    });
    setToken(data.access_token, data.email || creds.email);
    return data;
  }

  function normalizeAuth(email, password) {
    return {
      email: String(email || "").trim().toLowerCase(),
      password: String(password || "").trim(),
    };
  }

  async function login(email, password) {
    ensureApiUrl();
    if (!storageOk()) {
      throw new Error("Safari blocked saving your login — turn off Private Browsing or allow site data for runnr.fyi");
    }
    const creds = normalizeAuth(email, password);
    const data = await request("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify(creds),
    });
    setToken(data.access_token, data.email || creds.email);
    localStorage.setItem("runnr_remember_email", creds.email);
    return data;
  }

  async function forgotPassword(email) {
    ensureApiUrl();
    return request(
      "/api/v1/auth/forgot-password",
      {
        method: "POST",
        body: JSON.stringify({ email: String(email || "").trim().toLowerCase() }),
      },
      15000
    );
  }

  async function resetPassword(token, newPassword) {
    ensureApiUrl();
    if (!storageOk()) {
      throw new Error("Safari blocked saving your login — turn off Private Browsing or allow site data for runnr.fyi");
    }
    const data = await request(
      "/api/v1/auth/reset-password",
      {
        method: "POST",
        body: JSON.stringify({
          token: String(token || "").trim(),
          new_password: String(newPassword || "").trim(),
        }),
      },
      12000
    );
    setToken(data.access_token, data.email);
    if (data.email) localStorage.setItem("runnr_remember_email", data.email);
    return data;
  }

  async function verifyEmail(token) {
    return request(
      "/api/v1/auth/verify-email",
      {
        method: "POST",
        body: JSON.stringify({ token: String(token || "").trim() }),
      },
      12000
    );
  }

  async function resendVerification() {
    if (!isLoggedIn()) throw new Error("Log in first");
    return request("/api/v1/auth/resend-verification", { method: "POST", body: "{}" }, 15000);
  }

  /** Log in, or create account if this email is new (covers server DB resets). */
  async function signIn(email, password) {
    ensureApiUrl();
    if (!storageOk()) {
      throw new Error("Safari blocked saving your login — turn off Private Browsing or allow site data for runnr.fyi");
    }
    try {
      return await login(email, password);
    } catch (e) {
      const msg = String(e.message || e);
      if (/invalid email or password/i.test(msg)) {
        return await register(email, password);
      }
      throw e;
    }
  }

  function logout() {
    setToken("");
  }

  function saveAlpacaLocal(apiKey, apiSecret, paper) {
    localStorage.setItem(
      ALPACA_LOCAL_KEY,
      JSON.stringify({ key: apiKey, secret: apiSecret, paper: !!paper })
    );
  }

  function loadAlpacaLocal() {
    try {
      const raw = localStorage.getItem(ALPACA_LOCAL_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function hasLocalAlpaca() {
    const c = loadAlpacaLocal();
    return !!(c && c.key && c.secret);
  }

  function applyAlpacaBalance(equity) {
    if (equity == null || !window.S) return;
    if (window.S.balManualOverride) return;
    window.S.bal = Math.round(equity);
    window.S.sym = "$";
    window.S.balFromAlpaca = true;
    if (typeof updateHomeStats === "function") updateHomeStats();
    if (typeof persist === "function") persist();
  }

  function applyAlpacaStatus(st) {
    ensureBrokerState();
    if (!window.S || !st) return;
    window.S.brokerSync.alpaca.connected = !!st.connected;
    window.S.brokerSync.alpaca.paper = st.paper;
    window.S.brokerSync.alpaca.equity = st.equity;
    window.S.brokerSync.alpaca.positionCount = st.position_count;
    if (st.connected && st.equity != null) applyAlpacaBalance(st.equity);
    if (typeof persist === "function") persist();
  }

  async function verifySession() {
    if (!isLoggedIn()) return false;
    try {
      await request("/api/v1/auth/me");
      return true;
    } catch (e) {
      const msg = String(e.message || e);
      if (isAuthError(msg)) {
        setToken("");
        return false;
      }
      return true;
    }
  }

  async function tryAutoReconnectAlpaca() {
    if (!isLoggedIn()) return false;
    try {
      const st = await alpacaStatus();
      if (st?.connected) {
        applyAlpacaStatus(st);
        return true;
      }
    } catch (e) {
      const msg = String(e.message || e);
      if (/user not found|session expired|invalid token|missing bearer/i.test(msg)) {
        setToken("");
        return false;
      }
    }
    const creds = loadAlpacaLocal();
    if (!creds?.key || !creds?.secret) return false;
    try {
      const st = await connectAlpaca(creds.key, creds.secret, creds.paper !== false);
      applyAlpacaStatus({ ...st, connected: true });
      return true;
    } catch (e) {
      return false;
    }
  }

  async function alpacaStatus() {
    return request("/api/v1/brokers/alpaca/status");
  }

  async function connectAlpaca(apiKey, apiSecret, paper = true) {
    return request("/api/v1/brokers/alpaca/connect", {
      method: "POST",
      body: JSON.stringify({ api_key: apiKey, api_secret: apiSecret, paper }),
    });
  }

  async function syncAlpaca() {
    return request("/api/v1/brokers/alpaca/sync");
  }

  function ensureBrokerState() {
    if (!window.S) return;
    if (!window.S.brokerSync) {
      window.S.brokerSync = {
        alpaca: { connected: false, lastSync: null, imported: 0, equity: null },
        ibkr: { connected: false, lastSync: null, imported: 0 },
        importedOrderIds: [],
      };
    }
    if (!window.S.brokerSync.alpaca) {
      window.S.brokerSync.alpaca = { connected: false, lastSync: null, imported: 0, equity: null };
    }
    if (!window.S.brokerSync.ibkr) {
      window.S.brokerSync.ibkr = { connected: false, lastSync: null, imported: 0 };
    }
    if (!window.S.brokerSync.importedOrderIds) window.S.brokerSync.importedOrderIds = [];
    if (!window.S.trades) window.S.trades = [];
  }

  function applyFillToTrade(trade, fillPrice, alpacaSide) {
    trade.fillPrice = fillPrice;
    const side = alpacaSide || trade.alpacaSide || (trade.dir === "short" ? "sell" : "buy");
    trade.alpacaSide = side;
    if (side === "buy") {
      trade.entry = fillPrice;
      if (!trade.exit) trade.dir = "long";
    } else {
      // Sell fill alone is stored as exit until paired into a round-trip
      if (!trade.entry) {
        trade.exit = fillPrice;
        trade.dir = "long"; // assumed long close until short-open pairing says otherwise
      } else {
        trade.exit = fillPrice;
      }
    }
  }

  function formatAgo(iso) {
    if (!iso) return "never";
    const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return mins + "m ago";
    const hrs = Math.round(mins / 60);
    if (hrs < 48) return hrs + "h ago";
    return new Date(iso).toLocaleDateString("en-GB", { month: "short", day: "numeric" });
  }

  function isOptionSymbol(sym) {
    const s = String(sym || "").toUpperCase();
    if (s.length < 10) return false;
    return /[CP]\d{6,}/.test(s);
  }

  function orderAlpacaSide(o) {
    return String(o.side || "").toLowerCase().includes("sell") ? "sell" : "buy";
  }

  function fillTimeMs(t) {
    if (t.filledAt) {
      const ms = Date.parse(t.filledAt);
      if (!Number.isNaN(ms)) return ms;
    }
    return t.id || 0;
  }

  function inferAlpacaSide(t) {
    if (t.alpacaSide === "buy" || t.alpacaSide === "sell") return t.alpacaSide;
    const hasEntry = Number(t.entry) > 0;
    const hasExit = Number(t.exit) > 0;
    if (hasEntry && !hasExit) return "buy";
    if (hasExit && !hasEntry) return "sell";
    if (t.dir === "short") return "sell";
    return "buy";
  }

  function computeRoundTripPnl(entry, exit, size, dir) {
    const e = Number(entry);
    const x = Number(exit);
    const q = Number(size) || 1;
    if (!(e > 0 && x > 0)) return 0;
    if (window.Baron?.tradePnl) {
      return Math.round(window.Baron.tradePnl(null, e, x, q, dir || "long"));
    }
    const raw = dir === "short" ? (e - x) * q : (x - e) * q;
    return Math.round(raw);
  }

  function isFillSource(t) {
    return t && (t.source === "alpaca" || t.source === "csv" || t.source === "ibkr");
  }

  /**
   * FIFO-pair buy/sell fill legs into round-trips so journal closes
   * when the position is closed. Removes orphan sell legs after merge.
   */
  function pairAlpacaRoundTrips(positions) {
    ensureBrokerState();
    let paired = 0;
    const openQty = {};
    (positions || []).forEach((p) => {
      const sym = String(p.symbol || "").toUpperCase();
      if (!sym) return;
      openQty[sym] = Number(p.qty) || 0;
    });

    const legs = (window.S.trades || []).filter(
      (t) => isFillSource(t) && !t.mergedAway && !t.alpacaPaired
    );
    legs.forEach((t) => {
      if (!t.alpacaSide) t.alpacaSide = inferAlpacaSide(t);
    });

    // Already have both prices from a prior partial edit — mark paired
    legs.forEach((t) => {
      const e = Number(t.entry);
      const x = Number(t.exit);
      if (e > 0 && x > 0 && Math.abs(e - x) > 1e-9) {
        t.alpacaPaired = true;
        t.dir = t.dir === "short" ? "short" : "long";
        t.pnl = computeRoundTripPnl(e, x, t.size, t.dir);
        paired++;
      }
    });

    const buys = (window.S.trades || [])
      .filter(
        (t) =>
          isFillSource(t) &&
          !t.mergedAway &&
          !t.alpacaPaired &&
          inferAlpacaSide(t) === "buy" &&
          Number(t.entry) > 0 &&
          !(Number(t.exit) > 0)
      )
      .sort((a, b) => fillTimeMs(a) - fillTimeMs(b));

    const sells = (window.S.trades || [])
      .filter(
        (t) =>
          isFillSource(t) &&
          !t.mergedAway &&
          !t.alpacaPaired &&
          inferAlpacaSide(t) === "sell" &&
          Number(t.exit || t.fillPrice) > 0 &&
          !(Number(t.entry) > 0) // pure sell/close legs (not yet open-short converted)
      )
      .sort((a, b) => fillTimeMs(a) - fillTimeMs(b));

    // Short opens: sell with only exit and still open on broker → keep as open short
    const stillOpenShort = new Set(
      Object.keys(openQty).filter((sym) => openQty[sym] < 0)
    );

    for (const sell of sells) {
      const sym = String(sell.instr || "").toUpperCase();
      const sellPx = Number(sell.exit || sell.fillPrice) || 0;
      let sellQty = Number(sell.size) || 0;
      if (!sym || !(sellPx > 0) || !(sellQty > 0)) continue;

      // If this symbol is net short on Alpaca and no matching buy yet, leave as open short
      const matchingBuys = buys.filter((b) => {
        if (String(b.instr || "").toUpperCase() !== sym) return false;
        if (b.alpacaPaired || b.mergedAway) return false;
        if (!(Number(b.remainingQty != null ? b.remainingQty : b.size) > 0)) return false;
        // Only enforce chronology when both legs have real fill timestamps
        if (b.filledAt && sell.filledAt && fillTimeMs(b) > fillTimeMs(sell) + 1000) return false;
        return true;
      });

      if (!matchingBuys.length) {
        if (stillOpenShort.has(sym) || (openQty[sym] || 0) < 0) {
          sell.dir = "short";
          sell.entry = sellPx;
          sell.exit = null;
          sell.alpacaSide = "sell";
          continue;
        }
        // Orphan sell with no open short — nothing to pair this sync
        continue;
      }

      for (const buy of matchingBuys) {
        if (sellQty <= 0) break;
        const buyLeft = Number(buy.remainingQty != null ? buy.remainingQty : buy.size) || 0;
        if (buyLeft <= 0) continue;
        const matchQty = Math.min(buyLeft, sellQty);
        if (matchQty <= 0) continue;

        if (matchQty >= buyLeft - 1e-8) {
          // Full close of this buy leg
          buy.exit = sellPx;
          buy.dir = "long";
          buy.size = buyLeft;
          buy.pnl = computeRoundTripPnl(buy.entry, sellPx, buyLeft, "long");
          buy.alpacaPaired = true;
          buy.exitExternalId = sell.externalId;
          buy.remainingQty = 0;
          paired++;
        } else {
          // Partial: split remaining open qty onto a new open leg
          buy.exit = sellPx;
          buy.dir = "long";
          buy.size = matchQty;
          buy.pnl = computeRoundTripPnl(buy.entry, sellPx, matchQty, "long");
          buy.alpacaPaired = true;
          buy.exitExternalId = sell.externalId;
          buy.remainingQty = 0;
          paired++;
          const remainder = buyLeft - matchQty;
          window.S.trades.unshift({
            id: Date.now() + Math.floor(Math.random() * 1000),
            instr: buy.instr,
            dir: "long",
            entry: buy.entry,
            exit: null,
            size: remainder,
            remainingQty: remainder,
            pnl: 0,
            stopOk: null,
            sizeOk: null,
            type: buy.type || "shares",
            date: buy.date,
            incomplete: true,
            source: "alpaca",
            externalId: buy.externalId + ":rem:" + remainder,
            fillPrice: buy.entry,
            alpacaSide: "buy",
            filledAt: buy.filledAt,
            parentExternalId: buy.externalId,
          });
          buys.push(window.S.trades[0]);
          buys.sort((a, b) => fillTimeMs(a) - fillTimeMs(b));
        }
        sellQty -= matchQty;
      }

      if (sellQty <= 1e-8) {
        sell.mergedAway = true;
      } else {
        sell.size = sellQty;
        sell.remainingQty = sellQty;
      }
    }

    // Cover shorts: buy legs that close open shorts (sell-first)
    const openShorts = (window.S.trades || [])
      .filter(
        (t) =>
          isFillSource(t) &&
          !t.mergedAway &&
          !t.alpacaPaired &&
          t.dir === "short" &&
          Number(t.entry) > 0 &&
          !(Number(t.exit) > 0)
      )
      .sort((a, b) => fillTimeMs(a) - fillTimeMs(b));

    const coverBuys = (window.S.trades || [])
      .filter(
        (t) =>
          isFillSource(t) &&
          !t.mergedAway &&
          !t.alpacaPaired &&
          inferAlpacaSide(t) === "buy" &&
          Number(t.entry || t.fillPrice) > 0 &&
          !(Number(t.exit) > 0)
      )
      .sort((a, b) => fillTimeMs(a) - fillTimeMs(b));

    for (const shortT of openShorts) {
      const sym = String(shortT.instr || "").toUpperCase();
      let shortLeft = Number(shortT.remainingQty != null ? shortT.remainingQty : shortT.size) || 0;
      if (!(shortLeft > 0)) continue;
      // Only auto-close short if Alpaca no longer shows short exposure
      const brokerQty = openQty[sym];
      if (brokerQty != null && brokerQty < 0) continue;

      for (const buy of coverBuys) {
        if (shortLeft <= 0) break;
        if (String(buy.instr || "").toUpperCase() !== sym) continue;
        if (buy.alpacaPaired || buy.mergedAway) continue;
        const buyLeft = Number(buy.remainingQty != null ? buy.remainingQty : buy.size) || 0;
        if (buyLeft <= 0) continue;
        // Cover buy must be after short open
        if (fillTimeMs(buy) < fillTimeMs(shortT)) continue;
        const matchQty = Math.min(shortLeft, buyLeft);
        const coverPx = Number(buy.entry || buy.fillPrice);
        shortT.exit = coverPx;
        shortT.dir = "short";
        shortT.size = matchQty;
        shortT.pnl = computeRoundTripPnl(shortT.entry, coverPx, matchQty, "short");
        shortT.alpacaPaired = true;
        shortT.exitExternalId = buy.externalId;
        paired++;
        buy.mergedAway = true;
        shortLeft -= matchQty;
      }
    }

    // Drop merged orphan legs from journal
    window.S.trades = (window.S.trades || []).filter((t) => !t.mergedAway);
    return paired;
  }

  function importOrders(orders, positions, opts = {}) {
    ensureBrokerState();
    const source = opts.source || "alpaca";
    const seen = new Set(window.S.brokerSync.importedOrderIds || []);
    let added = 0;
    let repaired = 0;
    const maxId = window.S.trades.reduce((m, t) => Math.max(m, t.id || 0), 0);
    const demoIds = new Set([1, 2, 3, 4]);

    // Process oldest first so FIFO pairing sees chronology
    const sorted = [...(orders || [])].sort((a, b) => {
      const ta = Date.parse(a.filled_at || a.submitted_at || 0) || 0;
      const tb = Date.parse(b.filled_at || b.submitted_at || 0) || 0;
      return ta - tb;
    });

    sorted.forEach((o, i) => {
      if (!o.id) return;
      const alpacaSide = orderAlpacaSide(o);
      const fillPrice = Number(o.filled_avg_price) || 0;

      if (seen.has(o.id)) {
        const existing = window.S.trades.find(
          (t) => t.externalId === o.id || t.exitExternalId === o.id
        );
        if (existing && fillPrice && tradeNeedsPriceFix(existing)) {
          applyFillToTrade(existing, fillPrice, alpacaSide);
          repaired++;
        }
        return;
      }
      if (o.status && !String(o.status).toLowerCase().includes("fill")) return;
      const qty = o.filled_qty || o.qty || 1;
      const sym = o.symbol || "?";
      if (isOptionSymbol(sym)) return;
      const filledAt = o.filled_at || o.submitted_at;
      const date = filledAt
        ? new Date(filledAt).toLocaleDateString("en-GB", { month: "short", day: "numeric" })
        : new Date().toLocaleDateString("en-GB", { month: "short", day: "numeric" });

      const isBuy = alpacaSide === "buy";
      window.S.trades.unshift({
        id: maxId + i + 1 + Date.now(),
        instr: sym,
        dir: isBuy ? "long" : "long", // sell legs pair into long closes; short opens adjusted in pair step
        entry: isBuy ? fillPrice : null,
        exit: isBuy ? null : fillPrice,
        size: qty,
        remainingQty: qty,
        pnl: 0,
        stopOk: null,
        sizeOk: null,
        type: "shares",
        date,
        incomplete: true,
        source,
        externalId: o.id,
        fillPrice,
        alpacaSide,
        filledAt: filledAt || null,
      });
      seen.add(o.id);
      added++;
    });

    if (added > 0) {
      window.S.trades = window.S.trades.filter(
        (t) => isFillSource(t) || t.source === "csv" || !demoIds.has(t.id)
      );
    }

    const paired = pairAlpacaRoundTrips(positions || []);

    window.S.brokerSync.importedOrderIds = [...seen];
    if (window.S.brokerSync[source]) {
      window.S.brokerSync[source].imported = window.S.trades.filter(
        (t) => t.source === source && !t.mergedAway
      ).length;
    } else if (window.S.brokerSync.alpaca) {
      window.S.brokerSync.alpaca.imported = window.S.trades.filter(
        (t) => t.source === "alpaca" && !t.mergedAway
      ).length;
    }
    if (typeof persist === "function") persist();
    return { added, repaired, paired };
  }

  async function refreshStatus() {
    ensureBrokerState();
    if (!window.S) return null;
    if (!isLoggedIn()) {
      window.S.brokerSync.alpaca.connected = false;
      window.S.brokerSync.ibkr.connected = false;
      return null;
    }
    try {
      const st = await alpacaStatus();
      applyAlpacaStatus(st);
    } catch (e) {}
    try {
      const st = await ibkrStatus();
      applyIbkrStatus(st);
    } catch (e) {}
    return window.S.brokerSync.alpaca;
  }

  async function ensureAlpacaConnected() {
    if (!isLoggedIn()) return false;
    ensureBrokerState();
    try {
      const st = await alpacaStatus();
      if (st?.connected) {
        applyAlpacaStatus(st);
        return true;
      }
    } catch (e) {
      const msg = String(e.message || e);
      if (/user not found|session expired|invalid token|missing bearer/i.test(msg)) {
        setToken("");
        return false;
      }
    }
    return tryAutoReconnectAlpaca();
  }

  /** After sign-in or profile pull — server keys first, optional trade sync. */
  async function restoreAccountAlpaca(options = {}) {
    if (!isLoggedIn()) return { connected: false };
    const connected = await ensureAlpacaConnected();
    if (!connected) return { connected: false };
    if (!options.autoSync) return { connected: true };
    try {
      const sync = await runSync();
      return { connected: true, sync };
    } catch (e) {
      return { connected: true, syncError: String(e.message || e) };
    }
  }

  /** If this device still has Alpaca keys locally, upload them to the server account. */
  async function pushLocalAlpacaToAccount() {
    if (!isLoggedIn()) return false;
    const creds = loadAlpacaLocal();
    if (!creds?.key || !creds?.secret) return false;
    try {
      const st = await connectAlpaca(creds.key, creds.secret, creds.paper !== false);
      applyAlpacaStatus({ ...st, connected: true });
      return true;
    } catch (e) {
      return false;
    }
  }

  async function runSync() {
    ensureBrokerState();
    if (!isLoggedIn()) throw new Error("Log in to Runnr first");

    let added = 0;
    let repaired = 0;
    let paired = 0;
    let any = false;
    let lastData = null;

    const alpacaOk = await ensureAlpacaConnected();
    if (alpacaOk) {
      any = true;
      const data = await syncAlpaca();
      lastData = data;
      if (data.equity != null) applyAlpacaBalance(data.equity);
      if (data.equity != null) {
        window.S.brokerSync.alpaca.equity = data.equity;
        window.S.brokerSync.alpaca.positionCount = (data.positions || []).length;
      }
      const r = importOrders(data.recent_orders || [], data.positions || [], { source: "alpaca" });
      added += r.added;
      repaired += r.repaired;
      paired += r.paired;
      window.S.brokerSync.alpaca.lastSync = data.as_of || new Date().toISOString();
      window.S.brokerSync.alpaca.connected = true;
    }

    const ibkrOk = await ensureIbkrConnected();
    if (ibkrOk) {
      any = true;
      const data = await syncIbkr();
      lastData = data || lastData;
      const r = importOrders(data.recent_orders || [], data.positions || [], { source: "ibkr" });
      added += r.added;
      repaired += r.repaired;
      paired += r.paired;
      window.S.brokerSync.ibkr.lastSync = data.as_of || new Date().toISOString();
      window.S.brokerSync.ibkr.connected = true;
      window.S.brokerSync.ibkr.imported = window.S.trades.filter(
        (t) => t.source === "ibkr" && !t.mergedAway
      ).length;
    }

    if (!any) {
      throw new Error("No broker connected — tap Connect Alpaca or IBKR Flex on the Sync page");
    }

    if (typeof persist === "function") persist();
    if (typeof renderJournal === "function") renderJournal();
    if (typeof updateHomeStats === "function") updateHomeStats();
    if (typeof renderCoachPage === "function") renderCoachPage();
    if (typeof refreshPortfolioIfVisible === "function") refreshPortfolioIfVisible();
    else if (typeof loadPortfolio === "function" && document.getElementById("page-portfolio")?.classList.contains("active")) {
      loadPortfolio(typeof portPeriod !== "undefined" ? portPeriod : "all", document.querySelector(".period-tab.active"));
    }
    return { added, repaired, paired, data: lastData };
  }

  async function connectIbkr(token, queryId) {
    return request("/api/v1/brokers/ibkr/connect", {
      method: "POST",
      body: JSON.stringify({ token, query_id: queryId }),
    });
  }

  async function ibkrStatus() {
    return request("/api/v1/brokers/ibkr/status");
  }

  async function syncIbkr() {
    return request("/api/v1/brokers/ibkr/sync", {}, 90000);
  }

  function applyIbkrStatus(st) {
    ensureBrokerState();
    if (!window.S || !st) return;
    window.S.brokerSync.ibkr.connected = !!st.connected;
    if (st.error) window.S.brokerSync.ibkr.error = st.error;
    if (typeof persist === "function") persist();
  }

  async function ensureIbkrConnected() {
    if (!isLoggedIn()) return false;
    ensureBrokerState();
    try {
      const st = await ibkrStatus();
      if (st?.connected) {
        applyIbkrStatus(st);
        return true;
      }
    } catch (e) {
      const msg = String(e.message || e);
      if (/user not found|session expired|invalid token|missing bearer/i.test(msg)) {
        setToken("");
        return false;
      }
    }
    return false;
  }

  async function repairJournalIfNeeded() {
    if (!isLoggedIn() || !window.S) return false;
    if (!window.S.brokerSync?.alpaca?.connected) {
      await tryAutoReconnectAlpaca();
    }
    const needsFix = (window.S.trades || []).some(tradeNeedsPriceFix);
    if (!needsFix) return false;
    if (!window.S.brokerSync?.alpaca?.connected) return false;
    try {
      const { repaired } = await runSync();
      return repaired > 0;
    } catch (e) {
      return false;
    }
  }

  const DEMO_TRADE_IDS = new Set([1, 2, 3, 4]);
  const DEMO_WATCH_SYMS = new Set(["RACE", "ASTS", "EURUSD"]);
  let pushTimer = null;
  let _cloudPushPaused = false;

  function isDemoState(s) {
    s = s || window.S;
    if (!s) return true;
    if (s.balFromAlpaca || s.brokerSync?.alpaca?.connected) return false;
    const trades = s.trades || [];
    if (trades.some((t) => t.source === "alpaca" || !DEMO_TRADE_IDS.has(t.id))) return false;
    return true;
  }

  function hasMeaningfulState(s) {
    if (!s) return false;
    const trades = s.trades || [];
    if (trades.some((t) => t.source === "alpaca" || !DEMO_TRADE_IDS.has(t.id))) return true;
    const wl = s.watchlist || [];
    if (wl.some((w) => !DEMO_WATCH_SYMS.has(String(w.sym || "").toUpperCase()))) return true;
    if (wl.length !== 3) return true;
    if (Number(s.journalBaseBal) > 0) return true;
    if (s.balFromAlpaca || s.balManualOverride) return true;
    if (s.bal !== 10000 || (s.sym && s.sym !== "€")) return true;
    if (s.onboardingComplete) return true;
    if (s.profileHandle) return true;
    return false;
  }

  function applyRemoteState(remote) {
    if (!window.S || !remote) return false;
    _cloudPushPaused = true;
    try {
      Object.keys(window.S).forEach((k) => delete window.S[k]);
      Object.assign(window.S, remote);
      ensureBrokerState();
      // Broker link lives on the server (encrypted keys), not in cloud profile JSON.
      if (window.S.brokerSync?.alpaca) window.S.brokerSync.alpaca.connected = false;
      try {
        localStorage.setItem("runnr_state", JSON.stringify(window.S));
      } catch (e) {}
      return true;
    } finally {
      _cloudPushPaused = false;
    }
  }

  async function pullProfileState() {
    if (!isLoggedIn() || !window.S) return false;
    const data = await request("/api/v1/profile/state");
    if (!data?.state || !hasMeaningfulState(data.state)) return false;
    return applyRemoteState(data.state);
  }

  async function pushProfileState() {
    if (!isLoggedIn() || !window.S || _cloudPushPaused) return false;
    await request("/api/v1/profile/state", {
      method: "PUT",
      body: JSON.stringify({ state: window.S }),
    });
    return true;
  }

  function pushProfileStateDebounced() {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      pushProfileState().catch(() => {});
    }, 1500);
  }

  function tradeKey(t) {
    if (t.externalId) return "ext:" + t.externalId;
    return "id:" + t.id;
  }

  function tradeRichness(t) {
    let score = 0;
    if (Number(t.fillPrice || t.entry || t.exit)) score += 2;
    if (!t.incomplete) score += 2;
    if (t.stopOk != null || t.sizeOk != null) score += 1;
    if (t.pnl) score += 1;
    return score;
  }

  /** Union trades from both devices; dedupe by external/id, keep the richer copy. */
  function mergeTrades(localTrades, remoteTrades) {
    const byKey = new Map();
    const add = (t) => {
      if (!t) return;
      const key = tradeKey(t);
      const prev = byKey.get(key);
      if (!prev || tradeRichness(t) > tradeRichness(prev)) byKey.set(key, t);
    };
    (remoteTrades || []).forEach(add);
    (localTrades || []).forEach(add);
    let merged = [...byKey.values()];
    const hasReal = merged.some((t) => t.source === "alpaca" || !DEMO_TRADE_IDS.has(t.id));
    if (hasReal) merged = merged.filter((t) => t.source === "alpaca" || !DEMO_TRADE_IDS.has(t.id));
    return merged;
  }

  function watchRichness(w) {
    let score = 0;
    ["entry", "stop", "target"].forEach((k) => { if (Number(w[k])) score += 1; });
    if (w.thesis) score += 1;
    if (w.dir) score += 1;
    return score;
  }

  /** Union watchlist by symbol; keep the more detailed setup. */
  function mergeWatchlist(localWl, remoteWl) {
    const bySym = new Map();
    const add = (w) => {
      if (!w || !w.sym) return;
      const key = String(w.sym).toUpperCase();
      const prev = bySym.get(key);
      if (!prev || watchRichness(w) > watchRichness(prev)) bySym.set(key, w);
    };
    (remoteWl || []).forEach(add);
    (localWl || []).forEach(add);
    let merged = [...bySym.values()];
    const hasReal = merged.some((w) => !DEMO_WATCH_SYMS.has(String(w.sym || "").toUpperCase()));
    if (hasReal) merged = merged.filter((w) => !DEMO_WATCH_SYMS.has(String(w.sym || "").toUpperCase()));
    return merged;
  }

  /** Combine two full states without losing journal or watchlist from either side. */
  function mergeProfiles(local, remote) {
    const merged = {};
    Object.assign(merged, remote || {});
    Object.keys(local || {}).forEach((k) => {
      if (merged[k] === undefined) merged[k] = local[k];
    });
    // Prefer configured scalar settings from whichever side has them.
    if (local?.onboardingComplete) merged.onboardingComplete = true;
    if (local?.profileHandle) merged.profileHandle = local.profileHandle;
    if (Number(local?.journalBaseBal) > 0 && !(Number(remote?.journalBaseBal) > 0)) {
      merged.journalBaseBal = local.journalBaseBal;
    }
    merged.trades = mergeTrades(local?.trades, remote?.trades);
    merged.watchlist = mergeWatchlist(local?.watchlist, remote?.watchlist);
    return merged;
  }

  /** Diagnostic: who am I + what's local vs on the server. */
  async function diagnose() {
    const out = {
      loggedIn: isLoggedIn(),
      email: sessionEmail(),
      tokenTail: (token() || "").slice(-6),
      localWatchlist: (window.S?.watchlist || []).length,
      localTrades: (window.S?.trades || []).length,
      me: null,
      serverWatchlist: null,
      serverTrades: null,
      error: null,
    };
    try {
      const me = await request("/api/v1/auth/me");
      out.me = { id: me?.id, email: me?.email };
    } catch (e) { out.error = "me: " + String(e.message || e); }
    try {
      const data = await request("/api/v1/profile/state");
      out.serverWatchlist = (data?.state?.watchlist || []).length;
      out.serverTrades = (data?.state?.trades || []).length;
      out.serverUpdated = data?.updated_at || null;
    } catch (e) { out.error = (out.error ? out.error + " | " : "") + "state: " + String(e.message || e); }
    return out;
  }

  /** Force-push current local state to the server (deterministic upload). */
  async function forcePush() {
    if (!isLoggedIn() || !window.S) return { ok: false };
    await pushProfileState();
    return { ok: true, watchlist: (window.S.watchlist || []).length };
  }

  /** Pull watchlist from cloud and merge — for devices with corrupt/empty local list. */
  async function syncWatchlistFromCloud() {
    if (!isLoggedIn() || !window.S) return { ok: false };
    const data = await request("/api/v1/profile/state");
    const remote = data?.state;
    if (!remote?.watchlist?.length) return { ok: false };
    ensureBrokerState();
    window.S.watchlist = mergeWatchlist(window.S.watchlist, remote.watchlist);
    if (!window.S.watchlist.length) return { ok: false };
    try {
      localStorage.setItem("runnr_state", JSON.stringify(window.S));
    } catch (e) {}
    await pushProfileState();
    return { ok: true, count: window.S.watchlist.length };
  }

  function hasAlpacaFills(s) {
    return (s?.trades || []).some((t) => t && String(t.source || "").toLowerCase() === "alpaca");
  }

  async function shouldIgnoreRemote(remote) {
    if (!remote || !hasMeaningfulState(remote)) return false;
    const me = (sessionEmail() || "").trim().toLowerCase();
    if (!me || isHouseEmail(me)) return false;
    const own = String(remote.ownerEmail || "").trim().toLowerCase();
    if (own && own !== me) return true;
    if (own && own === me) return false;
    if (!hasAlpacaFills(remote)) return false;
    try {
      const st = await alpacaStatus();
      return !st?.connected;
    } catch (e) {
      return true;
    }
  }

  async function pushOwnedStub() {
    const me = (sessionEmail() || "").trim().toLowerCase();
    const stub = {
      ownerEmail: me,
      trades: [],
      watchlist: [],
      bal: 10000,
      risk: 1,
      sym: "€",
      brokerSync: {
        alpaca: { connected: false, lastSync: null, imported: 0 },
        importedOrderIds: [],
      },
    };
    await request("/api/v1/profile/state", {
      method: "PUT",
      body: JSON.stringify({ state: stub }),
    });
  }

  /** Pull cloud profile on login, or push local data if cloud is empty. */
  async function syncProfileState() {
    if (!isLoggedIn()) return { action: "none" };
    const data = await request("/api/v1/profile/state");
    let remote = data?.state;
    if (await shouldIgnoreRemote(remote)) {
      try { await pushOwnedStub(); } catch (e) {}
      return { action: "cleared-foreign" };
    }
    const serverHas = !!(remote && hasMeaningfulState(remote));
    const localHas = hasMeaningfulState(window.S);
    const localOwner = String(window.S?.ownerEmail || "").trim().toLowerCase();
    const me = (sessionEmail() || "").trim().toLowerCase();
    const localMine = !localOwner || localOwner === me;

    if (serverHas && !localHas) {
      applyRemoteState(remote);
      return { action: "pulled", updated_at: data.updated_at };
    }
    if (!serverHas && localHas && localMine) {
      await pushProfileState();
      return { action: "pushed" };
    }
    if (serverHas && localHas && localMine) {
      const merged = mergeProfiles(window.S, remote);
      merged.ownerEmail = me;
      applyRemoteState(merged);
      await pushProfileState();
      return { action: "merged", updated_at: data.updated_at };
    }
    return { action: "empty" };
  }

  let billingCache = {
    pro: true,
    plan: "free",
    status: "free",
    enabled: false,
    emailVerified: true,
    emailConfigured: false,
  };

  function billing() {
    return billingCache;
  }

  function isHouseEmail(email) {
    const e = String(email || "").trim().toLowerCase();
    if (!e) return false;
    if (HOUSE_EMAILS.indexOf(e) !== -1) return true;
    return e.endsWith("@thinicedigital.com");
  }

  function isPro() {
    if (isLoggedIn() && isHouseEmail(sessionEmail())) return true;
    if (!billingCache.enabled) return true;
    return !!billingCache.pro;
  }

  function isEmailVerified() {
    if (!isLoggedIn()) return false;
    if (!billingCache.emailConfigured) return true;
    return !!billingCache.emailVerified;
  }

  async function refreshBilling() {
    if (!isLoggedIn()) {
      billingCache = {
        pro: false,
        plan: "free",
        status: "free",
        enabled: true,
        emailVerified: false,
        emailConfigured: false,
      };
      try {
        const health = await fetch(apiBase() + "/health").then((r) => r.json()).catch(() => null);
        if (health && health.stripe_configured === false) {
          billingCache = {
            pro: true,
            plan: "free",
            status: "free",
            enabled: false,
            emailVerified: true,
            emailConfigured: false,
          };
        }
      } catch (e) {}
      return billingCache;
    }
    try {
      const me = await request("/api/v1/auth/me");
      billingCache = {
        pro: !!me.pro,
        plan: me.plan || "free",
        status: me.subscription_status || "free",
        enabled: !!me.billing_enabled,
        emailVerified: !!me.email_configured ? me.email_verified !== false : true,
        emailConfigured: !!me.email_configured,
      };
    } catch (e) {
      /* keep cache */
    }
    return billingCache;
  }

  async function createCheckout(interval) {
    if (!isLoggedIn()) throw new Error("Log in to Runnr first");
    // Fast ticket mint (no Stripe call) → browser navigates to /billing/go/… → Stripe
    const data = await request(
      "/api/v1/billing/checkout",
      {
        method: "POST",
        body: JSON.stringify({ interval: interval === "year" ? "year" : "month" }),
      },
      20000
    );
    if (!data?.url) throw new Error("No checkout URL");
    return data.url;
  }

  async function createPortal() {
    if (!isLoggedIn()) throw new Error("Log in to Runnr first");
    const data = await request("/api/v1/billing/portal", { method: "POST", body: "{}" }, 45000);
    if (!data?.url) throw new Error("No portal URL");
    return data.url;
  }

  return {
    apiBase,
    token,
    setToken,
    sessionEmail,
    isLoggedIn,
    register,
    login,
    signIn,
    resetPassword,
    forgotPassword,
    verifyEmail,
    resendVerification,
    logout,
    alpacaStatus,
    connectAlpaca,
    syncAlpaca,
    connectIbkr,
    ibkrStatus,
    syncIbkr,
    ensureIbkrConnected,
    applyIbkrStatus,
    refreshStatus,
    runSync,
    repairJournalIfNeeded,
    verifySession,
    tryAutoReconnectAlpaca,
    ensureAlpacaConnected,
    restoreAccountAlpaca,
    pushLocalAlpacaToAccount,
    saveAlpacaLocal,
    loadAlpacaLocal,
    hasLocalAlpaca,
    ensureBrokerState,
    applyAlpacaBalance,
    formatAgo,
    tradeNeedsPriceFix,
    isAuthError,
    ensureApiUrl,
    storageOk,
    syncProfileState,
    syncWatchlistFromCloud,
    diagnose,
    forcePush,
    importOrders,
    pairAlpacaRoundTrips,
    pullProfileState,
    pushProfileState,
    pushProfileStateDebounced,
    hasMeaningfulState,
    isDemoState,
    applyRemoteState,
    billing,
    isPro,
    isEmailVerified,
    refreshBilling,
    createCheckout,
    createPortal,
  };
})();
