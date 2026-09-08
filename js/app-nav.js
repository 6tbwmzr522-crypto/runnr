/**
 * Runnr app — navigation, guest shell, Home job.
 * Extracted from index.html (slice 1). Classic script; globals kept for onclick=.
 */
// ── NAVIGATION ─────────────────────────────────────────────────────────────
var pageMap = { home:'page-home', sizer:'page-sizer', journal:'page-journal', coach:'page-coach', portfolio:'page-portfolio', watchlist:'page-watchlist', sync:'page-sync', crypto:'page-crypto', desk:'page-desk', shelf:'page-shelf' };
var navIdx  = { home:0, sizer:1, watchlist:2, journal:3, coach:4, portfolio:5 };
var portPeriod = 'all';

function refreshPortfolioIfVisible() {
  if (document.getElementById('page-portfolio')?.classList.contains('active')) {
    loadPortfolio(portPeriod, document.querySelector('.period-tab.active'));
  }
}

function isGuestLanding() {
  if (window.RunnrSync?.isLoggedIn?.()) return false;
  try { if (localStorage.getItem('runnr_api_token')) return false; } catch (e) {}
  return true;
}
window.isGuestLanding = isGuestLanding;

function applyGuestShell() {
  const guest = isGuestLanding();
  try {
    document.documentElement.classList.toggle('runnr-guest', guest);
    if (!guest) document.documentElement.classList.remove('runnr-show-hook');
  } catch (e) {}
  applyQuietDesk();
}
window.applyGuestShell = applyGuestShell;

function applyQuietDesk() {
  const guest = typeof isGuestLanding === 'function' && isGuestLanding();
  const quiet = !guest && window.RunnrDeskQuiet && RunnrDeskQuiet.isQuiet(S && S.trades);
  try { document.documentElement.classList.toggle('runnr-quiet', !!quiet); } catch (e) {}
  return !!quiet;
}
window.applyQuietDesk = applyQuietDesk;

function expandDeskMore() {
  if (window.RunnrDeskQuiet) RunnrDeskQuiet.expandMore();
  applyQuietDesk();
}
window.expandDeskMore = expandDeskMore;

function renderHomeJob() {
  const hero = document.getElementById('home-job-hero');
  if (!hero) return;
  if (typeof isGuestLanding === 'function' && isGuestLanding()) {
    hero.hidden = true;
    return;
  }
  const job = window.RunnrDeskQuiet
    ? RunnrDeskQuiet.primaryJob(S.trades, S, typeof Baron !== 'undefined' ? Baron : null)
    : { id: 'log', title: 'Log your last trade', sub: 'Size it with a stop, then save it to your journal.', cta: 'Log your last trade' };
  hero.hidden = false;
  hero.dataset.job = job.id;
  const title = document.getElementById('home-job-title');
  const sub = document.getElementById('home-job-sub');
  const cta = document.getElementById('home-job-cta');
  const terminalLink = document.getElementById('home-job-terminal');
  const countable = window.RunnrTradeLimit
    ? RunnrTradeLimit.countJournalTradesForLimit(S.trades)
    : 0;
  if (terminalLink) terminalLink.hidden = countable < 1;
  if (title) title.textContent = job.title;
  if (sub) sub.textContent = job.sub;
  if (cta) {
    cta.textContent = job.cta;
    cta.dataset.job = job.id;
    cta.onclick = function () { runHomeJob(job); };
  }
  try { renderFreeTradeCounters(); } catch (e) {}
}
window.renderHomeJob = renderHomeJob;

function runHomeJob(job) {
  if (!job) return;
  if (job.id === 'log') {
    switchPage('journal');
    if (typeof openLogModal === 'function') openLogModal('cfd');
    return;
  }
  if (job.id === 'review') {
    reviewNextIncompleteFill();
    return;
  }
  if (job.id === 'replay' && job.tradeId != null) {
    openDisciplineReplay(job.tradeId);
    return;
  }
  focusSizerForNextTrade();
}
window.runHomeJob = runHomeJob;

function focusSizerForNextTrade() {
  switchPage('sizer');
  const page = document.getElementById('page-sizer');
  if (page && page.scrollIntoView) page.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const input = document.getElementById('cfd-instr') || document.getElementById('sh-instr');
  if (input) setTimeout(function () { try { input.focus(); } catch (e) {} }, 50);
}
window.focusSizerForNextTrade = focusSizerForNextTrade;

function startMarketFeedsIfAllowed() {
  if (isGuestLanding()) return;
  try { startFeedTimer(); } catch (e) {}
  fetchFearGreed().catch(() => {});
  refreshHomeMarkets().catch(() => {});
}

function switchPage(key) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(pageMap[key] || 'page-home').classList.add('active');
  document.querySelectorAll('.nav-btn').forEach((b,i) => b.classList.toggle('active', i === (navIdx[key] ?? -1) || b.dataset.nav === key));
  if (key === 'journal') renderJournal();
  if (key === 'sizer') { renderChallengePanel(); try { calcCFD(); } catch (e) {} }
  if (key === 'crypto') { renderChallengePanel(); try { calcCrypto(); } catch (e) {} }
  if (key === 'watchlist') {
    renderWatchlist();
    renderNotifSettings();
    if (!feedLastUpdate || watchlistNeedsPriceRefresh()) refreshAllPrices();
    else refreshWatchBriefs();
    maybePullWatchlistFromCloud();
  }
  if (key === 'coach') { renderCoachPage(); drawEquityCurve(); }
  if (key === 'portfolio') loadPortfolio('all', document.querySelector('.period-tab'));
  if (key === 'shelf') { if (window.RunnrShelf) RunnrShelf.render(); }
  if (key === 'home') {
    renderHomePreviews();
    updateHomeStats();
    renderHomeBrokerPreview();
    if (!isGuestLanding()) refreshHomeMarkets();
  }
  if (key === 'sync') {
    renderSyncPage();
    if (!RunnrSync.isLoggedIn()) updateSyncAuthVisibility();
    else restoreAlpacaInBackground();
  }
  if (key === 'desk') {
    if (window.RunnrDesk) RunnrDesk.enter();
  } else if (window.RunnrDesk) {
    RunnrDesk.leave();
  }
}
