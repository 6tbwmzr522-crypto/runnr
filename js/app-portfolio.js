/**
 * Runnr app — portfolio page.
 * Extracted from index.html (slice 1). Classic script; globals kept for onclick=.
 */
// ── PORTFOLIO PAGE ────────────────────────────────────────────────────────

var INSTR_COLORS = [
  '#00e5a0','#4da6ff','#ffb547','#ff4d6d',
  '#a78bfa','#34d399','#fb923c','#60a5fa','#f472b6'
];

function filterByPeriod(trades, period) {
  if (period === 'all') return trades;
  const now = new Date();
  return trades.filter(t => {
    const d = (typeof CoachEngine !== 'undefined' && CoachEngine.tradeDate)
      ? CoachEngine.tradeDate(t)
      : null;
    if (!d) return true;
    const diff = (now - d) / (1000 * 60 * 60 * 24);
    if (period === '1m') return diff <= 30;
    if (period === '3m') return diff <= 90;
    if (period === 'ytd') return d.getFullYear() === now.getFullYear();
    return true;
  });
}

/** Realized P&L when stored value missing or zero but entry/exit exist. */
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

function filterTrades(period) {
  const trades = S.trades.filter(isPortfolioPnlTrade);
  return filterByPeriod(trades, period);
}

function filterDisciplineTrades(period) {
  return filterByPeriod(S.trades.filter(t => !t.incomplete && !t.mergedAway), period);
}

function filterPendingTrades(period) {
  return filterByPeriod(S.trades.filter(t => t.incomplete && !t.mergedAway), period);
}

