/**
 * Runnr app — push notifications, price alerts, toasts.
 * Extracted from index.html (slice 1). Classic script; globals kept for onclick=.
 */
// ── PUSH NOTIFICATIONS & PRICE ALERTS ────────────────────────────────────
var alertState = {
  enabled: false,
  permission: 'default',
  fired: {}   // { 'SYM-entryPrice': timestamp } — prevents re-firing
};

// Restore saved alert state (Notification API missing on iOS Safari — must not throw at boot)
try {
  if (typeof Notification !== 'undefined') {
    alertState.permission = Notification.permission || 'default';
  }
  const saved = JSON.parse(localStorage.getItem('runnr_alerts') || '{}');
  if (typeof saved.enabled === 'boolean') alertState.enabled = saved.enabled;
  if (saved.fired && typeof saved.fired === 'object') alertState.fired = saved.fired;
} catch (e) {}

function persistAlerts() {
  try { localStorage.setItem('runnr_alerts', JSON.stringify({ enabled: alertState.enabled, fired: alertState.fired })); } catch(e) {}
}

async function requestNotifPermission() {
  if (!(await requirePro('Alerts'))) return;
  if (!('Notification' in window)) {
    showPermArea(
      '<div style="font-size:11px;color:var(--text2)">' + t('alerts.inAppOnly') + '</div>'
    );
    return;
  }
  const perm = await Notification.requestPermission();
  alertState.permission = perm;
  if (perm === 'granted') {
    alertState.enabled = true;
    persistAlerts();
    document.getElementById('notif-master-toggle').checked = true;
    renderNotifSettings();
    try {
      new Notification('Runnr Alerts Active', {
        body: 'You will be alerted when prices hit your entry zones.',
        icon: '',
      });
    } catch (e) {}
  } else {
    showPermArea(
      '<div style="font-size:11px;color:var(--text2)">' + t('alerts.pushDenied') + '</div>'
    );
    renderNotifSettings();
  }
}

function showPermArea(html) {
  const el = document.getElementById('notif-perm-area');
  if (el) el.innerHTML = html;
}

async function toggleNotifications(checked) {
  if (checked) {
    if (!(await requirePro('Alerts'))) {
      const toggle = document.getElementById('notif-master-toggle');
      if (toggle) toggle.checked = false;
      alertState.enabled = false;
      persistAlerts();
      renderNotifSettings();
      return;
    }
  }
  alertState.enabled = checked;
  persistAlerts();
  if (checked && typeof Notification !== 'undefined' && alertState.permission !== 'granted') {
    requestNotifPermission();
  }
  renderNotifSettings();
}

function renderNotifSettings() {
  const permArea  = document.getElementById('notif-perm-area');
  const alertList = document.getElementById('notif-alert-list');
  const toggle    = document.getElementById('notif-master-toggle');
  const riskLbl   = document.getElementById('notif-risk-label');
  if (!permArea) return;

  const alertsOn = !!alertState.enabled && hasProAccess();
  if (toggle) toggle.checked = alertsOn;
  if (riskLbl) riskLbl.textContent = S.risk + '%';

  if (!alertsOn && alertState.permission === 'default') {
    permArea.innerHTML =
      '<div class="notif-perm-banner">'
      + '<div class="nb-icon">🔔</div>'
      + '<div class="nb-text">' + t('alerts.enableBanner') + '</div>'
      + '<button class="nb-btn" onclick="document.getElementById(\'notif-master-toggle\').checked=true;toggleNotifications(true)">' + t('common.enable') + '</button>'
      + '</div>';
  } else if (alertsOn && alertState.permission !== 'granted') {
    permArea.innerHTML =
      '<div style="font-size:11px;color:var(--text2);line-height:1.45;margin-bottom:6px">'
      + t('alerts.inAppActive') + ' '
      + (typeof Notification !== 'undefined'
        ? '<button type="button" class="nb-btn" style="margin-top:6px" onclick="requestNotifPermission()">' + t('alerts.pushEnable') + '</button>'
        : t('alerts.inAppOnly'))
      + '</div>';
  } else {
    permArea.innerHTML = '';
  }

  if (!alertsOn || !S.watchlist.length) {
    if (alertList) alertList.style.display = 'none';
    return;
  }
  if (alertList) alertList.style.display = 'block';

  const itemsEl = document.getElementById('notif-items');
  if (itemsEl) {
    const armed = S.watchlist.length;
    itemsEl.innerHTML = '<div style="font-size:12px;color:var(--text2);line-height:1.5">' + t(armed === 1 ? 'alerts.monitoring' : 'alerts.monitoringMany', { count: armed }) + '</div>';
  }
}

function checkPriceAlerts() {
  if (!alertState.enabled) return;
  if (!hasProAccess()) return;
  S.watchlist.forEach(w => {
    const lp = liveprices[w.sym];
    if (!lp || !lp.price || lp.stale) return;

    const bandPct  = S.risk;
    const distPct  = Math.abs(distToEntry(lp.price, w.entry));
    const inZone   = distPct <= bandPct;
    const alertKey = w.sym + '-' + w.entry;

    if (!inZone) {
      // Price has moved away — reset so alert can fire again later
      if (alertState.fired[alertKey]) {
        const firedAt = alertState.fired[alertKey];
        if (Date.now() - firedAt > 15 * 60 * 1000) { // reset after 15 min
          delete alertState.fired[alertKey];
          persistAlerts();
        }
      }
      return;
    }

    // In zone — fire if not already fired recently
    if (alertState.fired[alertKey]) return;
    alertState.fired[alertKey] = Date.now();
    persistAlerts();

    const dir     = w.dir === 'long' ? 'Buy' : 'Sell';
    const diff    = distPct.toFixed(1);
    const msg     = dir + ' zone hit · ' + diff + '% from entry · Live: ' + fmtPrice(lp.price);

    // In-app toast (always)
    showToast(w.sym, msg);

    // Push notification (if tab is in background or permission granted)
    if (alertState.permission === 'granted') {
      try {
        new Notification('🎯 ' + w.sym + ' — Entry Zone Alert', {
          body: msg,
          icon: '',
          badge: '',
          tag: alertKey,
          renotify: false
        });
      } catch(e) {}
    }
  });
}

// ── In-app toast ───────────────────────────────────────────────────────────
var toastTimer = null;
function showToast(sym, msg) {
  const toast = document.getElementById('alert-toast');
  const symEl = document.getElementById('toast-sym');
  const msgEl = document.getElementById('toast-msg');
  if (!toast) return;
  if (symEl) symEl.textContent = '🎯 ' + sym + ' — Entry Zone Alert';
  if (msgEl) msgEl.textContent = msg;
  toast.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(dismissToast, 6000);
}

function dismissToast() {
  const toast = document.getElementById('alert-toast');
  if (toast) toast.classList.remove('show');
}

// ── Reset fired alerts (e.g. when risk % changes) ─────────────────────────
function resetAlerts() {
  alertState.fired = {};
  persistAlerts();
  renderNotifSettings();
}
