/**
 * Runnr app — navigation, guest shell, Home job.
 * Extracted from index.html (slice 1). Classic script; globals kept for onclick=.
 */
// ── NAVIGATION ─────────────────────────────────────────────────────────────
var pageMap = { home:'page-home', sizer:'page-sizer', journal:'page-journal', coach:'page-coach', portfolio:'page-portfolio', watchlist:'page-watchlist', sync:'page-sync', crypto:'page-crypto', desk:'page-desk', shelf:'page-shelf' };
/* Phone More destinations are not #nav buttons. Highlight More while those pages are open. */
var PHONE_MORE_PAGES = { watchlist: 1, portfolio: 1, shelf: 1 };
var DESKTOP_NAV_MQ = '(min-width: 1024px)';
var currentNavKey = 'home';
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
  try {
    if (window.RunnrDemoSandbox) {
      RunnrDemoSandbox.paintChrome(S);
      RunnrDemoSandbox.bindChrome();
    }
  } catch (e) {}
  applyQuietDesk();
}
window.applyGuestShell = applyGuestShell;

function applyQuietDesk() {
  const guest = typeof isGuestLanding === 'function' && isGuestLanding();
  const demo = !!(window.RunnrSync && typeof RunnrSync.isDemoState === 'function' && RunnrSync.isDemoState(S));
  const quiet = !guest && !demo && window.RunnrDeskQuiet && RunnrDeskQuiet.isQuiet(S && S.trades);
  try { document.documentElement.classList.toggle('runnr-quiet', !!quiet); } catch (e) {}
  return !!quiet;
}
window.applyQuietDesk = applyQuietDesk;

function isDesktopShell() {
  try {
    return !!(window.matchMedia && window.matchMedia(DESKTOP_NAV_MQ).matches);
  } catch (e) {
    return false;
  }
}

function isPhoneMorePage(key) {
  return !!PHONE_MORE_PAGES[key];
}

function moreSheetEl() {
  return document.getElementById('more-sheet');
}

function isMoreSheetOpen() {
  const el = moreSheetEl();
  return !!(el && el.classList.contains('open') && !el.hidden);
}

function paintNavActive(key) {
  const page = key || currentNavKey;
  const highlightMore = !isDesktopShell() && (isMoreSheetOpen() || isPhoneMorePage(page));
  document.querySelectorAll('#nav .nav-btn').forEach((b) => {
    const nav = b.getAttribute('data-nav');
    const on = highlightMore ? nav === 'more' : nav === page;
    b.classList.toggle('active', !!on);
  });
}

function moreNavBtn() {
  return document.querySelector('#nav .nav-btn-more');
}

function syncMoreAria() {
  const btn = moreNavBtn();
  if (btn) btn.setAttribute('aria-expanded', isMoreSheetOpen() ? 'true' : 'false');
}

function openMoreSheet() {
  if (isDesktopShell()) return;
  const el = moreSheetEl();
  if (!el) return;
  el.hidden = false;
  el.classList.add('open');
  el.setAttribute('aria-hidden', 'false');
  syncMoreAria();
  paintNavActive(currentNavKey);
}

function closeMoreSheet() {
  const el = moreSheetEl();
  if (!el) return;
  el.classList.remove('open');
  el.hidden = true;
  el.setAttribute('aria-hidden', 'true');
  syncMoreAria();
  paintNavActive(currentNavKey);
}

function toggleMoreSheet() {
  if (isMoreSheetOpen()) closeMoreSheet();
  else openMoreSheet();
}

function expandDeskMore() {
  toggleMoreSheet();
}

function bindMoreSheetGestures() {
  const panel = document.getElementById('more-sheet-panel');
  if (!panel || panel.dataset.bound === '1') return;
  panel.dataset.bound = '1';
  let startY = 0;
  panel.addEventListener('touchstart', function (e) {
    startY = e.touches && e.touches[0] ? e.touches[0].clientY : 0;
  }, { passive: true });
  panel.addEventListener('touchend', function (e) {
    const y = e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientY : startY;
    if (y - startY > 56) closeMoreSheet();
  }, { passive: true });
}

document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape' && isMoreSheetOpen()) closeMoreSheet();
});
bindMoreSheetGestures();

window.isDesktopShell = isDesktopShell;
window.isPhoneMorePage = isPhoneMorePage;
window.paintNavActive = paintNavActive;
window.openMoreSheet = openMoreSheet;
window.closeMoreSheet = closeMoreSheet;
window.toggleMoreSheet = toggleMoreSheet;
window.expandDeskMore = expandDeskMore;

function renderHomeJob() {
  const hero = document.getElementById('home-job-hero');
  if (!hero) return;
  const demoDesk = !!(window.RunnrDemoSandbox && typeof RunnrDemoSandbox.isDemoState === 'function' && RunnrDemoSandbox.isDemoState(S));
  if (typeof isGuestLanding === 'function' && isGuestLanding() && !demoDesk) {
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
  if (terminalLink) terminalLink.hidden = countable < 1 && !demoDesk;
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
    if (window.RunnrPretrade && typeof RunnrPretrade.open === 'function') {
      RunnrPretrade.open();
      return;
    }
    switchPage('journal');
    if (typeof openLogModal === 'function') openLogModal('cfd');
    return;
  }
  if (job.id === 'sample-score') {
    if (window.RunnrDemoSandbox && typeof RunnrDemoSandbox.openScoreTrade === 'function') {
      RunnrDemoSandbox.openScoreTrade(S);
    }
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
  if (window.RunnrPretrade && typeof RunnrPretrade.open === 'function') {
    RunnrPretrade.open();
    return;
  }
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
  currentNavKey = key;
  closeMoreSheet();
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(pageMap[key] || 'page-home').classList.add('active');
  paintNavActive(key);
  if (key === 'journal') renderJournal();
  if (key === 'sizer') {
    renderChallengePanel();
    try { calcCFD(); } catch (e) {}
  }
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
    try {
      if (location.hash !== '#desk') {
        history.replaceState(null, '', location.pathname + location.search + '#desk');
      }
    } catch (e) {}
    if (window.RunnrDesk) RunnrDesk.enter();
  } else if (window.RunnrDesk) {
    RunnrDesk.leave();
  }
  if (key === 'sizer') {
    if (window.RunnrPretrade) RunnrPretrade.enter();
  } else if (window.RunnrPretrade) {
    RunnrPretrade.leave();
  }
}
window.switchPage = switchPage;
