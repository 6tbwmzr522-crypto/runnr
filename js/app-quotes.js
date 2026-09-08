/**
 * Runnr app — quotes, live price feed, traffic banner, fear/greed.
 * Extracted from index.html (slice 1). Classic script; globals kept for onclick=.
 */
// ── STOCK DATA ────────────────────────────────────────────────────────────

// Cache to avoid re-fetching (short TTL for live quotes)
var stockCache = {};
var STOCK_CACHE_MS = 90000;
var STOCK_LIST_CACHE_MS = 120000;
var FEED_POLL_MS = 90000;
var FEED_POLL_MAX_MS = 300000;
var feedPollMs = FEED_POLL_MS;
var QUOTE_FETCH_CONCURRENCY = 4;
var QUOTE_BATCH_MAX = 24;
var quoteFetchActive = 0;
var quoteFetchWaiters = [];
var quoteErrorStreak = 0;
var quoteBackoffUntil = 0;

var CRYPTO_SYMS = ['BTC','ETH','SOL','DOGE','XRP','ADA','AVAX','LINK','BNB','LTC','DOT','MATIC','SHIB'];

function normalizeQuoteSymbol(sym) {
  const s = String(sym || '').trim().toUpperCase();
  if (!s) return s;
  if (s.includes('-') || s.includes('=')) return s;
  if (CRYPTO_SYMS.includes(s)) return s + '-USD';
  return s;
}

var QUOTE_SUFFIXES = ['.DE', '.L', '.PA', '.AS', '.MI', '.SW', '.MC', '.OL', '.CO', '.HE', '.BR', '.WA', '.VI', '.TO'];
var quoteSymbolCache = {};
var resolveInflight = {};

function seedQuoteCacheFromWatchlist() {
  (S.watchlist || []).forEach((w) => {
    const key = String(w.sym || '').trim().toUpperCase();
    if (key && w.quoteSym) quoteSymbolCache[key] = w.quoteSym;
  });
}
seedQuoteCacheFromWatchlist();

function isLikelyUsEquity(sym) {
  const base = String(sym || '').split('.')[0].toUpperCase();
  if (window.Baron?.EQUITIES?.includes(base)) return true;
  if (window.Baron?.COMMODITIES?.includes(base)) return true;
  return false;
}

function extractPriceFromMeta(meta) {
  if (!meta) return 0;
  const session = parseMarketSession(meta);
  let price = parseFloat(meta.regularMarketPrice);
  if (session === 'premarket' && meta.preMarketPrice) price = parseFloat(meta.preMarketPrice);
  else if (session === 'postmarket' && meta.postMarketPrice) price = parseFloat(meta.postMarketPrice);
  if (!price || isNaN(price)) price = parseFloat(meta.previousClose || meta.chartPreviousClose);
  return price > 0 && !isNaN(price) ? price : 0;
}

async function probeQuoteSymbol(sym) {
  try {
    const json = await fetchYahooChart(sym, '1m', '1d');
    const meta = json?.chart?.result?.[0]?.meta;
    const price = extractPriceFromMeta(meta);
    if (price > 0) return { sym, meta, price };
  } catch (e) {}
  return null;
}

async function doResolveQuoteSymbol(key) {
  const normalized = normalizeQuoteSymbol(key);
  if (normalized.includes('.') || normalized.includes('-') || normalized.includes('=')) {
    const hit = await probeQuoteSymbol(normalized);
    if (hit) return hit.sym;
    return normalized;
  }

  const hit = await probeQuoteSymbol(normalized);
  if (hit) return hit.sym;

  if (/^[A-Z]{1,6}$/.test(key) && !isLikelyUsEquity(key)) {
    for (const suf of QUOTE_SUFFIXES) {
      const candidate = key + suf;
      if (candidate === normalized) continue;
      const alt = await probeQuoteSymbol(candidate);
      if (alt) return alt.sym;
    }
  }

  return normalized;
}

async function resolveQuoteSymbol(displaySym) {
  const key = String(displaySym || '').trim().toUpperCase();
  if (!key) return key;
  if (quoteSymbolCache[key]) return quoteSymbolCache[key];
  if (resolveInflight[key]) return resolveInflight[key];
  resolveInflight[key] = doResolveQuoteSymbol(key).then((resolved) => {
    quoteSymbolCache[key] = resolved;
    return resolved;
  }).finally(() => { delete resolveInflight[key]; });
  return resolveInflight[key];
}

function watchQuoteSym(w) {
  return w?.quoteSym || quoteSymbolCache[w?.sym] || normalizeQuoteSymbol(w?.sym || '');
}

function quoteSymbolFromInstr(instr) {
  const s = String(instr || '').trim().toUpperCase();
  if (/^[A-Z]{1,5}$/.test(s)) return s;
  const m = s.match(/^([A-Z]{1,5})/);
  return m ? m[1] : normalizeQuoteSymbol(s);
}

function parseMarketSession(meta) {
  const raw = meta?.marketState || meta?.currentTradingPeriod?.period || '';
  const state = String(raw).toUpperCase();
  if (state.includes('PRE')) return 'premarket';
  if (state.includes('POST')) return 'postmarket';
  if (state.includes('REGULAR')) return 'regular';
  if (meta?.preMarketPrice && !meta?.regularMarketPrice) return 'premarket';
  if (meta?.postMarketPrice && meta?.marketState === 'CLOSED') return 'postmarket';
  return 'closed';
}

function sessionBadgeClass(session) {
  if (session === 'regular') return 'live';
  if (session === 'premarket') return 'premarket';
  if (session === 'postmarket') return 'postmarket';
  return 'closed';
}