function loadPortfolio(period, tabEl) {
  migratePortfolioBase();
  portPeriod = period;
  document.querySelectorAll('.period-tab').forEach(t => t.classList.remove('active'));
  if (tabEl) tabEl.classList.add('active');

  const trades = filterTrades(period);
  const discTrades = filterDisciplineTrades(period);
  const pendingTrades = filterPendingTrades(period);
  const openTrades = filterByPeriod(S.trades.filter(t => Baron.isOpenTrade?.(t)), period);
  const completed = trades.map(t => ({ ...t, pnl: resolveTradePnl(t) }));
  const hasClosed = completed.length > 0;
  const fmtKpi = (val, formatter) => hasClosed ? formatter(val) : '—';

  const journalPnl  = completed.reduce((s,t) => s + t.pnl, 0);
  const baseBal     = portfolioBaseBal();
  const liveEquity  = S.balFromAlpaca ? Number(S.bal) : null;
  const totalPnl    = liveEquity != null ? liveEquity - baseBal : journalPnl;
  const curBal      = liveEquity != null ? liveEquity : baseBal + journalPnl;
  const wins        = completed.filter(t => t.pnl > 0);
  const losses      = completed.filter(t => t.pnl <= 0);
  const winRate     = hasClosed ? (wins.length / completed.length * 100) : 0;
  const avgWin      = wins.length ? wins.reduce((s,t) => s+t.pnl,0) / wins.length : 0;
  const avgLoss     = losses.length ? Math.abs(losses.reduce((s,t) => s+t.pnl,0) / losses.length) : 0;
  const winPnL      = wins.reduce((s, t) => s + t.pnl, 0);
  const lossPnL     = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const profitFactor= lossPnL > 0 ? winPnL / lossPnL : wins.length ? 999 : 0;
  const avgRR       = avgLoss > 0 ? avgWin / avgLoss : 0;
  const stopDisc    = discTrades.filter(t=>t.stopOk).length / Math.max(discTrades.length,1) * 100;
  const sizeDisc    = discTrades.filter(t=>t.sizeOk).length / Math.max(discTrades.length,1) * 100;

  let peak = baseBal, dd = 0, runBal = baseBal;
  completed.forEach(t => {
    runBal += t.pnl;
    if (runBal > peak) peak = runBal;
    const curDD = (peak - runBal) / peak * 100;
    if (curDD > dd) dd = curDD;
  });
  if (liveEquity != null && liveEquity < peak) {
    const liveDd = (peak - liveEquity) / peak * 100;
    if (liveDd > dd) dd = liveDd;
  }

  const pnlPct = baseBal ? (totalPnl / baseBal * 100) : 0;
  const sym = S.sym;
  const fmt = v => sym + Math.round(v).toLocaleString();

  const pnlEl = document.getElementById('port-total-pnl');
  const pnlPctEl = document.getElementById('port-pnl-pct');
  if (pnlPctEl?.parentElement) pnlPctEl.parentElement.replaceChildren(pnlPctEl);
  if (!hasClosed && liveEquity == null) {
    pnlEl.textContent = '—';
    pnlEl.style.color = 'var(--text2)';
    if (discTrades.length) {
      pnlPctEl.textContent = discTrades.length + ' logged · ' + completed.length + ' closed with P&L';
      if (openTrades.length) pnlPctEl.textContent += ' · ' + openTrades.length + ' open';
      if (pendingTrades.length) pnlPctEl.textContent += ' · ' + pendingTrades.length + ' need Journal review';
    } else if (pendingTrades.length) {
      pnlPctEl.textContent = pendingTrades.length + ' synced fills — confirm stops in Journal to unlock stats';
    } else {
      pnlPctEl.textContent = 'Log exits in Journal to see P&L stats';
    }
    pnlPctEl.style.color = 'var(--text2)';
    document.getElementById('port-start-bal').textContent = sym + baseBal.toLocaleString();
    document.getElementById('port-cur-bal').textContent = sym + baseBal.toLocaleString();
    document.getElementById('port-cur-bal').style.color = 'var(--text2)';
  } else {
    pnlEl.textContent = (totalPnl >= 0 ? '+' : '') + sym + Math.round(Math.abs(totalPnl)).toLocaleString();
    pnlEl.style.color = totalPnl >= 0 ? 'var(--text)' : 'var(--red)';
    pnlPctEl.textContent = (pnlPct >= 0 ? '+' : '') + pnlPct.toFixed(1) + '% on ' + sym + baseBal.toLocaleString() + ' base';
    pnlPctEl.style.color = pnlPct >= 0 ? 'var(--accent)' : 'var(--red)';
    document.getElementById('port-start-bal').textContent = sym + baseBal.toLocaleString();
    document.getElementById('port-cur-bal').textContent = sym + Math.round(curBal).toLocaleString();
    document.getElementById('port-cur-bal').style.color = totalPnl >= 0 ? 'var(--accent)' : 'var(--red)';
  }
  document.getElementById('port-open').textContent = S.trades.filter(t => !t.mergedAway && Baron.isOpenTrade?.(t)).length;

  const totalLogged = discTrades.length + pendingTrades.length;
  document.getElementById('kpi-trades').textContent = totalLogged || completed.length;
  const tradesLbl = document.getElementById('kpi-trades-lbl');
  if (tradesLbl) {
    tradesLbl.textContent = hasClosed
      ? completed.length + ' closed'
      : totalLogged
        ? completed.length + ' closed · ' + Math.max(0, totalLogged - completed.length) + ' open'
        : 'Trades';
  }
  document.getElementById('kpi-wr').textContent = fmtKpi(winRate, v => v.toFixed(0) + '%');
  document.getElementById('kpi-wr').style.color = !hasClosed ? 'var(--text3)' : winRate >= 50 ? 'var(--accent)' : 'var(--red)';
  document.getElementById('kpi-pf').textContent = fmtKpi(profitFactor, v => (v >= 999 || !isFinite(v)) ? '—' : v.toFixed(2));
  document.getElementById('kpi-pf').style.color = !hasClosed ? 'var(--text3)' : profitFactor >= 1 ? 'var(--accent)' : 'var(--red)';
  document.getElementById('kpi-avgwin').textContent = fmtKpi(avgWin, fmt);
  document.getElementById('kpi-avgloss').textContent = fmtKpi(avgLoss, fmt);
  document.getElementById('kpi-rr').textContent = fmtKpi(avgRR, v => v.toFixed(1));
  document.getElementById('kpi-stop').textContent = discTrades.length ? stopDisc.toFixed(0) + '%' : '—';
  document.getElementById('kpi-stop').style.color = discTrades.length ? (stopDisc >= 80 ? 'var(--accent)' : stopDisc >= 60 ? 'var(--amber)' : 'var(--red)') : 'var(--text3)';
  document.getElementById('kpi-size').textContent = discTrades.length ? sizeDisc.toFixed(0) + '%' : '—';
  document.getElementById('kpi-size').style.color = discTrades.length ? (sizeDisc >= 80 ? 'var(--accent)' : sizeDisc >= 60 ? 'var(--amber)' : 'var(--red)') : 'var(--text3)';
  const incEl = document.getElementById('kpi-incomplete');
  if (incEl) {
    const incRate = totalLogged ? (pendingTrades.length / totalLogged * 100) : 0;
    incEl.textContent = totalLogged ? incRate.toFixed(0) + '%' : '—';
    incEl.style.color = !totalLogged ? 'var(--text3)' : pendingTrades.length ? 'var(--amber)' : 'var(--accent)';
  }
  document.getElementById('kpi-dd').textContent = fmtKpi(dd, v => '-' + v.toFixed(1) + '%');
  document.getElementById('kpi-dd').style.color = !hasClosed ? 'var(--text3)' : dd > 10 ? 'var(--red)' : dd > 5 ? 'var(--amber)' : 'var(--text3)';

  // Equity curve
  requestAnimationFrame(() => drawPortEquity(completed));
  try {
    const waveTrades = filterByPeriod((S.trades || []).filter((t) => t && !t.mergedAway && !t.disciplineOnly), period)
      .map((t) => Object.assign({}, t, { pnl: resolveTradePnl(t) ?? t.pnl }));
    if (window.RunnrWave) RunnrWave.render(waveTrades);
  } catch (e) { console.warn('session wave', e); }

  // Discipline donut
  const discPct  = discTrades.length ? discTrades.filter(t=>t.stopOk&&t.sizeOk).length/discTrades.length*100 : 0;
  const discPnl  = completed.filter(t=>t.stopOk&&t.sizeOk).reduce((s,t)=>s+t.pnl,0);
  const undiscPnl= completed.filter(t=>!t.stopOk||!t.sizeOk).reduce((s,t)=>s+t.pnl,0);
  document.getElementById('donut-disc-pct').textContent = discPct.toFixed(0) + '%';
  document.getElementById('disc-pnl-good').textContent = hasClosed
    ? (discPnl>=0?'+':'')+sym+Math.round(Math.abs(discPnl)).toLocaleString()
    : '—';
  document.getElementById('disc-pnl-good').style.color = hasClosed && discPnl>=0?'var(--accent)':'var(--text3)';
  document.getElementById('disc-pnl-bad').textContent = hasClosed
    ? (undiscPnl>=0?'+':'')+sym+Math.round(Math.abs(undiscPnl)).toLocaleString()
    : '—';
  document.getElementById('disc-pnl-bad').style.color = hasClosed && undiscPnl>=0?'var(--accent)':'var(--text3)';
  document.getElementById('disc-insight-text').textContent =
    !hasClosed && discTrades.length
      ? `${discTrades.length} trades logged — stop discipline ${stopDisc.toFixed(0)}%, size discipline ${sizeDisc.toFixed(0)}%. Add exits in Journal to unlock P&L stats.`
      : discPct >= 80
      ? `${discPct.toFixed(0)}% of your trades followed all sizing and stop rules. Your disciplined trades generated ${(discPnl>=0?'+':'')+sym+Math.round(Math.abs(discPnl)).toLocaleString()}.`
      : `Only ${discPct.toFixed(0)}% of trades were fully disciplined. Undisciplined trades cost you ${sym+Math.round(Math.abs(undiscPnl)).toLocaleString()} in lost edge.`;
  const stopDiscPct = discTrades.length ? discTrades.filter(t=>t.stopOk).length/discTrades.length*100 : 0;
  const sizeDiscPct = discTrades.length ? discTrades.filter(t=>t.sizeOk).length/discTrades.length*100 : 0;
  const discCount   = discTrades.filter(t=>t.stopOk&&t.sizeOk).length;
  const undiscCount = discTrades.length - discCount;
  const stopCount   = discTrades.filter(t=>t.stopOk).length;
  const sizeCount   = discTrades.filter(t=>t.sizeOk).length;

  // Update legend items
  if (document.getElementById('disc-trade-count'))
    document.getElementById('disc-trade-count').textContent = discTrades.length + ' trades';
  if (document.getElementById('disc-count-good'))
    document.getElementById('disc-count-good').textContent = discCount + ' / ' + discTrades.length + ' trades';
  if (document.getElementById('disc-count-bad'))
    document.getElementById('disc-count-bad').textContent = undiscCount + ' / ' + discTrades.length + ' trades';
  if (document.getElementById('disc-stop-pct')) {
    document.getElementById('disc-stop-pct').textContent = stopDiscPct.toFixed(0) + '%';
    document.getElementById('disc-stop-count').textContent = stopCount + ' / ' + discTrades.length + ' confirmed';
  }
  if (document.getElementById('disc-size-pct')) {
    document.getElementById('disc-size-pct').textContent = sizeDiscPct.toFixed(0) + '%';
    document.getElementById('disc-size-count').textContent = sizeCount + ' / ' + discTrades.length + ' correct';
  }

  requestAnimationFrame(() => drawDonut(discPct, stopDiscPct, sizeDiscPct));

  // Best / worst
  if (completed.length) {
    const best  = completed.reduce((a,b) => b.pnl > a.pnl ? b : a);
    const worst = completed.reduce((a,b) => b.pnl < a.pnl ? b : a);
    document.getElementById('best-sym').textContent  = best.instr;
    document.getElementById('best-date').textContent = best.date;
    document.getElementById('best-pnl').textContent  = '+' + sym + Math.abs(best.pnl).toLocaleString();
    document.getElementById('worst-sym').textContent  = worst.instr;
    document.getElementById('worst-date').textContent = worst.date;
    document.getElementById('worst-pnl').textContent  = (worst.pnl<0?'-':'') + sym + Math.abs(worst.pnl).toLocaleString();
    document.getElementById('worst-pnl').style.color  = worst.pnl < 0 ? 'var(--red)' : 'var(--accent)';
  } else {
    ['best-sym','best-date','worst-sym','worst-date'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = '—';
    });
    document.getElementById('best-pnl').textContent = '—';
    document.getElementById('worst-pnl').textContent = '—';
  }

  // Closed trades by instrument — opens live only in Open book
  const instrMap = {};
  completed.forEach(t => {
    if (!instrMap[t.instr]) instrMap[t.instr] = { pnl:0, count:0, wins:0 };
    instrMap[t.instr].pnl   += t.pnl;
    instrMap[t.instr].count += 1;
    if (t.pnl > 0) instrMap[t.instr].wins += 1;
  });
  const instrArr = Object.entries(instrMap).sort((a,b) => Math.abs(b[1].pnl) - Math.abs(a[1].pnl));
  const maxAbsPnl = Math.max(...instrArr.map(([,v]) => Math.abs(v.pnl)), 1);
  document.getElementById('port-instr-breakdown').innerHTML = instrArr.length ? instrArr.map(([instr,v],i) => {
    const barW = (Math.abs(v.pnl)/maxAbsPnl*100).toFixed(0);
    const col = INSTR_COLORS[i % INSTR_COLORS.length];
    const wr = v.count ? (v.wins/v.count*100).toFixed(0) : '—';
    return `<div class="instr-row">
      <div class="instr-dot" style="background:${col}"></div>
      <div style="flex:1">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px">
          <span class="instr-name">${instr}</span>
          <span class="instr-pnl" style="color:${v.pnl>=0?'var(--accent)':'var(--red)'}">${v.pnl>=0?'+':''}${S.sym}${Math.abs(Math.round(v.pnl)).toLocaleString()}</span>
        </div>
        <div style="height:4px;background:var(--surface3);border-radius:2px;overflow:hidden">
          <div style="height:100%;width:${barW}%;background:${col};border-radius:2px;opacity:${v.pnl>=0?1:0.6}"></div>
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:2px">
          <span class="instr-trades">${v.count} closed</span>
          <span class="instr-trades">${wr}% win rate</span>
        </div>
      </div>
    </div>`;
  }).join('') : '<div style="font-size:12px;color:var(--text3);padding:8px 0">No closed trades in this period</div>';

  // Long vs Short
  const longT  = completed.filter(t=>t.dir==='long');
  const shortT = completed.filter(t=>t.dir==='short');
  const longPnl  = longT.reduce((s,t)=>s+t.pnl,0);
  const shortPnl = shortT.reduce((s,t)=>s+t.pnl,0);
  document.getElementById('pnl-long').textContent  = longT.length ? (longPnl>=0?'+':'')+sym+Math.round(Math.abs(longPnl)).toLocaleString() : '—';
  document.getElementById('pnl-long').style.color  = longT.length && longPnl>=0?'var(--accent)':'var(--text3)';
  document.getElementById('count-long').textContent  = longT.length + ' trade' + (longT.length!==1?'s':'');
  document.getElementById('pnl-short').textContent = shortT.length ? (shortPnl>=0?'+':'')+sym+Math.round(Math.abs(shortPnl)).toLocaleString() : '—';
  document.getElementById('pnl-short').style.color = shortT.length && shortPnl>=0?'var(--accent)':'var(--text3)';
  document.getElementById('count-short').textContent = shortT.length + ' trade' + (shortT.length!==1?'s':'');

  renderPortOpenBook(openTrades, completed, sym);
  renderPortRecent(period, sym);
  renderPortCta();

  // Calendar heatmap — all journal activity in the selected period
  renderCalendar(completed, (S.trades || []).filter((t) => t && !t.mergedAway), period);
}

