/**
 * Runnr app — state, persist, migrations, trade-limit glue.
 * Extracted from index.html (slice 1). Classic script; globals kept for onclick=.
 */
// ── STATE ──────────────────────────────────────────────────────────────────
var WHOP_URL = 'https://whop.com/runnr'; // legacy; upgrades now go through Stripe
var INST_MIN_TRADES = 30;

function isImportedJournalTrade(t) {
  return window.RunnrTradeLimit.isImportedJournalTrade(t);
}
function isBrokerFillTrade(t) {
  return t && (t.source === 'alpaca' || t.source === 'ibkr' || t.source === 't212');
}
function isDemoJournalTrade(t) {
  return window.RunnrTradeLimit.isDemoJournalTrade(t);
}
function countJournalTradesForLimit() {
  return window.RunnrTradeLimit.countJournalTradesForLimit(S.trades);
}
function canAddJournalTrade(addCount = 1) {
  return window.RunnrTradeLimit.canAddJournalTrade(addCount, S.trades);
}
function journalTradeSlotsRemaining() {
  return window.RunnrTradeLimit.journalTradeSlotsRemaining(S.trades);
}
function openJournalLimitUpgrade() {
  const TL = window.RunnrTradeLimit;
  const loggedIn = typeof RunnrSync !== "undefined" && RunnrSync.isLoggedIn && RunnrSync.isLoggedIn();
  if (!loggedIn) openUpgrade("Start your 7-day free trial");
  else if (TL && typeof TL.trialActive === "function" && TL.trialActive()) openUpgrade("Runnr");
  else openUpgrade("Your 7-day trial has ended");
}
function maybeOpenJournalLimit(limited) {
  if (limited) openJournalLimitUpgrade();
}
window.countJournalTradesForLimit = countJournalTradesForLimit;
window.canAddJournalTrade = canAddJournalTrade;
window.journalTradeSlotsRemaining = journalTradeSlotsRemaining;

var S = {
  bal: 10000, risk: 1, sym: '€',
  riskHistory: [],
  trades: [
    { id:1, isDemo:true, instr:'RACE', dir:'long', entry:354, exit:380, size:28, pnl:728, stopOk:true, sizeOk:true, type:'shares', date:'Apr 17', riskSnapshot:{ risk:1, bal:10000, at:'2026-04-17T00:00:00.000Z', sym:'€' } },
    { id:2, isDemo:true, instr:'BE', dir:'long', entry:137, exit:151, size:65, pnl:910, stopOk:true, sizeOk:false, type:'shares', date:'Apr 15', riskSnapshot:{ risk:1, bal:10000, at:'2026-04-15T00:00:00.000Z', sym:'€' } },
    { id:3, isDemo:true, instr:'USDJPY', dir:'short', entry:159.37, exit:157.93, size:0.5, pnl:720, stopOk:true, sizeOk:true, type:'cfd', date:'Apr 12', riskSnapshot:{ risk:1, bal:10000, at:'2026-04-12T00:00:00.000Z', sym:'€' } },
    { id:4, isDemo:true, instr:'AAPL CFD', dir:'long', entry:198, exit:195, size:15, pnl:-45, stopOk:false, sizeOk:true, type:'cfd', date:'Apr 10', incomplete:true, riskSnapshot:{ risk:1, bal:10000, at:'2026-04-10T00:00:00.000Z', sym:'€' } },
  ],
  watchlist: [
    { id:1, sym:'RACE', dir:'long', entry:354, stop:338, target:420, thesis:'Post-selloff recovery, 52-week range support, buyback programme active', rr:3.9, urgent:false },
    { id:2, sym:'ASTS', dir:'long', entry:18, stop:15.5, target:28, thesis:'LEO satellite revenue inflection, institutional accumulation', rr:4.0, urgent:true },
    { id:3, sym:'EURUSD', dir:'short', entry:1.142, stop:1.150, target:1.110, thesis:'ECB dovish pivot signals, USD strength on rate divergence', rr:4.0, urgent:false },
  ],
  flags: { stop: null, size: null },
  editingTradeId: null,
  editingWatchId: null,
  optType: 'call',
  optCoachMode: 'leaps',
  optWheelKind: 'csp',
  onboardingComplete: false,
  profileHandle: '',
  firstName: '',
  coachDigestEnabled: true,
  lang: 'en',
  brokerSync: { alpaca: { connected: false, lastSync: null, imported: 0 }, importedOrderIds: [] },
  journalBaseBal: 0,
  challenge: (typeof Baron !== 'undefined' && Baron.defaultChallenge) ? Baron.defaultChallenge() : { enabled: false },
};