function sessionDisplayLabel(session, sym) {
  if (sym && sym.includes('-USD')) return 'Live · Crypto';
  if (session === 'regular') return 'Live';
  if (session === 'premarket') return 'Pre-Market';
  if (session === 'postmarket') return 'After-Hours';
  return 'Last Close';
}

function acquireQuoteSlot() {
  return new Promise((resolve) => {
    const tryAcquire = () => {
      if (quoteFetchActive < QUOTE_FETCH_CONCURRENCY) {
        quoteFetchActive += 1;
        resolve();
      } else {
        quoteFetchWaiters.push(tryAcquire);
      }
    };
    tryAcquire();
  });
}

function releaseQuoteSlot() {
  quoteFetchActive = Math.max(0, quoteFetchActive - 1);
  const next = quoteFetchWaiters.shift();
  if (next) next();
}

async function fetchYahooChart(sym, interval, range) {
  await acquireQuoteSlot();
  try {
    const base = (typeof RunnrSync !== 'undefined' ? RunnrSync.apiBase() : 'https://api.runnr.fyi');
    const url = base + '/api/v1/quotes/' + encodeURIComponent(sym) + '?interval=' + interval + '&range=' + range;
    const res = await fetchWithTimeout(url, 7000);
    if (!res.ok) throw new Error('fetch failed');
    const data = await res.json();
    const meta = data._runnr || {};
    data._runnrCache = meta.cache || res.headers.get('X-Runnr-Cache') || 'miss';
    data._runnrSource = meta.source || 'yahoo';
    trackQuoteCache(data._runnrCache);
    return data;
  } finally {
    releaseQuoteSlot();
  }
}

async function fetchQuotesBatch(syms, interval, range) {
  const unique = [...new Set((syms || []).map((s) => String(s || '').trim()).filter(Boolean))];
  const out = {};
  if (!unique.length) return out;
  const base = (typeof RunnrSync !== 'undefined' ? RunnrSync.apiBase() : 'https://api.runnr.fyi');
  for (let i = 0; i < unique.length; i += QUOTE_BATCH_MAX) {
    const chunk = unique.slice(i, i + QUOTE_BATCH_MAX);
    const res = await fetchWithTimeout(base + '/api/v1/quotes/batch', 20000, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ symbols: chunk, interval: interval, range: range })
    });
    if (res.status === 404 || res.status === 405) {
      await Promise.all(chunk.map(async (sym) => {
        try { out[sym] = await fetchYahooChart(sym, interval, range); } catch (err) {}
      }));
      continue;
    }
    if (!res.ok) throw new Error('fetch failed');
    const data = await res.json();
    const quotes = data.quotes || {};
    Object.keys(quotes).forEach((sym) => {
      const json = quotes[sym];
      if (!json) return;
      const meta = json._runnr || {};
      json._runnrCache = meta.cache || 'miss';
      json._runnrSource = meta.source || 'yahoo';
      trackQuoteCache(json._runnrCache);
      out[sym] = json;
    });
  }
  return out;
}

var quoteCacheHits = 0;
var quoteCacheMisses = 0;
var quoteStaleCount = 0;
var trafficBannerDismissed = false;

function trackQuoteCache(status) {
  if (status === 'hit' || status === 'swr' || status === 'refresh') quoteCacheHits++;
  else if (status === 'stale') quoteStaleCount++;
  else quoteCacheMisses++;
}

function showTrafficBanner(msg) {
  if (trafficBannerDismissed) return;
  const el = document.getElementById('traffic-banner');
  if (!el) return;
  const span = el.querySelector('.traffic-banner-text');
  if (span && msg) span.textContent = msg;
  el.style.display = 'flex';
}

function dismissTrafficBanner() {
  trafficBannerDismissed = true;
  const el = document.getElementById('traffic-banner');
  if (el) el.style.display = 'none';
}

function hideTrafficBanner() {
  const el = document.getElementById('traffic-banner');
  if (el && !trafficBannerDismissed) el.style.display = 'none';
}

function updateTrafficBanner(liveCount, total, batchStale) {
  if (!total) return;
  const ratio = liveCount / total;
  const stale = Number(batchStale) || 0;
  // Per-refresh only — never lifetime stale counters (those trip under normal SWR).
  const degraded = ratio === 0 || ratio < 0.5 || stale > liveCount;
  if (!trafficBannerDismissed) {
    if (ratio === 0) {
      showTrafficBanner('Prices unavailable — market closed or feed delayed. Journal & Alpaca sync still work.');
    } else if (degraded) {
      showTrafficBanner('Live prices may lag. Journal & Alpaca sync still work.');
    } else {
      hideTrafficBanner();
    }
  }
  if (degraded) setFeedPollInterval(Math.min(FEED_POLL_MAX_MS, Math.max(feedPollMs * 2, FEED_POLL_MS * 2)));
  else setFeedPollInterval(FEED_POLL_MS);
}

