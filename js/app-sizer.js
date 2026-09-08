/**
 * Runnr app — sizer tabs, calculators, challenge book, crypto sizer.
 * Extracted from index.html (slice 1). Classic script; globals kept for onclick=.
 */
// ── SIZER TABS ─────────────────────────────────────────────────────────────
function switchSizerTab(tab, el) {
  if (tab === 'crypto') {
    // Crypto lives on its own page
    switchPage('crypto');
    renderChallengePanel();
    try { calcCrypto(); } catch (e) {}
    return;
  }
  ['cfd','shares','options'].forEach(t => {
    document.getElementById('sizer-'+t).style.display = t===tab ? 'block' : 'none';
  });
  document.querySelectorAll('#page-sizer > .tabs > .tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  if (tab === 'cfd') try { calcCFD(); } catch (e) {}
  if (tab === 'shares') try { calcShares(); } catch (e) {}
  if (tab === 'options') {
    try {
      if (window.OptionsCoach) {
        OptionsCoach.setMode(S.optCoachMode || 'leaps');
        if (S.optWheelKind) OptionsCoach.setWheelKind(S.optWheelKind);
        applyOptCoachMode(S.optCoachMode || 'leaps');
      }
      if ((S.optCoachMode || 'leaps') === 'review') renderOptCoachReview();
      else calcOptions();
    } catch (e) {}
  }
}
function switchOptType(type, el) {
  S.optType = type;
  const tabs = el ? el.parentElement : document.getElementById('opt-type-tabs');
  if (tabs) tabs.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  const btn = el || document.getElementById(type === 'put' ? 'opt-type-put' : 'opt-type-call');
  if (btn) btn.classList.add('active');
  calcOptions();
}

function switchOptWheelKind(kind, el) {
  if (window.OptionsCoach) OptionsCoach.setWheelKind(kind);
  S.optWheelKind = kind === 'cc' ? 'cc' : 'csp';
  const tabs = el ? el.parentElement : document.getElementById('opt-wheel-tabs');
  if (tabs) tabs.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  const btn = el || document.getElementById(kind === 'cc' ? 'opt-wheel-cc' : 'opt-wheel-csp');
  if (btn) btn.classList.add('active');
  S.optType = S.optWheelKind === 'cc' ? 'call' : 'put';
  const callTab = document.getElementById('opt-type-call');
  const putTab = document.getElementById('opt-type-put');
  if (callTab && putTab) {
    callTab.classList.toggle('active', S.optType === 'call');
    putTab.classList.toggle('active', S.optType === 'put');
  }
  calcOptions();
}

function switchOptCoachMode(id) {
  const mode = window.OptionsCoach ? OptionsCoach.setMode(id) : { id: id || 'leaps' };
  S.optCoachMode = mode.id;
  applyOptCoachMode(mode.id);
  if (mode.id === 'review') {
    renderOptCoachReview();
    return;
  }
  calcOptions();
}

function applyOptCoachMode(id) {
  const coach = window.OptionsCoach;
  const mode = coach ? coach.modeOf(id) : { id: 'leaps', title: 'Size the LEAPS / long option', help: '', focus: [] };
  document.querySelectorAll('.opt-mode-pill').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-opt-mode') === mode.id);
  });
  const title = document.getElementById('opt-coach-title');
  const help = document.getElementById('opt-coach-help');
  if (title) title.textContent = mode.title || '';
  if (help) help.textContent = mode.help || '';
  const calc = document.getElementById('opt-coach-calc');
  const review = document.getElementById('opt-coach-review');
  const logBtn = document.getElementById('opt-log-btn');
  const editBtn = document.getElementById('opt-log-edit-btn');
  const isReview = mode.id === 'review';
  if (calc) calc.style.display = isReview ? 'none' : 'block';
  if (review) review.style.display = isReview ? 'block' : 'none';
  if (logBtn) {
    logBtn.style.display = isReview ? 'none' : '';
    logBtn.textContent = 'Log This Trade';
    logBtn.style.opacity = '1';
    logBtn.style.pointerEvents = 'auto';
  }
  if (editBtn) editBtn.style.display = isReview ? 'none' : '';
  const widthRow = document.getElementById('opt-field-width');
  if (widthRow) widthRow.style.display = mode.id === 'putcredit' ? 'block' : 'none';
  const wheelTabs = document.getElementById('opt-wheel-tabs');
  const typeTabs = document.getElementById('opt-type-tabs');
  if (wheelTabs) wheelTabs.style.display = mode.id === 'wheel' ? 'flex' : 'none';
  if (typeTabs) typeTabs.style.display = mode.id === 'leaps' ? 'flex' : 'none';
  const premLbl = document.getElementById('opt-prem-lbl');
  if (premLbl) {
    premLbl.textContent = mode.id === 'leaps' ? 'Premium / Contract' : 'Credit / Contract';
  }
  const targetField = document.getElementById('opt-field-target');
  if (targetField) targetField.style.opacity = mode.id === 'leaps' ? '1' : '0.7';
  const calcTitle = document.getElementById('opt-calc-title');
  if (calcTitle) {
    calcTitle.textContent = mode.id === 'wheel'
      ? 'Wheel sizer'
      : (mode.id === 'putcredit' ? 'Put-credit sizer' : 'Options Calculator');
  }
  if (mode.id === 'wheel') {
    const kind = (window.OptionsCoach && OptionsCoach.wheelKind) || S.optWheelKind || 'csp';
    switchOptWheelKind(kind);
  } else if (mode.id === 'putcredit') {
    S.optType = 'put';
    const callTab = document.getElementById('opt-type-call');
    const putTab = document.getElementById('opt-type-put');
    if (callTab && putTab) {
      callTab.classList.remove('active');
      putTab.classList.add('active');
    }
  }
  document.querySelectorAll('#opt-coach-calc .field').forEach((f) => f.classList.remove('opt-focus'));
  (mode.focus || []).forEach((fid) => {
    const input = document.getElementById(fid);
    const field = input ? input.closest('.field') : document.getElementById(fid.replace(/^opt-/, 'opt-field-'));
    if (field) field.classList.add('opt-focus');
  });
}

function renderOptCoachReview() {
  const empty = document.getElementById('opt-review-empty');
  const list = document.getElementById('opt-review-list');
  if (!list) return;
  const coach = window.OptionsCoach;
  const rows = coach ? coach.flaggedOptionsTrades(S.trades) : [];
  if (!rows.length) {
    if (empty) empty.style.display = 'block';
    list.innerHTML = '';
    return;
  }
  if (empty) empty.style.display = 'none';
  const DR = typeof DisciplineReplay !== 'undefined' ? DisciplineReplay : null;
  list.innerHTML = rows.slice(0, 8).map((t) => {
    const canReplay = DR && DR.canReplay(t, S, typeof Baron !== 'undefined' ? Baron : null);
    const flag = t.incomplete ? 'Incomplete' : (t.sizeOk === false ? 'Size flagged' : 'Stop flagged');
    const cta = canReplay ? 'Replay Disciplined' : (t.incomplete ? 'Open fill' : 'Open in journal');
    const safeId = String(t.id).replace(/[^0-9A-Za-z_-]/g, '');
    const action = canReplay
      ? `openDisciplineReplay('${safeId}')`
      : `openTradeEditor('${safeId}')`;
    const name = String(t.instr || 'Options fill').replace(/[&<>]/g, '');
    return `<div class="opt-review-row">
      <div class="opt-review-meta"><strong>${name}</strong>${flag} · ${t.date || '—'}</div>
      <button type="button" class="btn btn-sm" onclick="${action}">${cta}</button>
    </div>`;
  }).join('');
}