try {
  const saved = localStorage.getItem('runnr_state');
  if (saved) { const p = JSON.parse(saved); Object.assign(S, p); }
} catch(e) {}

// Drop null/garbage entries so migrations & renderers can't crash on bad records.
// A single null in trades/watchlist would otherwise throw at boot and blank the whole app.
S.trades = Array.isArray(S.trades) ? S.trades.filter(t => t && typeof t === 'object') : [];
S.watchlist = Array.isArray(S.watchlist) ? S.watchlist.filter(w => w && typeof w === 'object') : [];
if (typeof Baron !== 'undefined' && Baron.normalizeChallenge) S.challenge = Baron.normalizeChallenge(S.challenge);

function normalizeTradePnls() {
  if (!window.Baron?.resolveTradePnl) return;
  let changed = false;
  S.trades.forEach(t => {
    if (t.disciplineOnly || Baron.isOpenTrade(t)) return;
    const resolved = Baron.resolveTradePnl(t);
    if (resolved != null && t.pnl !== resolved) {
      t.pnl = resolved;
      changed = true;
    }
  });
  if (changed) persist();
}
normalizeTradePnls();

window.S = S;
if (typeof RunnrSync !== 'undefined' && RunnrSync.isLoggedIn?.()) {
  try {
    if (RunnrSync.recoverLocalState?.()) {
      S.trades = Array.isArray(S.trades) ? S.trades.filter(t => t && typeof t === 'object') : [];
      S.watchlist = Array.isArray(S.watchlist) ? S.watchlist.filter(w => w && typeof w === 'object') : [];
    }
    if (RunnrSync.enrichFromSnapshots?.()) {
      S.trades = Array.isArray(S.trades) ? S.trades.filter(t => t && typeof t === 'object') : [];
      S.watchlist = Array.isArray(S.watchlist) ? S.watchlist.filter(w => w && typeof w === 'object') : [];
    }
    if (RunnrSync.recoverWatchlistIfEmpty?.()) {
      S.watchlist = Array.isArray(S.watchlist) ? S.watchlist.filter(w => w && typeof w === 'object') : [];
    }
  } catch (e) { console.warn('recoverLocalState', e); }
  if (!S.firstName && typeof RunnrSync.houseFirstName === 'function') {
    const n = RunnrSync.houseFirstName(RunnrSync.sessionEmail());
    if (n) {
      S.firstName = n;
      try { localStorage.setItem('runnr_state', JSON.stringify(S)); } catch (e) {}
      RunnrSync.updateFirstName?.(n).catch(() => {});
    }
  }
}

function isOptionSymbol(sym) {
  const s = String(sym || '').toUpperCase();
  if (s.length < 10) return false;
  return /[CP]\d{6,}/.test(s);
}

var LEVELS_THESIS_PLACEHOLDER = 'Set levels from your chart';
var BARON_THESIS_PLACEHOLDER = LEVELS_THESIS_PLACEHOLDER; // legacy alias for stored watchlist rows

function migrateTradeEditability() {
  let changed = false;
  S.trades.forEach(t => {
    if (t.disciplineOnly && !t.baronRules) {
      delete t.disciplineOnly;
      changed = true;
    }
  });
  if ((S._journalMig || 0) < 2) {
    S.trades.forEach(t => {
      if (t.disciplineOnly) {
        delete t.disciplineOnly;
        changed = true;
      }
    });
    S._journalMig = 2;
    changed = true;
  }
  if (changed) persist();
}

function sanitizeAlpacaJournal() {
  const before = S.trades.length;
  let patched = false;
  S.trades = S.trades.filter(t => !(t.source === 'alpaca' && isOptionSymbol(t.instr)));
  S.trades.forEach(t => {
    if (t.source === 'alpaca' && !t.baronRules && t.disciplineOnly) {
      t.disciplineOnly = false;
      patched = true;
    }
    if (t.baronRules) {
      t.disciplineOnly = true;
      t.pnl = null;
      t.stopOk = t.stopOk !== false;
      t.sizeOk = t.sizeOk !== false;
      t.incomplete = false;
      patched = true;
    }
  });
  if (S.trades.length !== before || patched || S.trades.some(t => t.disciplineOnly && t.pnl != null)) persist();
}

try { sanitizeAlpacaJournal(); } catch (e) { console.warn('sanitizeAlpacaJournal failed', e); }
try { migrateTradeEditability(); } catch (e) { console.warn('migrateTradeEditability failed', e); }