async function openStockDetail(sym) {
  const displaySym = String(sym || '').trim().toUpperCase();
  sym = await resolveQuoteSymbol(displaySym);
  document.getElementById('sd-modal-title').textContent = displaySym + (sym !== displaySym ? ' · ' + sym : '') + ' — Market Data';
  document.getElementById('sd-modal-body').innerHTML = '<div class="sd-loading">⟳ Fetching live data for ' + displaySym + '...</div>';
  openModal('modal-stock');

  const cacheKey = displaySym;
  if (stockCache[cacheKey] && (Date.now() - stockCache[cacheKey].ts < STOCK_CACHE_MS)) {
    renderStockModal(displaySym, stockCache[cacheKey].data);
    return;
  }

  try {
    const [histJson, liveJson] = await Promise.all([
      fetchYahooChart(sym, '1d', '1y'),
      fetchYahooChart(sym, '1m', '1d').catch(() => null)
    ]);
    const chart = histJson.chart.result[0];
    const meta = chart.meta;
    const liveMeta = liveJson?.chart?.result?.[0]?.meta || meta;
    const closes = chart.indicators.quote[0].close.filter(Boolean);
    const highs  = chart.indicators.quote[0].high.filter(Boolean);
    const lows   = chart.indicators.quote[0].low.filter(Boolean);
    const vols   = chart.indicators.quote[0].volume.filter(Boolean);

    const regularPrice = extractPriceFromMeta(liveMeta) || extractPriceFromMeta(meta) || closes[closes.length - 1];
    const prevClose = liveMeta.previousClose || meta.previousClose || meta.chartPreviousClose || closes[closes.length - 2];
    if (!regularPrice || !closes.length) throw new Error('no price data');
    const session = parseMarketSession(liveMeta);
    const pmPrice = liveMeta.preMarketPrice || meta.preMarketPrice || null;
    const postPrice = liveMeta.postMarketPrice || meta.postMarketPrice || null;

    let displayPrice = regularPrice;
    if (session === 'premarket' && pmPrice) displayPrice = pmPrice;
    else if (session === 'postmarket' && postPrice) displayPrice = postPrice;
    else if (sym.includes('-USD')) displayPrice = liveMeta.regularMarketPrice || regularPrice;

    const change = displayPrice - prevClose;
    const changePct = prevClose ? (change / prevClose) * 100 : 0;
    const w52High = Math.max(...highs);
    const w52Low  = Math.min(...lows);
    const avgVol  = Math.round(vols.reduce((a,b) => a+b, 0) / vols.length);
    const curVol  = liveMeta.regularMarketVolume || meta.regularMarketVolume || vols[vols.length-1];

    function calcRSI(data, period = 14) {
      if (data.length < period + 1) return 50;
      let gains = 0, losses = 0;
      for (let i = data.length - period; i < data.length; i++) {
        const d = data[i] - data[i-1];
        if (d >= 0) gains += d; else losses -= d;
      }
      const rs = gains / (losses || 0.001);
      return Math.round(100 - 100 / (1 + rs));
    }

    function sma(data, period) {
      if (data.length < period) return null;
      return data.slice(-period).reduce((a,b) => a+b, 0) / period;
    }

    const rsi = calcRSI(closes);
    const ma50  = sma(closes, 50);
    const ma200 = sma(closes, 200);

    const pmChange = pmPrice ? pmPrice - prevClose : null;
    const pmPct = pmChange != null && prevClose ? (pmChange / prevClose * 100) : null;
    const postChange = postPrice ? postPrice - prevClose : null;
    const postPct = postChange != null && prevClose ? (postChange / prevClose * 100) : null;

    const data = {
      current: displayPrice,
      regularPrice,
      prevClose,
      change,
      changePct,
      w52High,
      w52Low,
      avgVol,
      curVol,
      rsi,
      ma50,
      ma200,
      pmPrice,
      pmChange,
      pmPct,
      postPrice,
      postChange,
      postPct,
      session,
      sessionLabel: sessionDisplayLabel(session, sym),
      closes: closes.slice(-50),
      sym: displaySym.replace('-USD', ''),
      quoteSym: sym
    };

    stockCache[cacheKey] = { data, ts: Date.now() };
    const watchItem = S.watchlist.find(w => w.sym === displaySym);
    if (watchItem) {
      watchItem.quoteSym = sym;
      persist();
    }
    renderStockModal(displaySym, data);

  } catch(e) {
    // Fallback with simulated realistic data
    const seed = displaySym.split('').reduce((a,c) => a + c.charCodeAt(0), 0);
    const pseudo = n => ((seed * n * 9301 + 49297) % 233280) / 233280;
    const watchItem = S.watchlist.find(w => w.sym === displaySym);
    const livePx = liveprices[displaySym]?.price;
    const base = (watchItem?.entry > 0) ? watchItem.entry
      : (livePx > 0) ? livePx
      : 100 + pseudo(7) * 400;
    const data = {
      current: base,
      prevClose: base * (1 - 0.005 + pseudo(2) * 0.01),
      change: base * (-0.005 + pseudo(3) * 0.01),
      changePct: -0.5 + pseudo(4) * 1.0,
      w52High: base * (1.1 + pseudo(5) * 0.4),
      w52Low:  base * (0.5 + pseudo(6) * 0.3),
      avgVol: Math.round(1000000 + pseudo(8) * 20000000),
      curVol: Math.round(500000 + pseudo(9) * 15000000),
      rsi: Math.round(30 + pseudo(10) * 50),
      ma50:  base * (0.97 + pseudo(11) * 0.06),
      ma200: base * (0.85 + pseudo(12) * 0.2),
      pmPrice: null, pmChange: null, pmPct: null,
      postPrice: null, postChange: null, postPct: null,
      session: 'closed', sessionLabel: 'Last Close',
      closes: Array.from({length:50}, (_,i) => base * (0.9 + pseudo(i+20) * 0.2)),
      sym: displaySym.replace('-USD', ''), simulated: true
    };
    stockCache[cacheKey] = { data, ts: Date.now() };
    renderStockModal(displaySym, data);
  }
}

