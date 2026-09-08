/**
 * Runnr app — broker connect UI, auth glue, CSV import.
 * Extracted from index.html (slice 1). Classic script; globals kept for onclick=.
 */
// ── BROKER SYNC (Runnr API) ───────────────────────────────────────────────
var brokers = [
  { code: 'Alpaca', bg: '#f5d542', color: '#000', live: true },
  { code: 'IBKR', bg: '#cc0000', color: '#fff', live: true, kind: 'flex' },
  { code: 'Trading 212', bg: '#00a7e1', color: '#fff', live: true, csv: true },
  { code: 'eToro', bg: '#6FCF97', color: '#000', csv: true },
  { code: 'Degiro', bg: '#e30613', color: '#fff', csv: true },
  { code: 'Schwab', bg: '#00a0df', color: '#fff', csv: true },
];

var csvPresetId = 'auto';

function renderCsvPresetChips() {
  const el = document.getElementById('csv-preset-chips');
  const tip = document.getElementById('csv-preset-tip');
  if (!el || !window.RunnrCsvPresets) return;
  const presets = RunnrCsvPresets.list();
  el.innerHTML = presets.map((p) => {
    const on = p.id === csvPresetId;
    return `<button type="button" class="risk-pill${on ? ' on' : ''}" data-csv-preset="${p.id}" onclick="setCsvPreset('${p.id}')" style="font-size:11px;padding:5px 10px">${p.label}</button>`;
  }).join('');
  const cur = presets.find((p) => p.id === csvPresetId) || presets[0];
  if (tip) tip.textContent = cur?.tip || '';
}

function setCsvPreset(id) {
  csvPresetId = id || 'auto';
  renderCsvPresetChips();
}
window.setCsvPreset = setCsvPreset;

function renderAvailableBrokers() {
  const el = document.getElementById('available-brokers');
  if (!el) return;
  try {
    RunnrSync.ensureBrokerState();
    const alpacaLinked = !!(S.brokerSync && S.brokerSync.alpaca && S.brokerSync.alpaca.connected);
    const ibkrLinked = !!(S.brokerSync && S.brokerSync.ibkr && S.brokerSync.ibkr.connected);
    const t212Linked = !!(S.brokerSync && S.brokerSync.t212 && S.brokerSync.t212.connected);
    const hasLocal = typeof RunnrSync.hasLocalAlpaca === 'function' && RunnrSync.hasLocalAlpaca();
    const loggedIn = typeof RunnrSync.isLoggedIn === 'function' && RunnrSync.isLoggedIn();
    el.innerHTML = brokers.map(b => {
      let badge = '+ Connect';
      let badgeCls = 'bk-available';
      let status = b.live ? 'Read-only sync available' : (b.csv ? 'CSV preset on Sync page' : 'Coming soon — CSV import works today');
      if (b.code === 'Alpaca') {
        if (alpacaLinked) {
          badge = '● Connected';
          badgeCls = 'bk-synced';
        } else if (loggedIn && hasLocal) {
          badge = '↻ Reconnect';
          badgeCls = 'bk-synced';
        }
      } else if (b.code === 'IBKR') {
        if (ibkrLinked) {
          badge = '● Connected';
          badgeCls = 'bk-synced';
          status = 'Flex Web Service · read-only';
        } else {
          status = 'Flex token · read-only';
        }
      } else if (b.code === 'Trading 212') {
        if (t212Linked) {
          badge = '● Connected';
          badgeCls = 'bk-synced';
          status = 'Read-only · Invest / Stocks ISA';
        } else {
          badge = '+ Connect';
          status = 'Paste API key + secret · Invest / Stocks ISA (not SIPP)';
        }
      } else if (b.csv) {
        badge = 'CSV';
        badgeCls = 'bk-available';
      }
      return `
  <div class="broker-card" onclick="connectBroker('${b.code}')">
    <div class="bk-logo" style="background:${b.bg};color:${b.color}">${b.code.slice(0,4)}</div>
    <div class="bk-info"><div class="bk-name">${b.code}</div><div class="bk-status">${status}</div></div>
    <div class="bk-badge ${badgeCls}">${badge}</div>
  </div>`;
    }).join('');
  } catch (e) {
    console.error('renderAvailableBrokers', e);
  }
  const connectBtn = document.getElementById('sync-connect-alpaca-btn');
  if (connectBtn) {
    const linked = !!(S.brokerSync && S.brokerSync.alpaca && S.brokerSync.alpaca.connected);
    connectBtn.style.display = linked ? 'none' : 'block';
    connectBtn.textContent = (typeof RunnrSync.hasLocalAlpaca === 'function' && RunnrSync.hasLocalAlpaca())
      ? '↻ Reconnect Alpaca'
      : 'Connect Alpaca';
  }
}

function showSessionBanner(text) {
  const el = document.getElementById('session-banner');
  if (!el) return;
  const span = el.querySelector('.session-banner-text');
  if (span && text) span.textContent = text;
  el.style.display = 'flex';
}

function hideSessionBanner() {
  const el = document.getElementById('session-banner');
  if (el) el.style.display = 'none';
}

function renderStatsFooterLinks() {
  const allow = typeof RunnrSync !== 'undefined' && typeof RunnrSync.canViewStats === 'function'
    && RunnrSync.canViewStats();
  document.querySelectorAll('.js-stats-link').forEach((el) => {
    el.hidden = !allow;
  });
}

function profileInitial() {
  const name = (window.S && S.firstName) || '';
  if (name) return name.charAt(0).toUpperCase();
  const email = (typeof RunnrSync !== 'undefined' && RunnrSync.sessionEmail?.()) || '';
  return (email.charAt(0) || 'R').toUpperCase();
}

function formatMemberSince(raw) {
  if (!raw) return 'Member';
  const s = String(raw).trim();
  const iso = s.includes('T') ? s : s.replace(' ', 'T');
  const d = new Date(/Z$|[+-]\d\d:\d\d$/.test(iso) ? iso : iso + 'Z');
  if (isNaN(d.getTime())) return 'Member';
  try {
    return 'Member since ' + d.toLocaleString('en-GB', { month: 'long', year: 'numeric' });
  } catch (e) {
    return 'Member since ' + d.getFullYear();
  }
}