function recentJournalTrades(period, limit) {
  const list = filterByPeriod((S.trades || []).filter((t) => t && !t.mergedAway), period);
  const ts = (t) => {
    const d = typeof tradeHeatDate === 'function' ? tradeHeatDate(t) : null;
    if (d && !Number.isNaN(d.getTime())) return d.getTime();
    const n = Number(t && t.id);
    return Number.isFinite(n) ? n : 0;
  };
  return list.slice().sort((a, b) => ts(b) - ts(a)).slice(0, limit || 5);
}

function portRecentFlags(t) {
  if (!t) return '';
  const stop = t.incomplete && !t.challengeFail
    ? '<span class="flag flag-incomplete">Stop ?</span>'
    : (t.stopOk ? '<span class="flag flag-ok">Stop</span>' : '<span class="flag flag-no">Stop</span>');
  const size = t.challengeFail
    ? '<span class="flag flag-no">FAIL</span>'
    : (t.incomplete
      ? '<span class="flag flag-incomplete">Size ?</span>'
      : (t.sizeOk ? '<span class="flag flag-ok">Size</span>' : '<span class="flag flag-no">Size</span>'));
  return stop + size + (t.incomplete ? '<span class="flag flag-miss">Incomplete</span>' : '');
}

function openPortRecentTrade(id) {
  const t = (S.trades || []).find((x) => tradeId(x.id) === tradeId(id));
  if (!t) {
    switchPage('journal');
    return;
  }
  const DR = typeof DisciplineReplay !== 'undefined' ? DisciplineReplay : null;
  if (DR && DR.canReplay(t, S, typeof Baron !== 'undefined' ? Baron : null)) {
    openDisciplineReplay(id);
    return;
  }
  if (typeof openTradeEditor === 'function') openTradeEditor(id);
  else switchPage('journal');
}
window.openPortRecentTrade = openPortRecentTrade;