function renderStockModal(sym, d) {
  const isPos = d.change >= 0;
  const rsiColor = d.rsi < 30 ? 'var(--accent)' : d.rsi > 70 ? 'var(--red)' : 'var(--amber)';
  const rsiLabel = d.rsi < 30 ? 'Oversold' : d.rsi > 70 ? 'Overbought' : 'Neutral';
  const rsiPct = (d.rsi / 100 * 100).toFixed(0);
  const rangePct = d.w52High > d.w52Low
    ? ((d.current - d.w52Low) / (d.w52High - d.w52Low) * 100).toFixed(0)
    : 50;
  const ma50above  = d.ma50  ? d.current > d.ma50  : null;
  const ma200above = d.ma200 ? d.current > d.ma200 : null;
  const fmtVol = v => v >= 1e6 ? (v/1e6).toFixed(1)+'M' : v >= 1e3 ? (v/1e3).toFixed(0)+'K' : v;
  const fmtP = v => v != null ? '$'+Number(v).toFixed(2) : '—';

  let html = '';
  const badgeCls = sessionBadgeClass(d.session || 'closed');

  if (d.pmPrice && d.session !== 'premarket') {
    const pmPos = d.pmChange >= 0;
    html += `<div class="sd-premarket">
      <div><div class="pm-label">Pre-Market</div><div style="font-size:10px;color:var(--text3)">Before open</div></div>
      <div style="text-align:right">
        <div class="pm-price">${fmtP(d.pmPrice)}</div>
        <div class="${pmPos?'sd-change-pos':'sd-change-neg'}">${pmPos?'+':''}${d.pmChange.toFixed(2)} (${pmPos?'+':''}${d.pmPct.toFixed(2)}%)</div>
      </div>
    </div>`;
  }

  if (d.postPrice && d.session !== 'postmarket') {
    const postPos = d.postChange >= 0;
    html += `<div class="sd-postmarket">
      <div><div class="pm-label">After-Hours</div><div style="font-size:10px;color:var(--text3)">Extended session</div></div>
      <div style="text-align:right">
        <div class="pm-price">${fmtP(d.postPrice)}</div>
        <div class="${postPos?'sd-change-pos':'sd-change-neg'}">${postPos?'+':''}${d.postChange.toFixed(2)} (${postPos?'+':''}${d.postPct.toFixed(2)}%)</div>
      </div>
    </div>`;
  }

  html += `<div class="sd-full" style="margin-bottom:8px">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div>
        <div class="sd-session-badge ${badgeCls}">${d.sessionLabel || 'Last Close'}</div>
        <div style="font-family:var(--font-mono);font-size:28px;font-weight:500">${fmtP(d.current)}</div>
        ${d.regularPrice && d.session !== 'closed' && d.regularPrice !== d.current ? `<div style="font-size:10px;color:var(--text3);margin-top:2px">Regular: ${fmtP(d.regularPrice)}</div>` : ''}
      </div>
      <div style="text-align:right">
        <div class="${isPos?'sd-change-pos':'sd-change-neg'}" style="font-size:18px">${isPos?'+':''}${d.change.toFixed(2)}</div>
        <div class="${isPos?'sd-change-pos':'sd-change-neg'}" style="font-size:13px">${isPos?'+':''}${d.changePct.toFixed(2)}%</div>
      </div>
    </div>
  </div>`;

  // Stats grid
  html += `<div class="sd-grid">
    <div class="sd-stat">
      <div class="s-lbl">Volume</div>
      <div class="s-val">${fmtVol(d.curVol)}</div>
      <div class="s-sub">Avg: ${fmtVol(d.avgVol)}</div>
    </div>
    <div class="sd-stat">
      <div class="s-lbl">Vol vs Average</div>
      <div class="s-val" style="color:${d.curVol > d.avgVol ? 'var(--accent)' : 'var(--text)'}">
        ${d.curVol && d.avgVol ? (d.curVol/d.avgVol*100).toFixed(0)+'%' : '—'}
      </div>
      <div class="s-sub">${d.curVol > d.avgVol ? 'Above average' : 'Below average'}</div>
    </div>
  </div>`;

  // 52 week range
  html += `<div class="sd-full" style="margin-bottom:8px">
    <div class="s-lbl" style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:6px">52-Week Range</div>
    <div class="range-bar-wrap">
      <div class="range-bar">
        <div class="range-fill" style="width:100%"></div>
        <div class="range-dot" style="left:${rangePct}%"></div>
      </div>
      <div class="range-labels">
        <span>${fmtP(d.w52Low)}</span>
        <span style="color:var(--text2)">Current: ${fmtP(d.current)} (${rangePct}%)</span>
        <span>${fmtP(d.w52High)}</span>
      </div>
    </div>
  </div>`;

  // RSI
  html += `<div class="sd-full" style="margin-bottom:8px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
      <div class="s-lbl" style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:0.8px">RSI (14)</div>
      <div style="display:flex;align-items:center;gap:4px">
        <span class="rsi-val" style="color:${rsiColor}">${d.rsi}</span>
        <span class="rsi-zone" style="color:${rsiColor}">${rsiLabel}</span>
      </div>
    </div>
    <div class="rsi-bar-wrap">
      <span style="font-size:9px;color:var(--red);font-family:var(--font-mono)">0</span>
      <div class="rsi-bar" style="flex:1;position:relative">
        <div class="rsi-marker" style="left:${rsiPct}%"></div>
      </div>
      <span style="font-size:9px;color:var(--accent);font-family:var(--font-mono)">100</span>
    </div>
    <div style="display:flex;justify-content:space-between;font-size:9px;color:var(--text3);margin-top:4px;font-family:var(--font-mono)">
      <span style="color:var(--accent)">Oversold &lt;30</span>
      <span style="color:var(--amber)">Neutral 30–70</span>
      <span style="color:var(--red)">Overbought &gt;70</span>
    </div>
  </div>`;

  // Moving averages
  const ma50pct  = d.ma50  ? ((d.current - d.ma50)  / d.ma50  * 100).toFixed(1) : null;
  const ma200pct = d.ma200 ? ((d.current - d.ma200) / d.ma200 * 100).toFixed(1) : null;
  html += `<div class="sd-grid">
    <div class="sd-stat">
      <div class="s-lbl">50-Day MA</div>
      <div class="s-val" style="color:${ma50above ? 'var(--accent)' : 'var(--red)'}">
        ${d.ma50 ? fmtP(d.ma50.toFixed(2)) : '—'}
      </div>
      <div class="s-sub" style="color:${ma50above ? 'var(--accent)' : 'var(--red)'}">
        ${ma50pct != null ? (ma50above ? '▲ ' : '▼ ') + Math.abs(ma50pct) + '% ' + (ma50above ? 'above' : 'below') : ''}
      </div>
    </div>
    <div class="sd-stat">
      <div class="s-lbl">200-Day MA</div>
      <div class="s-val" style="color:${ma200above ? 'var(--accent)' : 'var(--red)'}">
        ${d.ma200 ? fmtP(d.ma200.toFixed(2)) : '—'}
      </div>
      <div class="s-sub" style="color:${ma200above ? 'var(--accent)' : 'var(--red)'}">
        ${ma200pct != null ? (ma200above ? '▲ ' : '▼ ') + Math.abs(ma200pct) + '% ' + (ma200above ? 'above' : 'below') : ''}
      </div>
    </div>
  </div>`;

  // MA signal summary
  const trend = ma50above && ma200above ? '🟢 Bullish — price above both MAs'
              : !ma50above && !ma200above ? '🔴 Bearish — price below both MAs'
              : ma50above ? '🟡 Mixed — above 50MA, below 200MA'
              : '🟡 Mixed — below 50MA, above 200MA';
  html += `<div style="background:var(--surface2);border-radius:var(--r-sm);padding:10px 12px;font-size:12px;color:var(--text2);border:1px solid var(--border);margin-top:2px">
    ${trend}
  </div>`;

  // Mini price chart
  html += `<div style="margin-top:10px">
    <div class="s-lbl" style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:6px">50-Day Price</div>
    <canvas id="sd-chart-${sym}" height="60" style="width:100%;border-radius:var(--r-sm)"></canvas>
  </div>`;

  if (d.simulated) {
    html += `<div style="margin-top:8px;font-size:10px;color:var(--text3);text-align:center;font-style:italic">⚠ Live data unavailable — showing estimated values</div>`;
  }

  document.getElementById('sd-modal-body').innerHTML = html;

  // Draw mini chart after DOM update
  requestAnimationFrame(() => drawMiniChart('sd-chart-'+sym, d.closes, d.ma50, d.ma200));
}