function renderHeaderSyncPill() {
  try { renderStatsFooterLinks(); } catch (e) {}
  const el = document.getElementById('header-sync-pill');
  if (!el) return;
  const inSession = !!(typeof RunnrSync !== 'undefined' && RunnrSync.isLoggedIn?.())
    || (function () { try { return !!localStorage.getItem('runnr_api_token'); } catch (e) { return false; } })();
  if (inSession) {
    const who = ((typeof RunnrSync !== 'undefined' && RunnrSync.sessionEmail?.()) || 'Signed in').split('@')[0];
    const verified = !!(window.RunnrSync?.isEmailVerified?.());
    const avatar = window.RunnrSync?.billing?.()?.avatarUrl || '';
    const initial = profileInitial();
    const face = avatar
      ? '<img alt="" src="' + String(avatar).replace(/"/g, '') + '">'
      : initial;
    el.innerHTML = '<span class="profile-chip-face">' + face + '</span><span class="profile-chip-check' + (verified ? '' : ' off') + '" aria-hidden="true">✓</span>';
    el.classList.add('on', 'profile-chip');
    el.title = who + ' — tap for account';
    el.setAttribute('aria-label', 'Account');
    if (el.tagName === 'A') el.setAttribute('href', '#');
    hideSessionBanner();
  } else {
    el.textContent = (typeof t === 'function' ? t('common.signIn') : 'Sign in');
    el.classList.remove('on', 'profile-chip');
    el.title = (typeof t === 'function' ? t('common.signInTitle') : 'Sign in');
    el.setAttribute('aria-label', el.title);
    if (el.tagName === 'A') el.setAttribute('href', '/login.html');
  }
}

function fillAccountSheet() {
  const email = (window.RunnrSync?.sessionEmail?.() || '').replace(/</g, '') || 'Signed in';
  const emailEl = document.getElementById('account-email');
  const sinceEl = document.getElementById('account-since');
  const av = document.getElementById('account-avatar');
  if (emailEl) emailEl.textContent = email;
  if (sinceEl) sinceEl.textContent = formatMemberSince(window.RunnrSync?.billing?.()?.createdAt);
  if (av) {
    const src = window.RunnrSync?.billing?.()?.avatarUrl || '';
    av.innerHTML = src ? '<img alt="" src="' + String(src).replace(/"/g, '') + '">' : profileInitial();
  }
}

function openAccountSheet() {
  fillAccountSheet();
  openModal('modal-account');
  if (window.RunnrSync?.refreshBilling) {
    RunnrSync.refreshBilling().then(() => {
      fillAccountSheet();
      renderHeaderSyncPill();
    }).catch(() => {});
  }
}

function manageAccountFromSheet() {
  closeModal('modal-account');
  openSettingsModal();
}
window.openAccountSheet = openAccountSheet;
window.manageAccountFromSheet = manageAccountFromSheet;
window.renderHeaderSyncPill = renderHeaderSyncPill;

function headerSyncTap(e) {
  const inSession = !!(typeof RunnrSync !== 'undefined' && RunnrSync.isLoggedIn?.())
    || (function () { try { return !!localStorage.getItem('runnr_api_token'); } catch (err) { return false; } })();
  if (inSession) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    openAccountSheet();
    return false;
  }
  return true;
}

function signOutRunnr() {
  if (!confirm('Log out? This email’s journal is saved for next sign-in. The screen will reset to the demo book.')) return;
  RunnrSync.logout();
  location.reload();
}
window.signOutRunnr = signOutRunnr;

function handleRunnrAuthExpired(msg) {
  renderHeaderSyncPill();
  renderSyncAuthBanner();
  const m = String(msg || '');
  if (/user not found|create your account|sign in again/i.test(m)) {
    showSessionBanner('Tap Sign in — same email + password. Continue will recreate your account if needed.');
  } else {
    showSessionBanner('Session ended — tap Sign in in the header (email is remembered).');
  }
}
window.onRunnrAuthExpired = handleRunnrAuthExpired;

function showSyncAuthError(text) {
  document.querySelectorAll('#sync-auth-error, #sync-auth-error-inline, .sync-auth-error').forEach((el) => {
    if (el.id === 'sync-reset-error') return;
    el.textContent = text || '';
  });
}

function showSyncResetError(text) {
  const el = document.getElementById('sync-reset-error');
  if (el) el.textContent = text || '';
  if (text) scrollSyncAuthIntoView('sync-reset-auth');
}

function showSyncResetStatus(text, kind) {
  const el = document.getElementById('sync-reset-status');
  if (!el) return;
  if (!text) {
    el.className = '';
    el.textContent = '';
    return;
  }
  el.className = 'show ' + (kind || 'working');
  el.textContent = text;
  scrollSyncAuthIntoView('sync-reset-auth');
}

function dismissSyncKeyboard() {
  const active = document.activeElement;
  if (active && typeof active.blur === 'function') active.blur();
}

var isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function syncAuthUsesInline() {
  return isIOS || document.getElementById('page-sync')?.classList.contains('active');
}

function recalledFirstNameForEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  if (window.RunnrSync?.recalledFirstName) return RunnrSync.recalledFirstName(e);
  try {
    const map = JSON.parse(localStorage.getItem('runnr_remember_first_name') || '{}') || {};
    if (e && map[e]) return map[e];
  } catch (err) {}
  try {
    const st = JSON.parse(localStorage.getItem('runnr_state') || '{}');
    if (st && st.firstName) return st.firstName;
  } catch (err) {}
  return '';
}

function fillSyncAuthFirstName() {
  const email = readFieldValue('sync-email-inline', 'sync-email')
    || localStorage.getItem('runnr_remember_email')
    || '';
  const name = recalledFirstNameForEmail(email);
  ['sync-first-name', 'sync-first-name-inline'].forEach((id) => {
    const el = document.getElementById(id);
    if (el && name && document.activeElement !== el) el.value = name;
  });
}

function prefillSyncAuthEmail() {
  const remembered = localStorage.getItem('runnr_remember_email') || (window.RunnrSync?.sessionEmail?.() || '');
  ['sync-email', 'sync-email-inline', 'sync-reset-email'].forEach((id) => {
    const el = document.getElementById(id);
    if (el && remembered) el.value = remembered;
  });
  fillSyncAuthFirstName();
}

function updateSyncAuthVisibility() {
  const gate = document.getElementById('sync-login-gate');
  const signin = document.getElementById('sync-inline-auth');
  const reset = document.getElementById('sync-reset-auth');
  const mobile = document.getElementById('sync-mobile-login');
  const loggedOut = !window.RunnrSync?.isLoggedIn?.();
  if (gate) gate.style.display = loggedOut ? 'block' : 'none';
  if (signin) signin.style.display = 'none';
  if (reset) reset.style.display = 'none';
  if (mobile) mobile.style.display = 'none';
  if (loggedOut) prefillSyncAuthEmail();
}

function scrollSyncAuthIntoView(id) {
  setTimeout(() => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 120);
}