function openOptionsFillReview(id) {
  const t = S.trades.find(x => tradeId(x.id) === tradeId(id));
  if (!t) return;
  const DR = typeof DisciplineReplay !== 'undefined' ? DisciplineReplay : null;
  if (DR && DR.canReplay(t, S, typeof Baron !== 'undefined' ? Baron : null)) {
    openDisciplineReplay(id);
    return;
  }
  openTradeEditor(id);
}

// ── CALCULATORS ────────────────────────────────────────────────────────────
function rrVerdict(rr) {
  if (!rr || rr <= 0) return null;
  if (rr >= 2) return { cls:'rr-good', text:`✓ R:R ${rr.toFixed(1)} — Good setup` };
  if (rr >= 1.5) return { cls:'rr-ok', text:`~ R:R ${rr.toFixed(1)} — Acceptable` };
  return { cls:'rr-bad', text:`✗ R:R ${rr.toFixed(1)} — Poor risk/reward` };
}
function showVerdict(elId, rr) {
  const el = document.getElementById(elId);
  const v = rrVerdict(rr);
  if (v) { el.className='rr-verdict '+v.cls; el.textContent=v.text; el.style.display='block'; }
  else el.style.display='none';
}

function sizerBalance() {
  return (typeof Baron !== 'undefined' && Baron.sizerBalance) ? Baron.sizerBalance(S) : (S.bal || 0);
}

function challengeEnabled() {
  return !!(S.challenge && S.challenge.enabled);
}

function getChallengeRemaining() {
  if (typeof Baron === 'undefined' || !Baron.challengeRemaining) return null;
  return Baron.challengeRemaining(S.challenge, S.trades, new Date(), {
    resolvePnl: (t) => (typeof resolveTradePnl === 'function' ? resolveTradePnl(t) : Baron.resolveTradePnl(t)),
    isOpenTrade: (t) => Baron.isOpenTrade(t),
  });
}

function moneyAmt(n) {
  const v = Math.round(Number(n) || 0);
  return S.sym + Math.abs(v).toLocaleString();
}

var lastChallengeVerdict = null;

function challengeUnitLabel(type) {
  if (type === 'shares') return 'shares';
  if (type === 'crypto') return 'units';
  return 'contracts';
}

function syncChallengeBookUI() {
  const on = challengeEnabled();
  const pers = document.getElementById('sizer-book-personal');
  const chal = document.getElementById('sizer-book-challenge');
  if (pers) pers.classList.toggle('active', !on);
  if (chal) chal.classList.toggle('active', on);
  const tog = document.getElementById('set-ch-enabled');
  if (tog) tog.checked = on;
}

function setChallengeBook(on, opts) {
  opts = opts || {};
  if (typeof Baron !== 'undefined' && Baron.normalizeChallenge) {
    S.challenge = Baron.normalizeChallenge(S.challenge);
  } else {
    S.challenge = S.challenge || { enabled: false };
  }
  S.challenge.enabled = !!on;
  persist();
  syncChallengeBookUI();
  renderChallengePanel();
  if (document.getElementById('page-journal')?.classList.contains('active')) renderJournal();
  if (!opts.skipCalc) {
    try { calcCFD(); } catch (e) {}
    try { calcShares(); } catch (e) {}
    try { if (document.getElementById('sizer-options')?.style.display !== 'none') calcOptions(); } catch (e) {}
    try { calcCrypto(); } catch (e) {}
  }
}
window.setChallengeBook = setChallengeBook;