function drawMiniChart(canvasId, closes, ma50val, ma200val) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.offsetWidth || 300;
  const H = 60;
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.height = H + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const n = closes.length;
  const mn = Math.min(...closes) * 0.995;
  const mx = Math.max(...closes) * 1.005;
  const toX = i => (i / (n-1)) * W;
  const toY = v => H - 4 - ((v - mn) / (mx - mn)) * (H - 8);

  // Background
  ctx.fillStyle = '#162520';
  ctx.fillRect(0, 0, W, H);

  // Price area fill
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, 'rgba(0,229,160,0.25)');
  grad.addColorStop(1, 'rgba(0,229,160,0.02)');
  ctx.beginPath();
  ctx.moveTo(toX(0), H);
  closes.forEach((v,i) => ctx.lineTo(toX(i), toY(v)));
  ctx.lineTo(toX(n-1), H);
  ctx.fillStyle = grad;
  ctx.fill();

  // Price line
  ctx.beginPath();
  closes.forEach((v,i) => i === 0 ? ctx.moveTo(toX(i), toY(v)) : ctx.lineTo(toX(i), toY(v)));
  ctx.strokeStyle = '#00e5a0'; ctx.lineWidth = 1.5; ctx.stroke();

  // MA50 line
  if (ma50val) {
    ctx.beginPath();
    ctx.setLineDash([3,2]);
    ctx.moveTo(0, toY(ma50val)); ctx.lineTo(W, toY(ma50val));
    ctx.strokeStyle = '#ffb547'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#ffb547'; ctx.font = `${9*dpr/dpr}px Cormorant Garamond, serif`;
    ctx.fillText('50MA', 4, toY(ma50val) - 3);
  }

  // MA200 line
  if (ma200val) {
    ctx.beginPath();
    ctx.setLineDash([4,3]);
    ctx.moveTo(0, toY(ma200val)); ctx.lineTo(W, toY(ma200val));
    ctx.strokeStyle = '#4da6ff'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#4da6ff'; ctx.font = `${9*dpr/dpr}px Cormorant Garamond, serif`;
    ctx.fillText('200MA', 4, toY(ma200val) + 10);
  }
  ctx.setLineDash([]);
}

// ── LIVE PRICE FEED ──────────────────────────────────────────────────────
var liveprices = {};
window.liveprices = liveprices;
var feedTimer = null;
var feedLastUpdate = null;
var feedFetching = false;

function watchlistNeedsPriceRefresh() {
  if (!S.watchlist.length) return false;
  return S.watchlist.some((w) => {
    const lp = liveprices[w.sym];
    return !lp || !lp.price;
  });
}

function setFeedStatus(state, msg) {
  const dot = document.getElementById('feed-dot');
  const txt = document.getElementById('feed-status-text');
  if (dot) dot.className = 'feed-dot ' + state;
  if (txt) txt.textContent = msg;
}