function renderSyncAuthBanner() {
  const el = document.getElementById('sync-auth-banner');
  updateSyncAuthVisibility();
  if (!el) return;
  if (RunnrSync.isLoggedIn()) {
    const who = RunnrSync.sessionEmail() || 'your account';
    el.innerHTML = `<div class="card-sm" style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
      <span style="font-size:12px;color:var(--text2)">✓ ${who} · journal & watchlist sync</span>
      <button class="btn btn-sm btn-ghost" type="button" onclick="signOutRunnr()">Log out</button>
    </div>`;
    const house = (typeof RunnrSync.isHouse === 'function' && RunnrSync.isHouse())
      || (typeof RunnrSync.canViewStats === 'function' && RunnrSync.canViewStats());
    if (house) {
      el.innerHTML += `<div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
      <button class="btn btn-sm btn-ghost" type="button" onclick="diagnoseSyncNow()">Diagnose sync</button>
      <button class="btn btn-sm btn-ghost" type="button" onclick="forcePushThisDevice()">Push this device → cloud</button>
      <button class="btn btn-sm btn-ghost" type="button" onclick="forcePullWatchlist()">Pull watchlist ← cloud</button>
    </div>`;
    }
  } else if (syncAuthUsesInline()) {
    el.innerHTML = `<div style="font-size:12px;color:var(--text2);margin-bottom:4px">Tap <strong>Open sign-in page</strong> above.</div>`;
  } else {
    el.innerHTML = `<div class="card-sm" style="font-size:12px;color:var(--text2);margin-bottom:4px">Sign in to sync your journal, watchlist, and settings across devices.</div>
      <button class="btn btn-sm" type="button" onclick="openSyncAuthModal()">Sign in</button>`;
  }
}

function renderConnectedBrokers() {
  RunnrSync.ensureBrokerState();
  const el = document.getElementById('sync-connected');
  if (!el) return;
  const a = S.brokerSync.alpaca || {};
  const ib = S.brokerSync.ibkr || {};
  const t212 = S.brokerSync.t212 || {};
  const cards = [];

  if (a.connected) {
    const ago = RunnrSync.formatAgo(a.lastSync);
    const eq = a.equity != null ? ('$' + Math.round(a.equity).toLocaleString()) : '—';
    cards.push(`<div class="broker-card" style="cursor:default;margin-bottom:8px">
      <div class="bk-logo" style="background:#f5d542;color:#000">ALP</div>
      <div class="bk-info">
        <div class="bk-name">Alpaca ${a.paper !== false ? 'Paper' : 'Live'}</div>
        <div class="bk-status">${eq} · ${a.positionCount ?? 0} positions · Last sync ${ago}</div>
      </div>
      <div class="bk-badge bk-synced">● Live</div>
    </div>`);
  } else if (RunnrSync.isLoggedIn() && RunnrSync.hasLocalAlpaca()) {
    cards.push(`<div class="card-sm" style="font-size:12px;color:var(--text2);display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px">
      <span>Alpaca unlinked on server — keys saved on this phone.</span>
      <button class="btn btn-sm" onclick="reconnectAlpaca()">Reconnect</button>
    </div>`);
  }

  if (ib.connected) {
    const ago = RunnrSync.formatAgo(ib.lastSync);
    cards.push(`<div class="broker-card" style="cursor:default;margin-bottom:8px">
      <div class="bk-logo" style="background:#cc0000;color:#fff">IBKR</div>
      <div class="bk-info">
        <div class="bk-name">IBKR Flex</div>
        <div class="bk-status">${ib.imported || 0} fills imported · Last sync ${ago}</div>
      </div>
      <div class="bk-badge bk-synced">● Live</div>
    </div>`);
  }

  if (t212.connected) {
    const ago = RunnrSync.formatAgo(t212.lastSync);
    cards.push(`<div class="broker-card" style="cursor:default;margin-bottom:8px">
      <div class="bk-logo" style="background:#00a7e1;color:#fff">T212</div>
      <div class="bk-info">
        <div class="bk-name">Trading 212</div>
        <div class="bk-status">${t212.imported || 0} fills imported · Last sync ${ago}</div>
      </div>
      <div class="bk-badge bk-synced">● Live</div>
    </div>`);
  }

  if (cards.length) {
    el.innerHTML = cards.join('');
    return;
  }
  if (RunnrSync.isLoggedIn()) {
    el.innerHTML = `<div style="font-size:12px;color:var(--text3)">No broker linked yet — connect Alpaca, IBKR Flex, or Trading 212 below, or import CSV.</div>`;
  } else {
    el.innerHTML = `<div style="font-size:12px;color:var(--text3)">Log in first, then connect a broker below.</div>`;
  }
}

function renderHomeBrokerPreview() {
  const el = document.getElementById('home-broker-preview');
  if (!el) return;
  RunnrSync.ensureBrokerState();
  const a = S.brokerSync.alpaca || {};
  if (!a.connected) {
    el.innerHTML = `<div style="font-size:12px;color:var(--text3)">No broker connected. <span style="color:var(--accent);cursor:pointer" onclick="switchPage('sync')">Connect Alpaca →</span></div>`;
    return;
  }
  const ago = RunnrSync.formatAgo(a.lastSync);
  el.innerHTML = `<div class="broker-card" style="cursor:default">
    <div class="bk-logo" style="background:#f5d542;color:#000">ALP</div>
    <div class="bk-info">
      <div class="bk-name">Alpaca Paper</div>
      <div class="bk-status">Last sync ${ago} · ${a.imported || 0} trades imported</div>
    </div>
    <div class="bk-badge bk-synced">● Live</div>
  </div>
  <div style="font-size:11px;color:var(--text3);margin-top:4px"><span style="color:var(--accent);cursor:pointer" onclick="runBrokerSync()">Refresh now</span></div>`;
}

function renderT212JournalButton() {
  const btn = document.getElementById('journal-t212-btn');
  if (!btn) return;
  const loggedIn = typeof RunnrSync !== 'undefined' && RunnrSync.isLoggedIn?.();
  btn.style.display = loggedIn ? 'inline-flex' : 'none';
}
window.renderT212JournalButton = renderT212JournalButton;

function renderSyncPage() {
  renderHeaderSyncPill();
  renderSyncAuthBanner();
  renderConnectedBrokers();
  renderAvailableBrokers();
  renderCsvPresetChips();
  renderT212JournalButton();
}

var _alpacaRestorePending = false;
function restoreAlpacaInBackground() {
  if (!RunnrSync.isLoggedIn() || _alpacaRestorePending) return;
  if (S.brokerSync?.alpaca?.connected) return;
  _alpacaRestorePending = true;
  RunnrSync.ensureAlpacaConnected()
    .then((ok) => {
      if (ok) {
        renderSyncPage();
        renderHomeBrokerPreview();
        showToast('Runnr', 'Alpaca linked from your account');
      }
    })
    .finally(() => { _alpacaRestorePending = false; });
}

function openSyncAuthModal() {
  if (window.RunnrSync?.isLoggedIn?.()) {
    switchPage('sync');
    return;
  }
  window.location.href = '/login.html';
}

function showSyncSignInStatus(text, kind) {
  const el = document.getElementById('sync-signin-status');
  if (!el) return;
  if (!text) {
    el.className = '';
    el.textContent = '';
    return;
  }
  el.className = 'show ' + (kind || 'working');
  el.textContent = text;
  scrollSyncAuthIntoView('sync-inline-auth');
}

