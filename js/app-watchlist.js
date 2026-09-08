/**
 * Runnr app — watchlist, shelves, home market tiles.
 * Extracted from index.html (slice 1). Classic script; globals kept for onclick=.
 */
// ── WATCHLIST ──────────────────────────────────────────────────────────────
function watchRowStatus(w, lp) {
  const bandPct = S.risk;
  const alertKey = w.sym + '-' + w.entry;
  const firedAt = alertState.fired[alertKey];
  const inZone = lp && lp.price && Math.abs(distToEntry(lp.price, w.entry)) <= bandPct;
  if (inZone) return { cls: 'ai-status-hit', text: '● In Zone' };
  if (firedAt) return { cls: 'ai-status-fired', text: 'Alerted' };
  return { cls: 'ai-status-armed', text: 'Armed' };
}

function watchId(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : v;
}

function selectWatch(id) {
  id = watchId(id);
  S.selectedWatchId = watchId(S.selectedWatchId) === id ? null : id;
  persist();
  renderWatchlist();
  const panel = document.getElementById('watchlist-detail');
  if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
window.selectWatch = selectWatch;

function watchRemark(w) {
  const t = (w.thesis && w.thesis !== BARON_THESIS_PLACEHOLDER) ? String(w.thesis).trim() : '';
  return t;
}

function getDisplayRemark(w) {
  const manual = watchRemark(w);
  if (manual) return { text: manual, mode: 'user' };
  if (w.autoRemark) return { text: w.autoRemark, mode: w.autoRemarkMode || 'headline' };
  return null;
}

function remarkModeLabel(mode) {
  if (mode === 'ai') return '✦ AI';
  if (mode === 'headline') return '↻ News';
  if (mode === 'fallback') return '…';
  return '';
}

function renderRemarkHtml(w) {
  const r = getDisplayRemark(w);
  if (r) {
    const badge = r.mode !== 'user' ? `<span class="remark-src">${remarkModeLabel(r.mode)}</span>` : '';
    return `<div class="wcr-remark">${escHtml(r.text)}${badge}</div>`;
  }
  if (!watchRemark(w)) {
    return `<div class="wcr-remark" style="font-style:normal;color:var(--text3)">⟳ Fetching market read…</div>`;
  }
  return '';
}

var WATCH_BRIEF_MS = 15 * 60 * 1000; // refresh market remarks every 15m
var watchBriefRunning = false;

function watchBriefFresh(w) {
  return !!(w.autoRemark && w.autoRemarkAt && Date.now() - w.autoRemarkAt < WATCH_BRIEF_MS);
}

async function fetchWatchBriefForItem(w, force) {
  if (watchRemark(w)) return;
  if (!force && watchBriefFresh(w)) return;
  const base = (typeof RunnrSync !== 'undefined' ? RunnrSync.apiBase() : 'https://api.runnr.fyi');
  const sym = quoteSymbolFromInstr(w.sym);
  const params = new URLSearchParams();
  if (w.dir) params.set('direction', w.dir);
  if (w.entry) params.set('entry', String(w.entry));
  if (w.stop) params.set('stop', String(w.stop));
  if (w.target) params.set('target', String(w.target));
  if (force) params.set('refresh', '1');
  const qs = params.toString();
  const url = base + '/api/v1/quotes/' + encodeURIComponent(sym) + '/brief' + (qs ? '?' + qs : '');
  const res = await fetchWithTimeout(url, 15000);
  if (!res.ok) throw new Error('brief failed');
  const data = await res.json();
  if (data?.remark) {
    w.autoRemark = data.remark;
    w.autoRemarkMode = data.mode || 'headline';
    w.autoRemarkAt = Date.now();
    persist();
  }
}

async function refreshWatchBriefs(force) {
  if (watchBriefRunning) return;
  const batch = S.watchlist.filter(w => !watchRemark(w) && (force || !watchBriefFresh(w)));
  if (!batch.length) return;
  watchBriefRunning = true;
  await Promise.allSettled(batch.slice(0, 8).map(w => fetchWatchBriefForItem(w, !!force)));
  watchBriefRunning = false;
  if (document.getElementById('page-watchlist')?.classList.contains('active')) renderWatchlist();
}

async function refreshWatchBriefForItem(id, e) {
  if (e) { e.stopPropagation(); e.preventDefault(); }
  const w = S.watchlist.find(x => watchId(x.id) === watchId(id));
  if (!w || watchRemark(w)) return;
  delete w.autoRemark;
  delete w.autoRemarkAt;
  delete w.autoRemarkMode;
  renderWatchlist();
  await fetchWatchBriefForItem(w, true);
  renderWatchlist();
}
window.refreshWatchBriefForItem = refreshWatchBriefForItem;

function escHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

function watchRR(w) {
  if (!w) return 0;
  const e = Number(w.entry), s = Number(w.stop), t = Number(w.target);
  if (e && s && t && e !== s) {
    const rr = Math.abs(t - e) / Math.abs(e - s);
    if (isFinite(rr)) return rr;
  }
  return typeof w.rr === 'number' && isFinite(w.rr) ? w.rr : 0;
}

var WATCH_SHELF_KEYS = ['zone', 'alerted', 'armed', 'levels'];

function tt(key, fallback) {
  try {
    if (typeof t === 'function') {
      const s = t(key);
      if (s && s !== key) return s;
    }
  } catch (e) {}
  return fallback;
}

function watchShelfBucket(w) {
  if (!Number(w.stop) || !Number(w.target)) return 'levels';
  const prices = typeof liveprices !== 'undefined' ? liveprices : {};
  const lp = prices[w.sym];
  let st = { cls: 'ai-status-armed', text: 'Armed' };
  try { st = watchRowStatus(w, lp); } catch (e) {}
  if (st.cls === 'ai-status-hit') return 'zone';
  if (st.cls === 'ai-status-fired') return 'alerted';
  return 'armed';
}

function watchShelfLabel(key) {
  if (key === 'zone') return tt('watch.shelfZone', 'In zone');
  if (key === 'alerted') return tt('watch.shelfAlerted', 'Alerted');
  if (key === 'armed') return tt('watch.shelfArmed', 'Armed');
  return tt('watch.shelfLevels', 'Set levels');
}

function watchShelfItems() {
  return (S.watchlist || []).filter((w) => w && !isFactoryDemoWatchItem(w));
}

function groupWatchShelves(items) {
  const groups = { zone: [], alerted: [], armed: [], levels: [] };
  (items || []).forEach((w) => {
    const key = watchShelfBucket(w);
    (groups[key] || groups.armed).push(w);
  });
  return WATCH_SHELF_KEYS.filter((k) => groups[k].length).map((k) => ({ key: k, items: groups[k] }));
}

function openWatchFromShelf(id) {
  S.selectedWatchId = watchId(id);
  persist();
  switchPage('watchlist');
}
window.openWatchFromShelf = openWatchFromShelf;

function addWatchFromShelf() {
  openModal('modal-add-watch');
}
window.addWatchFromShelf = addWatchFromShelf;

function renderWatchShelfAddTile() {
  const empty = !watchShelfItems().length;
  const label = tt('watch.addSetup', '+ Add Setup');
  const hint = empty ? tt('home.watchShelfEmpty', 'No setups yet — add one on Watch') : '';
  return `<button type="button" class="watch-shelf-tile add" onclick="addWatchFromShelf()">
    <div class="ws-sym">${escHtml(label)}</div>
    ${hint ? `<div class="ws-st">${escHtml(hint)}</div>` : ''}
  </button>`;
}

function renderWatchShelfTile(w) {
  const prices = typeof liveprices !== 'undefined' ? liveprices : {};
  const lp = prices[w.sym];
  const px = lp && lp.price ? fmtPrice(lp.price) : '—';
  const bucket = watchShelfBucket(w);
  const st = bucket === 'levels'
    ? { text: watchShelfLabel('levels') }
    : (() => { try { return watchRowStatus(w, lp); } catch (e) { return { text: watchShelfLabel(bucket) }; } })();
  const label = String(st.text || watchShelfLabel(bucket)).replace(/^●\s*/, '');
  return `<button type="button" class="watch-shelf-tile ${bucket}" onclick="openWatchFromShelf(${JSON.stringify(w.id)})">
    <div class="ws-sym">${escHtml(w.sym)}</div>
    <div class="ws-meta"><span class="ws-px">${px}</span><span class="ws-dir">${escHtml(w.dir || '')}</span></div>
    <div class="ws-st">${escHtml(label)}</div>
  </button>`;
}

function renderWatchShelf() {
  const el = document.getElementById('home-watch-shelf');
  if (!el) return;
  const items = watchShelfItems();
  const ordered = groupWatchShelves(items).flatMap((g) => g.items).slice(0, 12);
  el.innerHTML = ordered.map(renderWatchShelfTile).join('') + renderWatchShelfAddTile();
}

function renderWatchCompactRow(w) {
  const prices = typeof liveprices !== 'undefined' ? liveprices : {};
  const lp = prices[w.sym];
      const livePrice = lp && lp.price ? fmtPrice(lp.price) : '—';
  const needsLevels = !Number(w.stop) || !Number(w.target);
  let st = { cls: 'ai-status-armed', text: 'Armed' };
  try { st = watchRowStatus(w, lp); } catch (e) {}
  if (needsLevels) { st = { cls: 'ai-status-armed', text: 'Set levels' }; }
  const selected = watchId(S.selectedWatchId) === watchId(w.id);
  const remark = watchRemark(w);
  let remarkHtml = '';
  try { remarkHtml = remark ? `<div class="wcr-remark">${escHtml(remark)}</div>` : renderRemarkHtml(w); } catch (e) {}
  return `<div class="watch-compact-row ${selected ? 'watch-compact-selected' : ''}" role="button" tabindex="0" onclick="selectWatch(${w.id})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();selectWatch(${w.id})}">
    <div class="wcr-block">
      <div class="wcr-line1">
        <div class="ai-sym">${escHtml(w.sym)}</div>
        <span class="wcr-dir">${w.dir || ''}</span>
        <span class="wcr-live">${livePrice}</span>
      </div>
      ${selected ? '' : `<div class="wcr-sub">${w.entry || '—'} · stop ${w.stop || '—'} · target ${w.target || '—'} · ${watchRR(w).toFixed(1)}R</div>`}
      ${remarkHtml}
    </div>
    <div class="ai-status ${st.cls}">${String(st.text || '').replace(/^●\s*/, '')}</div>
  </div>`;
}

function renderWatchDetailCard(w) {
  const rr = watchRR(w);
  const rrColor = rr >= 2 ? 'var(--accent)' : rr >= 1.5 ? 'var(--amber)' : 'var(--red)';
  const lp = liveprices[w.sym];
  const needsLevels = !w.entry || !w.stop || !w.target || w.needsLevels;
  const thesis = watchRemark(w);
  const display = getDisplayRemark(w);
  const remarkBlock = thesis
    ? `<div class="wds-thesis">${escHtml(thesis)}</div>`
    : display
      ? `<div class="wds-thesis">${escHtml(display.text)}<span class="remark-src">${remarkModeLabel(display.mode)}</span></div>`
      : `<div class="wds-thesis" style="border-top:none;padding-top:0;color:var(--text3);font-style:normal;font-family:var(--font-body);font-size:11px">⟳ Pulling market read…</div>`;
  return `<div class="watch-detail-slim watch-detail-panel" id="wi-${w.id}">
    <div class="live-price-row" id="lp-row-${w.id}">
      ${lp && lp.price ? renderLivePriceRow(lp, w) : '<span class="lp-loading">⟳ Fetching price…</span>'}
    </div>
    <div class="wds-levels">
      <span><em>Entry</em>${w.entry || '—'}</span>
      <span class="stop"><em>Stop</em>${w.stop || '—'}</span>
      <span class="tgt"><em>Target</em>${w.target || '—'}</span>
      <span><em>R:R</em><span style="color:${rrColor}">${rr.toFixed(1)}</span></span>
      <span><em>Dir</em>${(w.dir || '').toUpperCase()}</span>
    </div>
    <div class="wds-actions">
      ${needsLevels ? `<button onclick="event.stopPropagation();openWatchEditor(${w.id})" style="background:var(--gold-dim);color:var(--gold);border:1px solid var(--border)">Set levels</button>` : ''}
      <button onclick="event.stopPropagation();sizefromWatch(${w.id})" style="background:var(--accent-dim);color:var(--accent)">→ Size it</button>
      <button onclick="event.stopPropagation();openStockDetail('${w.sym}')" style="background:var(--surface3);color:var(--text2);border:1px solid var(--border)">Chart</button>
      <button onclick="event.stopPropagation();openWatchEditor(${w.id})" style="background:transparent;color:var(--text3);border:1px solid var(--border)">${thesis ? 'Edit remark' : '+ Remark'}</button>
      ${!thesis ? `<button onclick="event.stopPropagation();refreshWatchBriefForItem(${w.id}, event)" style="background:transparent;color:var(--text3);border:1px solid var(--border)">↻ AI read</button>` : ''}
    </div>
    ${remarkBlock}
    ${needsLevels && !thesis && !display ? `<div class="wds-thesis" style="border-top:none;padding-top:0;color:var(--amber);font-style:normal;font-family:var(--font-body);font-size:11px">Set entry, stop &amp; target — add your own remark anytime.</div>` : ''}
    ${!needsLevels && !thesis && !display ? `<div class="wds-thesis" style="border-top:none;padding-top:0;color:var(--text3);font-style:normal;font-family:var(--font-body);font-size:11px">Tap + Remark to override the auto read.</div>` : ''}
  </div>`;
}

function renderWatchlist() {
  const list = document.getElementById('watchlist-list');
  if (!list) return;
  normalizeWatchlist();
  const loggedIn = !!(typeof RunnrSync !== 'undefined' && RunnrSync.isLoggedIn?.());
  const items = (S.watchlist || []).filter((w) => w && !isFactoryDemoWatchItem(w));
  if (!items.length) {
    list.innerHTML = '<div class="empty-state"><div class="es-icon">👁</div>No setups yet.'
      + (loggedIn ? ' Add one, or open Watch after syncing from another device.' : ' Add your first watch.')
      + '</div>';
    maybePullWatchlistFromCloud();
    renderWatchShelf();
    return;
  }
  const selectedId = watchId(S.selectedWatchId);
  const shelves = groupWatchShelves(items);
  const rows = shelves.map((shelf) => {
    const body = shelf.items.map((w) => {
      try {
        let html = renderWatchCompactRow(w);
        if (watchId(w.id) === selectedId) {
          html += `<div id="watchlist-detail" class="watch-inline-detail">${renderWatchDetailCard(w)}</div>`;
        }
        return html;
      } catch (e) { console.warn('skip bad watch item', w && w.sym, e); return ''; }
    }).join('');
    if (!body.trim()) return '';
    return `<div class="watch-shelf-group"><div class="watch-shelf-label">${escHtml(watchShelfLabel(shelf.key))} · ${shelf.items.length}</div><div class="watch-compact-list">${body}</div></div>`;
  }).join('');
  if (!rows.trim()) {
    list.innerHTML = '<div class="empty-state"><div class="es-icon">👁</div>Setups could not load. Add one on Watch.</div>';
    maybePullWatchlistFromCloud();
    renderWatchShelf();
    return;
  }
  const hint = selectedId ? '' : '<div style="font-size:11px;color:var(--text3);text-align:center;margin:8px 0 12px">' + t('watch.tapTicker') + '</div>';
  list.innerHTML = `${rows}${hint}`;
  renderNotifSettings();
  refreshWatchBriefs();
  renderWatchShelf();
}

function renderLivePriceRow(lp, w) {
  if (!lp || !lp.price) return '<span class="lp-loading">⟳ Fetching price…</span>';
  const change = Number(lp.change) || 0;
  const changePct = Number(lp.changePct) || 0;
  const isPos = change >= 0;
  const distPct = distToEntry(lp.price, w.entry);
  const isNear  = isNearEntry(lp.price, w.entry, w.dir);
  const entryReached = w.dir === 'long' ? lp.price <= w.entry : lp.price >= w.entry;
  let distLabel = '';
  if (entryReached) {
    distLabel = `<span style="color:var(--accent);font-weight:700;font-size:10px">✓ AT ENTRY</span>`;
  } else {
    const pct = Math.abs(distPct).toFixed(1);
    distLabel = `<span class="lp-dist ${isNear?'lp-dist-near':'lp-dist-far'}">${pct}% from entry</span>`;
  }
  return `
    <div class="lp-current">
      <span class="lp-price">${lp.price < 10 ? lp.price.toFixed(4) : lp.price < 100 ? lp.price.toFixed(3) : lp.price.toFixed(2)}</span>
      <span class="${isPos?'lp-change-pos':'lp-change-neg'}">${isPos?'▲':'▼'} ${Math.abs(change).toFixed(2)} (${Math.abs(changePct).toFixed(2)}%)</span>
    </div>
    <div class="lp-right">
      ${distLabel}
      <div style="font-size:9px;color:var(--text3);margin-top:1px">${lp.timestamp}</div>
    </div>`;
}

function renderDistBar(price, w) {
  // Bar spans from stop to target, showing current price position
  const lo = Math.min(w.stop, w.target, price) * 0.995;
  const hi = Math.max(w.stop, w.target, price) * 1.005;
  const range = hi - lo;
  if (range === 0) return '';
  const stopPct   = ((w.stop   - lo) / range * 100).toFixed(1);
  const entryPct  = ((w.entry  - lo) / range * 100).toFixed(1);
  const targetPct = ((w.target - lo) / range * 100).toFixed(1);
  const curPct    = ((price    - lo) / range * 100).toFixed(1);
  const isPos     = price >= w.entry;
  return `<div class="dist-bar-wrap">
    <div class="dist-bar" style="background:linear-gradient(90deg,rgba(255,77,109,0.15),rgba(255,181,71,0.1),rgba(0,229,160,0.15))">
      <div class="dist-entry-marker" style="left:${entryPct}%;background:var(--text3)" title="Entry"></div>
      <div class="dist-entry-marker" style="left:${stopPct}%;background:rgba(255,77,109,0.6)" title="Stop"></div>
      <div class="dist-entry-marker" style="left:${targetPct}%;background:rgba(0,229,160,0.6)" title="Target"></div>
      <div class="dist-current-marker" style="left:${curPct}%;background:${isPos?'var(--accent)':'var(--red)'}" title="Current price"></div>
    </div>
    <div style="display:flex;justify-content:space-between;font-size:9px;color:var(--text3);margin-top:2px;font-family:var(--font-mono)">
      <span style="color:rgba(255,77,109,0.7)">Stop ${w.stop}</span>
      <span>Entry ${w.entry}</span>
      <span style="color:rgba(0,229,160,0.7)">Target ${w.target}</span>
    </div>
  </div>`;
}

function distToEntry(price, entry) {
  return ((price - entry) / entry) * 100;
}

function isNearEntry(price, entry, dir) {
  const pct = Math.abs(distToEntry(price, entry));
  return pct <= 2.5; // within 2.5% of entry
}

function renderHomePreviews() {
  paintHomeMarkets();
  renderWatchShelf();
}

var HOME_MARKETS = {
  indices: [
    { sym: '^GSPC', label: 'S&P 500' },
    { sym: '^VIX', label: 'VIX' },
    { sym: '^IXIC', label: 'NASDAQ' },
    { sym: '^GDAXI', label: 'DAX' },
    { sym: '^HSI', label: 'Hang Seng' },
    { sym: '^N225', label: 'Nikkei' },
    { sym: '000001.SS', label: 'Shanghai' },
    { sym: 'BTC-USD', label: 'Bitcoin' },
  ],
  commodities: [
    { sym: 'CL=F', label: 'WTI Oil' },
    { sym: 'RB=F', label: 'Gasoline' },
    { sym: 'NG=F', label: 'Nat Gas' },
    { sym: 'GC=F', label: 'Gold' },
    { sym: 'SI=F', label: 'Silver' },
    { sym: 'HG=F', label: 'Copper' },
  ],
};
var homeMarketCache = {};
var homeMarketsRefreshing = false;

function parseQuickQuote(json) {
  const chart = json?.chart?.result?.[0];
  if (!chart) return null;
  const meta = chart.meta || {};
  const closes = (chart.indicators?.quote?.[0]?.close || []).filter(Boolean);
  const price = meta.regularMarketPrice || meta.preMarketPrice || meta.postMarketPrice || closes[closes.length - 1];
  const prev = meta.previousClose || meta.chartPreviousClose || closes[closes.length - 2];
  if (price == null || isNaN(price)) return null;
  const change = prev != null ? price - prev : 0;
  const changePct = prev ? (change / prev) * 100 : 0;
  return { price, change, changePct, session: parseMarketSession(meta) };
}

function renderMarketTile(item, data) {
  const loading = !data;
  const up = (data?.change || 0) >= 0;
  const chgColor = loading ? 'var(--text3)' : up ? 'var(--accent)' : 'var(--red)';
  const arrow = loading ? '' : up ? '▲' : '▼';
  const price = loading ? '—' : fmtPrice(data.price);
  const chg = loading ? '…' : arrow + ' ' + Math.abs(data.changePct || 0).toFixed(2) + '%';
  const session = loading ? '' : sessionDisplayLabel(data.session, item.sym);
  return `<div class="market-tile${loading ? ' loading' : ''}" onclick="openStockDetail('${item.sym.replace(/'/g, "\\'")}')">
    <div class="m-label">${item.label}</div>
    <div class="m-price">${price}</div>
    <div class="m-chg" style="color:${chgColor}">${chg}</div>
    ${session ? `<div class="m-session">${session}</div>` : ''}
  </div>`;
}

function paintHomeMarkets() {
  const paint = (id, list) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = list.map(item => renderMarketTile(item, homeMarketCache[item.sym])).join('');
  };
  paint('home-markets-indices', HOME_MARKETS.indices);
  paint('home-markets-commodities', HOME_MARKETS.commodities);
}

