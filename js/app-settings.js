/**
 * Runnr app — settings, billing UI, banners, theme.
 * Extracted from index.html (slice 1). Classic script; globals kept for onclick=.
 */
// ── SETTINGS ───────────────────────────────────────────────────────────────
function openAboutModal() { openModal('modal-about'); }
function openPrivacyModal() { location.href = '/privacy/'; }
function openTerms() { location.href = '/terms/'; }
function openRefund() { location.href = '/refund/'; }
function openWhopPricing() { openUpgrade(); }
function openPricing() { openUpgrade(); }
function openUpgrade(featureLabel) {
  const hint = document.getElementById('upgrade-feature-hint');
  if (hint) {
    if (featureLabel) {
      hint.style.display = 'block';
      hint.textContent = featureLabel + ' needs Runnr.';
    } else {
      hint.style.display = 'none';
      hint.textContent = '';
    }
  }
  openModal('modal-upgrade');
  refreshBillingUI();
}
function updateProBadge(isPro) {
  const badge = document.getElementById('header-pro-badge');
  if (!badge) return;
  badge.classList.toggle('on', !!isPro);
}
async function refreshBillingUI() {
  const line = document.getElementById('billing-status-line');
  const freeBox = document.getElementById('settings-billing-free');
  const proBox = document.getElementById('settings-billing-pro');
  const upFree = document.getElementById('upgrade-free-panel');
  const upPro = document.getElementById('upgrade-pro-panel');
  const upProLine = document.getElementById('upgrade-pro-line');
  try {
    await window.RunnrSync?.refreshBilling?.();
  } catch (e) {}
  const b = window.RunnrSync?.billing?.() || { pro: false, plan: 'free', status: 'free', enabled: false };
  const loggedIn = !!window.RunnrSync?.isLoggedIn?.();
  const isPro = loggedIn && (typeof RunnrSync.isPro === 'function' ? !!RunnrSync.isPro() : !!b.pro);
  const paidPro = loggedIn && window.RunnrTradeLimit && typeof RunnrTradeLimit.isPaidPro === 'function'
    ? !!RunnrTradeLimit.isPaidPro()
    : (b.status === 'active' || b.plan === 'boss' || !!b.house);
  const stripeSub = b.status === 'trialing' || paidPro;
  updateProBadge(isPro && stripeSub);
  try { renderHeaderSyncPill(); } catch (e) {}

  if (line) {
    if (!b.enabled) line.textContent = 'Billing not configured on server yet';
    else if (stripeSub) line.textContent = 'Plan: Runnr · ' + (b.plan || 'pro') + ' · ' + (b.status || 'active');
    else if (b.trialActive) {
      const days = Number(b.trialDaysLeft) || 0;
      line.textContent = days === 1 ? 'Plan: Trial · 1 day left' : `Plan: Trial · ${days} days left`;
    } else if (loggedIn) line.textContent = 'Plan: Trial ended — subscribe to keep Runnr';
    else line.textContent = 'Plan: Start free · 7-day trial';
  }
  if (freeBox) freeBox.style.display = (b.enabled !== false && !stripeSub) ? 'block' : 'none';
  if (proBox) proBox.style.display = stripeSub ? 'block' : 'none';
  if (upFree) upFree.style.display = stripeSub ? 'none' : 'block';
  if (upPro) upPro.style.display = stripeSub ? 'block' : 'none';
  if (upProLine) {
    upProLine.textContent = isPro
      ? ('Plan: ' + (b.plan || 'pro') + ' · ' + (b.status || 'active'))
      : '—';
  }
  try { renderStatsFooterLinks(); } catch (e) {}
  try { renderSyncAuthBanner(); } catch (e) {}
  try { updateVerifyBanner(); } catch (e) {}
  try { if (typeof renderCoachPage === 'function') renderCoachPage(); } catch (e) {}
  try { if (typeof renderNotifSettings === 'function') renderNotifSettings(); } catch (e) {}
  try {
    if (typeof drawEquityCurve === 'function' && document.getElementById('page-coach')?.classList.contains('active')) {
      drawEquityCurve();
    }
  } catch (e) {}
  try { maybeOpenExpiredTrialPaywall(); } catch (e) {}
}
async function startStripeCheckout(interval) {
  if (!RunnrSync.isLoggedIn()) {
    closeModal('modal-upgrade');
    openSyncAuthModal();
    showToast('Runnr', 'Sign in first, then subscribe');
    return;
  }
  if (!(await requireVerifiedEmail())) return;
  try {
    showToast('Runnr', 'Opening Stripe Checkout…');
    const url = await RunnrSync.createCheckout(interval === 'year' ? 'year' : 'month');
    window.location.href = url;
  } catch (e) {
    const tip = '\n\n1) Open https://api.runnr.fyi/health in a new tab\n2) Hard-refresh Runnr (⌘⇧R)\n3) Sign in again, then tap Start Runnr';
    alert('Checkout failed: ' + (e.message || e) + tip);
  }
}
async function openStripePortal() {
  if (!RunnrSync.isLoggedIn()) {
    openSyncAuthModal();
    return;
  }
  try {
    const url = await RunnrSync.createPortal();
    window.location.href = url;
  } catch (e) {
    alert('Billing portal: ' + (e.message || e));
  }
}
async function requirePro(featureLabel, opts) {
  opts = opts || {};
  try { await RunnrSync.refreshBilling?.(); } catch (e) {}
  const mailerOn = !!RunnrSync.billing?.().emailConfigured;
  if (!opts.skipEmail && mailerOn && !(await requireVerifiedEmail())) return false;
  if (hasProAccess()) return true;
  openUpgrade(featureLabel || 'This feature');
  return false;
}
function hasProAccess() {
  try {
    if (typeof RunnrSync !== 'undefined' && typeof RunnrSync.isPro === 'function') {
      return !!RunnrSync.isPro();
    }
  } catch (e) {}
  return false;
}
var trialPaywallShown = false;
function maybeOpenExpiredTrialPaywall() {
  if (trialPaywallShown) return;
  try {
    if (!RunnrSync.isLoggedIn?.()) return;
    const b = RunnrSync.billing?.() || {};
    if (b.enabled === false) return;
    if (RunnrSync.isPro?.()) return;
    trialPaywallShown = true;
    openUpgrade("Your 7-day trial has ended");
  } catch (e) {}
}
async function requireVerifiedEmail() {
  try { await RunnrSync.refreshBilling?.(); } catch (e) {}
  if (!RunnrSync.isLoggedIn()) return true;
  if (RunnrSync.isEmailVerified?.()) return true;
  // No Resend key on the API — don't trap Terminal / Alpaca behind a copy-paste link.
  if (!RunnrSync.billing?.().emailConfigured) return true;
  const go = confirm('Verify your email first to unlock sync, CSV, and billing.\n\nResend verification link?');
  if (!go) return false;
  try {
    const data = await RunnrSync.resendVerification();
    if (data?.verify_url) {
      location.href = data.verify_url;
      return false;
    }
    showToast('Runnr', data?.detail || 'Verification email sent');
  } catch (e) {
    alert('Could not resend: ' + (e.message || e));
  }
  return false;
}
window.requireVerifiedEmail = requireVerifiedEmail;
function dismissDemoBanner() {
  try { sessionStorage.setItem('runnr_demo_banner_dismissed', '1'); } catch (e) {}
  updateDemoBanner();
}
function dismissVerifyBanner() {
  try { sessionStorage.setItem('runnr_verify_banner_dismissed', '1'); } catch (e) {}
  hideSyncVerify();
  updateVerifyBanner();
  if (typeof switchPage === 'function') switchPage('home');
}
function rememberVerificationSent(data) {
  try {
    if (data && data.verification_sent) sessionStorage.setItem('runnr_verify_sent', '1');
    else if (data && data.verification_sent === false) sessionStorage.setItem('runnr_verify_sent', '0');
  } catch (e) {}
}
function updateVerifyBanner() {
  const el = document.getElementById('verify-banner');
  const copy = document.getElementById('verify-banner-copy');
  if (!el) return;
  let dismissed = false;
  try { dismissed = sessionStorage.getItem('runnr_verify_banner_dismissed') === '1'; } catch (e) {}
  const loggedIn = !!(window.RunnrSync?.isLoggedIn?.());
  const verified = !!(window.RunnrSync?.isEmailVerified?.());
  const mailerOn = !!(window.RunnrSync?.billing?.()?.emailConfigured);
  const show = loggedIn && mailerOn && !verified && !dismissed;
  el.classList.toggle('show', show);
  if (copy && show) {
    let sent = true;
    try { sent = sessionStorage.getItem('runnr_verify_sent') !== '0'; } catch (e) {}
    const email = (RunnrSync.sessionEmail?.() || 'your inbox').replace(/</g, '');
    copy.textContent = sent
      ? ('Confirm your email to unlock sync, CSV, and billing. We sent a link to ' + email + '.')
      : ('We could not send a confirmation email to ' + email + '. Tap Resend, or continue using Runnr and confirm later.');
  }
}
async function resendFromVerifyBanner() {
  try {
    const data = await RunnrSync.resendVerification();
    rememberVerificationSent({ verification_sent: !!(data && data.verification_sent) });
    showToast('Runnr', data && data.detail ? data.detail : 'Verification email sent');
    updateVerifyBanner();
  } catch (e) {
    rememberVerificationSent({ verification_sent: false });
    showToast('Runnr', String(e.message || e));
    updateVerifyBanner();
  }
}
window.dismissVerifyBanner = dismissVerifyBanner;
window.resendFromVerifyBanner = resendFromVerifyBanner;
function updateDemoBanner() {
  const el = document.getElementById('demo-banner');
  const badge = document.getElementById('home-demo-badge');
  const isDemo = (typeof RunnrSync?.isDemoState === 'function' && RunnrSync.isDemoState(S))
    || (typeof RunnrDemoSandbox !== 'undefined' && RunnrDemoSandbox.isDemoState && RunnrDemoSandbox.isDemoState(S));
  let dismissed = false;
  try { dismissed = sessionStorage.getItem('runnr_demo_banner_dismissed') === '1'; } catch (e) {}
  const chrome = document.getElementById('demo-chrome');
  if (el) el.classList.toggle('show', isDemo && !dismissed && !chrome);
  if (badge) badge.style.display = isDemo ? 'inline-block' : 'none';
  const portBadge = document.getElementById('port-demo-badge');
  if (portBadge) portBadge.style.display = isDemo ? 'inline-block' : 'none';
  try {
    if (window.RunnrDemoSandbox) {
      RunnrDemoSandbox.paintChrome(S);
      RunnrDemoSandbox.bindChrome();
    }
  } catch (e) {}
}
window.openAboutModal = openAboutModal;
window.openPrivacyModal = openPrivacyModal;
window.openTerms = openTerms;
window.openRefund = openRefund;
window.openWhopPricing = openWhopPricing;
window.openPricing = openPricing;
window.openUpgrade = openUpgrade;
window.startStripeCheckout = startStripeCheckout;
window.openStripePortal = openStripePortal;
window.requirePro = requirePro;
window.hasProAccess = hasProAccess;
window.refreshBillingUI = refreshBillingUI;
window.updateProBadge = updateProBadge;
window.dismissDemoBanner = dismissDemoBanner;

