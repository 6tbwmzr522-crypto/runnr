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

  async function resetPassword(email, newPassword) {
    ensureApiUrl();
    if (!storageOk()) {
      throw new Error("Safari blocked saving your login — turn off Private Browsing or allow site data for runnr.fyi");
    }
    const creds = normalizeAuth(email, newPassword);
    const data = await request(
      "/api/v1/auth/reset-password",
      {
        method: "POST",
        body: JSON.stringify({ email: creds.email, new_password: creds.password }),
      },
      12000
    );
    setToken(data.access_token, data.email || creds.email);
    localStorage.setItem("runnr_remember_email", creds.email);
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

  const DEMO_TRADE_IDS = new Set([1, 2, 3, 4]);
  const DEMO_WATCH_SYMS = new Set(["RACE", "ASTS", "EURUSD"]);
  let pushTimer = null;
  let _cloudPushPaused = false;

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

  /** Pull cloud profile on login, or push local data if cloud is empty. */
  async function syncProfileState() {
    if (!isLoggedIn()) return { action: "none" };
    const data = await request("/api/v1/profile/state");
    const serverHas = !!(data?.state && hasMeaningfulState(data.state));
    const localHas = hasMeaningfulState(window.S);

    if (serverHas && !localHas) {
      applyRemoteState(data.state);
      return { action: "pulled", updated_at: data.updated_at };
    }
    if (!serverHas && localHas) {
      await pushProfileState();
      return { action: "pushed" };
    }
    if (serverHas && localHas) {
      const merged = mergeProfiles(window.S, data.state);
      applyRemoteState(merged);
      await pushProfileState();
      return { action: "merged", updated_at: data.updated_at };
    }
    return { action: "empty" };
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
    pullProfileState,
    pushProfileState,
    pushProfileStateDebounced,
    hasMeaningfulState,
    applyRemoteState,
  };
})();