async function refreshHomeMarkets() {
  if (isGuestLanding()) return;
  if (homeMarketsRefreshing) return;
  homeMarketsRefreshing = true;
  const stamp = document.getElementById('home-markets-updated');
  const all = [...HOME_MARKETS.indices, ...HOME_MARKETS.commodities];
  paintHomeMarkets();
  const need = all.filter((item) => {
    const cached = homeMarketCache[item.sym];
    return !(cached && Date.now() - cached.ts < STOCK_LIST_CACHE_MS);
  });
  if (need.length) {
    try {
      const batch = await fetchQuotesBatch(need.map((item) => item.sym), '1m', '1d');
      need.forEach((item) => {
        const json = batch[item.sym];
        const q = json && parseQuickQuote(json);
        if (q) homeMarketCache[item.sym] = { ...q, ts: Date.now() };
      });
    } catch (e) { /* keep stale or dash */ }
  }
  paintHomeMarkets();
  if (stamp) {
    const live = all.filter(i => homeMarketCache[i.sym]).length;
    stamp.textContent = live ? '↻ ' + new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) + ' · tap for chart' : '↻ Unavailable';
  }
  homeMarketsRefreshing = false;
}

function openWatchEditor(id) {
  id = watchId(id);
  const w = S.watchlist.find(x => watchId(x.id) === id);
  if (!w) return;
  S.editingWatchId = id;
  document.getElementById('w-sym').value = w.sym;
  document.getElementById('w-dir').value = w.dir || 'long';
  document.getElementById('w-entry').value = w.entry || '';
  document.getElementById('w-stop').value = w.stop || '';
  document.getElementById('w-target').value = w.target || '';
  document.getElementById('w-thesis').value = (w.thesis && w.thesis !== BARON_THESIS_PLACEHOLDER) ? w.thesis : '';
  const title = document.querySelector('#modal-add-watch .modal-title');
  if (title) title.innerHTML = 'Edit Setup <button class="modal-close" onclick="closeModal(\'modal-add-watch\')">✕</button>';
  const btn = document.querySelector('#modal-add-watch .btn');
  if (btn) btn.textContent = 'Save Setup';
  openModal('modal-add-watch');
}
window.openWatchEditor = openWatchEditor;