function renderPortRecent(period, sym) {
  const list = document.getElementById('port-recent-list');
  if (!list) return;
  const rows = recentJournalTrades(period, 5);
  if (!rows.length) {
    list.innerHTML = '<div class="port-recent-empty">No journal fills in this period</div>';
    return;
  }
  const money = sym || S.sym || '';
  list.innerHTML = rows.map((t) => {
    const safeId = String(t.id).replace(/[^0-9A-Za-z_-]/g, '');
    const name = String(t.instr || 'Fill').replace(/[&<>]/g, '');
    const open = typeof Baron !== 'undefined' && Baron.isOpenTrade?.(t);
    const pnl = resolveTradePnl(t);
    const pnlStr = open
      ? 'open'
      : (t.incomplete && (t.source === 'alpaca' || t.source === 'ibkr' || t.source === 't212')
        ? 'review'
        : ((pnl >= 0 ? '+' : '') + money + Math.round(Math.abs(Number(pnl) || 0)).toLocaleString()));
    const pnlCls = open || pnlStr === 'review' ? '' : (pnl >= 0 ? 'pos' : 'neg');
    return `<button type="button" class="port-recent-row" onclick="openPortRecentTrade('${safeId}')">
      <div class="port-recent-meta">
        <div class="port-recent-sym">${name}</div>
        <div class="port-recent-sub">${t.date || '—'} · ${(t.dir || '').toUpperCase() || '—'}</div>
        <div class="flags">${portRecentFlags(t)}</div>
      </div>
      <div class="port-recent-right">
        <span class="te-pnl ${pnlCls}">${pnlStr}</span>
      </div>
    </button>`;
  }).join('');
}