// Safe fetch with timeout fallback (AbortSignal.timeout not in all browsers)
function fetchWithTimeout(url, ms, opts) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...(opts || {}), signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

function livePriceFromChart(json, key, sym) {
  const result = json && json.chart && json.chart.result && json.chart.result[0];
  if (!result) return null;
  const meta = result.meta;
  let price = extractPriceFromMeta(meta);
  const prev = parseFloat(meta.previousClose || meta.chartPreviousClose || price);
  if (!price || isNaN(price)) return null;
  const change = price - prev;
  const changePct = prev > 0 ? (change / prev) * 100 : 0;
  const now = new Date();
  const ts = now.getHours() + ':' + String(now.getMinutes()).padStart(2, '0');
  const cacheStatus = json._runnrCache || (json._runnr && json._runnr.cache) || 'miss';
  const staleQuote = cacheStatus === 'stale';
  return { price, change, changePct, timestamp: ts, stale: staleQuote, fetchedAt: Date.now(), sym: key, quoteSym: sym };
}

async function fetchLivePrice(displaySym, resolvedSym) {
  const key = String(displaySym || '').trim().toUpperCase();
  const sym = resolvedSym || await resolveQuoteSymbol(key);
  quoteSymbolCache[key] = sym;
  const w = S.watchlist.find(item => item.sym === key);
  if (w) w.quoteSym = sym;
  try {
    const json = await fetchYahooChart(sym, '1m', '1d');
    const parsed = livePriceFromChart(json, key, sym);
    if (!parsed) throw new Error('no result');
    return parsed;
  } catch(e) {
    const last = liveprices[key];
    if (last && last.price > 0 && !last.estimated) {
      return { ...last, stale: true, fetchedAt: last.fetchedAt || Date.now() };
    }
    const watch = w || S.watchlist.find(item => item.sym === key);
    const seed  = key.split('').reduce((a,c) => a + c.charCodeAt(0), 0);
    const noise = ((seed * (Date.now() % 99991)) % 1000) / 1000 * 0.014 - 0.007;
    const anchor = watch?.entry > 0 ? watch.entry : 100 + (seed % 400);
    const price = parseFloat((anchor * (1 + noise)).toFixed(anchor < 10 ? 5 : anchor < 100 ? 3 : 2));
    const change = parseFloat((price - anchor).toFixed(2));
    const changePct = anchor > 0 ? parseFloat((change / anchor * 100).toFixed(2)) : 0;
    const now = new Date();
    const ts  = now.getHours() + ':' + String(now.getMinutes()).padStart(2,'0') + ' est';
    return { price, change, changePct, timestamp: ts, stale: true, estimated: true, fetchedAt: Date.now(), sym: key, quoteSym: sym };
  }
}

async function refreshAllPrices() {
  if (feedFetching) return;
  if (Date.now() < quoteBackoffUntil) {
    setFeedStatus('error', 'Prices delayed — retrying soon');
    showTrafficBanner('Live prices may lag. Journal & Alpaca sync still work.');
    return;
  }
  feedFetching = true;
  setFeedStatus('loading', 'Updating prices...');
  try {
    seedQuoteCacheFromWatchlist();
    const syms = [...new Set(S.watchlist.map(w => w.sym))];
    if (!syms.length) { setFeedStatus('error', 'No symbols'); return; }
    let liveCount = 0;
    let staleCount = 0;
    let failCount = 0;
    const pending = [];
    for (const sym of syms) {
      const last = liveprices[sym];
      if (last && last.fetchedAt && !last.stale && !last.estimated && (Date.now() - last.fetchedAt < STOCK_LIST_CACHE_MS)) {
        liveCount++;
        continue;
      }
      const w = S.watchlist.find(item => item.sym === sym);
      const resolved = (w && w.quoteSym) || quoteSymbolCache[sym] || normalizeQuoteSymbol(sym);
      pending.push({ display: sym, resolved: resolved });
    }
    if (pending.length) {
      const batch = await fetchQuotesBatch(pending.map((p) => p.resolved), '1m', '1d');
      for (const { display, resolved } of pending) {
        const json = batch[resolved] || batch[display];
        let data = json ? livePriceFromChart(json, display, resolved) : null;
        if (!data) {
          const last = liveprices[display];
          if (last && last.price > 0 && !last.estimated) data = { ...last, stale: true };
        }
        if (!data) { failCount++; continue; }
        liveprices[display] = data;
        if (data.estimated) failCount++;
        else if (data.stale) staleCount++;
        else liveCount++;
        const w = S.watchlist.find((item) => item.sym === display);
        if (w) w.urgent = isNearEntry(data.price, w.entry, w.dir);
      }
    }
    if (failCount * 2 >= syms.length || staleCount > liveCount) {
      quoteErrorStreak++;
      quoteBackoffUntil = Date.now() + Math.min(300000, 15000 * Math.pow(2, Math.min(quoteErrorStreak - 1, 4)));
    } else {
      quoteErrorStreak = 0;
      quoteBackoffUntil = 0;
    }
    feedLastUpdate = new Date();
    const ts = feedLastUpdate.getHours() + ':' + String(feedLastUpdate.getMinutes()).padStart(2,'0');
    if (liveCount === syms.length) setFeedStatus('live', 'Live · ' + ts);
    else if (liveCount > 0)        setFeedStatus('live', liveCount + '/' + syms.length + ' live · ' + ts);
    else                            setFeedStatus('error', 'Estimated · ' + ts);
    updateTrafficBanner(liveCount, syms.length, staleCount);
    if (document.getElementById('page-watchlist').classList.contains('active')) {
      renderWatchlist();
      refreshWatchBriefs();
    }
    renderHomePreviews();
    checkPriceAlerts();
    renderNotifSettings();
  } catch (e) {
    setFeedStatus('error', 'Price fetch failed — tap ↻ Refresh');
  } finally {
    feedFetching = false;
  }
}