function saveWatch() {
  const sym = document.getElementById('w-sym').value.toUpperCase();
  if (!sym) return;
  const entry = parseFloat(document.getElementById('w-entry').value)||0;
  const stop  = parseFloat(document.getElementById('w-stop').value)||0;
  const target= parseFloat(document.getElementById('w-target').value)||0;
  const thesis = document.getElementById('w-thesis').value.trim();
  const rr = (entry && stop && target) ? parseFloat(((Math.abs(target-entry)/Math.abs(entry-stop)).toFixed(1))) : 0;
  let savedWatch = null;
  if (S.editingWatchId != null) {
    const w = S.watchlist.find(x => watchId(x.id) === watchId(S.editingWatchId));
    if (w) {
      Object.assign(w, { sym, dir: document.getElementById('w-dir').value, entry, stop, target, thesis, rr, needsLevels: !(entry && stop && target) });
      if (entry && stop && target) delete w.needsLevels;
      delete w.quoteSym;
      savedWatch = w;
    }
    S.editingWatchId = null;
  } else {
    const id = Date.now();
    savedWatch = { id, sym, dir: document.getElementById('w-dir').value, entry, stop, target, thesis, rr, urgent: false };
    S.watchlist.unshift(savedWatch);
    S.selectedWatchId = id;
  }
  persist();
  closeModal('modal-add-watch');
  const title = document.querySelector('#modal-add-watch .modal-title');
  if (title) title.innerHTML = 'Add Setup <button class="modal-close" onclick="closeModal(\'modal-add-watch\')">✕</button>';
  const btn = document.querySelector('#modal-add-watch .btn');
  if (btn) btn.textContent = 'Add to Watchlist';
  renderWatchlist();
  if (savedWatch) hydrateWatchQuote(savedWatch);
}