function changeLanguage(code) {
  if (!window.RunnrI18n) return;
  S.lang = RunnrI18n.setLang(code);
  persist();
  updateHomeStats();
  renderNotifSettings();
  renderHeaderSyncPill();
  const banner = document.getElementById('session-banner');
  if (banner?.classList.contains('show')) {
    const txt = banner.querySelector('.session-banner-text');
    if (txt) txt.textContent = t('header.sessionBanner');
  }
}
window.changeLanguage = changeLanguage;

function saveSettings() {
  S.bal = parseFloat(document.getElementById('set-bal').value) || S.bal;
  const portBase = parseFloat(document.getElementById('set-port-base').value);
  if (portBase > 0) S.journalBaseBal = Math.round(portBase);
  S.risk = parseFloat(document.getElementById('set-risk').value) || S.risk;
  S.sym = document.getElementById('set-currency').value;
  readChallengeSettingsForm();
  S.balManualOverride = true;
  S.balFromAlpaca = false;
  S.profileHandle = (document.getElementById('set-handle')?.value || '').trim().replace(/[^a-zA-Z0-9_-]/g, '') || S.profileHandle;
  const firstEl = document.getElementById('set-first-name');
  if (firstEl) {
    const n = (typeof RunnrSync.normalizeFirstName === 'function')
      ? RunnrSync.normalizeFirstName(firstEl.value)
      : String(firstEl.value || '').trim();
    if (n) {
      S.firstName = n;
      if (RunnrSync.isLoggedIn?.()) {
        RunnrSync.updateFirstName?.(n).catch(() => {});
      }
    }
  }
  const digestEl = document.getElementById('set-coach-digest');
  if (digestEl) S.coachDigestEnabled = digestEl.checked;
  const langEl = document.getElementById('set-language');
  if (langEl && langEl.value !== S.lang) changeLanguage(langEl.value);
  persist();
  updateHomeStats();
  renderChallengePanel();
  closeModal('modal-settings');
  if (typeof RunnrDesk?.refresh === 'function') RunnrDesk.refresh();
}
function openSettingsModal() {
  document.getElementById('set-bal').value = S.bal;
  const portBaseEl = document.getElementById('set-port-base');
  if (portBaseEl) portBaseEl.value = S.journalBaseBal > 0 ? S.journalBaseBal : '';
  document.getElementById('set-risk').value = S.risk;
  fillChallengeSettingsForm();
  const cur = document.getElementById('set-currency');
  if (cur) cur.value = S.sym || '€';
  const hint = document.getElementById('set-bal-hint');
  if (hint) hint.style.display = (S.balFromAlpaca && S.brokerSync?.alpaca?.connected) ? 'block' : 'none';
  const h = document.getElementById('set-handle');
  if (h) h.value = S.profileHandle || '';
  const firstNameEl = document.getElementById('set-first-name');
  if (firstNameEl) firstNameEl.value = S.firstName || '';
  const d = document.getElementById('set-coach-digest');
  if (d) d.checked = S.coachDigestEnabled !== false;
  const langEl = document.getElementById('set-language');
  if (langEl) langEl.value = S.lang || 'en';
  openModal('modal-settings');
  refreshBillingUI();
}