function renderPortCta() {
  const wrap = document.getElementById('port-cta-wrap');
  const cta = document.getElementById('port-cta');
  if (!wrap || !cta) return;
  if (typeof isGuestLanding === 'function' && isGuestLanding()) {
    wrap.hidden = true;
    return;
  }
  wrap.hidden = false;
  const job = window.RunnrDeskQuiet
    ? RunnrDeskQuiet.primaryJob(S.trades, S, typeof Baron !== 'undefined' ? Baron : null)
    : { id: 'size', cta: 'Size the next trade' };
  cta.textContent = job.cta || 'Size the next trade';
  cta.dataset.job = job.id || 'size';
  cta.onclick = function () { runHomeJob(job); };
}

function drawPortEquity(trades) {
  const canvas = document.getElementById('port-equity-canvas');
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.offsetWidth || 340;
  const H = 110;
  canvas.width = W*dpr; canvas.height = H*dpr;
  canvas.style.height = H+'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr,dpr);

  // Build equity line
  const startBal = portfolioBaseBal();
  let bal = startBal;
  const points = [bal];
  trades.forEach(t => { bal += t.pnl; points.push(bal); });

  if (points.length < 2) {
    ctx.fillStyle = 'var(--text3)';
    ctx.font = '12px DM Sans';
    ctx.textAlign = 'center';
    ctx.fillText('Log more trades to see your equity curve', W/2, H/2);
    return;
  }

  const mn = Math.min(...points) * 0.995;
  const mx = Math.max(...points) * 1.005;
  const toX = i => (i/(points.length-1))*W;
  const toY = v => H-8 - ((v-mn)/(mx-mn))*(H-16);

  // Flat baseline
  ctx.beginPath();
  ctx.setLineDash([4,4]);
  ctx.moveTo(0, toY(startBal)); ctx.lineTo(W, toY(startBal));
  ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth=1; ctx.stroke();
  ctx.setLineDash([]);

  // Area fill
  const lastY = toY(points[points.length-1]);
  const isUp = points[points.length-1] >= startBal;
  const grad = ctx.createLinearGradient(0,0,0,H);
  grad.addColorStop(0, isUp ? 'rgba(0,229,160,0.3)' : 'rgba(255,77,109,0.25)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.beginPath();
  ctx.moveTo(toX(0), H);
  points.forEach((v,i) => ctx.lineTo(toX(i), toY(v)));
  ctx.lineTo(toX(points.length-1), H);
  ctx.fillStyle = grad; ctx.fill();

  // Line
  ctx.beginPath();
  points.forEach((v,i) => i===0 ? ctx.moveTo(toX(i),toY(v)) : ctx.lineTo(toX(i),toY(v)));
  ctx.strokeStyle = isUp ? '#00e5a0' : '#ff4d6d';
  ctx.lineWidth = 2; ctx.lineJoin='round'; ctx.stroke();

  // End dot
  ctx.beginPath();
  ctx.arc(toX(points.length-1), toY(points[points.length-1]), 4, 0, 2*Math.PI);
  ctx.fillStyle = isUp ? '#00e5a0' : '#ff4d6d'; ctx.fill();

  // Start/end labels
  ctx.font = `${10*dpr/dpr}px Cormorant Garamond, serif`;
  ctx.textAlign='left'; ctx.fillStyle='rgba(255,255,255,0.4)';
  ctx.fillText(S.sym+Math.round(points[0]).toLocaleString(), 4, toY(points[0])-4);
  ctx.textAlign='right';
  ctx.fillStyle = isUp ? '#00e5a0' : '#ff4d6d';
  ctx.fillText(S.sym+Math.round(points[points.length-1]).toLocaleString(), W-4, toY(points[points.length-1])-4);
}

function drawDonut(pct, stopPct, sizePct) {
  const canvas = document.getElementById('port-donut');
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const SIZE = 140;
  canvas.width = SIZE*dpr; canvas.height = SIZE*dpr;
  canvas.style.width = SIZE+'px'; canvas.style.height = SIZE+'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr,dpr);

  const cx = SIZE/2, cy = SIZE/2;
  const PI2 = Math.PI * 2;
  const start = -Math.PI / 2; // top

  // ── Outer ring: overall discipline (thick) ──
  const outerR = 58, outerW = 14;

  // Track
  ctx.beginPath(); ctx.arc(cx,cy,outerR,0,PI2);
  ctx.strokeStyle='rgba(255,255,255,0.06)'; ctx.lineWidth=outerW; ctx.stroke();

  // Disciplined segment
  const discAngle = (pct/100)*PI2;
  if (discAngle > 0) {
    const grad = ctx.createLinearGradient(cx-outerR,cy,cx+outerR,cy);
    grad.addColorStop(0,'#00b87a'); grad.addColorStop(1,'#00e5a0');
    ctx.beginPath(); ctx.arc(cx,cy,outerR,start,start+discAngle);
    ctx.strokeStyle=grad; ctx.lineWidth=outerW;
    ctx.lineCap='butt'; ctx.stroke();
  }

  // Undisciplined segment
  if (pct < 100) {
    const undiscAngle = ((100-pct)/100)*PI2;
    ctx.beginPath(); ctx.arc(cx,cy,outerR,start+discAngle,start+PI2);
    ctx.strokeStyle='rgba(255,77,109,0.55)'; ctx.lineWidth=outerW;
    ctx.lineCap='butt'; ctx.stroke();
  }

  // ── Middle ring: stop discipline ──
  const midR = 40, midW = 8;
  const sp = (stopPct||0)/100;

  ctx.beginPath(); ctx.arc(cx,cy,midR,0,PI2);
  ctx.strokeStyle='rgba(255,255,255,0.05)'; ctx.lineWidth=midW; ctx.stroke();

  if (sp > 0) {
    ctx.beginPath(); ctx.arc(cx,cy,midR,start,start+sp*PI2);
    ctx.strokeStyle='rgba(255,181,71,0.85)'; ctx.lineWidth=midW;
    ctx.lineCap='butt'; ctx.stroke();
  }
  if (sp < 1) {
    ctx.beginPath(); ctx.arc(cx,cy,midR,start+sp*PI2,start+PI2);
    ctx.strokeStyle='rgba(255,181,71,0.18)'; ctx.lineWidth=midW;
    ctx.lineCap='butt'; ctx.stroke();
  }

  // ── Inner ring: size discipline ──
  const innerR = 24, innerW = 7;
  const szp = (sizePct||0)/100;

  ctx.beginPath(); ctx.arc(cx,cy,innerR,0,PI2);
  ctx.strokeStyle='rgba(255,255,255,0.04)'; ctx.lineWidth=innerW; ctx.stroke();

  if (szp > 0) {
    ctx.beginPath(); ctx.arc(cx,cy,innerR,start,start+szp*PI2);
    ctx.strokeStyle='rgba(77,166,255,0.85)'; ctx.lineWidth=innerW;
    ctx.lineCap='butt'; ctx.stroke();
  }
  if (szp < 1) {
    ctx.beginPath(); ctx.arc(cx,cy,innerR,start+szp*PI2,start+PI2);
    ctx.strokeStyle='rgba(77,166,255,0.15)'; ctx.lineWidth=innerW;
    ctx.lineCap='butt'; ctx.stroke();
  }

  // ── Ring separators (subtle gaps) ──
  for (let a=0; a<PI2; a+=PI2/8) {
    ctx.save();
    ctx.translate(cx,cy); ctx.rotate(a);
    ctx.beginPath(); ctx.moveTo(outerR-outerW/2-1,0); ctx.lineTo(outerR+outerW/2+1,0);
    ctx.strokeStyle=`rgba(10,22,18,0.9)`; ctx.lineWidth=1.5; ctx.stroke();
    ctx.restore();
  }

  // ── Glow effect on disciplined arc end point ──
  if (pct > 0 && pct < 100) {
    const ex = cx + outerR * Math.cos(start + discAngle);
    const ey = cy + outerR * Math.sin(start + discAngle);
    const glow = ctx.createRadialGradient(ex,ey,0,ex,ey,10);
    glow.addColorStop(0,'rgba(0,229,160,0.5)');
    glow.addColorStop(1,'rgba(0,229,160,0)');
    ctx.beginPath(); ctx.arc(ex,ey,10,0,PI2);
    ctx.fillStyle=glow; ctx.fill();
  }
}

function renderPortOpenBook(openTrades, completed, sym) {
  const list = document.getElementById('port-open-list');
  const title = document.getElementById('port-open-title');
  if (!list) return;
  const opens = openTrades || [];
  if (title) title.textContent = 'Open book';
  if (!opens.length) {
    list.innerHTML = '<div style="font-size:12px;color:var(--text3);padding:6px 0">No open trades in this period</div>';
    return;
  }
  list.innerHTML = opens.map((t) => {
    const dir = t.dir === 'short' ? 'SHORT' : 'LONG';
    const entry = t.entry != null && t.entry !== '' ? t.entry : '—';
    return `<div class="port-side-row">
      <div>
        <div class="instr-name">${t.instr || '—'}</div>
        <div class="instr-trades">${dir} · ${t.date || 'open'} · @ ${entry}</div>
      </div>
      <span class="instr-trades">open</span>
    </div>`;
  }).join('');
}

function calendarDayKey(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function heatmapRange(period) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today);
  if (period === '1m') start.setDate(today.getDate() - 29);
  else if (period === '3m') start.setDate(today.getDate() - 89);
  else if (period === 'ytd') start.setMonth(0, 1);
  else start.setDate(today.getDate() - (26 * 7 - 1));
  return { today, start };
}