async function hydrateWatchQuote(w) {
  if (!w?.sym) return;
  try {
    const resolved = await resolveQuoteSymbol(w.sym);
    w.quoteSym = resolved;
    const data = await fetchLivePrice(w.sym, resolved);
    if (data?.price > 0) {
      liveprices[w.sym] = data;
      if (!w.entry) {
        w.entry = parseFloat(data.price.toFixed(data.price < 1 ? 4 : data.price < 100 ? 2 : 1));
        if (w.stop && w.target && w.entry && w.stop !== w.entry) {
          w.rr = parseFloat((Math.abs(w.target - w.entry) / Math.abs(w.entry - w.stop)).toFixed(1));
        }
        delete w.needsLevels;
      }
      w.urgent = isNearEntry(data.price, w.entry, w.dir);
      persist();
    }
  } catch (e) {}
  renderWatchlist();
  renderHomePreviews();
}

async function previewWatchSymbolPrice() {
  const hint = document.getElementById('w-sym-hint');
  const symEl = document.getElementById('w-sym');
  if (!hint || !symEl) return;
  const sym = symEl.value.trim().toUpperCase();
  if (!sym) { hint.textContent = ''; return; }
  hint.textContent = '⟳ Looking up live price…';
  try {
    const resolved = await resolveQuoteSymbol(sym);
    const data = await fetchLivePrice(sym, resolved);
    const entryEl = document.getElementById('w-entry');
    if (data?.price > 0) {
      const via = resolved !== normalizeQuoteSymbol(sym) ? ` · ${resolved}` : '';
      hint.innerHTML = `Live: <strong style="color:var(--accent)">${fmtPrice(data.price)}</strong>${via}`;
      if (entryEl && !parseFloat(entryEl.value)) {
        entryEl.placeholder = data.price.toFixed(data.price < 1 ? 4 : 2);
      }
    } else {
      hint.textContent = 'No quote — try exchange suffix (e.g. BMW.DE, VOW3.DE)';
    }
  } catch (e) {
    hint.textContent = 'Could not fetch price — try BMW.DE for XETRA listings';
  }
}
window.previewWatchSymbolPrice = previewWatchSymbolPrice;

function sizefromWatch(id) {
  const w = S.watchlist.find(w => w.id === id);
  if (!w) return;
  switchPage('sizer');
  setTimeout(() => {
    document.getElementById('cfd-instr').value = w.sym;
    document.getElementById('cfd-entry').value = w.entry;
    document.getElementById('cfd-stop').value  = w.stop;
    document.getElementById('cfd-target').value= w.target;
    document.getElementById('cfd-dir').value   = w.dir;
    document.getElementById('cfd-manual-size').value = '';
    calcCFD();
  }, 50);
}
