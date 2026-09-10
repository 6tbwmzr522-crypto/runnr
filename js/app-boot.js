/**
 * Runnr app — modals, tier badge, risk helpers, init.
 * Extracted from index.html (slice 1). Classic script; globals kept for onclick=.
 */
// ── MODALS ────────────────────────────────────────────────────────────────
function openModal(id) {
  if (window.RunnrGrowth?.close) RunnrGrowth.close();
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeModal(id) {
  document.getElementById(id)?.classList.remove('open');
  if (!document.querySelector('.modal-overlay.open')) document.body.style.overflow = '';
  if (id === 'modal-log' && !advancingIncompleteReview) reviewingIncompleteQueue = false;
}
function closeModalOutside(e, id) { if (e.target.id === id) closeModal(id); }

// ── TIER BADGE ────────────────────────────────────────────────────────────
function updateTierProgress() {
  const m = CoachEngine.metrics(S.trades);
  const fill = document.getElementById('tier-fill');
  if (fill) fill.style.width = Math.min(100, (m.count / 20) * 100) + '%';
}

function updateTier() {
  const score = CoachEngine.disciplineScore(S.trades);
  const total = score.tradeCount;
  const rate = total > 0 ? score.stopPct / 100 : 0;
  const badge  = document.getElementById('tier-badge');
  if (badge) {
    if (rate >= 0.85 && total >= 20) { badge.textContent = '🏆 ELITE'; }
    else if (rate >= 0.8 && total >= 20) { badge.textContent = '📈 CONSISTENT'; }
    else { badge.textContent = '🌱 NOVICE'; }
  }
  updateTierProgress();
}

// ── RISK HELPERS (ATR defaults) ───────────────────────────────────────────
function applyAtrSharesPreset() {
  if (!window.Baron?.applySharesPreset?.(S.bal, S.risk)) {
    alert('Enter an entry price first.');
    return;
  }
  S.risk = Baron.STRATEGY.risk_pct;
  updateHomeStats();
  persist();
}
window.applyBaronSharesPreset = applyAtrSharesPreset;

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

function bindAuthButton(id, handler) {
  const btn = document.getElementById(id);
  if (!btn || btn.dataset.bound) return;
  btn.dataset.bound = '1';
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    handler();
  });
}

function initSyncAuthForm() {
  const signinForm = document.getElementById('sync-inline-form');
  const modalForm = document.getElementById('sync-auth-form');
  const resetForm = document.getElementById('sync-reset-form');
  const forgotBtn = document.getElementById('sync-forgot-btn');

  bindAuthButton('sync-login-btn-inline', submitSyncContinue);
  bindAuthButton('sync-reset-btn', submitSyncResetPassword);
  bindAuthButton('sync-reset-send-btn', submitSyncForgotPassword);
  bindAuthButton('sync-login-btn', submitSyncContinue);

  ['sync-email', 'sync-email-inline'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el || el.dataset.namePrefill) return;
    el.dataset.namePrefill = '1';
    el.addEventListener('input', fillSyncAuthFirstName);
    el.addEventListener('change', fillSyncAuthFirstName);
  });

  if (signinForm && !signinForm.dataset.bound) {
    signinForm.dataset.bound = '1';
    signinForm.addEventListener('submit', (e) => {
      e.preventDefault();
      submitSyncContinue();
    });
    signinForm.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.shiftKey) return;
      e.preventDefault();
      if (signinForm.requestSubmit) signinForm.requestSubmit();
      else submitSyncContinue();
    });
  }
  if (modalForm && !modalForm.dataset.bound) {
    modalForm.dataset.bound = '1';
    modalForm.addEventListener('submit', (e) => {
      e.preventDefault();
      submitSyncContinue();
    });
    modalForm.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.shiftKey) return;
      e.preventDefault();
      if (modalForm.requestSubmit) modalForm.requestSubmit();
      else submitSyncContinue();
    });
  }
  if (resetForm && !resetForm.dataset.bound) {
    resetForm.dataset.bound = '1';
    resetForm.addEventListener('submit', (e) => {
      e.preventDefault();
      submitSyncResetPassword();
    });
  }
  if (forgotBtn && !forgotBtn.dataset.bound) {
    forgotBtn.dataset.bound = '1';
    forgotBtn.addEventListener('click', (e) => {
      e.preventDefault();
      closeModal('modal-sync-auth');
      switchPage('sync');
      scrollSyncAuthIntoView('sync-reset-auth');
    });
  }
  const resendVerify = document.getElementById('sync-resend-verify-btn');
  const continueVerify = document.getElementById('sync-continue-verify-btn');
  if (resendVerify && !resendVerify.dataset.bound) {
    resendVerify.dataset.bound = '1';
    resendVerify.addEventListener('click', async () => {
      resendVerify.disabled = true;
      try {
        const data = await RunnrSync.resendVerification();
        rememberVerificationSent({ verification_sent: !!(data && data.verification_sent) });
        showToast('Runnr', data && data.detail ? data.detail : 'Verification email sent');
        if (data && data.verify_url) {
          const copy = document.getElementById('sync-verify-copy');
          if (copy) {
            copy.innerHTML += ' <a href="' + data.verify_url + '" style="color:var(--gold)">verify now</a>.';
          }
        }
      } catch (err) {
        showToast('Runnr', String(err.message || err));
      }
      resendVerify.disabled = false;
    });
  }
  if (continueVerify && !continueVerify.dataset.bound) {
    continueVerify.dataset.bound = '1';
    continueVerify.addEventListener('click', () => {
      dismissVerifyBanner();
    });
  }
  const dismissVerify = document.getElementById('sync-dismiss-verify-btn');
  if (dismissVerify && !dismissVerify.dataset.bound) {
    dismissVerify.dataset.bound = '1';
    dismissVerify.addEventListener('click', () => {
      dismissVerifyBanner();
    });
  }
}

