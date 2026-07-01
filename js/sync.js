/**
 * Runnr API client — login, Alpaca connect, read-only sync.
 */
const RunnrSync = (() => {
  const TOKEN_KEY = "runnr_api_token";
  const URL_KEY = "runnr_api_url";

  function apiBase() {
    const saved = localStorage.getItem(URL_KEY);
    if (saved) return saved.replace(/\/$/, "");
    if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
      return "http://localhost:8090";
    }
    return "https://api.runnr.fyi";
  }

  function token() {
    return localStorage.getItem(TOKEN_KEY) || "";
  }

  function setToken(t) {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  }

  function isLoggedIn() {
    return !!token();
  }

  async function request(path, options = {}) {
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    if (token()) headers.Authorization = "Bearer " + token();
    const res = await fetch(apiBase() + path, { ...options, headers });
    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      data = null;
    }
    if (!res.ok) {
      const msg = (data && data.detail) || res.statusText || "Request failed";
      throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
    }
    return data;
  }

  async function register(email, password) {
    const data = await request("/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setToken(data.access_token);
    return data;
  }

  async function login(email, password) {
    const data = await request("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setToken(data.access_token);
    return data;
  }

  function logout() {
    setToken("");
    if (window.S && window.S.brokerSync) {
      window.S.brokerSync.alpaca = { connected: false, lastSync: null, imported: 0 };
      if (typeof persist === "function") persist();
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
    if (!window.S.brokerSync) {
      window.S.brokerSync = {
        alpaca: { connected: false, lastSync: null, imported: 0, equity: null },
        importedOrderIds: [],
      };
    }
    if (!window.S.brokerSync.importedOrderIds) window.S.brokerSync.importedOrderIds = [];
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

  function importOrders(orders) {
    ensureBrokerState();
    const seen = new Set(window.S.brokerSync.importedOrderIds || []);
    let added = 0;
    const maxId = window.S.trades.reduce((m, t) => Math.max(m, t.id || 0), 0);

    orders.forEach((o, i) => {
      if (!o.id || seen.has(o.id)) return;
      if (o.status && !String(o.status).toLowerCase().includes("fill")) return;
      const side = String(o.side || "").toLowerCase();
      const dir = side.includes("sell") ? "short" : "long";
      const qty = o.filled_qty || o.qty || 1;
      const sym = o.symbol || "?";
      const d = o.filled_at || o.submitted_at;
      const date = d
        ? new Date(d).toLocaleDateString("en-GB", { month: "short", day: "numeric" })
        : new Date().toLocaleDateString("en-GB", { month: "short", day: "numeric" });

      window.S.trades.unshift({
        id: maxId + i + 1 + Date.now(),
        instr: sym,
        dir,
        entry: 0,
        exit: null,
        size: qty,
        pnl: 0,
        stopOk: null,
        sizeOk: null,
        type: "shares",
        date,
        incomplete: true,
        source: "alpaca",
        externalId: o.id,
      });
      seen.add(o.id);
      added++;
    });

    window.S.brokerSync.importedOrderIds = [...seen];
    window.S.brokerSync.alpaca.imported = (window.S.brokerSync.alpaca.imported || 0) + added;
    if (typeof persist === "function") persist();
    return added;
  }

  async function refreshStatus() {
    ensureBrokerState();
    if (!isLoggedIn()) {
      window.S.brokerSync.alpaca.connected = false;
      return null;
    }
    try {
      const st = await alpacaStatus();
      window.S.brokerSync.alpaca.connected = !!st.connected;
      window.S.brokerSync.alpaca.paper = st.paper;
      window.S.brokerSync.alpaca.equity = st.equity;
      window.S.brokerSync.alpaca.positionCount = st.position_count;
      if (typeof persist === "function") persist();
      return st;
    } catch (e) {
      window.S.brokerSync.alpaca.connected = false;
      return null;
    }
  }

  async function runSync() {
    ensureBrokerState();
    if (!isLoggedIn()) throw new Error("Log in to Runnr first");
    const data = await syncAlpaca();
    const added = importOrders(data.recent_orders || []);
    window.S.brokerSync.alpaca.lastSync = data.as_of || new Date().toISOString();
    window.S.brokerSync.alpaca.connected = true;
    if (typeof persist === "function") persist();
    if (typeof renderJournal === "function") renderJournal();
    if (typeof updateHomeStats === "function") updateHomeStats();
    if (typeof renderCoachPage === "function") renderCoachPage();
    return { added, data };
  }

  return {
    apiBase,
    token,
    setToken,
    isLoggedIn,
    register,
    login,
    logout,
    alpacaStatus,
    connectAlpaca,
    syncAlpaca,
    refreshStatus,
    runSync,
    ensureBrokerState,
    formatAgo,
  };
})();