function readFieldValue(...ids) {
  for (const id of ids) {
    const el = document.getElementById(id);
    if (!el) continue;
    const v = String(el.value || '').trim();
    if (v) return v;
  }
  return '';
}

function waitForIosFields(ms) {
  return isIOS ? new Promise((r) => setTimeout(r, ms || 150)) : Promise.resolve();
}

function readSyncSignInFields() {
  const modalOpen = document.getElementById('modal-sync-auth')?.classList.contains('open');
  const useInline = !modalOpen && (isIOS || document.getElementById('page-sync')?.classList.contains('active'));
  if (useInline) {
    return {
      email: readFieldValue('sync-email-inline', 'sync-reset-email', 'sync-email').toLowerCase(),
      password: readFieldValue('sync-password-inline', 'sync-password'),
      firstName: readFieldValue('sync-first-name-inline', 'sync-first-name'),
    };
  }
  return {
    email: readFieldValue('sync-email', 'sync-email-inline').toLowerCase(),
    password: readFieldValue('sync-password', 'sync-password-inline'),
    firstName: readFieldValue('sync-first-name', 'sync-first-name-inline'),
  };
}

function readSyncResetFields() {
  let email = (document.getElementById('sync-reset-email')?.value || '').trim().toLowerCase();
  if (!email) {
    email = (document.getElementById('sync-email-inline')?.value || '').trim().toLowerCase();
    if (email) {
      const resetEl = document.getElementById('sync-reset-email');
      if (resetEl) resetEl.value = email;
    }
  }
  return {
    email,
    password: (document.getElementById('sync-reset-password')?.value || '').trim(),
    confirm: (document.getElementById('sync-reset-password2')?.value || '').trim(),
  };
}

function setSyncAuthBusy(busy, mode) {
  const ids = mode === 'reset' ? ['sync-reset-btn'] : ['sync-login-btn', 'sync-login-btn-inline'];
  const idleText = mode === 'reset' ? 'Set new password & sign in' : 'Continue';
  ids.forEach((id) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.disabled = !!busy;
    btn.textContent = busy ? (mode === 'reset' ? 'Updating…' : 'Signing in…') : idleText;
  });
  clearTimeout(window._syncAuthBusyTimer);
  if (busy) {
    window._syncAuthBusyTimer = setTimeout(() => setSyncAuthBusy(false, mode), 20000);
  }
}

function validateSyncAuth(email, password) {
  if (!email) return 'Enter your email address.';
  if (!email.includes('@')) return 'Enter a valid email (needs an @ sign).';
  if (!password) return 'Enter a password.';
  if (password.length < 8) return 'Password must be at least 8 characters.';
  return '';
}

var _syncSignInRunning = false;

async function submitSyncContinue() {
  if (_syncSignInRunning) return;
  dismissSyncKeyboard();
  await waitForIosFields(150);
  const { email, password, firstName } = readSyncSignInFields();
  const err = validateSyncAuth(email, password);
  if (err) {
    showSyncAuthError(err);
    showSyncSignInStatus(err, 'err');
    return;
  }
  if (RunnrSync.storageOk && !RunnrSync.storageOk()) {
    const msg = 'Safari blocked storage — turn off Private Browsing, or open runnr.fyi in a normal tab (not Private).';
    showSyncAuthError(msg);
    showSyncSignInStatus(msg, 'err');
    return;
  }
  showSyncAuthError('');
  showSyncSignInStatus('Signing in…', 'working');
  _syncSignInRunning = true;
  setSyncAuthBusy(true, 'signin');
  try {
    const data = await RunnrSync.signIn(email, password, firstName);
    if (!RunnrSync.isLoggedIn()) {
      throw new Error('Login did not stick — turn off Private Browsing in Safari');
    }
    try {
      if (sessionStorage.getItem('runnr_account_switched') === '1') {
        sessionStorage.removeItem('runnr_account_switched');
        location.href = '/?signedin=1';
        return;
      }
    } catch (e) {}
    showSyncSignInStatus('Signed in — loading your profile…', 'ok');
    const needsVerify = data && data.email_verified === false;
    rememberVerificationSent(data);
    if (needsVerify) {
      showSyncVerify(email, data);
      updateVerifyBanner();
      showToast('Runnr', 'Signed in — confirm your email when you can');
      try { await RunnrSync.refreshBilling?.(); refreshBillingUI(); } catch (e) {}
      finishSyncSignIn(email);
      return;
    }
    finishSyncSignIn(email);
    showToast('Runnr', 'Signed in');
    try {
      await RunnrSync.refreshBilling?.();
      refreshBillingUI();
    } catch (e) {}
  } catch (e) {
    const msg = String(e.message || e);
    showSyncSignInStatus('', '');
    if (/wrong password/i.test(msg)) {
      showSyncAuthError('Wrong password for this email — scroll down to Reset password, or use the same password as on your Mac.');
      showSyncSignInStatus('Wrong password', 'err');
    } else if (/invalid email or password/i.test(msg)) {
      showSyncAuthError('Could not sign in — check email and password.');
      showSyncSignInStatus('Sign in failed', 'err');
    } else if (/cannot reach|timed out|private browsing|blocked saving|failed to fetch|network/i.test(msg)) {
      showSyncAuthError(msg);
      showSyncSignInStatus(msg, 'err');
    } else {
      showSyncAuthError(msg || 'Sign in failed — try again');
      showSyncSignInStatus(msg || 'Sign in failed', 'err');
    }
  } finally {
    _syncSignInRunning = false;
    setSyncAuthBusy(false, 'signin');
  }
}

var _syncResetRunning = false;

function showResetSetFields(token) {
  const tok = document.getElementById('sync-reset-token');
  if (tok) tok.value = token || '';
  const req = document.getElementById('sync-reset-request-fields');
  const set = document.getElementById('sync-reset-set-fields');
  if (req) req.style.display = token ? 'none' : 'block';
  if (set) set.style.display = token ? 'block' : 'none';
}

async function submitSyncForgotPassword() {
  if (_syncResetRunning) return;
  dismissSyncKeyboard();
  const email = (document.getElementById('sync-reset-email')?.value || '').trim().toLowerCase()
    || (document.getElementById('sync-email-inline')?.value || '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    showSyncResetError('Enter the email for your Runnr account.');
    return;
  }
  showSyncResetError('');
  showSyncResetStatus('Sending reset link…', 'working');
  _syncResetRunning = true;
  try {
    const data = await RunnrSync.forgotPassword(email);
    if (data?.reset_url) {
      showSyncResetStatus((data.detail || 'Use this reset link:') + '\n' + data.reset_url, 'ok');
      const u = new URL(data.reset_url);
      const token = u.searchParams.get('reset');
      if (token) showResetSetFields(token);
    } else {
      showSyncResetStatus(data?.detail || 'Check your email for a reset link.', 'ok');
    }
  } catch (e) {
    showSyncResetStatus('', '');
    showSyncResetError(String(e.message || e));
  } finally {
    _syncResetRunning = false;
  }
}