function tradeHeatDate(t) {
  const parsed = window.CoachEngine?.tradeDate?.(t);
  if (parsed && !Number.isNaN(parsed.getTime())) return parsed;
  if (!t) return null;
  if (t.filledAt) {
    const iso = new Date(t.filledAt);
    if (!Number.isNaN(iso.getTime())) return iso;
  }
  const s = String(t.date || '').trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function renderCalendar(closedTrades, allTrades, period) {
  const cal = document.getElementById('port-cal');
  if (!cal) return;
  const closedIds = new Set((closedTrades || []).map((t) => t && t.id));
  const byDay = {};
  (allTrades || []).forEach((t) => {
    const parsed = tradeHeatDate(t);
    if (!parsed || Number.isNaN(parsed.getTime())) return;
    const key = calendarDayKey(parsed);
    if (!byDay[key]) byDay[key] = { pnl: 0, n: 0, closed: 0 };
    byDay[key].n += 1;
    if (closedIds.has(t.id) || (t.pnl != null && t.exit != null && t.exit !== '')) {
      const pnl = Number(t.pnl);
      byDay[key].pnl += Number.isFinite(pnl) ? pnl : 0;
      byDay[key].closed += 1;
    }
  });

  const { today, start: windowStart } = heatmapRange(period);
  const gridStart = new Date(windowStart);
  gridStart.setDate(gridStart.getDate() - ((gridStart.getDay() + 6) % 7));
  const gridEnd = new Date(today);
  const padEnd = (7 - gridEnd.getDay()) % 7;
  gridEnd.setDate(gridEnd.getDate() + padEnd);

  let html = '';
  let activeDays = 0;
  for (let d = new Date(gridStart); d <= gridEnd; d.setDate(d.getDate() + 1)) {
    const key = calendarDayKey(d);
    const inWindow = d >= windowStart && d <= today;
    const hit = inWindow ? byDay[key] : null;
    if (hit) activeDays += 1;
    let cls = 'cal-day';
    if (!inWindow) cls += ' pad';
    else if (!hit) cls += ' flat';
    else if (hit.closed && hit.pnl > 0) cls += ' win';
    else if (hit.closed && hit.pnl < 0) cls += ' loss';
    else cls += ' traded';
    if (inWindow && d.getTime() === today.getTime()) cls += ' today';
    const label = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
    const title = hit
      ? `${label}: ${hit.n} logged · ${hit.closed ? (hit.pnl >= 0 ? '+' : '') + Math.round(hit.pnl) : 'open / no P&L yet'}`
      : label;
    html += `<div class="${cls}" title="${title}"></div>`;
  }
  cal.innerHTML = html;
  const meta = document.getElementById('port-cal-meta');
  if (meta) {
    const span = period === '1m' ? '1M' : period === '3m' ? '3M' : period === 'ytd' ? 'YTD' : '26 weeks';
    meta.textContent = activeDays
      ? activeDays + ' active day' + (activeDays === 1 ? '' : 's') + ' · ' + span
      : span + ' · no journal activity in this window';
  }
}
