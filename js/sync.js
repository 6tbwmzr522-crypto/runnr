/**
 * Runnr API client — login, Alpaca connect, read-only sync.
 */
const RunnrSync = (() => {
  const TOKEN_KEY = "runnr_api_token";
  const EMAIL_KEY = "runnr_api_email";
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

  function setToken(t, email) {
    if (t) {
      localStorage.setItem(TOKEN_KEY, t);
      if (email) localStorage.setItem(EMAIL_KEY, email);
    } else {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(EMAIL_KEY);
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
      const d = o.filled_at || o.submitted_at;
      const date = d
        ? new Date(d).toLocaleDateString("en-GB", { month: "short", day: "numeric" })
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
      window.S.brokerSync.alpaca.connected = !!st.connected;
      window.S.brokerSync.alpaca.paper = st.paper;
      window.S.brokerSync.alpaca.equity = st.equity;
      window.S.brokerSync.alpaca.positionCount = st.position_count;
      if (typeof persist === "function") persist();
      return st;
    } catch (e) {
      return null;
    }
  }

  async function runSync() {
    ensureBrokerState();
    if (!isLoggedIn()) throw new Error("Log in to Runnr first");
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
    const needsFix = (window.S.trades || []).some(tradeNeedsPriceFix);
    if (!needsFix) return false;
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
    logout,
    alpacaStatus,
    connectAlpaca,
    syncAlpaca,
    refreshStatus,
    runSync,
    repairJournalIfNeeded,
    ensureBrokerState,
    formatAgo,
    tradeNeedsPriceFix,
  };
})();