async function submitSyncResetPassword() {
  if (_syncResetRunning) return;
  dismissSyncKeyboard();
  await waitForIosFields(150);
  const token = (document.getElementById('sync-reset-token')?.value || '').trim();
  const password = (document.getElementById('sync-reset-password')?.value || '').trim();
  const confirm = (document.getElementById('sync-reset-password2')?.value || '').trim();
  if (!token) {
    showSyncResetError('Request a reset link first (or open the link from your email).');
    return;
  }
  if (!password || password.length < 8) {
    showSyncResetError('Password must be at least 8 characters.');
    return;
  }
  if (password !== confirm) {
    showSyncResetError('Passwords do not match — type the same new password twice.');
    return;
  }
  if (RunnrSync.storageOk && !RunnrSync.storageOk()) {
    showSyncResetError('Safari blocked storage — turn off Private Browsing for runnr.fyi.');
    return;
  }
  showSyncResetError('');
  showSyncResetStatus('Updating password…', 'working');
  _syncResetRunning = true;
  setSyncAuthBusy(true, 'reset');
  try {
    const data = await RunnrSync.resetPassword(token, password);
    if (!RunnrSync.isLoggedIn()) {
      throw new Error('Password saved but login did not stick — turn off Private Browsing');
    }
    showSyncResetStatus('Signed in — loading your profile…', 'ok');
    finishSyncSignIn(data.email || '');
    showToast('Runnr', 'Password updated — signed in');
  } catch (e) {
    const msg = String(e.message || e);
    showSyncResetStatus('', '');
    showSyncResetError(msg || 'Reset failed — request a new link');
  } finally {
    _syncResetRunning = false;
    setSyncAuthBusy(false, 'reset');
  }
}
window.submitSyncContinue = submitSyncContinue;
window.submitSyncResetPassword = submitSyncResetPassword;
window.submitSyncForgotPassword = submitSyncForgotPassword;

function showSyncVerify(email, data) {
  const card = document.getElementById('sync-verify-auth');
  const copy = document.getElementById('sync-verify-copy');
  if (!card || !copy) return;
  const safe = String(email || '').replace(/</g, '');
  const sent = data && data.verification_sent;
  const link = data && data.verify_url;
  let html = 'We sent a confirmation link to <strong>' + safe + '</strong>. Open it when you can — you can use Runnr now.';
  if (data && data.email_configured === false) {
    html = 'Confirmation emails are not sending yet. You can still use Runnr.';
  } else if (!sent && link) {
    html += ' Email isn’t configured yet — <a href="' + link + '" style="color:var(--gold)">verify now</a>.';
  } else if (!sent) {
    html = 'We could not send the confirmation email to <strong>' + safe + '</strong>. Tap resend, or continue and confirm later.';
  }
  rememberVerificationSent(data);
  copy.innerHTML = html;
  card.style.display = 'block';
  scrollSyncAuthIntoView('sync-verify-auth');
}

function hideSyncVerify() {
  const card = document.getElementById('sync-verify-auth');
  if (card) card.style.display = 'none';
}

function finishSyncSignIn(email) {
  localStorage.setItem('runnr_remember_email', email);
  window._runnrAuthPending = false;
  hideSessionBanner();
  closeModal('modal-sync-auth');
  document.body.style.overflow = '';
  updateSyncAuthVisibility();
  renderHeaderSyncPill();
  renderSyncAuthBanner();
  renderSyncPage();
  refreshBillingUI();

  setTimeout(() => {
    RunnrSync.syncProfileState()
      .then((profile) => {
        if (profile && profile.action !== 'none') refreshAfterProfileSync();
        return postLoginAlpacaFlow({ autoSync: true });
      })
      .catch(() => {});
  }, 100);
}

async function postLoginAlpacaFlow(opts = {}) {
  const { autoSync = false, toast = false } = opts;
  try {
    const result = await RunnrSync.restoreAccountAlpaca({ autoSync });
    await RunnrSync.refreshStatus();
    renderSyncPage();
    renderHomeBrokerPreview();
    updateHomeStats();
    if (result.connected) {
      renderJournal();
      if (toast) {
        const msg = autoSync && result.sync
          ? 'Signed in — Alpaca linked, trades synced'
          : 'Alpaca linked from your account';
        showToast('Runnr', msg);
      }
    }
    return result;
  } catch (e) {
    renderSyncPage();
    renderHomeBrokerPreview();
    return { connected: false };
  }
}

async function submitSyncLogin() {
  return submitSyncContinue();
}

async function submitSyncRegister() {
  return submitSyncContinue();
}

async function connectBroker(name) {
  if (name === 'Alpaca') {
    if (!RunnrSync.isLoggedIn()) {
      openSyncAuthModal();
      return;
    }
    if (!(await requirePro('Alpaca connection'))) return;
    if (!canAddJournalTrade(1)) {
      openJournalLimitUpgrade();
      return;
    }
    const ok = await RunnrSync.ensureAlpacaConnected();
    renderSyncPage();
    renderHomeBrokerPreview();
    if (ok) {
      showToast('Runnr', 'Alpaca linked from your account');
      try {
        const r = await RunnrSync.runSync();
        renderJournal();
        updateHomeStats();
        maybeOpenJournalLimit(r && r.limited);
      } catch (e) {}
      return;
    }
    openAlpacaModal();
    return;
  }
  if (name === 'IBKR') {
    if (!RunnrSync.isLoggedIn()) {
      openSyncAuthModal();
      return;
    }
    if (!(await requirePro('IBKR Flex connection'))) return;
    if (!canAddJournalTrade(1)) {
      openJournalLimitUpgrade();
      return;
    }
    const ok = await RunnrSync.ensureIbkrConnected();
    renderSyncPage();
    if (ok) {
      showToast('Runnr', 'IBKR Flex linked');
      try {
        const r = await RunnrSync.runSync();
        renderJournal();
        updateHomeStats();
        maybeOpenJournalLimit(r && r.limited);
      } catch (e) {}
      return;
    }
    openIbkrModal();
    return;
  }
  if (name === 'Trading 212') {
    if (!RunnrSync.isLoggedIn()) {
      openSyncAuthModal();
      return;
    }
    if (!(await requirePro('Trading 212 import'))) return;
    if (!canAddJournalTrade(1)) {
      openJournalLimitUpgrade();
      return;
    }
    const ok = await RunnrSync.ensureT212Connected();
    renderSyncPage();
    if (ok) {
      showToast('Runnr', 'Trading 212 linked — importing fills');
      try {
        const r = await RunnrSync.runSync();
        renderJournal();
        updateHomeStats();
        maybeOpenJournalLimit(r && r.limited);
      } catch (e) {
        const msg = String(e.message || e);
        alert('T212 import failed: ' + msg);
      }
      return;
    }
    openT212Modal();
    return;
  }
  const csvMap = {
    eToro: 'etoro',
    Degiro: 'degiro',
    Schwab: 'schwab',
  };
  if (csvMap[name]) {
    setCsvPreset(csvMap[name]);
    switchPage('sync');
    const zone = document.getElementById('csv-drop-zone');
    if (zone) zone.scrollIntoView({ behavior: 'smooth', block: 'center' });
    showToast('Runnr', name + ' — pick CSV preset, then upload export');
    return;
  }
  alert(name + ' coming soon.\n\nUse Alpaca or IBKR Flex today, or import trades via CSV on the Sync page.');
}