function migrateWatchlistThesis() {
  let changed = false;
  const oldPlaceholders = new Set([
    LEVELS_THESIS_PLACEHOLDER,
    'Baron universe — set levels from chart',
    'Baron universe — set levels from your chart',
  ]);
  S.watchlist.forEach(w => {
    if (oldPlaceholders.has(w.thesis)) {
      w.thesis = '';
      w.needsLevels = !w.entry || !w.stop || !w.target;
      changed = true;
    }
    if ((!w.entry || !w.stop || !w.target) && (w.baron || w.needsLevels)) w.needsLevels = true;
  });
  if (changed) persist();
}
try { migrateWatchlistThesis(); } catch (e) { console.warn('migrateWatchlistThesis failed', e); }

function portfolioBaseBal() {
  return S.journalBaseBal > 0 ? S.journalBaseBal : S.bal;
}

function migratePortfolioBase() {
  if (S.journalBaseBal > 0) return;
  if (!S.balFromAlpaca || !S.bal || !window.Baron?.resolveTradePnl) return;
  const closedPnl = S.trades
    .filter(t => !t.disciplineOnly && isPortfolioPnlTrade(t))
    .reduce((s, t) => {
      const p = Baron.resolveTradePnl(t);
      return p != null ? s + p : s;
    }, 0);
  if (closedPnl === 0) return;
  const inferred = Math.round(S.bal - closedPnl);
  if (inferred > 0) {
    S.journalBaseBal = inferred;
    persist();
  }
}
try { migratePortfolioBase(); } catch (e) { console.warn('migratePortfolioBase failed', e); }

function persist() {
  if (typeof DisciplineReplay !== 'undefined' && DisciplineReplay.stampHistory) {
    DisciplineReplay.stampHistory(S);
  }
  if (RunnrSync?.isLoggedIn?.()) {
    S.ownerEmail = (RunnrSync.sessionEmail() || '').trim().toLowerCase();
  }
  try { localStorage.setItem('runnr_state', JSON.stringify(S)); } catch(e) {}
  try {
    const who = (RunnrSync?.sessionEmail?.() || '').trim().toLowerCase();
    if (who && RunnrSync?.isLoggedIn?.()) localStorage.setItem('runnr_state:' + who, JSON.stringify(S));
  } catch (e) {}
  if (RunnrSync?.isLoggedIn?.() && RunnrSync?.hasMeaningfulState?.(S)) {
    RunnrSync.pushProfileStateDebounced?.();
  }
}

function isFactoryDemoWatchItem(w) {
  if (!w) return true;
  const id = Number(w.id);
  const sym = String(w.sym || '').toUpperCase();
  return (id === 1 || id === 2 || id === 3) && (sym === 'RACE' || sym === 'ASTS' || sym === 'EURUSD');
}
function isDemoWatchItem(w) {
  return isFactoryDemoWatchItem(w);
}
function isSetupWatch(w) {
  if (!w || isFactoryDemoWatchItem(w)) return false;
  return !!(Number(w.stop) || Number(w.target) || w.thesis);
}
function watchlistIsEmptyOrDemo() {
  return !(S.watchlist || []).some(isSetupWatch);
}

function ensureWatchFromPositions() {
  const visible = (S.watchlist || []).filter((w) => w && !isFactoryDemoWatchItem(w));
  if (visible.length) return false;
  if (typeof RunnrSync?.seedWatchlistFromTrades !== 'function') return false;
  const ok = RunnrSync.seedWatchlistFromTrades();
  if (ok) {
    S.watchlist = Array.isArray(S.watchlist) ? S.watchlist.filter((w) => w && typeof w === 'object') : [];
    try { normalizeWatchlist(); } catch (e) {}
  }
  return !!ok;
}

var _watchlistCloudPulled = false;
function maybePullWatchlistFromCloud() {
  if (_watchlistCloudPulled) return;
  if (!window.RunnrSync?.isLoggedIn?.()) return;
  normalizeWatchlist();
  if (!watchlistIsEmptyOrDemo()) return;
  _watchlistCloudPulled = true;
  const el = document.getElementById('feed-status-text');
  if (el) el.textContent = 'Syncing watchlist…';
  const pull = typeof RunnrSync.syncWatchlistFromCloud === 'function'
    ? RunnrSync.syncWatchlistFromCloud()
    : RunnrSync.syncProfileState();
  pull
    .then((result) => {
      const ok = result?.ok || (result && result.action !== 'none');
      if (!ok && typeof RunnrSync.enrichFromSnapshots === 'function') {
        RunnrSync.enrichFromSnapshots();
      }
      normalizeWatchlist();
      if (!(S.watchlist || []).some((w) => w && !isFactoryDemoWatchItem(w))) {
        ensureWatchFromPositions();
      }
      renderWatchlist();
      if (el) {
        const n = (S.watchlist || []).filter((w) => w && !isFactoryDemoWatchItem(w)).length;
        el.textContent = n ? 'Live' : 'Watchlist empty — add a setup';
      }
    })
    .catch(() => {
      _watchlistCloudPulled = false;
      if (el) el.textContent = 'Tap ↻ Refresh';
    });
}