function parseOverrideInput(id) {
  const el = document.getElementById(id);
  if (!el) return null;
  const raw = String(el.value || '').trim();
  if (raw === '') return null;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

function applyChallengePresetFromSettings(presetId) {
  if (typeof Baron === 'undefined' || !Baron.applyChallengePreset) return;
  const next = Baron.applyChallengePreset(S.challenge, presetId);
  const firm = document.getElementById('set-ch-firm');
  const size = document.getElementById('set-ch-size');
  const daily = document.getElementById('set-ch-daily');
  const dd = document.getElementById('set-ch-dd');
  const target = document.getElementById('set-ch-target');
  const cons = document.getElementById('set-ch-consistency');
  const sel = document.getElementById('set-ch-preset');
  if (firm) firm.value = next.firm;
  if (size) size.value = next.accountSize;
  if (daily) daily.value = next.maxDailyLoss;
  if (dd) dd.value = next.maxTrailingDd;
  if (target) target.value = next.profitTarget;
  if (cons) cons.value = next.consistencyPct != null ? next.consistencyPct : 0;
  if (sel) sel.value = presetId === 'custom' ? 'custom' : (next.preset || presetId);
}
window.applyChallengePresetFromSettings = applyChallengePresetFromSettings;

function markChallengeCustom() {
  const sel = document.getElementById('set-ch-preset');
  if (sel) sel.value = 'custom';
  if (S.challenge) S.challenge.preset = 'custom';
}
window.markChallengeCustom = markChallengeCustom;

function fillChallengeSettingsForm() {
  const c = (typeof Baron !== 'undefined' && Baron.normalizeChallenge)
    ? Baron.normalizeChallenge(S.challenge)
    : (S.challenge || {});
  S.challenge = c;
  const en = document.getElementById('set-ch-enabled');
  const preset = document.getElementById('set-ch-preset');
  const firm = document.getElementById('set-ch-firm');
  const size = document.getElementById('set-ch-size');
  const daily = document.getElementById('set-ch-daily');
  const dd = document.getElementById('set-ch-dd');
  const target = document.getElementById('set-ch-target');
  const cons = document.getElementById('set-ch-consistency');
  if (en) en.checked = !!c.enabled;
  if (preset) preset.value = c.preset || 'custom';
  if (firm) firm.value = c.firm || '';
  if (size) size.value = c.accountSize || '';
  if (daily) daily.value = c.maxDailyLoss || '';
  if (dd) dd.value = c.maxTrailingDd || '';
  if (target) target.value = c.profitTarget || '';
  if (cons) cons.value = c.consistencyPct != null ? c.consistencyPct : 0;
  const od = document.getElementById('set-ch-over-daily');
  const odd = document.getElementById('set-ch-over-dd');
  const op = document.getElementById('set-ch-over-profit');
  if (od) od.value = c.overrideDailyUsed != null ? c.overrideDailyUsed : '';
  if (odd) odd.value = c.overrideDdUsed != null ? c.overrideDdUsed : '';
  if (op) op.value = c.overrideProfit != null ? c.overrideProfit : '';
}

function readChallengeSettingsForm() {
  if (typeof Baron === 'undefined' || !Baron.normalizeChallenge) return;
  S.challenge = Baron.normalizeChallenge({
    enabled: document.getElementById('set-ch-enabled')?.checked,
    preset: document.getElementById('set-ch-preset')?.value,
    firm: document.getElementById('set-ch-firm')?.value,
    accountSize: document.getElementById('set-ch-size')?.value,
    maxDailyLoss: document.getElementById('set-ch-daily')?.value,
    maxTrailingDd: document.getElementById('set-ch-dd')?.value,
    profitTarget: document.getElementById('set-ch-target')?.value,
    consistencyPct: document.getElementById('set-ch-consistency')?.value,
    overrideDailyUsed: parseOverrideInput('set-ch-over-daily'),
    overrideDdUsed: parseOverrideInput('set-ch-over-dd'),
    overrideProfit: parseOverrideInput('set-ch-over-profit'),
  });
}

function challengeBookLabel(rem) {
  if (!rem) return 'CHALLENGE';
  return 'CHALLENGE · ' + (rem.firm || 'Eval') + (rem.accountSize >= 1000 ? ' ' + Math.round(rem.accountSize / 1000) + 'k' : '');
}

function paintChallengeMeter(prefix, rem) {
  const dailyPct = rem.dailyLimit > 0 ? Math.min(100, (rem.dailyUsed / rem.dailyLimit) * 100) : 0;
  const ddPct = rem.ddLimit > 0 ? Math.min(100, (rem.ddUsed / rem.ddLimit) * 100) : 0;
  const profitPct = rem.profitTarget > 0 ? Math.min(100, Math.max(0, rem.profit / rem.profitTarget) * 100) : 0;
  const dailyVal = document.getElementById(prefix + '-daily-used');
  const dailyCap = document.getElementById(prefix + '-daily-cap');
  const dailyBar = document.getElementById(prefix + '-daily-bar');
  const ddVal = document.getElementById(prefix + '-dd-used');
  const ddCap = document.getElementById(prefix + '-dd-cap');
  const ddBar = document.getElementById(prefix + '-dd-bar');
  const pVal = document.getElementById(prefix + '-profit-val');
  const pCap = document.getElementById(prefix + '-profit-cap');
  const pBar = document.getElementById(prefix + '-profit-bar');
  if (dailyVal) {
    dailyVal.textContent = moneyAmt(rem.dailyUsed) + ' used · ' + moneyAmt(rem.dailyLeft) + ' left';
    dailyVal.classList.toggle('hot', rem.dailyLeft <= 0);
  }
  if (dailyCap) dailyCap.textContent = 'of ' + moneyAmt(rem.dailyLimit);
  if (dailyBar) {
    dailyBar.style.width = dailyPct + '%';
    dailyBar.className = rem.dailyLeft <= 0 ? 'hot' : '';
  }
  if (ddVal) {
    ddVal.textContent = moneyAmt(rem.ddUsed) + ' used · ' + moneyAmt(rem.ddLeft) + ' left';
    ddVal.classList.toggle('mint', rem.ddLeft > 0);
    ddVal.classList.toggle('hot', rem.ddLeft <= 0);
  }
  if (ddCap) ddCap.textContent = 'of ' + moneyAmt(rem.ddLimit);
  if (ddBar) {
    ddBar.style.width = ddPct + '%';
    ddBar.className = rem.ddLeft <= 0 ? 'hot' : 'mint';
  }
  if (pVal) pVal.textContent = (rem.profit < 0 ? '−' : '') + moneyAmt(rem.profit) + ' · ' + moneyAmt(rem.profitLeft) + ' to target';
  if (pCap) pCap.textContent = '/ ' + moneyAmt(rem.profitTarget) + ' target';
  if (pBar) {
    pBar.style.width = profitPct + '%';
    pBar.className = 'mint';
  }
  const consRow = document.getElementById(prefix + '-cons-row');
  const consVal = document.getElementById(prefix + '-cons-val');
  const consCap = document.getElementById(prefix + '-cons-cap');
  const consBar = document.getElementById(prefix + '-cons-bar');
  if (consRow) consRow.style.display = rem.consistencyOn ? 'block' : 'none';
  if (rem.consistencyOn) {
    const sharePct = Math.round((rem.consistencyShare || 0) * 100);
    if (consVal) {
      consVal.textContent = moneyAmt(rem.bestDayPnl) + ' · ' + sharePct + '% of profit';
      consVal.classList.toggle('hot', rem.profit > 0 && rem.bestDayPnl > rem.consistencyCapAmt);
      consVal.classList.toggle('mint', !(rem.profit > 0 && rem.bestDayPnl > rem.consistencyCapAmt));
    }
    if (consCap) consCap.textContent = rem.consistencyPct + '% cap';
    if (consBar) {
      const capPct = rem.consistencyPct > 0 ? Math.min(100, (sharePct / rem.consistencyPct) * 100) : 0;
      consBar.style.width = capPct + '%';
      consBar.className = rem.profit > 0 && rem.bestDayPnl > rem.consistencyCapAmt ? 'hot' : '';
    }
  }
}

function challengeApproachCopy(rem) {
  if (!rem || typeof Baron === 'undefined' || !Baron.challengeApproaching) return '';
  const a = Baron.challengeApproaching(rem);
  if (!a.tight) return '';
  const bits = [];
  if (a.reasons.includes('daily')) bits.push('Daily loss is tight — ' + moneyAmt(rem.dailyLeft) + ' left of ' + moneyAmt(rem.dailyLimit) + '.');
  if (a.reasons.includes('dd')) bits.push('Trailing DD is tight — ' + moneyAmt(rem.ddLeft) + ' left of ' + moneyAmt(rem.ddLimit) + '.');
  if (a.reasons.includes('consistency')) {
    const sharePct = Math.round((rem.consistencyShare || 0) * 100);
    bits.push('Best day is ' + sharePct + '% of profit — cap is ' + rem.consistencyPct + '%.');
  }
  return bits.join(' ');
}

function paintChallengeApproach(id, rem) {
  const el = document.getElementById(id);
  if (!el) return;
  const copy = challengeApproachCopy(rem);
  if (copy) {
    el.style.display = 'block';
    el.textContent = copy;
  } else {
    el.style.display = 'none';
    el.textContent = '';
  }
}

function renderHomeChallengeCard(rem) {
  const card = document.getElementById('home-challenge-card');
  if (!card) return;
  const on = challengeEnabled() && !!rem;
  card.style.display = on ? 'block' : 'none';
  if (!on) {
    paintChallengeApproach('home-ch-approach-warn', null);
    return;
  }
  const pill = document.getElementById('home-ch-pill');
  if (pill) pill.textContent = challengeBookLabel(rem);
  paintChallengeMeter('home-ch', rem);
  paintChallengeApproach('home-ch-approach-warn', rem);
  const src = document.getElementById('home-ch-source');
  if (src) {
    src.textContent = (!rem.dailyFromJournal || !rem.ddFromJournal || !rem.profitFromJournal)
      ? 'Using manual override — change it in Settings if the eval screen differs.'
      : 'From journal P&L on this book.';
  }
}

function renderChallengePanel() {
  syncChallengeBookUI();
  const on = challengeEnabled();
  const panel = document.getElementById('sizer-challenge-panel');
  const pill = document.getElementById('sizer-challenge-pill');
  if (panel) panel.style.display = on ? 'block' : 'none';
  const rem = on ? getChallengeRemaining() : null;
  const label = challengeBookLabel(rem);
  if (pill) {
    pill.style.display = on ? 'inline-block' : 'none';
    pill.textContent = label;
  }
  renderHomeChallengeCard(rem);
  if (!on || !rem) {
    lastChallengeVerdict = null;
    hideAllChallengeGates();
    ['cfd', 'sh', 'cry'].forEach((p) => {
      const line = document.getElementById(p + '-challenge-line');
      if (line) line.style.display = 'none';
    });
    const cryStatus = document.getElementById('crypto-challenge-status');
    if (cryStatus) cryStatus.style.display = 'none';
    paintChallengeApproach('ch-approach-warn', null);
    paintChallengeApproach('crypto-ch-approach-warn', null);
    resetSizerLogButtons();
    return rem;
  }
  paintChallengeMeter('ch', rem);
  paintChallengeApproach('ch-approach-warn', rem);
  const src = document.getElementById('ch-source');
  if (src) {
    const bits = [];
    if (!rem.dailyFromJournal || !rem.ddFromJournal || !rem.profitFromJournal) bits.push('Using manual override');
    else bits.push('From journal P&L on this book');
    bits.push('override in Settings if your eval dashboard differs.');
    src.textContent = bits.join(' — ');
  }
  const cryStatus = document.getElementById('crypto-challenge-status');
  if (cryStatus) {
    cryStatus.style.display = 'block';
    const d = document.getElementById('crypto-ch-daily');
    const dd = document.getElementById('crypto-ch-dd');
    const tgt = document.getElementById('crypto-ch-target');
    if (d) d.textContent = moneyAmt(rem.dailyLeft) + ' left';
    if (dd) dd.textContent = moneyAmt(rem.ddLeft) + ' left';
    if (tgt) {
      const pct = rem.profitTarget > 0 ? Math.max(0, Math.round((rem.profit / rem.profitTarget) * 100)) : 0;
      tgt.textContent = pct + '%';
    }
    paintChallengeApproach('crypto-ch-approach-warn', rem);
  }
  return rem;
}

function challengeGateId(type) {
  if (type === 'shares') return 'sh-challenge-gate';
  if (type === 'crypto') return 'crypto-challenge-gate';
  if (type === 'options') return 'opt-challenge-gate';
  return 'cfd-challenge-gate';
}

function hideAllChallengeGates() {
  ['cfd-challenge-gate', 'sh-challenge-gate', 'crypto-challenge-gate', 'opt-challenge-gate'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}

function resetSizerLogButtons() {
  [['cfd-log-btn', 'Log This Trade'], ['sh-log-btn', 'Log This Trade'], ['cry-log-btn', 'Log This Trade']].forEach(([id, label]) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.textContent = label;
    btn.style.opacity = '1';
    btn.style.pointerEvents = 'auto';
  });
}

function applyChallengeFill(type, size, cashRisk, proposedProfit) {
  const rem = renderChallengePanel();
  const lineId = type === 'shares' ? 'sh-challenge-line' : (type === 'crypto' ? 'cry-challenge-line' : (type === 'options' ? null : 'cfd-challenge-line'));
  const line = lineId ? document.getElementById(lineId) : null;
  hideAllChallengeGates();
  const gate = document.getElementById(challengeGateId(type));
  const btnId = type === 'shares' ? 'sh-log-btn' : (type === 'crypto' ? 'cry-log-btn' : (type === 'options' ? null : 'cfd-log-btn'));
  const btn = btnId ? document.getElementById(btnId) : null;
  if (!challengeEnabled() || !rem || typeof Baron === 'undefined') {
    lastChallengeVerdict = null;
    if (line) line.style.display = 'none';
    if (gate) gate.style.display = 'none';
    if (btn) { btn.textContent = 'Log This Trade'; btn.style.opacity = '1'; btn.style.pointerEvents = 'auto'; }
    return { blocked: false };
  }
  if (!(cashRisk > 0) || !(size > 0)) {
    lastChallengeVerdict = { blocked: false };
    if (line) line.style.display = 'none';
    if (gate) gate.style.display = 'none';
    if (btn) { btn.textContent = 'Log This Trade'; }
    return lastChallengeVerdict;
  }
  const add = Number(proposedProfit) || 0;
  const verdict = Baron.evaluateChallengeFill(rem, cashRisk, size, add);
  const unitLabel = challengeUnitLabel(type);
  verdict.unitLabel = unitLabel;
  verdict.note = verdict.blocked ? Baron.challengeNearMissNote(verdict, unitLabel) : '';
  lastChallengeVerdict = verdict;
  if (verdict.blocked) {
    let why;
    if (verdict.reason === 'consistency') why = 'consistency cap (best day ≤ ' + rem.consistencyPct + '% of profit)';
    else if (verdict.reason === 'dd') why = 'trailing DD left ' + moneyAmt(verdict.ddLeft);
    else why = 'daily loss left ' + moneyAmt(verdict.dailyLeft);
    if (line) {
      line.style.display = 'block';
      line.textContent = verdict.reason === 'consistency'
        ? `${Number.isInteger(size) ? size : size} ${unitLabel} would add ${moneyAmt(add)} today — ${why}`
        : `${Number.isInteger(size) ? size : size} ${unitLabel} would risk ${moneyAmt(cashRisk)} — ${why}`;
    }
    if (gate) {
      gate.style.display = 'block';
      const msg = gate.querySelector('.opt-gate-body');
      if (msg) msg.textContent = 'This fill would fail the eval. ' + verdict.note;
    }
    if (btn) btn.textContent = 'Log near-miss';
  } else {
    if (line) line.style.display = 'none';
    if (gate) gate.style.display = 'none';
    if (btn) btn.textContent = 'Log This Trade';
  }
  return verdict;
}

function renderJournalChallengeChrome() {
  const on = challengeEnabled();
  const status = document.getElementById('journal-challenge-status');
  const pill = document.getElementById('journal-challenge-pill');
  const banner = document.getElementById('journal-challenge-banner');
  const foot = document.getElementById('journal-challenge-foot');
  const rem = on ? getChallengeRemaining() : null;
  if (status) status.style.display = on ? 'block' : 'none';
  if (foot) foot.style.display = on ? 'block' : 'none';
  if (pill && rem) pill.textContent = 'CHALLENGE · ' + (rem.firm || 'Eval') + (rem.accountSize >= 1000 ? ' ' + Math.round(rem.accountSize / 1000) + 'k' : '');
  if (on && rem) {
    const d = document.getElementById('journal-ch-daily');
    const dd = document.getElementById('journal-ch-dd');
    const tgt = document.getElementById('journal-ch-target');
    if (d) d.textContent = moneyAmt(rem.dailyLeft) + ' LEFT';
    if (dd) dd.textContent = moneyAmt(rem.ddLeft) + ' LEFT';
    if (tgt) {
      const pct = rem.profitTarget > 0 ? Math.max(0, Math.round((rem.profit / rem.profitTarget) * 100)) : 0;
      tgt.textContent = pct + '%';
    }
    const consRow = document.getElementById('journal-ch-cons-row');
    if (consRow) consRow.style.display = rem.consistencyOn ? 'flex' : 'none';
    if (rem.consistencyOn) {
      const best = document.getElementById('journal-ch-best');
      const share = document.getElementById('journal-ch-share');
      const cap = document.getElementById('journal-ch-cons');
      if (best) best.textContent = moneyAmt(rem.bestDayPnl);
      if (share) share.textContent = Math.round((rem.consistencyShare || 0) * 100) + '%';
      if (cap) cap.textContent = rem.consistencyPct + '%';
    }
  } else {
    const consRow = document.getElementById('journal-ch-cons-row');
    if (consRow) consRow.style.display = 'none';
  }
  const misses = (S.trades || []).filter(t => t && t.challengeFail);
  if (banner) {
    if (misses.length) {
      banner.style.display = 'block';
      banner.textContent = misses.length === 1
        ? '1 fill would have failed the eval.'
        : misses.length + ' fills would have failed the eval.';
    } else {
      banner.style.display = 'none';
    }
  }
}

function escapeTeText(s) {
  return String(s || '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function readFvgInputs(prefix, dir) {
  return {
    high: document.getElementById(prefix + '-fvg-high')?.value,
    low: document.getElementById(prefix + '-fvg-low')?.value,
    confirm: document.getElementById(prefix + '-fvg-confirm')?.value,
    stop: document.getElementById(prefix + '-stop')?.value,
    dir: dir || 'long',
  };
}

function applyFvgStrip(prefix, dir) {
  const Fvg = window.FvgRetrace;
  const status = document.getElementById(prefix + '-fvg-status');
  const gate = document.getElementById(prefix + '-fvg-gate');
  const msg = document.getElementById(prefix + '-fvg-gate-msg');
  const title = gate && gate.querySelector('.opt-gate-title');
  if (!Fvg || typeof Fvg.evaluate !== 'function') {
    if (gate) gate.style.display = 'none';
    return { used: false, canLog: true };
  }
  const result = Fvg.evaluate(readFvgInputs(prefix, dir));
  if (status) {
    status.textContent = result.used ? (result.message || (result.canLog ? 'FVG retrace ready — size as usual.' : '')) : '';
    status.className = 'fvg-status' + (result.used ? (result.canLog ? ' ok' : ' wait') : '');
  }
  if (gate) {
    if (result.used && !result.canLog) {
      gate.style.display = 'block';
      if (msg) msg.textContent = result.message || 'Fix the FVG setup to log.';
      if (title) title.textContent = result.reason === 'not-ready' ? 'Not ready' : 'Setup blocked';
    } else {
      gate.style.display = 'none';
    }
  }
  return result;
}

function attachFvgToDraft(draft, prefix, dir) {
  if (!draft || !window.FvgRetrace) return draft;
  const result = FvgRetrace.evaluate({
    high: document.getElementById(prefix + '-fvg-high')?.value,
    low: document.getElementById(prefix + '-fvg-low')?.value,
    confirm: document.getElementById(prefix + '-fvg-confirm')?.value,
    stop: draft.stop,
    dir: dir || draft.dir || 'long',
  });
  if (!result.used) return draft;
  draft.fvgCanLog = result.canLog;
  draft.fvgMessage = result.message || '';
  if (result.canLog) draft.setup = 'fvg';
  else draft.withinRules = false;
  return draft;
}

function calcCFD() {
  const instr = document.getElementById('cfd-instr')?.value || '';
  const entry = parseFloat(document.getElementById('cfd-entry').value);
  const stop  = parseFloat(document.getElementById('cfd-stop').value);
  const target= parseFloat(document.getElementById('cfd-target').value);
  const dir = document.getElementById('cfd-dir')?.value || 'long';
  if (!entry || !stop) { applyChallengeFill('cfd', 0, 0); applyFvgStrip('cfd', dir); return; }
  const bal = sizerBalance();
  const maxRisk = bal * S.risk / 100;
  const stopDist = Math.abs(entry - stop);
  if (!stopDist) return;
  const sized = (typeof Baron !== 'undefined' && Baron.sizeForex)
    ? Baron.sizeForex(bal, S.risk, entry, stop, instr)
    : { units: Math.floor(maxRisk / stopDist), risk: Math.floor(maxRisk / stopDist) * stopDist, pair: null };
  const pair = sized.pair;
  const suggested = sized.units;
  const manualRaw = document.getElementById('cfd-manual-size')?.value;
  const manual = manualRaw ? parseFloat(manualRaw) : NaN;
  const useManual = manualRaw !== '' && !isNaN(manual) && manual > 0;
  const units = useManual ? Math.floor(manual) : suggested;
  const riskAmt = (typeof Baron !== 'undefined' && Baron.riskAtStop)
    ? Baron.riskAtStop(pair, entry, stop, units)
    : units * stopDist;
  let reward = null;
  if (pair && typeof Baron !== 'undefined') {
    reward = Baron.rewardAtTarget(pair, entry, target, units);
  } else if (target) {
    reward = Math.abs(target - entry) * units;
  }
  const rr = target ? Math.abs(target - entry) / stopDist : null;
  const sym = S.sym;
  const riskPct = bal > 0 ? (riskAmt / bal * 100) : 0;
  document.getElementById('cfd-units').textContent = units.toLocaleString();
  document.getElementById('cfd-risk-amt').textContent = sym + Math.round(riskAmt).toLocaleString();
  document.getElementById('cfd-risk-amt').style.color = riskAmt > maxRisk * 1.05 ? 'var(--amber)' : '';
  document.getElementById('cfd-rr').textContent = rr ? rr.toFixed(1) : '—';
  document.getElementById('cfd-reward').textContent = reward ? sym + Math.round(reward).toLocaleString() : '—';
  const unitsLbl = document.getElementById('cfd-units-lbl');
  if (unitsLbl) {
    unitsLbl.textContent = useManual
      ? (pair ? `YOUR SIZE (${pair.base} NOTIONAL)` : 'YOUR SIZE')
      : (pair ? `MAX UNITS (${pair.base} NOTIONAL)` : 'MAX UNITS / CONTRACTS');
  }
  const riskLbl = document.getElementById('cfd-risk-lbl');
  const rewLbl = document.getElementById('cfd-reward-lbl');
  if (riskLbl) riskLbl.textContent = pair ? 'RISK AT STOP' : 'RISK';
  if (rewLbl) rewLbl.textContent = pair ? 'REWARD AT TARGET' : 'REWARD';
  const riskPctEl = document.getElementById('cfd-risk-pct');
  if (riskPctEl) {
    if (useManual && units > 0) {
      riskPctEl.style.display = 'block';
      riskPctEl.textContent = `${riskPct.toFixed(2)}% of account at stop` + (riskAmt > maxRisk * 1.05 ? ' — above your ' + S.risk + '% budget' : '');
      riskPctEl.style.color = riskAmt > maxRisk * 1.05 ? 'var(--amber)' : 'var(--text2)';
    } else riskPctEl.style.display = 'none';
  }
  const hint = document.getElementById('cfd-forex-hint');
  if (hint) {
    if (useManual && pair) {
      hint.style.display = 'block';
      hint.textContent = `Scenario at ${units.toLocaleString()} ${pair.base} units — 1% risk auto-size is ${suggested.toLocaleString()}.`;
    } else if (pair) {
      hint.style.display = 'block';
      hint.textContent = `True ${S.risk}% risk sizing — enter ${suggested.toLocaleString()} ${pair.base} units in your broker (e.g. T212).`;
    } else hint.style.display = 'none';
  }
  showVerdict('cfd-verdict', rr);
  applyChallengeFill('cfd', units, riskAmt, reward);
  applyFvgStrip('cfd', dir);
}

function calcShares() {
  const entry = parseFloat(document.getElementById('sh-entry').value);
  const stop  = parseFloat(document.getElementById('sh-stop').value);
  const target= parseFloat(document.getElementById('sh-target').value);
  const dir = document.getElementById('sh-fvg-dir')?.value || 'long';
  if (!entry || !stop) { applyChallengeFill('shares', 0, 0); applyFvgStrip('sh', dir); return; }
  const bal = sizerBalance();
  const maxRisk = bal * S.risk / 100;
  const stopDist = Math.abs(entry - stop);
  if (!stopDist) return;
  const sized = (typeof Baron !== 'undefined' && Baron.sizeShares)
    ? Baron.sizeShares(bal, S.risk, entry, stop)
    : { shares: Math.floor(maxRisk / stopDist), risk: Math.floor(maxRisk / stopDist) * stopDist };
  const suggested = sized.shares;
  const manualRaw = document.getElementById('sh-manual-size')?.value;
  const manual = manualRaw ? parseFloat(manualRaw) : NaN;
  const useManual = manualRaw !== '' && !isNaN(manual) && manual > 0;
  const shares = useManual ? Math.floor(manual) : suggested;
  const riskAmt = shares * stopDist;
  const rr = target ? Math.abs(target - entry) / stopDist : null;
  const reward = target ? Math.abs(target - entry) * shares : null;
  document.getElementById('sh-units').textContent = shares.toLocaleString();
  document.getElementById('sh-risk').textContent = S.sym + Math.round(riskAmt).toLocaleString();
  document.getElementById('sh-risk').style.color = riskAmt > maxRisk * 1.05 ? 'var(--amber)' : '';
  document.getElementById('sh-rr').textContent = rr ? rr.toFixed(1) : '—';
  document.getElementById('sh-reward').textContent = reward ? S.sym + Math.round(reward).toLocaleString() : '—';
  const unitsLbl = document.getElementById('sh-units-lbl');
  if (unitsLbl) unitsLbl.textContent = useManual ? 'YOUR SHARES' : 'MAX SHARES';
  const shRiskLbl = document.getElementById('sh-risk-lbl');
  const shRewLbl = document.getElementById('sh-reward-lbl');
  if (shRiskLbl) shRiskLbl.textContent = 'RISK';
  if (shRewLbl) shRewLbl.textContent = 'REWARD';
  showVerdict('sh-verdict', rr);
  applyChallengeFill('shares', shares, riskAmt, reward);
  applyFvgStrip('sh', dir);
}

function readOptCoachInputs() {
  return {
    mode: (window.OptionsCoach && OptionsCoach.currentMode) || S.optCoachMode || 'leaps',
    wheelKind: (window.OptionsCoach && OptionsCoach.wheelKind) || S.optWheelKind || 'csp',
    optType: S.optType || 'call',
    strike: parseFloat(document.getElementById('opt-strike')?.value),
    spot: parseFloat(document.getElementById('opt-spot')?.value),
    prem: parseFloat(document.getElementById('opt-prem')?.value),
    target: parseFloat(document.getElementById('opt-target')?.value),
    dte: parseInt(document.getElementById('opt-dte')?.value, 10) || 30,
    portfolio: parseFloat(document.getElementById('opt-portfolio')?.value) || S.bal,
    existing: parseFloat(document.getElementById('opt-existing')?.value) || 0,
    width: parseFloat(document.getElementById('opt-width')?.value),
    sym: S.sym,
  };
}

function calcOptions() {
  const coach = window.OptionsCoach;
  const input = readOptCoachInputs();
  const portfolio = input.portfolio;
  const strike = input.strike;
  const spot = input.spot;
  const prem = input.prem;
  const target = input.target;
  const existing = input.existing;

  const maxRiskLabel = portfolio * 0.02;
  const maxLbl = document.getElementById('opt-max-risk-label');
  if (maxLbl) maxLbl.textContent = S.sym + Math.round(maxRiskLabel).toLocaleString();

  if (input.mode === 'review') return;
  if (!strike || !spot || !prem) return;
  if (!coach || typeof coach.computePlan !== 'function') return;

  const plan = coach.computePlan(input);
  coach.lastPlan = plan;
  if (!plan || !plan.ready) return;

  const maxRisk = plan.limits.maxRisk;
  const maxOptExposure = plan.limits.maxExposure;
  const contracts = plan.contracts;
  const shown = plan.shown;
  const totalRisk = plan.totalRisk;
  const isCall = plan.isCall;
  const bePrice = plan.bePrice;
  const rule1Pass = plan.rule1Pass;
  const rule2Pass = plan.rule2Pass;
  const exposurePct = plan.exposurePct;
  const newTotal = plan.newTotal;

  document.getElementById('opt-contracts').textContent = shown;
  const costLbl = document.getElementById('opt-cost-lbl');
  const itmLbl = document.getElementById('opt-itm-lbl');
  const beLbl = document.getElementById('opt-be-lbl');
  if (costLbl) costLbl.textContent = plan.labels.cost;
  if (itmLbl) itmLbl.textContent = plan.labels.mid;
  if (beLbl) beLbl.textContent = plan.labels.be;
  document.getElementById('opt-cost').textContent = S.sym + Math.round(plan.totalExposure).toLocaleString();
  if (plan.midValue === 'credit') {
    document.getElementById('opt-itm').textContent = S.sym + Math.round(plan.totalCredit).toLocaleString();
  } else {
    document.getElementById('opt-itm').textContent = plan.status.label;
  }
  if (plan.beValue === 'maxLoss') {
    document.getElementById('opt-be').textContent = S.sym + Math.round(plan.totalRisk).toLocaleString();
  } else {
    document.getElementById('opt-be').textContent = bePrice.toFixed(2);
  }

  document.getElementById('opt-rules').style.display = 'block';

  const r1card = document.getElementById('rule1-card');
  const r1badge = document.getElementById('rule1-badge');
  const r1status = document.getElementById('rule1-status');
  const r1detail = document.getElementById('rule1-detail');
  const riskNoun = plan.debit ? 'Cost' : 'Max loss';
  r1card.className = 'rule-card ' + (rule1Pass ? 'rule-ok' : 'rule-fail');
  r1badge.className = 'r-badge ' + (rule1Pass ? 'badge-pass' : 'badge-fail');
  r1badge.textContent = rule1Pass ? '✓ PASS' : '✗ FAIL';
  r1status.textContent = `${riskNoun}: ${S.sym}${Math.round(totalRisk).toLocaleString()} / Max: ${S.sym}${Math.round(maxRisk).toLocaleString()} (2% of ${S.sym}${Math.round(portfolio).toLocaleString()})`;
  r1status.style.color = rule1Pass ? 'var(--accent)' : 'var(--red)';
  if (plan.debit) {
    r1detail.textContent = rule1Pass
      ? `${shown} contract${shown!==1?'s':''} at ${S.sym}${prem}/share costs ${S.sym}${Math.round(totalRisk).toLocaleString()}. If it goes to zero — it stings, it doesn't bleed.`
      : `${shown} contract${shown!==1?'s':''} costs ${S.sym}${Math.round(totalRisk).toLocaleString()} — exceeds your 2% limit of ${S.sym}${Math.round(maxRisk).toLocaleString()}. Reduce to ${Math.floor(maxRisk/(prem*100))} contract${Math.floor(maxRisk/(prem*100))!==1?'s':''}.`;
  } else {
    r1detail.textContent = rule1Pass
      ? `${shown} contract${shown!==1?'s':''}: max loss ${S.sym}${Math.round(totalRisk).toLocaleString()} vs 2% limit. Credit ${S.sym}${Math.round(plan.totalCredit).toLocaleString()} is income only if you keep the size.`
      : `${shown} contract${shown!==1?'s':''} can lose ${S.sym}${Math.round(totalRisk).toLocaleString()} — over the 2% limit of ${S.sym}${Math.round(maxRisk).toLocaleString()}. Credit does not shrink the gate. Size to ${Math.floor(maxRisk/plan.riskPer) || 0} or skip.`;
  }

  const r2card = document.getElementById('rule2-card');
  const r2badge = document.getElementById('rule2-badge');
  const r2status = document.getElementById('rule2-status');
  const r2detail = document.getElementById('rule2-detail');
  const r2bar = document.getElementById('rule2-bar');
  r2card.className = 'rule-card ' + (rule2Pass ? (exposurePct > 15 ? 'rule-warn' : 'rule-ok') : 'rule-fail');
  r2badge.className = 'r-badge ' + (rule2Pass ? (exposurePct > 15 ? 'badge-warn' : 'badge-pass') : 'badge-fail');
  r2badge.textContent = rule2Pass ? (exposurePct > 15 ? '⚠ NEAR LIMIT' : '✓ PASS') : '✗ FAIL';
  r2status.textContent = `Exposure after trade: ${S.sym}${Math.round(newTotal).toLocaleString()} (${exposurePct.toFixed(1)}% of portfolio)`;
  r2status.style.color = rule2Pass ? (exposurePct > 15 ? 'var(--amber)' : 'var(--accent)') : 'var(--red)';
  r2detail.textContent = rule2Pass
    ? `Total options exposure ${exposurePct.toFixed(1)}% of portfolio — within the 20% limit. ${exposurePct > 15 ? 'Approaching limit — next trade may breach it.' : 'Headroom remaining: ' + S.sym + Math.round(maxOptExposure - newTotal).toLocaleString() + '.'}`
    : `Total exposure ${S.sym}${Math.round(newTotal).toLocaleString()} (${exposurePct.toFixed(1)}%) exceeds 20% limit. Options move like 4–5× their notional — this is too much portfolio in leveraged instruments.`;
  const barPct = Math.min(100, exposurePct / 20 * 100);
  r2bar.style.width = barPct + '%';
  r2bar.style.background = rule2Pass ? (exposurePct > 15 ? 'var(--amber)' : 'var(--accent)') : 'var(--red)';

  const r3card = document.getElementById('rule3-card');
  const r3badge = document.getElementById('rule3-badge');
  const r3status = document.getElementById('rule3-status');
  const r3detail = document.getElementById('rule3-detail');
  const r3title = r3card ? r3card.querySelector('.r-title') : null;
  let rule3Pass = plan.rule3Pass;

  if (!plan.debit) {
    if (r3title) r3title.textContent = 'Credit vs max loss — not a 2:1 long';
    const credit = plan.creditPer || 0;
    const maxL = plan.maxLossPer || 0;
    const ratio = maxL > 0 ? credit / maxL : 0;
    r3card.className = 'rule-card rule-neutral';
    r3badge.className = 'r-badge badge-na';
    r3badge.textContent = 'INFO';
    r3status.textContent = `Credit ${S.sym}${credit.toFixed(0)} vs max loss ${S.sym}${Math.round(maxL).toLocaleString()} per contract (${ratio.toFixed(2)}:1)`;
    r3status.style.color = 'var(--text2)';
    r3detail.textContent = 'Short premium is not a 2:1 long setup. The gate is 2% / 20% — credit is not a paycheck.';
    const v = document.getElementById('opt-verdict');
    if (v) {
      v.className = 'rr-verdict rr-ok';
      v.textContent = plan.mode === 'wheel'
        ? `Break-even ${bePrice.toFixed(2)} · process/sizing, not a yield promise`
        : `Break-even ${bePrice.toFixed(2)} · defined risk ${plan.definedRisk ? 'spread' : 'cash-secured'}`;
      v.style.display = 'block';
    }
  } else if (target) {
    if (r3title) r3title.textContent = 'Minimum 2:1 reward-to-risk ratio';
    const atExpiry = plan.rule3.atExpiry;
    const profit = plan.rule3.profit;
    const rr = plan.rule3.rr;
    rule3Pass = plan.rule3Pass;
    const rrWarn = rr >= 1.5 && rr < 2;
    r3card.className = 'rule-card ' + (rule3Pass ? 'rule-ok' : (rrWarn ? 'rule-warn' : 'rule-fail'));
    r3badge.className = 'r-badge ' + (rule3Pass ? 'badge-pass' : (rrWarn ? 'badge-warn' : 'badge-fail'));
    r3badge.textContent = rule3Pass ? '✓ PASS' : (rrWarn ? '⚠ MARGINAL' : '✗ FAIL');
    r3status.textContent = `R:R = ${rr.toFixed(1)}:1 (profit ${S.sym}${profit.toFixed(2)} / risk ${S.sym}${prem.toFixed(2)} per share)`;
    r3status.style.color = rule3Pass ? 'var(--accent)' : (rrWarn ? 'var(--amber)' : 'var(--red)');
    r3detail.textContent = rule3Pass
      ? `At target ${target}: option worth ${S.sym}${atExpiry.toFixed(2)}/share, profit ${S.sym}${profit.toFixed(2)}/share. ${rr >= 3 ? 'Excellent setup — 3:1 or better.' : 'Meets minimum 2:1 rule.'}`
      : rrWarn
        ? `R:R of ${rr.toFixed(1)}:1 is below the 2:1 minimum. Consider a higher target or a lower-premium entry. Don't take bad odds just because the direction feels right.`
        : atExpiry === 0
          ? `At target ${target} the option expires worthless. Price doesn't reach the strike — this trade has no path to profit.`
          : `R:R of ${rr.toFixed(1)}:1 is too low. You're risking ${S.sym}${prem.toFixed(2)} to make ${S.sym}${profit.toFixed(2)}. If the setup doesn't offer at least 2:1, skip it.`;
    showVerdict('opt-verdict', rr >= 2 ? rr + 1 : rr >= 1.5 ? 1.7 : 0.8);
  } else {
    if (r3title) r3title.textContent = 'Minimum 2:1 reward-to-risk ratio';
    r3card.className = 'rule-card rule-neutral';
    r3badge.className = 'r-badge badge-na';
    r3badge.textContent = '— PENDING';
    r3status.textContent = 'Enter target price to check R:R';
    r3status.style.color = 'var(--text3)';
    r3detail.textContent = '';
    const v = document.getElementById('opt-verdict');
    if (v) v.style.display = 'none';
  }

  const failures = plan.gateFailures || [];
  const gateEl = document.getElementById('opt-gate');
  const logBtn = document.getElementById('opt-log-btn');
  if (failures.length > 0) {
    gateEl.style.display = 'block';
    document.getElementById('opt-gate-msg').innerHTML = failures.map(f => `• ${f}`).join('<br>');
    logBtn.style.opacity = '0.4';
    logBtn.style.pointerEvents = 'none';
    logBtn.textContent = '⛔ Fix Rule Violations to Log';
  } else {
    gateEl.style.display = 'none';
    logBtn.style.opacity = '1';
    logBtn.style.pointerEvents = 'auto';
    logBtn.textContent = '✓ Log This Trade';
  }

  if (challengeEnabled()) {
    const optReward = plan.debit
      ? (target ? Math.max(0, ((isCall ? Math.max(0, target - strike) : Math.max(0, strike - target)) - prem) * shown * 100) : 0)
      : plan.totalCredit;
    applyChallengeFill('options', shown, totalRisk, optReward);
    if (failures.length > 0) {
      logBtn.style.opacity = '0.4';
      logBtn.style.pointerEvents = 'none';
      logBtn.textContent = '⛔ Fix Rule Violations to Log';
    }
  }

  const scenEl = document.getElementById('opt-scenario-table');
  const scenWrap = document.getElementById('opt-scenarios');
  if (plan.debit && target) {
    const atExpiry = isCall ? Math.max(0, target - strike) : Math.max(0, strike - target);
    const scenarios = [
      ['At target', target, (atExpiry - prem) * shown * 100],
      ['Break-even', bePrice, 0],
      ['–50% premium', null, -totalRisk * 0.5],
      ['Expires worthless', null, -totalRisk],
    ];
    scenEl.innerHTML = scenarios.map(([lbl, price, pnl]) => `
      <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:12px">
        <span style="color:var(--text3)">${lbl}</span>
        <span style="font-family:var(--font-mono);color:var(--text2)">${price ? price.toFixed(2) : '—'}</span>
        <span style="font-family:var(--font-mono);color:${pnl>=0?'var(--accent)':'var(--red)'}">
          ${pnl>=0?'+':''}${S.sym}${Math.round(Math.abs(pnl)).toLocaleString()}
        </span>
      </div>`).join('');
    scenWrap.style.display = 'block';
  } else if (!plan.debit) {
    const scenarios = [
      ['Max credit (kept)', null, plan.totalCredit],
      ['Break-even', bePrice, 0],
      ['Max loss', null, -plan.totalRisk],
    ];
    scenEl.innerHTML = scenarios.map(([lbl, price, pnl]) => `
      <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:12px">
        <span style="color:var(--text3)">${lbl}</span>
        <span style="font-family:var(--font-mono);color:var(--text2)">${price ? price.toFixed(2) : '—'}</span>
        <span style="font-family:var(--font-mono);color:${pnl>=0?'var(--accent)':'var(--red)'}">
          ${pnl>=0?'+':''}${S.sym}${Math.round(Math.abs(pnl)).toLocaleString()}
        </span>
      </div>`).join('');
    scenWrap.style.display = 'block';
  }
}

// ── CRYPTO SIZER ────────────────────────────────────────────────────────────
var cryptoPrices = { BTC: 97500, ETH: 3240, SOL: 165, XRP: 0.62, BNB: 620, DOGE: 0.18 };

function setCrypto(sym, el) {
  document.getElementById('cry-instr').value = sym;
  document.querySelectorAll('#crypto-pills .risk-pill').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  // Prefill with approximate price
  if (cryptoPrices[sym]) {
    const p = cryptoPrices[sym];
    document.getElementById('cry-entry').value = p;
    document.getElementById('cry-stop').value = parseFloat((p * 0.94).toFixed(sym === 'DOGE' ? 4 : 2));
    document.getElementById('cry-target').value = parseFloat((p * 1.12).toFixed(sym === 'DOGE' ? 4 : 2));
  }
  calcCrypto();
}

function calcCrypto() {
  const entry   = parseFloat(document.getElementById('cry-entry').value);
  const stop    = parseFloat(document.getElementById('cry-stop').value);
  const target  = parseFloat(document.getElementById('cry-target').value);
  const lev     = parseInt(document.getElementById('cry-lev').value) || 1;
  const type    = document.getElementById('cry-type').value;

  if (!entry || !stop) { applyChallengeFill('crypto', 0, 0); return; }

  const bal = sizerBalance();
  const maxRisk    = bal * S.risk / 100;
  const stopDist   = Math.abs(entry - stop);
  const stopPct    = (stopDist / entry) * 100;
  const effectiveRisk = maxRisk * lev; // with leverage your risk amplifies
  // For spot: units = maxRisk / stopDist
  // For leveraged: margin = maxRisk, notional = maxRisk * lev, units = notional / entry
  const units      = lev === 1
    ? maxRisk / stopDist
    : (maxRisk * lev) / entry;
  const notional   = units * entry;
  const margin     = lev === 1 ? notional : notional / lev;
  const liqDist    = lev > 1 ? (entry / lev) * 0.85 : null; // approx liq price
  const liqPrice   = liqDist ? (entry - liqDist) : null;
  const rr         = target ? Math.abs(target - entry) / stopDist : null;
  const reward     = target ? Math.abs(target - entry) * units : null;

  // Format helpers
  const sym = document.getElementById('cry-instr').value.toUpperCase() || 'COIN';
  const fmt = v => v >= 1000 ? S.sym + Math.round(v).toLocaleString() : S.sym + v.toFixed(2);
  const fmtU = v => v >= 1 ? v.toFixed(4) : v.toFixed(6);

  document.getElementById('cry-units').textContent = fmtU(units);
  document.getElementById('cry-unit-label').textContent = lev > 1 ? `UNITS (${lev}× LEVERAGED)` : 'UNITS (SPOT)';
  document.getElementById('cry-risk-amt').textContent = fmt(maxRisk);
  document.getElementById('cry-rr').textContent = rr ? rr.toFixed(1) : '—';
  document.getElementById('cry-reward').textContent = reward ? fmt(reward) : '—';
  document.getElementById('cry-notional').textContent = fmt(notional);
  document.getElementById('cry-margin').textContent = fmt(margin);
  document.getElementById('cry-liq').textContent = liqPrice ? S.sym + liqPrice.toFixed(2) : 'N/A';

  // R:R verdict
  if (rr) showVerdict('cry-verdict', rr);
  else document.getElementById('cry-verdict').style.display = 'none';

  // Leverage warning
  const levWarn = document.getElementById('cry-lev-warn');
  if (lev >= 10) {
    levWarn.style.display = 'block';
    levWarn.innerHTML = `⚠ <strong>${lev}× leverage:</strong> a ${(100/lev).toFixed(1)}% move against you wipes your margin. Your stop at ${S.sym}${stop.toFixed(2)} is ${stopPct.toFixed(1)}% away — liquidation would occur near ${S.sym}${liqPrice ? liqPrice.toFixed(2) : '?'}.`;
  } else if (lev >= 3) {
    levWarn.style.display = 'block';
    levWarn.innerHTML = `ℹ ${lev}× leverage active. Effective notional exposure: ${fmt(notional)}. Make sure your stop is set on the exchange before entry.`;
  } else {
    levWarn.style.display = 'none';
  }

  // Perpetual funding note
  document.getElementById('cry-funding-note').style.display = type === 'perpetual' ? 'block' : 'none';

  // Risk rules
  document.getElementById('cry-rules').style.display = 'block';

  // Rule 1 — effective risk check
  const effPct = bal > 0 ? (effectiveRisk / bal) * 100 : 0;
  const r1ok = effPct <= 5; // allow up to 5% for leveraged (stricter than CFD)
  const r1card = document.getElementById('cry-rule1');
  const r1badge = document.getElementById('cry-r1-badge');
  r1card.className = 'rule-card ' + (r1ok ? 'rule-ok' : (effPct <= 8 ? 'rule-warn' : 'rule-fail'));
  r1badge.className = 'r-badge ' + (r1ok ? 'badge-pass' : (effPct <= 8 ? 'badge-warn' : 'badge-fail'));
  r1badge.textContent = r1ok ? '✓ OK' : (effPct <= 8 ? '⚠ HIGH' : '✗ DANGER');
  document.getElementById('cry-r1-status').textContent = `Effective exposure: ${fmt(effectiveRisk)} (${effPct.toFixed(1)}% of portfolio)`;
  document.getElementById('cry-r1-detail').textContent = lev === 1
    ? `Spot position. Direct risk: ${fmt(maxRisk)} on a ${stopPct.toFixed(1)}% stop.`
    : `${lev}× leverage amplifies your ${fmt(margin)} margin into ${fmt(notional)} notional. If stop is hit: loss = ${fmt(maxRisk)}.`;

  // Rule 2 — stop vs liquidation
  if (lev > 1 && liqPrice) {
    const stopToLiq = ((stop - liqPrice) / entry) * 100;
    const r2ok = stop > liqPrice && stopToLiq > 1;
    const r2card = document.getElementById('cry-rule2');
    const r2badge = document.getElementById('cry-r2-badge');
    r2card.className = 'rule-card ' + (r2ok ? 'rule-ok' : 'rule-fail');
    r2badge.className = 'r-badge ' + (r2ok ? 'badge-pass' : 'badge-fail');
    r2badge.textContent = r2ok ? '✓ SAFE' : '✗ DANGER';
    document.getElementById('cry-r2-status').textContent = `Stop: ${S.sym}${stop} | Est. liquidation: ${S.sym}${liqPrice.toFixed(2)}`;
    document.getElementById('cry-r2-detail').textContent = r2ok
      ? `${stopToLiq.toFixed(1)}% buffer between stop and liquidation. Good — your stop fires before you get liquidated.`
      : `Your stop (${S.sym}${stop}) is BELOW your estimated liquidation price (${S.sym}${liqPrice.toFixed(2)}). You would be liquidated before your stop triggers. Move stop higher or reduce leverage.`;
    document.getElementById('cry-rule2').style.display = 'block';
  } else {
    document.getElementById('cry-rule2').style.display = lev > 1 ? 'block' : 'none';
    if (lev === 1) {
      document.getElementById('cry-r2-badge').textContent = 'N/A';
      document.getElementById('cry-r2-status').textContent = 'Spot — no liquidation risk';
    }
  }
  applyChallengeFill('crypto', units, units * stopDist, reward);
}