async function openIbkrModal() {
  if (!RunnrSync.isLoggedIn()) {
    openSyncAuthModal();
    showToast('Runnr', 'Sign in to connect IBKR');
    return;
  }
  if (!(await requirePro('IBKR Flex connection'))) return;
  openModal('modal-ibkr');
}

async function submitIbkrConnect() {
  const token = document.getElementById('ibkr-token').value.trim();
  const queryId = document.getElementById('ibkr-query').value.trim();
  if (!token || !queryId) return alert('Paste Flex token and Query ID.');
  try {
    const st = await RunnrSync.connectIbkr(token, queryId);
    RunnrSync.ensureBrokerState();
    S.brokerSync.ibkr.connected = true;
    persist();
    closeModal('modal-ibkr');
    document.getElementById('ibkr-token').value = '';
    renderSyncPage();
    alert('IBKR Flex connected — token encrypted on your Runnr account. Tap Sync now to pull trades.');
    try {
      const r = await RunnrSync.runSync();
      renderJournal();
      updateHomeStats();
      maybeOpenJournalLimit(r && r.limited);
    } catch (e) {
      showToast('Runnr', 'Connected — sync later if Flex is still generating');
    }
  } catch (e) {
    const msg = String(e.message || e);
    if (RunnrSync.isAuthError?.(msg)) {
      RunnrSync.logout();
      handleRunnrAuthExpired(msg);
      openSyncAuthModal();
      return;
    }
    alert('Connect failed: ' + msg);
  }
}
window.openIbkrModal = openIbkrModal;
window.submitIbkrConnect = submitIbkrConnect;

async function openT212Modal() {
  if (!RunnrSync.isLoggedIn()) {
    openSyncAuthModal();
    showToast('Runnr', 'Sign in to connect Trading 212');
    return;
  }
  if (!(await requirePro('Trading 212 connection'))) return;
  openModal('modal-t212');
}

async function submitT212Connect() {
  const apiKey = document.getElementById('t212-key').value.trim();
  const apiSecret = document.getElementById('t212-secret').value.trim();
  if (!apiKey || !apiSecret) return alert('Paste both API key and API secret.');
  try {
    const st = await RunnrSync.connectT212(apiKey, apiSecret);
    RunnrSync.ensureBrokerState();
    S.brokerSync.t212.connected = true;
    if (st && st.position_count != null) S.brokerSync.t212.positionCount = st.position_count;
    persist();
    closeModal('modal-t212');
    document.getElementById('t212-key').value = '';
    document.getElementById('t212-secret').value = '';
    renderSyncPage();
    alert('Trading 212 connected — key encrypted on your Runnr account. Importing fills…');
    try {
      const r = await RunnrSync.runSync();
      renderJournal();
      updateHomeStats();
      renderSyncPage();
      maybeOpenJournalLimit(r && r.limited);
    } catch (e) {
      showToast('Runnr', 'Connected — tap Sync now to pull fills');
    }
  } catch (e) {
    const msg = String(e.message || e);
    if (RunnrSync.isAuthError?.(msg)) {
      RunnrSync.logout();
      handleRunnrAuthExpired(msg);
      openSyncAuthModal();
      return;
    }
    alert('Connect failed: ' + msg);
  }
}
window.openT212Modal = openT212Modal;
window.submitT212Connect = submitT212Connect;

async function openAlpacaModal() {
  if (!RunnrSync.isLoggedIn()) {
    openSyncAuthModal();
    showToast('Runnr', 'Sign in to connect Alpaca');
    return;
  }
  if (!(await requirePro('Alpaca connection'))) return;
  const saved = RunnrSync.loadAlpacaLocal();
  if (saved?.key) document.getElementById('alpaca-key').value = saved.key;
  if (saved?.secret) document.getElementById('alpaca-secret').value = saved.secret;
  if (saved && saved.paper === false) document.getElementById('alpaca-paper').value = '0';
  openModal('modal-alpaca');
}

async function reconnectAlpaca() {
  if (!RunnrSync.isLoggedIn()) {
    openSyncAuthModal();
    return;
  }
  if (!(await requirePro('Alpaca connection'))) return;
  const ok = await RunnrSync.tryAutoReconnectAlpaca();
  renderSyncPage();
  renderHomeBrokerPreview();
  if (ok) {
    await RunnrSync.repairJournalIfNeeded();
    renderJournal();
    updateHomeStats();
    alert('Alpaca reconnected.');
    return;
  }
  openAlpacaModal();
}

async function submitAlpacaConnect() {
  const apiKey = document.getElementById('alpaca-key').value.trim();
  const apiSecret = document.getElementById('alpaca-secret').value.trim();
  const paper = document.getElementById('alpaca-paper').value === '1';
  if (!apiKey || !apiSecret) return alert('Paste both API key and secret.');
  try {
    const st = await RunnrSync.connectAlpaca(apiKey, apiSecret, paper);
    RunnrSync.saveAlpacaLocal(apiKey, apiSecret, paper);
    RunnrSync.ensureBrokerState();
    S.brokerSync.alpaca.connected = true;
    S.brokerSync.alpaca.paper = st.paper;
    S.brokerSync.alpaca.equity = st.equity;
    S.brokerSync.alpaca.positionCount = st.position_count;
    S.balManualOverride = false;
    if (typeof RunnrSync.applyAlpacaBalance === 'function') RunnrSync.applyAlpacaBalance(st.equity);
    persist();
    closeModal('modal-alpaca');
    document.getElementById('alpaca-secret').value = '';
    renderSyncPage();
    renderHomeBrokerPreview();
    alert('Alpaca connected — saved to your Runnr account. Works on every device you sign in on.');
  } catch (e) {
    const msg = String(e.message || e);
    if (RunnrSync.isAuthError?.(msg)) {
      RunnrSync.logout();
      handleRunnrAuthExpired(msg);
      openSyncAuthModal();
      return;
    }
    alert('Connect failed: ' + msg);
  }
}