async function forcePullWatchlist() {
  _watchlistCloudPulled = false;
  showToast('Runnr', 'Pulling watchlist…');
  try {
    const result = await RunnrSync.syncWatchlistFromCloud();
    normalizeWatchlist();
    if (result?.ok) {
      refreshAfterProfileSync();
      showToast('Runnr', 'Watchlist synced — ' + result.count + ' setup(s)');
    } else {
      showToast('Runnr', 'No watchlist in cloud yet — open Mac & tap Sync');
    }
  } catch (e) {
    showToast('Runnr', 'Sync failed — try again');
  }
}
window.forcePullWatchlist = forcePullWatchlist;

async function diagnoseSyncNow() {
  try {
    const d = await RunnrSync.diagnose();
    const lines = [
      'DEVICE: ' + (/iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'Phone' : 'Mac/Other'),
      'Logged in as: ' + (d.email || '—'),
      'Server account: ' + (d.me ? ('#' + d.me.id + ' ' + d.me.email) : 'FAILED'),
      'Token tail: …' + d.tokenTail,
      '',
      'LOCAL watchlist: ' + d.localWatchlist,
      'SERVER watchlist: ' + (d.serverWatchlist == null ? 'FAILED' : d.serverWatchlist),
      'LOCAL trades: ' + d.localTrades,
      'SERVER trades: ' + (d.serverTrades == null ? 'FAILED' : d.serverTrades),
      d.serverUpdated ? ('Server updated: ' + d.serverUpdated) : '',
      d.error ? ('ERROR: ' + d.error) : '',
    ].filter(Boolean);
    alert(lines.join('\n'));
  } catch (e) {
    alert('Diagnose failed: ' + (e.message || e));
  }
}
window.diagnoseSyncNow = diagnoseSyncNow;

async function forcePushThisDevice() {
  try {
    const r = await RunnrSync.forcePush();
    showToast('Runnr', r.ok ? ('Uploaded ' + r.watchlist + ' setups to cloud') : 'Not logged in');
  } catch (e) {
    showToast('Runnr', 'Upload failed: ' + (e.message || e));
  }
}
window.forcePushThisDevice = forcePushThisDevice;

function normalizeWatchlist() {
  if (!Array.isArray(S.watchlist)) { S.watchlist = []; return; }
  S.watchlist = S.watchlist.filter((w) => {
    if (!w || typeof w !== 'object') return false;
    const sym = String(w.sym || '').trim();
    if (!sym) return false;
    w.sym = sym.toUpperCase();
    return true;
  });
  S.watchlist.forEach((w) => {
    if (!w.dir) w.dir = 'long';
    if (typeof w.rr !== 'number' || !isFinite(w.rr)) w.rr = watchRR(w);
    if (w.id == null) w.id = Date.now() + Math.floor(Math.random() * 1000);
  });
}

function refreshAfterProfileSync() {
  const safe = (fn) => { try { fn(); } catch (e) { console.warn('refreshAfterProfileSync step failed', e); } };
  safe(normalizeWatchlist);
  safe(normalizeTradePnls);
  safe(migratePortfolioBase);
  safe(seedQuoteCacheFromWatchlist);
  feedLastUpdate = null;
  safe(renderJournal);
  safe(renderWatchlist);
  safe(updateHomeStats);
  safe(renderHomePreviews);
  safe(refreshPortfolioIfVisible);
  safe(renderCoachPage);
  safe(renderSyncPage);
  safe(renderHomeBrokerPreview);
  try { refreshAllPrices().catch(() => {}); } catch (e) {}
}

function resolveTradePnl(t) {
  return window.Baron?.resolveTradePnl?.(t) ?? null;
}

/** Closed round-trips count for Portfolio P&L (Alpaca closes included before discipline review). */
function isPortfolioPnlTrade(t) {
  if (!t || t.disciplineOnly || t.mergedAway) return false;
  if (Baron.isOpenTrade?.(t)) return false;
  if (resolveTradePnl(t) == null) return false;
  if (!t.incomplete) return true;
  return isBrokerFillTrade(t) && (t.alpacaPaired || (Number(t.entry) > 0 && Number(t.exit) > 0));
}