function armFeedTimer() {
  if (feedTimer) clearInterval(feedTimer);
  let fgTick = 0;
  feedTimer = setInterval(() => {
    refreshAllPrices();
    refreshHomeMarkets().catch(() => {});
    if (++fgTick % 10 === 0) fetchFearGreed().catch(() => {});
    if (document.getElementById('page-watchlist')?.classList.contains('active')) refreshWatchBriefs();
  }, feedPollMs);
}

function setFeedPollInterval(next) {
  next = Math.max(FEED_POLL_MS, Math.min(FEED_POLL_MAX_MS, next));
  if (next === feedPollMs) return;
  feedPollMs = next;
  if (feedTimer) armFeedTimer();
}

function startFeedTimer() {
  if (isGuestLanding()) return;
  refreshAllPrices();
  refreshHomeMarkets().catch(() => {});
  armFeedTimer();
}

function fmtPrice(p) {
  if (!p || isNaN(p)) return '—';
  if (p < 0.01)  return p.toFixed(6);
  if (p < 1)     return p.toFixed(4);
  if (p < 10)    return p.toFixed(4);
  if (p < 100)   return p.toFixed(3);
  if (p < 10000) return p.toFixed(2);
  return Math.round(p).toLocaleString();
}

function renderLivePriceRow(lp, w) {
  if (!lp || !lp.price) return '<span class="lp-loading">⟳ Loading...</span>';
  const isPos     = (lp.change || 0) >= 0;
  const distPct   = distToEntry(lp.price, w.entry);
  const near      = isNearEntry(lp.price, w.entry, w.dir);
  const reached   = w.dir === 'long' ? lp.price <= w.entry : lp.price >= w.entry;
  const chg       = (lp.change || 0).toFixed(2);
  const chgPct    = (lp.changePct || 0).toFixed(2);
  const arrow     = isPos ? '▲' : '▼';
  const chgClass  = isPos ? 'lp-change-pos' : 'lp-change-neg';
  let distHtml = '';
  if (reached) {
    distHtml = '<span style="color:var(--accent);font-weight:700;font-size:10px">✓ AT ENTRY</span>';
  } else {
    const pct = Math.abs(distPct).toFixed(1);
    const cls = near ? 'lp-dist lp-dist-near' : 'lp-dist lp-dist-far';
    distHtml  = '<span class="' + cls + '">' + pct + '% from entry</span>';
  }
  const staleNote = lp.stale ? '<span style="font-size:9px;color:var(--text3);margin-left:3px">(est)</span>' : '';
  return '<div class="lp-current">'
    + '<span class="lp-price">' + fmtPrice(lp.price) + '</span>'
    + staleNote
    + '<span class="' + chgClass + '">' + arrow + ' ' + Math.abs(chg) + ' (' + Math.abs(chgPct) + '%)</span>'
    + '</div>'
    + '<div class="lp-right">'
    + distHtml
    + '<div style="font-size:9px;color:var(--text3);margin-top:1px">' + (lp.timestamp||'') + '</div>'
    + '</div>';
}

function renderDistBar(price, w) {
  if (!price || !w.stop || !w.target) return '';
  const lo = Math.min(w.stop, w.target, price) * 0.995;
  const hi = Math.max(w.stop, w.target, price) * 1.005;
  const range = hi - lo;
  if (range <= 0) return '';
  const pct = v => Math.min(100, Math.max(0, ((v - lo) / range * 100))).toFixed(1);
  const stopPct   = pct(w.stop);
  const entryPct  = pct(w.entry);
  const targetPct = pct(w.target);
  const curPct    = pct(price);
  const isPos     = price >= w.entry;
  const curColor  = isPos ? 'var(--accent)' : 'var(--red)';
  return '<div class="dist-bar-wrap">'
    + '<div class="dist-bar" style="background:linear-gradient(90deg,rgba(255,77,109,0.12),rgba(255,181,71,0.08),rgba(0,229,160,0.12))">'
    + '<div class="dist-entry-marker" style="left:' + entryPct + '%;background:var(--text3)" title="Entry"></div>'
    + '<div class="dist-entry-marker" style="left:' + stopPct + '%;background:rgba(255,77,109,0.6)" title="Stop"></div>'
    + '<div class="dist-entry-marker" style="left:' + targetPct + '%;background:rgba(0,229,160,0.6)" title="Target"></div>'
    + '<div class="dist-current-marker" style="left:' + curPct + '%;background:' + curColor + '" title="Live price"></div>'
    + '</div>'
    + '<div style="display:flex;justify-content:space-between;font-size:9px;color:var(--text3);margin-top:2px;font-family:var(--font-mono)">'
    + '<span style="color:rgba(255,77,109,0.7)">Stop ' + w.stop + '</span>'
    + '<span>Entry ' + w.entry + '</span>'
    + '<span style="color:rgba(0,229,160,0.7)">Target ' + w.target + '</span>'
    + '</div></div>';
}