async function ensureAlpacaLinked() {
  if (typeof RunnrSync.ensureAlpacaConnected === 'function') {
    const ok = await RunnrSync.ensureAlpacaConnected();
    if (ok) return true;
  }
  if (typeof RunnrSync.pushLocalAlpacaToAccount === 'function') {
    const pushed = await RunnrSync.pushLocalAlpacaToAccount();
    if (pushed) return true;
  }
  if (typeof RunnrSync.refreshStatus === 'function') {
    await RunnrSync.refreshStatus();
  }
  return !!(S.brokerSync && S.brokerSync.alpaca && S.brokerSync.alpaca.connected);
}

// ── CSV IMPORT ──────────────────────────────────────────────────────────
async function triggerCsvImport() {
  if (!RunnrSync.isLoggedIn()) {
    openSyncAuthModal();
    showToast('Runnr', 'Sign in to import CSV');
    return;
  }
  if (!(await requirePro('CSV import'))) return;
  if (!canAddJournalTrade(1)) {
    openJournalLimitUpgrade();
    return;
  }
  const input = document.getElementById('csv-import-input');
  if (!input) return;
  input.value = '';
  input.click();
}

function importClosedCsvTrades(trades) {
  let added = 0;
  let skipped = 0;
  const maxId = S.trades.reduce((m, t) => Math.max(m, t.id || 0), 0);
  const demoIds = new Set([1, 2, 3, 4]);
  const seen = new Set(
    S.trades.filter((t) => t.source === 'csv').map((t) => t.externalId).filter(Boolean)
  );

  let remaining = typeof journalTradeSlotsRemaining === "function"
    ? journalTradeSlotsRemaining()
    : Infinity;
  let limited = false;

  trades.forEach((row, i) => {
    const externalId = row.externalId;
    if (seen.has(externalId)) { skipped++; return; }
    if (remaining <= 0) { limited = true; skipped++; return; }
    seen.add(externalId);
    const csvRow = {
      id: maxId + i + 1 + Date.now(),
      instr: row.instr,
      dir: row.dir,
      entry: row.entry,
      exit: row.exit,
      stop: null,
      target: null,
      size: row.size,
      pnl: row.pnl ?? 0,
      stopOk: null,
      sizeOk: null,
      type: 'shares',
      date: row.date,
      incomplete: true,
      source: 'csv',
      externalId,
      filledAt: row.filledAt || null,
    };
    if (typeof DisciplineReplay !== 'undefined' && DisciplineReplay.stampTrade) {
      DisciplineReplay.stampTrade(csvRow, S, typeof Baron !== 'undefined' ? Baron : null);
    }
    S.trades.unshift(csvRow);
    added++;
    if (Number.isFinite(remaining)) remaining -= 1;
  });

  if (added > 0) {
    S.trades = S.trades.filter((t) => t.source === 'csv' || t.source === 'alpaca' || t.source === 'ibkr' || t.source === 't212' || !demoIds.has(t.id));
    persist();
  }
  return { added, skipped, limited };
}

function setCsvImportStatus(msg, ok) {
  const el = document.getElementById('csv-import-status');
  if (!el) return;
  el.style.display = msg ? 'block' : 'none';
  el.style.color = ok === false ? 'var(--red)' : ok === true ? 'var(--accent)' : 'var(--text3)';
  el.textContent = msg || '';
}

function handleCsvImportFile(input) {
  const file = input?.files?.[0];
  if (!file) return;
  importCsvFile(file).finally(() => { if (input) input.value = ''; });
}

async function importCsvFile(file) {
  setCsvImportStatus('Reading ' + file.name + '…');
  const preview = document.getElementById('csv-import-preview');
  try {
    const text = await file.text();
    if (!window.RunnrCsvPresets) {
      setCsvImportStatus('CSV presets failed to load — refresh the page.', false);
      return;
    }
    const result = RunnrCsvPresets.normalize(text, csvPresetId);
    const headers = result.parsed?.headers || [];
    const presetLabel = result.preset?.label || csvPresetId;
    if (preview) {
      preview.style.display = 'block';
      preview.textContent = `Preset: ${presetLabel} · ${result.parsed?.rows?.length || 0} rows · columns: ${headers.slice(0, 8).join(', ')}${headers.length > 8 ? '…' : ''}`;
    }
    if (!result.ok) {
      setCsvImportStatus(result.error || 'No trades imported.', false);
      return;
    }

    let added = 0;
    let skipped = result.skipped || 0;
    let paired = 0;

    let limited = false;
    if (result.mode === 'fills') {
      const r = RunnrSync.importOrders(result.orders, [], { source: 'csv' });
      added = r.added;
      paired = r.paired || 0;
      skipped += (result.orders.length - r.added);
      limited = !!r.limited;
    } else {
      const r = importClosedCsvTrades(result.trades);
      added = r.added;
      skipped += r.skipped;
      limited = !!r.limited;
    }

    if (!added) {
      if (limited) {
        setCsvImportStatus('Trial ended — upgrade to import more fills.', false);
        openJournalLimitUpgrade();
        return;
      }
      setCsvImportStatus('No new trades imported (duplicates or unmatched rows).', false);
      return;
    }
    const pairNote = paired ? ` · ${paired} paired` : '';
    const limitNote = limited ? ' Trial ended — upgrade for the rest.' : '';
    setCsvImportStatus(`Imported ${added} via ${presetLabel}${pairNote}${skipped ? ` (${skipped} skipped)` : ''}.${limitNote}`, true);
    if (limited) openJournalLimitUpgrade();
    renderJournal();
    updateHomeStats();
    refreshPortfolioIfVisible();
    showToast('Runnr', `Imported ${added} — complete flags in Journal`);
    switchPage('journal');
  } catch (e) {
    setCsvImportStatus('Import failed: ' + (e.message || e), false);
  }
}

function initCsvDropZone() {
  const zone = document.getElementById('csv-drop-zone');
  const input = document.getElementById('csv-import-input');
  if (!zone || zone.dataset.bound) return;
  zone.dataset.bound = '1';
  renderCsvPresetChips();
  zone.addEventListener('click', () => triggerCsvImport());
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.style.borderColor = 'var(--accent)';
  });
  zone.addEventListener('dragleave', () => {
    zone.style.borderColor = 'var(--border)';
  });
  zone.addEventListener('drop', async (e) => {
    e.preventDefault();
    zone.style.borderColor = 'var(--border)';
    if (!RunnrSync.isLoggedIn()) {
      openSyncAuthModal();
      return;
    }
    if (!(await requirePro('CSV import'))) return;
    if (!canAddJournalTrade(1)) {
      openJournalLimitUpgrade();
      return;
    }
    const file = e.dataTransfer?.files?.[0];
    if (file) importCsvFile(file);
  });
  if (input) {
    // keep change handler
  }
}
window.triggerCsvImport = triggerCsvImport;
window.handleCsvImportFile = handleCsvImportFile;
window.initCsvDropZone = initCsvDropZone;