function initApp() {
  if (!document.querySelector('.page.active')) {
    document.getElementById('page-home')?.classList.add('active');
  }
  try { applyGuestShell(); } catch (e) {}
  try { if (window.RunnrI18n) RunnrI18n.init(S.lang || 'en', S); } catch (e) {}
  try { normalizeWatchlist(); } catch (e) {}
  try { ensureWatchFromPositions(); } catch (e) {}
  try { updateHomeStats(); } catch (e) {}
  try { renderChallengePanel(); } catch (e) {}
  try {
    if (window.OptionsCoach) {
      OptionsCoach.setMode(S.optCoachMode || 'leaps');
      OptionsCoach.setWheelKind(S.optWheelKind || 'csp');
      applyOptCoachMode(S.optCoachMode || 'leaps');
    }
  } catch (e) {}
  try { renderHomePreviews(); } catch (e) {}
  try { initSyncAuthForm(); } catch (e) {}
  try { initCsvDropZone(); } catch (e) {}
  registerServiceWorker();
  try { renderHeaderSyncPill(); } catch (e) {}
  try { refreshBillingUI(); } catch (e) {}
  try { maybePullWatchlistFromCloud(); } catch (e) {}
  try { window.RunnrIntro?.bind?.(); } catch (e) {}
  const params = new URLSearchParams(location.search);
  if (params.get('oauth')) {
    const code = params.get('oauth');
    history.replaceState(null, '', location.pathname + location.hash);
    window._runnrAuthPending = true;
    RunnrSync.consumeOAuthCode(code)
      .then((data) => {
        rememberVerificationSent(data);
        renderHeaderSyncPill();
        applyGuestShell();
        switchPage('home');
        try { updateHomeStats(); renderHomePreviews(); renderHomeBrokerPreview(); } catch (err) {}
        return RunnrSync.syncProfileState()
          .then((profile) => {
            if (profile && profile.action !== 'none') refreshAfterProfileSync();
            return postLoginAlpacaFlow({ autoSync: true, toast: true });
          })
          .catch(() => showToast('Runnr', 'Signed in'));
      })
      .then(() => {
        window._runnrAuthPending = false;
        return RunnrSync.refreshBilling?.();
      })
      .then(() => {
        try { window.RunnrIntro?.maybeShow?.(S); } catch (err) {}
      })
      .catch((e) => {
        window._runnrAuthPending = false;
        showToast('Runnr', String(e.message || e));
      });
  }
  if (params.get('verify')) {
    const token = params.get('verify');
    history.replaceState(null, '', location.pathname + location.hash);
    RunnrSync.verifyEmail(token)
      .then(() => {
        showToast('Runnr', 'Email verified');
        return RunnrSync.refreshBilling?.();
      })
      .then(() => {
        hideSyncVerify();
        refreshBillingUI();
      })
      .catch((e) => alert('Verification failed: ' + (e.message || e)));
  } else if (params.get('reset')) {
    const token = params.get('reset');
    history.replaceState(null, '', location.pathname + location.hash);
    switchPage('sync');
    const reset = document.getElementById('sync-reset-auth');
    const login = document.getElementById('sync-inline-auth');
    if (reset) reset.style.display = 'block';
    if (login) login.style.display = 'none';
    showResetSetFields(token);
    showSyncResetStatus('Choose a new password below.', 'ok');
  }
  if (/[?&]billing=success/.test(location.search)) {
    history.replaceState(null, '', location.pathname + location.hash);
    showToast('Runnr', 'Subscription active — welcome aboard');
    if (window.RunnrSync?.isLoggedIn?.()) {
      RunnrSync.refreshBilling?.().then(() => refreshBillingUI()).catch(() => {});
    }
  } else if (/[?&]billing=cancel/.test(location.search)) {
    history.replaceState(null, '', location.pathname + location.hash);
    showToast('Runnr', 'Checkout cancelled');
  } else if (/[?&]billing=upgrade/.test(location.search)) {
    history.replaceState(null, '', location.pathname + location.hash);
    const openPaywall = () => {
      if (typeof openUpgrade === 'function') openUpgrade('Your 7-day trial has ended');
    };
    if (window.RunnrSync?.isLoggedIn?.()) {
      RunnrSync.refreshBilling?.()
        .then(() => { try { refreshBillingUI(); } catch (e) {} openPaywall(); })
        .catch(() => openPaywall());
    } else if (typeof openSyncAuthModal === 'function') {
      openSyncAuthModal();
      showToast('Runnr', 'Sign in, then subscribe to keep Runnr');
    }
  }
  if (/[?&]signedin=1/.test(location.search) && window.RunnrSync?.isLoggedIn?.()) {
    history.replaceState(null, '', location.pathname + location.hash);
    renderHeaderSyncPill();
    applyGuestShell();
    switchPage('home');
    try { updateHomeStats(); renderHomePreviews(); renderHomeBrokerPreview(); } catch (e) {}
    RunnrSync.syncProfileState()
      .then((profile) => {
        if (profile && profile.action !== 'none') refreshAfterProfileSync();
        return postLoginAlpacaFlow({ autoSync: true, toast: true });
      })
      .catch(() => showToast('Runnr', 'Signed in'));
  }
  if (window.RunnrGrowth) {
    RunnrGrowth.renderHomeBanner(S);
    RunnrGrowth.scheduleDigestCheck(S);
    RunnrGrowth.bootGate(S);
    setTimeout(() => { RunnrGrowth.bootGate(S); }, 600);
  }
  if (window.RunnrSync?.isLoggedIn?.() && !params.get('oauth')) {
    const showIntro = () => { try { window.RunnrIntro?.maybeShow?.(S); } catch (e) {} };
    if (RunnrSync.refreshBilling) RunnrSync.refreshBilling().catch(() => {}).then(showIntro);
    else setTimeout(showIntro, 200);
  }
  setTimeout(() => {
    try { startMarketFeedsIfAllowed(); } catch (e) {}
    if (window.RunnrSync?.isLoggedIn?.()) {
      applyGuestShell();
      RunnrSync.refreshStatus().catch(() => {});
      RunnrSync.refreshBilling?.()
        .then(() => {
          refreshBillingUI();
          const mailerOn = !!RunnrSync.billing?.().emailConfigured;
          if (mailerOn && !RunnrSync.isEmailVerified?.()) {
            let sent = true;
            try { sent = sessionStorage.getItem('runnr_verify_sent') !== '0'; } catch (e) {}
            rememberVerificationSent({ verification_sent: sent });
            updateVerifyBanner();
          }
        })
        .catch(() => refreshBillingUI());
    }
  }, 400);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { try { initApp(); } catch (e) { console.warn('initApp', e); } });
} else {
  try { initApp(); } catch (e) { console.warn('initApp', e); }
}

window.addEventListener('resize', () => {
  if (document.getElementById('page-coach')?.classList.contains('active')) drawEquityCurve();
  if (window.RunnrWave) RunnrWave.onResize();
});
window.addEventListener('unhandledrejection', (e) => {
  const msg = String(e.reason?.message || e.reason || '');
  if (/sync|auth|password|login|reset|runnr/i.test(msg)) {
    showSyncResetError(msg || 'Something went wrong — try again');
    setSyncAuthBusy(false, 'reset');
    setSyncAuthBusy(false, 'signin');
    _syncResetRunning = false;
  }
});