function setRisk(r) {
  S.risk = r;
  document.querySelectorAll('.risk-pill').forEach(p => {
    p.classList.toggle('active', parseFloat(p.textContent) === r);
  });
  updateHomeStats();
  persist();
  resetAlerts();   // reset fired state when band changes
  renderNotifSettings();
}

function updateHomeStats() {
  const mr = S.bal * S.risk / 100;
  document.getElementById('home-bal').textContent = S.sym + S.bal.toLocaleString();
  document.getElementById('home-risk-label').textContent = typeof t === 'function'
    ? t('home.riskPerTrade', { risk: S.risk, amount: S.sym + Math.round(mr) })
    : `Risk ${S.risk}% = ${S.sym}${Math.round(mr)} per trade`;
  document.getElementById('acct-display').textContent = S.sym + S.bal.toLocaleString();
  const balSrc = document.getElementById('home-bal-source');
  if (balSrc) {
    if (S.balFromAlpaca && S.brokerSync?.alpaca?.connected) {
      const paper = S.brokerSync.alpaca.paper !== false ? 'paper' : 'live';
      balSrc.textContent = '↻ Alpaca ' + paper + ' equity';
      balSrc.style.display = 'block';
    } else {
      balSrc.style.display = 'none';
    }
  }

  const incomplete = S.trades.filter(t => t.incomplete);
  const banner = document.getElementById('incomplete-banner');
  if (incomplete.length > 0) {
    banner.style.display = 'flex';
    const msg = incomplete.length === 1
      ? (typeof t === 'function' ? t('home.incompleteOne') : '1 trade needs discipline flags')
      : (typeof t === 'function' ? t('home.incompleteMany', { count: incomplete.length }) : `${incomplete.length} trades need discipline flags`);
    const tail = typeof t === 'function' ? t('home.tapComplete') : 'tap to complete';
    banner.innerHTML = `⚠️ <strong>${msg}</strong> — ${tail}`;
  } else {
    banner.style.display = 'none';
  }

  const weekTrades = CoachEngine.withinDays(S.trades, 7);
  const allM = CoachEngine.metrics(S.trades);
  const weekM = CoachEngine.metrics(weekTrades);
  const weekPnl = weekM.totalPnl;
  const wpEl = document.getElementById('home-week-pnl');
  if (wpEl) {
    wpEl.textContent = (weekPnl >= 0 ? '+' : '') + S.sym + Math.abs(Math.round(weekPnl)).toLocaleString();
    wpEl.style.color = weekPnl >= 0 ? 'var(--accent)' : 'var(--red)';
  }
  const wsEl = document.getElementById('home-week-stop');
  if (wsEl) {
    const pct = weekM.count ? weekM.stopPct.toFixed(0) + '%' : '—';
    wsEl.textContent = typeof t === 'function'
      ? `${t('home.stopDiscipline')}: ${pct}`
      : (weekM.count ? `Stop discipline: ${weekM.stopPct.toFixed(0)}%` : 'Stop discipline: —');
  }

  const setStat = (id, val, color) => {
    const el = document.getElementById(id);
    if (el) { el.textContent = val; if (color) el.style.color = color; }
  };
  setStat('qs-stop', allM.count ? allM.stopPct.toFixed(0) + '%' : '—', allM.stopPct >= 80 ? 'var(--accent)' : 'var(--amber)');
  setStat('qs-size', allM.count ? allM.sizePct.toFixed(0) + '%' : '—', allM.sizePct >= 80 ? 'var(--accent)' : 'var(--amber)');
  const pfEmpty = !allM.count || allM.profitFactor >= 999;
  setStat('qs-pf', pfEmpty ? '—' : allM.profitFactor.toFixed(1), !pfEmpty && allM.profitFactor >= 1 ? 'var(--accent)' : 'var(--text3)');
  setStat('qs-wr', allM.count ? allM.winRate.toFixed(0) + '%' : '—', allM.winRate >= 50 ? 'var(--accent)' : 'var(--text)');
  const wrMeta = document.getElementById('qs-wr-meta');
  if (wrMeta) wrMeta.textContent = allM.count ? `${allM.count} trades` : '0 trades';
  const hideEmptyStat = (id, hide) => {
    const item = document.getElementById(id)?.closest('.stat-item');
    if (item) item.hidden = !!hide;
  };
  const keepDemoStats = !!(window.RunnrSync && typeof RunnrSync.isDemoState === 'function' && RunnrSync.isDemoState(S));
  hideEmptyStat('qs-stop', !allM.count && !keepDemoStats);
  hideEmptyStat('qs-size', !allM.count && !keepDemoStats);
  hideEmptyStat('qs-pf', pfEmpty && !keepDemoStats);
  hideEmptyStat('qs-wr', !allM.count && !keepDemoStats);

  document.querySelectorAll('.risk-pill').forEach(pill => {
    pill.classList.toggle('active', parseFloat(pill.textContent) === S.risk);
  });
  updateTier();
  if (window.RunnrGrowth) {
    RunnrGrowth.renderDisciplineCard(S);
    RunnrGrowth.renderHomeBanner(S);
  }
  applyQuietDesk();
  renderHomeJob();
  try { renderFreeTradeCounters(); } catch (e) {}
  updateDemoBanner();
  try { renderChallengePanel(); } catch (e) {}
}

// ── LIGHT / DARK MODE ────────────────────────────────────────────────────────
function toggleTheme() {
  const isLight = document.body.classList.toggle('light');
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = isLight ? t('common.dark') : t('common.light');
  try { localStorage.setItem('runnr_theme', isLight ? 'light' : 'dark'); } catch(e) {}
  // Redraw canvases
  setTimeout(() => {
    drawFGGauge(parseInt(document.getElementById('fg-value').textContent) || 72);
    if (document.getElementById('page-coach').classList.contains('active')) drawEquityCurve();
  }, 50);
}

// Restore saved theme
try {
  if (localStorage.getItem('runnr_theme') === 'light') {
    document.body.classList.add('light');
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.textContent = '🌙 Dark';
  }
} catch(e) {}