// ── FEAR / GREED GAUGE ──────────────────────────────────────────────────
function drawFGGauge(value) {
  const canvas = document.getElementById('fg-canvas');
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = 140 * dpr;
  canvas.height = 82 * dpr;
  canvas.style.width = '140px';
  canvas.style.height = '82px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const cx = 70, cy = 72, r = 58, innerR = 36;

  // Gradient arc segments (fear=red → neutral=yellow → greed=green)
  const zones = [
    { start: Math.PI, end: Math.PI * 1.2, color: '#ef4444' },    // Extreme Fear
    { start: Math.PI * 1.2, end: Math.PI * 1.4, color: '#f97316' }, // Fear
    { start: Math.PI * 1.4, end: Math.PI * 1.6, color: '#eab308' }, // Neutral
    { start: Math.PI * 1.6, end: Math.PI * 1.8, color: '#84cc16' }, // Greed
    { start: Math.PI * 1.8, end: Math.PI * 2.0, color: '#22c55e' }, // Extreme Greed
  ];

  // Draw background track
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI, 2 * Math.PI);
  ctx.lineWidth = 18;
  ctx.strokeStyle = '#1e312a';
  ctx.stroke();

  // Draw colored zones
  zones.forEach(z => {
    ctx.beginPath();
    ctx.arc(cx, cy, r, z.start, z.end);
    ctx.lineWidth = 18;
    ctx.strokeStyle = z.color;
    ctx.lineCap = 'butt';
    ctx.stroke();
  });

  // Draw inner dark circle to create donut shape
  ctx.beginPath();
  ctx.arc(cx, cy, innerR, 0, 2 * Math.PI);
  ctx.fillStyle = '#0f1a16';
  ctx.fill();

  // Tick marks
  for (let i = 0; i <= 10; i++) {
    const angle = Math.PI + (i / 10) * Math.PI;
    const x1 = cx + (r + 2) * Math.cos(angle);
    const y1 = cy + (r + 2) * Math.sin(angle);
    const x2 = cx + (r - 20) * Math.cos(angle);
    const y2 = cy + (r - 20) * Math.sin(angle);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = '#162520';
    ctx.lineWidth = i % 5 === 0 ? 2 : 1;
    ctx.stroke();
  }

  // Needle
  const needleAngle = Math.PI + (value / 100) * Math.PI;
  const needleLen = r - 12;
  const nx = cx + needleLen * Math.cos(needleAngle);
  const ny = cy + needleLen * Math.sin(needleAngle);

  // Needle shadow
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(nx + 1, ny + 1);
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.stroke();

  // Needle main
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(nx, ny);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.stroke();

  // Center pivot
  ctx.beginPath();
  ctx.arc(cx, cy, 5, 0, 2 * Math.PI);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, 2 * Math.PI);
  ctx.fillStyle = '#0f1a16';
  ctx.fill();

  // Value text in center
  ctx.font = `bold ${14 * dpr / dpr}px Cormorant Garamond, serif`;
  ctx.fillStyle = '#e8f5f0';
  ctx.textAlign = 'center';
  ctx.fillText(value, cx, cy - 8);
}

function updateFGDisplay(value, meta = {}) {
  const zones = [
    { max: 25, label: 'EXTREME FEAR', color: '#ef4444', zoneId: 'fz-ef',
      desc: 'Extreme fear in the market. Historically a buying signal — but volatility is high. Be cautious with sizing.' },
    { max: 45, label: 'FEAR', color: '#f97316', zoneId: 'fz-f',
      desc: 'Market is fearful. Opportunities may be emerging, but momentum is weak. Wait for confirmation before entry.' },
    { max: 55, label: 'NEUTRAL', color: '#eab308', zoneId: 'fz-n',
      desc: 'Market sentiment is balanced. No strong directional signal — trade your setups on their own merit.' },
    { max: 75, label: 'GREED', color: '#f59e0b', zoneId: 'fz-g',
      desc: 'Market is showing signs of greed. Traders may be overexposed — consider tightening position sizes.' },
    { max: 100, label: 'EXTREME GREED', color: '#22c55e', zoneId: 'fz-eg',
      desc: 'Extreme greed. Markets are euphoric — high risk of reversal. Reduce size, tighten stops, lock in profits.' },
  ];

  const zone = zones.find(z => value <= z.max) || zones[zones.length - 1];

  document.getElementById('fg-value').textContent = value;
  document.getElementById('fg-value').style.color = zone.color;
  document.getElementById('fg-label').textContent = zone.label;
  document.getElementById('fg-label').style.color = zone.color;
  document.getElementById('fg-desc').textContent = zone.desc;

  // Update active zone highlight
  ['fz-ef','fz-f','fz-n','fz-g','fz-eg'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('active', id === zone.zoneId);
  });

  drawFGGauge(value);

  const upd = document.getElementById('fg-updated');
  if (upd) {
    const ts = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    if (meta.live) {
      const rating = meta.rating ? ' · ' + meta.rating : '';
      upd.textContent = '↻ Live · CNN Fear & Greed · ' + ts + rating;
      upd.style.color = 'var(--accent)';
    } else if (meta.fallback) {
      upd.textContent = '↻ Offline — daily estimate only (not live)';
      upd.style.color = 'var(--amber)';
    } else {
      upd.textContent = '↻ Updated ' + ts;
      upd.style.color = 'var(--text3)';
    }
  }
}

async function fetchFearGreed() {
  if (isGuestLanding()) return;
  try {
    const base = (typeof RunnrSync !== 'undefined' ? RunnrSync.apiBase() : 'https://api.runnr.fyi');
    const res = await fetchWithTimeout(base + '/api/v1/quotes/fear-greed', 6000);
    if (res.ok) {
      const data = await res.json();
      const value = Math.round(data.score || 50);
      updateFGDisplay(value, { live: true, rating: data.rating || '' });
      return;
    }
  } catch(e) {}

  const seed = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
  const pseudo = ((seed * 9301 + 49297) % 233280) / 233280;
  const fallback = Math.round(35 + pseudo * 50);
  updateFGDisplay(fallback, { fallback: true });
}