async function importT212Fills() {
  if (!RunnrSync.isLoggedIn()) {
    openSyncAuthModal();
    return;
  }
  if (!(await requirePro('Trading 212 import'))) return;
  if (!canAddJournalTrade(1)) {
    openJournalLimitUpgrade();
    return;
  }
  try {
    const ok = await RunnrSync.ensureT212Connected();
    renderT212JournalButton();
    if (!ok) {
      switchPage('sync');
      openT212Modal();
      showToast('Runnr', 'Connect Trading 212 with your API key + secret');
      return;
    }
    const data = await RunnrSync.syncT212();
    const { added, repaired, paired, limited } = RunnrSync.importOrders(
      data.recent_orders || [],
      data.positions || [],
      { source: 't212' }
    );
    if (window.S.brokerSync && window.S.brokerSync.t212) {
      window.S.brokerSync.t212.lastSync = data.as_of || new Date().toISOString();
      window.S.brokerSync.t212.connected = true;
      window.S.brokerSync.t212.imported = (window.S.trades || []).filter(
        (t) => t.source === 't212' && !t.mergedAway
      ).length;
    }
    if (typeof persist === 'function') persist();
    renderJournal();
    updateHomeStats();
    renderSyncPage();
    refreshPortfolioIfVisible();
    if (typeof renderCoachPage === 'function') renderCoachPage();
    const parts = [];
    if (added) parts.push(`${added} new`);
    if (repaired) parts.push(`${repaired} updated`);
    if (paired) parts.push(`${paired} closed round-trip${paired === 1 ? '' : 's'}`);
    alert(parts.length ? `T212 import — ${parts.join(', ')}.` : 'T212 import — journal is up to date.');
    maybeOpenJournalLimit(limited);
  } catch (e) {
    const msg = String(e.message || e);
    if (RunnrSync.isAuthError?.(msg)) {
      RunnrSync.logout();
      handleRunnrAuthExpired(msg);
      openSyncAuthModal();
      return;
    }
    alert('T212 import failed: ' + msg);
  }
}
window.importT212Fills = importT212Fills;

async function runBrokerSync() {
  if (!RunnrSync.isLoggedIn()) {
    openSyncAuthModal();
    return;
  }
  if (!(await requirePro('Broker sync'))) return;
  if (!canAddJournalTrade(1)) {
    openJournalLimitUpgrade();
    return;
  }
  try {
    try {
      const profile = await RunnrSync.syncProfileState();
      if (profile && profile.action !== 'none') refreshAfterProfileSync();
    } catch (e) {}
    const connected = await ensureAlpacaLinked();
    const ibkrOk = typeof RunnrSync.ensureIbkrConnected === 'function' && await RunnrSync.ensureIbkrConnected();
    const t212Ok = typeof RunnrSync.ensureT212Connected === 'function' && await RunnrSync.ensureT212Connected();
    renderSyncPage();
    if (!connected && !ibkrOk && !t212Ok) {
      openAlpacaModal();
      showToast('Runnr', 'Paste Alpaca, IBKR Flex, or Trading 212 keys — then Sync');
      return;
    }
    const { added, repaired, paired, limited } = await RunnrSync.runSync();
    await RunnrSync.refreshStatus();
    renderSyncPage();
    renderHomeBrokerPreview();
    updateHomeStats();
    renderJournal();
    refreshPortfolioIfVisible();
    if (added || repaired || paired) {
      switchPage('journal');
      const parts = [];
      if (added) parts.push(`${added} new`);
      if (repaired) parts.push(`${repaired} updated with prices`);
      if (paired) parts.push(`${paired} closed round-trip${paired === 1 ? '' : 's'}`);
      alert(`Synced — ${parts.join(', ')}.`);
    } else {
      alert('Synced — journal is up to date.');
    }
    maybeOpenJournalLimit(limited);
  } catch (e) {
    const msg = String(e.message || e);
    if (RunnrSync.isAuthError?.(msg)) {
      RunnrSync.logout();
      handleRunnrAuthExpired(msg);
      openSyncAuthModal();
      return;
    }
    if (/alpaca not connected/i.test(msg)) {
      openAlpacaModal();
      showToast('Runnr', 'Connect Alpaca once — works on all devices');
      return;
    }
    alert('Sync failed: ' + msg);
  }
}

function bootRunnrSync() {
  renderHeaderSyncPill();
  renderSyncAuthBanner();
  if (!window.RunnrSync || !RunnrSync.isLoggedIn()) {
    renderSyncPage();
    renderHomeBrokerPreview();
    return;
  }
  RunnrSync.verifySession()
    .then((ok) => {
      if (!ok) {
        handleRunnrAuthExpired('Session expired');
        renderSyncPage();
        renderHomeBrokerPreview();
        return null;
      }
      return RunnrSync.syncProfileState();
    })
    .then((profile) => {
      if (profile === null) return null;
      if (profile.action !== 'none') refreshAfterProfileSync();
      return RunnrSync.ensureAlpacaConnected().then((ok) => {
        if (!ok && RunnrSync.pushLocalAlpacaToAccount) {
          return RunnrSync.pushLocalAlpacaToAccount();
        }
        return ok;
      }).then((ok) => {
        const extra = [];
        if (typeof RunnrSync.ensureIbkrConnected === 'function') extra.push(RunnrSync.ensureIbkrConnected());
        if (typeof RunnrSync.ensureT212Connected === 'function') extra.push(RunnrSync.ensureT212Connected());
        return Promise.all(extra).then(() => ok);
      });
    })
    .then((result) => {
      if (result === null) return;
      return RunnrSync.repairJournalIfNeeded();
    })
    .then(() => {
      normalizeWatchlist();
      renderHeaderSyncPill();
      renderSyncPage();
      renderHomeBrokerPreview();
      renderJournal();
      updateHomeStats();
      renderWatchlist();
      if (typeof RunnrSync.enrichFromSnapshots === 'function') {
        RunnrSync.enrichFromSnapshots();
      }
      if (typeof RunnrSync.recoverWatchlistIfEmpty === 'function') {
        RunnrSync.recoverWatchlistIfEmpty();
      }
      normalizeWatchlist();
      renderWatchlist();
      updateHomeStats();
      if (document.getElementById('page-portfolio')?.classList.contains('active')) {
        loadPortfolio(portPeriod, document.querySelector('.period-tab.active'));
      }
      if (!watchlistIsEmptyOrDemo()) {
        return RunnrSync.pushProfileState().catch(() => {});
      }
    })
    .catch(() => {
      renderSyncPage();
      renderHomeBrokerPreview();
    });
}

try { bootRunnrSync(); } catch (e) { console.warn('bootRunnrSync failed', e); }
