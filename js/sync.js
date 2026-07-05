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

  function setToken(t, email) {
    try {
      if (t) {
        localStorage.setItem(TOKEN_KEY, t);
        if (email) localStorage.setItem(EMAIL_KEY, email);
      } else {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(EMAIL_KEY);
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
    if (!t || t.source !== "alpaca") return false;
    const price = Number(t.fillPrice || t.entry || t.exit || 0);
    return !price;
  }

  async function request(path, options = {}) {
    ensureApiUrl();
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    if (token()) headers.Authorization = "Bearer " + token();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
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
    const data = await request("/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setToken(data.access_token, data.email || email);
    return data;
  }

  async function login(email, password) {
    const data = await request("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setToken(data.access_token, data.email || email);
    localStorage.setItem("runnr_remember_email", email);
    return data;
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
    localStorage.removeItem(ALPACA_LOCAL_KEY);
    if (window.S && window.S.brokerSync) {
      window.S.brokerSync.alpaca = { connected: false, lastSync: null, imported: 0 };
      if (typeof persist === "function") persist();
    }
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
        importedOrderIds: [],
      };
    }
    if (!window.S.brokerSync.importedOrderIds) window.S.brokerSync.importedOrderIds = [];
    if (!window.S.trades) window.S.trades = [];
  }

  function applyFillToTrade(trade, fillPrice, dir) {
    trade.fillPrice = fillPrice;
    if (dir === "long" || trade.dir === "long") {
      trade.entry = fillPrice;
    } else {
      trade.exit = fillPrice;
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

  function importOrders(orders) {
    ensureBrokerState();
    const seen = new Set(window.S.brokerSync.importedOrderIds || []);
    let added = 0;
    let repaired = 0;
    const maxId = window.S.trades.reduce((m, t) => Math.max(m, t.id || 0), 0);
    const demoIds = new Set([1, 2, 3, 4]);

    orders.forEach((o, i) => {
      if (!o.id) return;
      const side = String(o.side || "").toLowerCase();
      const dir = side.includes("sell") ? "short" : "long";
      const fillPrice = Number(o.filled_avg_price) || 0;

      if (seen.has(o.id)) {
        const existing = window.S.trades.find((t) => t.externalId === o.id);
        if (existing && fillPrice && tradeNeedsPriceFix(existing)) {
          applyFillToTrade(existing, fillPrice, dir);
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

      window.S.trades.unshift({
        id: maxId + i + 1 + Date.now(),
        instr: sym,
        dir,
        entry: dir === "long" ? fillPrice : null,
        exit: dir === "short" ? fillPrice : null,
        size: qty,
        pnl: 0,
        stopOk: null,
        sizeOk: null,
        type: "shares",
        date,
        incomplete: true,
        source: "alpaca",
        externalId: o.id,
        fillPrice,
      });
      seen.add(o.id);
      added++;
    });

    if (added > 0) {
      window.S.trades = window.S.trades.filter((t) => t.source === "alpaca" || !demoIds.has(t.id));
    }

    window.S.brokerSync.importedOrderIds = [...seen];
    window.S.brokerSync.alpaca.imported = window.S.trades.filter((t) => t.source === "alpaca").length;
    if (typeof persist === "function") persist();
    return { added, repaired };
  }

  async function refreshStatus() {
    ensureBrokerState();
    if (!window.S) return null;
    if (!isLoggedIn()) {
      window.S.brokerSync.alpaca.connected = false;
      return null;
    }
    try {
      const st = await alpacaStatus();
      applyAlpacaStatus(st);
      return st;
    } catch (e) {
      return null;
    }
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

  async function runSync() {
    ensureBrokerState();
    if (!isLoggedIn()) throw new Error("Log in to Runnr first");
    const connected = await ensureAlpacaConnected();
    if (!connected) {
      throw new Error("Alpaca not connected — tap Connect Alpaca on the Sync page");
    }
    const data = await syncAlpaca();
    const { added, repaired } = importOrders(data.recent_orders || []);
    window.S.brokerSync.alpaca.lastSync = data.as_of || new Date().toISOString();
    window.S.brokerSync.alpaca.connected = true;
    if (typeof persist === "function") persist();
    if (typeof renderJournal === "function") renderJournal();
    if (typeof updateHomeStats === "function") updateHomeStats();
    if (typeof renderCoachPage === "function") renderCoachPage();
    return { added, repaired, data };
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

  return {
    apiBase,
    token,
    setToken,
    sessionEmail,
    isLoggedIn,
    register,
    login,
    signIn,
    logout,
    alpacaStatus,
    connectAlpaca,
    syncAlpaca,
    refreshStatus,
    runSync,
    repairJournalIfNeeded,
    verifySession,
    tryAutoReconnectAlpaca,
    ensureAlpacaConnected,
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
  };
})();
