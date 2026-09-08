/**
 * Runnr app — journal render + log modal.
 * Extracted from index.html (slice 1). Classic script; globals kept for onclick=.
 */
// ── JOURNAL ────────────────────────────────────────────────────────────────
var journalClickBound = false;

function tradeId(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : v;
}

function isTradeEditable(t) {
  return !!t;
}

function bindJournalClicks() {
  const list = document.getElementById('journal-list');
  if (!list || journalClickBound) return;
  journalClickBound = true;
  list.addEventListener('click', (e) => {
    if (e.target.closest('.te-del') || e.target.closest('.te-sym') || e.target.closest('.te-replay') || e.target.closest('.te-edit')) return;
    const row = e.target.closest('.trade-entry[data-trade-id]');
    if (!row || row.dataset.editable !== '1') return;
    openTradeEditor(row.dataset.tradeId);
  });
}

function renderFreeTradeCounters() {
  const TL = window.RunnrTradeLimit;
  const copy = TL && typeof TL.freeSlotsLabel === 'function' ? TL.freeSlotsLabel() : '';
  document.querySelectorAll('[data-free-trade-counter]').forEach((el) => {
    if (!copy) {
      el.hidden = true;
      el.textContent = '';
      return;
    }
    el.hidden = false;
    el.textContent = copy;
  });
}
window.renderFreeTradeCounters = renderFreeTradeCounters;

function renderJournal() {
  bindJournalClicks();
  renderJournalChallengeChrome();
  const list = document.getElementById('journal-list');
  const hint = document.getElementById('journal-hint');
  const alpacaPending = S.trades.filter(t => isBrokerFillTrade(t) && t.incomplete);
  if (hint) {
    if (alpacaPending.length) {
      const wallAt = (window.RunnrDeskQuiet && RunnrDeskQuiet.INCOMPLETE_WALL_THRESHOLD) || 5;
      const high = alpacaPending.length > wallAt;
      const progress = window.RunnrDeskQuiet
        ? RunnrDeskQuiet.brokerFillProgress(S.trades)
        : { total: alpacaPending.length, reviewed: 0, incomplete: alpacaPending.length };
      hint.style.display = 'block';
      hint.classList.toggle('journal-hint-calm', high);
      const detail = high
        ? ''
        : '<span>Need Stop and Size on each fill. Replay appears when size is flagged or a stop is missing — including older fills with no risk snapshot.</span>';
      const progressLine = progress.total
        ? `<div class="journal-incomplete-progress">${progress.reviewed} of ${progress.total} reviewed</div>`
        : '';
      hint.innerHTML = `<div class="journal-incomplete-hero">
        <div class="journal-incomplete-copy">
          <strong>${alpacaPending.length} fill${alpacaPending.length > 1 ? 's' : ''} to review</strong>
          ${progressLine}
          ${detail}
        </div>
        <div class="journal-incomplete-actions">
          <button type="button" class="btn" onclick="reviewNextIncompleteFill(event)">Review next incomplete</button>
          <button type="button" class="btn btn-ghost" onclick="applyDisciplineDefaultsToAll(event)">Mark all as compliant (Stop ✓ Size ✓)</button>
        </div>
      </div>`;
    } else if (RunnrSync.billing?.()?.enabled !== false) {
      hint.classList.remove('journal-hint-calm');
      const TL = window.RunnrTradeLimit;
      const copy = TL && typeof TL.freeSlotsLabel === 'function' ? TL.freeSlotsLabel() : '';
      if (copy && !RunnrSync.isPro?.()) {
        hint.style.display = 'block';
        hint.innerHTML = `<span><strong>${copy}</strong> · <button type="button" class="btn btn-sm" style="margin-left:8px" onclick="openJournalLimitUpgrade()">Start Runnr — €19/mo</button></span>`;
      } else if (copy && TL && typeof TL.trialActive === 'function' && TL.trialActive()) {
        hint.style.display = 'block';
        hint.innerHTML = `<span><strong>${copy}</strong> · then €19/month</span>`;
      } else {
        hint.style.display = 'none';
      }
    } else {
      hint.classList.remove('journal-hint-calm');
      hint.style.display = 'none';
    }
  }
  try { renderFreeTradeCounters(); } catch (e) {}
  renderT212JournalButton();
  if (!S.trades.length) {
    list.innerHTML = '<div class="empty-state"><div class="es-icon">📋</div>No trades yet. Import T212 / Alpaca on Sync or log a trade.</div>';
    return;
  }
  const wallAt = (window.RunnrDeskQuiet && RunnrDeskQuiet.INCOMPLETE_WALL_THRESHOLD) || 5;
  const hideIncompleteWall = alpacaPending.length > wallAt && !showAllIncompleteFills;
  const journalRows = hideIncompleteWall
    ? S.trades.filter(t => !(isBrokerFillTrade(t) && t.incomplete))
    : S.trades;
  const wallToggle = hideIncompleteWall
    ? `<button type="button" class="journal-show-all" onclick="toggleIncompleteFillWall(true)">Show all ${alpacaPending.length} incomplete fills</button>`
    : (alpacaPending.length > wallAt && showAllIncompleteFills
      ? `<button type="button" class="journal-show-all" onclick="toggleIncompleteFillWall(false)">Hide incomplete wall</button>`
      : '');
  list.innerHTML = (wallToggle ? wallToggle : '') + journalRows.map(t => {
    try {
    const isFill = isBrokerFillTrade(t);
    const pnlStr = formatTradePnl(t, isFill);
    const pnlCls = Baron.isOpenTrade?.(t) ? '' : (resolveTradePnl(t) >= 0 ? 'pos' : 'neg');
    const stopFlag = t.incomplete && !t.challengeFail ? '<span class="flag flag-incomplete">Stop ?</span>' :
      (t.stopOk ? '<span class="flag flag-ok">✓ Stop</span>' : '<span class="flag flag-no">✗ Stop</span>');
    const sizeFlag = t.challengeFail ? '<span class="flag flag-no">FAIL</span>' :
      (t.incomplete ? '<span class="flag flag-incomplete">Size ?</span>' :
      (t.sizeOk ? '<span class="flag flag-ok">✓ Size</span>' : '<span class="flag flag-no">✗ Size</span>'));
    const fill = Number(t.fillPrice || t.entry || t.exit || 0);
    const priceLabel = fill > 0 ? `$${fill.toFixed(2)}` : 'price pending';
    const metaLine = isFill
      ? `<span>${t.date}</span><span>${t.dir === 'long' ? 'BUY' : 'SELL'} ${t.size} @ ${priceLabel}</span><span>${t.source === 't212' ? 'T212' : (t.source === 'ibkr' ? 'IBKR' : 'Alpaca')}</span>`
      : `<span>${t.date}</span><span>${t.entry} → ${t.exit ?? 'open'}</span><span>${t.size} units</span>`;
    const editable = isTradeEditable(t);
    const editLabel = Baron.isOpenTrade?.(t) ? 'Close' : 'Edit';
    return `<div class="trade-entry${editable ? ' trade-entry-editable' : ''}" data-trade-id="${t.id}" data-editable="${editable ? '1' : '0'}">
      <div class="te-top">
        <div style="display:flex;align-items:center;gap:6px;min-width:0">
          <span class="te-sym" onclick="event.stopPropagation();openStockDetail('${quoteSymbolFromInstr(t.instr).replace(/'/g, "\\'")}')" title="Live price">${t.instr.length > 12 ? t.instr.slice(0, 10) + '…' : t.instr}</span>
          <span style="font-size:11px;color:var(--text3)">${t.dir.toUpperCase()}</span>
        </div>
        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
          <span class="te-pnl ${pnlCls}" style="${t.incomplete && isFill ? 'color:var(--accent);font-size:12px' : ''}">${pnlStr}</span>
          ${editable ? `<button type="button" class="te-edit" onclick="event.stopPropagation();event.preventDefault();openTradeEditor('${t.id}')">${editLabel}</button>` : ''}
          <button type="button" class="te-del" onclick="deleteTrade('${t.id}', event)" title="Delete entry">✕</button>
        </div>
      </div>
      <div class="te-meta">${metaLine}</div>
      <div class="flags">${stopFlag}${sizeFlag}${t.setup === 'fvg' ? '<span class="flag flag-ok">FVG</span>' : ''}${t.challengeFail ? '' : (t.incomplete?'<span class="flag flag-miss">Incomplete</span>':'')}</div>
      ${typeof DisciplineReplay !== 'undefined' && DisciplineReplay.canReplay(t, S, typeof Baron !== 'undefined' ? Baron : null) ? `<button type="button" class="te-replay te-replay-primary" onclick="openDisciplineReplay('${t.id}', event)">Replay Disciplined</button>` : ''}
      ${t.challengeNote ? `<div class="te-note">${escapeTeText(t.challengeNote)}</div>` : ''}
    </div>`;
    } catch (e) { console.warn('skip bad trade', t && t.id, e); return ''; }
  }).join('');
}

var disciplineReplayTradeId = null;

function replayReasonHtml(text) {
  return escapeTeText(text || '').replace(/\brecorded\b/g, '<strong>recorded</strong>');
}

function replayStampLiveHtml(view) {
  if (!view || !view.missingSnapshot) return '';
  const label = view.stampCta || 'Use current risk % / balance for this trade';
  const explain = view.stampExplain
    || "This stamps today's settings onto this fill because trade-time rules were never saved. It is not a historical claim.";
  return `<div class="replay-cta">${escapeTeText(explain)}</div>
    <button type="button" class="btn" style="margin-bottom:12px" onclick="stampReplayFromLiveSettings()">${escapeTeText(label)}</button>`;
}

function renderDisciplineReplayView(view, trade) {
  const instr = escapeTeText(view.instr || '—');
  const settings = `<p class="replay-settings">${escapeTeText(view.settingsNote)} · ${instr}</p>
    <p class="replay-note">${escapeTeText(view.fillsNote)}</p>`;
  const disc = view.stopDisclaimer ? `<div class="replay-disc">${escapeTeText(view.stopDisclaimer)}</div>` : '';
  const takeaway = `<div class="replay-takeaway">${escapeTeText(view.takeaway)}</div>`;
  const recorded = `<div class="replay-col replay-recorded">
        <h4>Recorded</h4>
        <div class="replay-row"><span class="k">Size</span><span class="v">${escapeTeText(view.happened.sizeLabel)}</span></div>
        <div class="replay-row"><span class="k">Stop</span><span class="v">${escapeTeText(view.happened.stopLabel)}</span></div>
        <div class="replay-row"><span class="k">P&amp;L</span><span class="v">${escapeTeText(view.happened.pnlLabel)}</span></div>
      </div>`;
  if (view.unchanged || (view.missingSnapshot && !view.needsStop) || view.sanityFailed) {
    const reasons = (view.emptyReasons || []).map(r => {
      const text = typeof r === 'string' ? r : (r && r.text);
      return `<p>${replayReasonHtml(text)}</p>`;
    }).join('') || `<p>${replayReasonHtml(view.ruleNote || 'No size or stop price change to replay.')}</p>`;
    return `${settings}
    <div class="replay-empty">${reasons}</div>
    ${replayStampLiveHtml(view)}
    ${recorded}
    ${takeaway}
    ${disc}`;
  }
  const cta = view.needsStop
    ? `<div class="replay-cta">${escapeTeText(view.cta || 'Add a stop on this trade to replay')}</div>
       <button type="button" class="btn btn-sm" style="margin-bottom:12px" onclick="editTradeFromReplay()">Edit trade</button>`
    : '';
  return `${settings}
    <div class="replay-grid">
      <div class="replay-col">
        <h4>What happened</h4>
        <div class="replay-row"><span class="k">Size</span><span class="v">${escapeTeText(view.happened.sizeLabel)}</span></div>
        <div class="replay-row"><span class="k">Stop</span><span class="v">${escapeTeText(view.happened.stopLabel)}</span></div>
        <div class="replay-row"><span class="k">P&amp;L</span><span class="v">${escapeTeText(view.happened.pnlLabel)}</span></div>
      </div>
      <div class="replay-col">
        <h4>Disciplined version</h4>
        <div class="replay-row"><span class="k">Size</span><span class="v">${escapeTeText(view.disciplined.sizeLabel)}</span></div>
        <div class="replay-row"><span class="k">Stop</span><span class="v">${escapeTeText(view.disciplined.stopLabel)}</span></div>
        <div class="replay-row"><span class="k">P&amp;L</span><span class="v">${escapeTeText(view.disciplined.pnlLabel)}</span></div>
      </div>
    </div>
    <p class="replay-note">${escapeTeText(view.ruleNote)}</p>
    ${cta}
    ${replayStampLiveHtml(view)}
    ${takeaway}
    ${disc}`;
}

function openDisciplineReplay(id, e) {
  if (e) { e.stopPropagation(); e.preventDefault(); }
  id = tradeId(id);
  const t = S.trades.find(x => tradeId(x.id) === id);
  if (!t || typeof DisciplineReplay === 'undefined' || !DisciplineReplay.isEligible(t)) return;
  disciplineReplayTradeId = id;
  const view = DisciplineReplay.buildView(t, S, typeof Baron !== 'undefined' ? Baron : null);
  const root = document.getElementById('discipline-replay-body');
  if (root) root.innerHTML = renderDisciplineReplayView(view, t);
  openModal('modal-discipline-replay');
}

function editTradeFromReplay() {
  const id = disciplineReplayTradeId;
  closeModal('modal-discipline-replay');
  if (id) openTradeEditor(id);
}

function stampReplayFromLiveSettings() {
  const id = disciplineReplayTradeId;
  const t = id != null ? S.trades.find(x => tradeId(x.id) === id) : null;
  if (!t || typeof DisciplineReplay === 'undefined' || !DisciplineReplay.stampTrade) return;
  DisciplineReplay.stampTrade(t, S, typeof Baron !== 'undefined' ? Baron : null);
  persist();
  renderJournal();
  const view = DisciplineReplay.buildView(t, S, typeof Baron !== 'undefined' ? Baron : null);
  const root = document.getElementById('discipline-replay-body');
  if (root) root.innerHTML = renderDisciplineReplayView(view, t);
}
window.openDisciplineReplay = openDisciplineReplay;
window.editTradeFromReplay = editTradeFromReplay;
window.stampReplayFromLiveSettings = stampReplayFromLiveSettings;

function formatTradePnl(t, isAlpaca) {
  if (t.disciplineOnly) {
    return '<span style="color:var(--accent);font-size:11px">discipline ✓</span>';
  }
  if (Baron.isOpenTrade?.(t)) {
    if (t.incomplete && isAlpaca) {
      const fill = Number(t.fillPrice || t.entry || t.exit || 0);
      return fill > 0
        ? '<span style="color:var(--amber);font-size:12px">Open</span>'
        : 'sync for price';
    }
    return '<span style="color:var(--amber);font-size:12px">Open</span>';
  }
  const pnl = resolveTradePnl(t);
  if (t.incomplete && isAlpaca) {
    if (pnl != null) {
      const sign = pnl >= 0 ? '+' : '';
      return sign + S.sym + Math.abs(pnl).toLocaleString() + ' · review';
    }
    const fill = Number(t.fillPrice || t.entry || t.exit || 0);
    return fill > 0 ? 'tap to review' : 'sync for price';
  }
  if (pnl == null) return '<span style="color:var(--text3);font-size:12px">—</span>';
  return (pnl >= 0 ? '+' : '') + S.sym + Math.abs(pnl).toLocaleString();
}

function deleteTrade(id, e) {
  if (e) { e.stopPropagation(); e.preventDefault(); }
  id = tradeId(id);
  const t = S.trades.find(x => tradeId(x.id) === id);
  if (!t) return;
  const label = t.instr + (t.date ? ' (' + t.date + ')' : '');
  if (!confirm('Delete ' + label + ' from journal?')) return;
  S.trades = S.trades.filter(x => tradeId(x.id) !== id);
  if (t.externalId && S.brokerSync?.importedOrderIds) {
    S.brokerSync.importedOrderIds = S.brokerSync.importedOrderIds.filter(x => x !== t.externalId);
  }
  if (tradeId(S.editingTradeId) === id) S.editingTradeId = null;
  persist();
  renderJournal();
  updateHomeStats();
  refreshPortfolioIfVisible();
  if (typeof renderCoachPage === 'function') renderCoachPage();
  if (window.RunnrGrowth) RunnrGrowth.renderDisciplineCard(S);
}

function openTradeEditor(id) {
  id = tradeId(id);
  const t = S.trades.find(x => tradeId(x.id) === id);
  if (!t) return;
  S.editingTradeId = id;
  openLogModal(t.type || 'cfd');
  const title = document.querySelector('#modal-log .modal-title');
  if (title) {
    title.innerHTML = (Baron.isOpenTrade?.(t) ? 'Close Trade' : 'Edit Trade') +
      ' <button class="modal-close" onclick="closeModal(\'modal-log\')">✕</button>';
  }
  document.getElementById('log-instr').value = t.instr;
  document.getElementById('log-entry').value = t.entry ?? t.fillPrice ?? '';
  document.getElementById('log-exit').value = Baron.isOpenTrade?.(t) ? '' : (t.exit ?? '');
  document.getElementById('log-size').value = t.size ?? '';
  document.getElementById('log-dir').value = t.dir || 'long';
  const stopEl = document.getElementById('log-stop');
  if (stopEl) stopEl.value = t.stop ?? '';
  ['stop-yes','stop-no','size-yes','size-no'].forEach(fid => {
    const el = document.getElementById(fid);
    if (!el) return;
    el.style.background = '';
    el.style.color = '';
    el.style.borderColor = '';
  });
  if (t.stopOk) setFlag('stop', 'yes');
  else if (!t.incomplete || t.stopOk === false) setFlag('stop', 'no');
  if (t.sizeOk) setFlag('size', 'yes');
  else if (!t.incomplete || t.sizeOk === false) setFlag('size', 'no');
}
window.openTradeEditor = openTradeEditor;

function reviewTrade(id) {
  openTradeEditor(id);
}

var reviewingIncompleteQueue = false;
var advancingIncompleteReview = false;
var showAllIncompleteFills = false;

function toggleIncompleteFillWall(show) {
  showAllIncompleteFills = !!show;
  renderJournal();
}
window.toggleIncompleteFillWall = toggleIncompleteFillWall;

function incompleteBrokerFillList() {
  if (typeof DisciplineReplay !== 'undefined' && DisciplineReplay.incompleteBrokerFills) {
    return DisciplineReplay.incompleteBrokerFills(S.trades);
  }
  return S.trades.filter(t => isBrokerFillTrade(t) && t.incomplete);
}

function setIncompleteReviewTitle(count) {
  const title = document.querySelector('#modal-log .modal-title');
  if (!title) return;
  const left = count > 0 ? ' · ' + count + ' left' : '';
  title.innerHTML = 'Review fill' + left + ' <button class="modal-close" onclick="closeModal(\'modal-log\')">✕</button>';
}

function reviewNextIncompleteFill(e) {
  if (e) e.stopPropagation();
  const pending = incompleteBrokerFillList();
  if (!pending.length) return;
  reviewingIncompleteQueue = true;
  const first = (typeof DisciplineReplay !== 'undefined' && DisciplineReplay.firstIncompleteBrokerFill)
    ? DisciplineReplay.firstIncompleteBrokerFill(S.trades)
    : pending[0];
  if (!first) return;
  openTradeEditor(first.id);
  setIncompleteReviewTitle(pending.length);
}
window.reviewNextIncompleteFill = reviewNextIncompleteFill;

function applyDisciplineDefaultsToAll(e) {
  if (e) e.stopPropagation();
  const pending = incompleteBrokerFillList();
  if (!pending.length) return;
  const msg = `Mark ALL ${pending.length} broker fills as compliant (Stop ✓ Size ✓)?\n\nThis rubber-stamps them as within the rules without reviewing Stop/Size on each trade. Disciplined Replay will NOT apply to these fills — Replay only appears when Stop or Size is flagged No.\n\nThis cannot be undone except by editing trades one by one.`;
  if (!confirm(msg)) return;
  pending.forEach(t => {
    const fill = Number(t.fillPrice || t.entry || t.exit || 0);
    if (t.dir === 'long') {
      if (!t.entry && fill) t.entry = fill;
      if (t.exit == null) t.exit = t.entry || fill || null;
    } else {
      if (!t.exit && fill) t.exit = fill;
      if (t.entry == null) t.entry = t.exit || fill || null;
    }
    t.stopOk = true;
    t.sizeOk = true;
    t.incomplete = false;
    t.baronRules = true; // legacy field — means discipline defaults applied
    t.disciplineOnly = true;
    t.pnl = null;
  });
  persist();
  renderJournal();
  updateHomeStats();
  if (typeof renderCoachPage === 'function') renderCoachPage();
  alert(`${pending.length} trades marked compliant. Replay will not apply to these. Check Coach for your score.`);
}
window.applyBaronRulesToAll = applyDisciplineDefaultsToAll;

// ── LOG MODAL ──────────────────────────────────────────────────────────────
function getSizerDraft(type) {
  const maxRisk = sizerBalance() * S.risk / 100;
  const blocked = !!(lastChallengeVerdict && lastChallengeVerdict.blocked);
  if (type === 'cfd') {
    const instr = document.getElementById('cfd-instr')?.value?.trim() || '';
    const entry = parseFloat(document.getElementById('cfd-entry')?.value);
    const stop = parseFloat(document.getElementById('cfd-stop')?.value);
    const target = parseFloat(document.getElementById('cfd-target')?.value);
    const dir = document.getElementById('cfd-dir')?.value || 'long';
    const size = parseFloat(document.getElementById('cfd-units')?.textContent?.replace(/,/g, ''));
    if (!instr || !entry || !stop || !size) return null;
    const pair = window.Baron?.parseForexPair?.(instr);
    const riskAmt = window.Baron?.riskAtStop
      ? Baron.riskAtStop(pair, entry, stop, size)
      : size * Math.abs(entry - stop);
    const draft = {
      type: 'cfd', instr, entry, stop, target: target || null, dir, size, exit: null,
      pair, withinRules: riskAmt <= maxRisk * 1.05 && !blocked,
    };
    return attachFvgToDraft(draft, 'cfd', dir);
  }
  if (type === 'shares') {
    const instr = document.getElementById('sh-instr')?.value?.trim() || '';
    const entry = parseFloat(document.getElementById('sh-entry')?.value);
    const stop = parseFloat(document.getElementById('sh-stop')?.value);
    const target = parseFloat(document.getElementById('sh-target')?.value);
    const size = parseFloat(document.getElementById('sh-units')?.textContent?.replace(/,/g, ''));
    if (!instr || !entry || !stop || !size) return null;
    const riskAmt = size * Math.abs(entry - stop);
    const fvgUsed = window.FvgRetrace && FvgRetrace.inUse({
      high: document.getElementById('sh-fvg-high')?.value,
      low: document.getElementById('sh-fvg-low')?.value,
      confirm: document.getElementById('sh-fvg-confirm')?.value,
    });
    const dir = fvgUsed ? (document.getElementById('sh-fvg-dir')?.value || 'long') : 'long';
    const draft = {
      type: 'shares', instr, entry, stop, target: target || null, dir, size, exit: null,
      pair: null, withinRules: riskAmt <= maxRisk * 1.05 && !blocked,
    };
    return attachFvgToDraft(draft, 'sh', dir);
  }
  if (type === 'crypto') {
    const instr = document.getElementById('cry-instr')?.value?.trim() || '';
    const entry = parseFloat(document.getElementById('cry-entry')?.value);
    const stop = parseFloat(document.getElementById('cry-stop')?.value);
    const target = parseFloat(document.getElementById('cry-target')?.value);
    const size = parseFloat(document.getElementById('cry-units')?.textContent?.replace(/,/g, ''));
    const leverage = parseInt(document.getElementById('cry-lev')?.value, 10) || 1;
    if (!instr || !entry || !stop || !size) return null;
    const riskAmt = size * Math.abs(entry - stop);
    return {
      type: 'crypto', instr, entry, stop, target: target || null, dir: 'long', size, exit: null,
      pair: null, leverage, withinRules: riskAmt <= maxRisk * 1.05 && !blocked,
    };
  }
  if (type === 'options') {
    const instr = document.getElementById('opt-instr')?.value?.trim() || '';
    const strike = parseFloat(document.getElementById('opt-strike')?.value);
    const target = parseFloat(document.getElementById('opt-target')?.value);
    const coach = window.OptionsCoach;
    const plan = (coach && coach.lastPlan && coach.lastPlan.ready)
      ? coach.lastPlan
      : (coach ? coach.computePlan(readOptCoachInputs()) : null);
    if (!instr || !strike || !plan || !plan.ready) return null;
    const optGateUp = document.getElementById('opt-gate')?.style.display === 'block';
    return {
      type: 'options',
      instr,
      entry: strike,
      stop: plan.bePrice || null,
      target: target || null,
      dir: plan.dir || 'long',
      size: plan.shown,
      exit: null,
      pair: null,
      optMode: plan.mode,
      optKind: plan.wheelKind || null,
      withinRules: plan.allClear === true && !optGateUp && !blocked,
    };
  }
  return null;
}

function tradePnlFromDraft(draft) {
  if (!draft?.entry || draft.exit == null || draft.exit === '') return null;
  const pair = draft.pair || window.Baron?.parseForexPair?.(draft.instr);
  const size = draft.size || 1;
  const dir = draft.dir || 'long';
  if (window.Baron?.tradePnl) {
    return Math.round(Baron.tradePnl(pair, draft.entry, draft.exit, size, dir));
  }
  return Math.round((dir === 'long' ? draft.exit - draft.entry : draft.entry - draft.exit) * size);
}

function commitLog(draft) {
  if (!draft?.instr || !draft?.entry) return false;
  const pair = draft.pair || window.Baron?.parseForexPair?.(draft.instr);
  const patch = {
    instr: draft.instr,
    dir: draft.dir || 'long',
    entry: draft.entry,
    exit: draft.exit ?? null,
    stop: draft.stop || null,
    target: draft.target || null,
    size: draft.size || 1,
    pnl: tradePnlFromDraft({ ...draft, pair }),
    stopOk: !!draft.stopOk,
    sizeOk: !!draft.sizeOk,
    incomplete: !!draft.incomplete,
    type: draft.type || 'cfd',
  };
  if (pair) patch.pair = pair;
  if (draft.leverage) patch.leverage = draft.leverage;
  if (draft.optMode) patch.optMode = draft.optMode;
  if (draft.optKind) patch.optKind = draft.optKind;
  if (draft.setup) patch.setup = draft.setup;
  if (draft.book) patch.book = draft.book;
  if (draft.challengeFail) {
    patch.challengeFail = true;
    patch.challengeNote = draft.challengeNote || '';
  } else if (draft.challengeFail === false) {
    patch.challengeFail = false;
    patch.challengeNote = '';
  }
  if (typeof Baron !== 'undefined' && Baron.isoDay && !S.editingTradeId) patch.dateKey = Baron.isoDay(new Date());
  if (S.editingTradeId) {
    const t = S.trades.find(x => tradeId(x.id) === tradeId(S.editingTradeId));
    if (t) {
      const next = {
        ...patch,
        stop: draft.stop ?? t.stop ?? null,
        target: draft.target ?? t.target ?? null,
        pair: patch.pair ?? t.pair ?? null,
        type: draft.type || t.type || 'cfd',
        source: t.source,
        externalId: t.externalId,
        fillPrice: t.fillPrice,
        date: t.date,
        riskSnapshot: t.riskSnapshot,
      };
      if (t.disciplineOnly && draft.exit != null) {
        delete next.disciplineOnly;
        next.baronRules = false;
      }
      Object.assign(t, next);
    }
    S.editingTradeId = null;
  } else {
    if (!canAddJournalTrade(1)) {
      openJournalLimitUpgrade();
      return false;
    }
    const row = {
      id: Date.now(),
      date: new Date().toLocaleDateString('en-GB', { month: 'short', day: 'numeric' }),
      ...patch,
    };
    if (typeof DisciplineReplay !== 'undefined' && DisciplineReplay.stampTrade) {
      DisciplineReplay.stampTrade(row, S, typeof Baron !== 'undefined' ? Baron : null);
    }
    S.trades.unshift(row);
  }
  persist();
  renderJournal();
  updateHomeStats();
  refreshPortfolioIfVisible();
  if (typeof renderCoachPage === 'function') renderCoachPage();
  return true;
}

function openLogModal(type) {
  if (!S.editingTradeId) {
    if (typeof canAddJournalTrade === 'function' && !canAddJournalTrade(1)) {
      if (typeof openJournalLimitUpgrade === 'function') openJournalLimitUpgrade();
      return;
    }
  }
  S.flags = { stop: null, size: null };
  ['stop-yes','stop-no','size-yes','size-no'].forEach(id => {
    document.getElementById(id).style.background = '';
    document.getElementById(id).style.color = '';
    document.getElementById(id).style.borderColor = '';
  });
  const stopEl = document.getElementById('log-stop');
  if (stopEl && !S.editingTradeId) stopEl.value = '';
  openModal('modal-log');
}

function saveLogFromSizer(type) {
  const draft = getSizerDraft(type);
  if (!draft) {
    showToast('Sizer', 'Add instrument, entry, stop & size first');
    return;
  }
  if (type === 'options' && draft.withinRules === false) {
    showToast('Options Coach', 'Fix the 2% / 20% gates to log');
    return;
  }
  if ((type === 'cfd' || type === 'shares') && draft.fvgCanLog === false) {
    showToast('FVG retrace', draft.fvgMessage || 'Fix the setup to log');
    return;
  }
  draft.stopOk = true;
  const blocked = !!(lastChallengeVerdict && lastChallengeVerdict.blocked);
  draft.sizeOk = draft.withinRules !== false && !blocked;
  draft.incomplete = false;
  if (challengeEnabled()) draft.book = 'challenge';
  draft.challengeFail = blocked;
  draft.challengeNote = blocked ? (lastChallengeVerdict.note || '') : '';
  if (!commitLog(draft)) return;
  const msg = blocked
    ? 'Logged near-miss — would have failed the eval'
    : (!draft.sizeOk
      ? 'Logged — size flagged for review in Journal'
      : 'Logged ✓ — sized & stopped like a pro');
  showToast(draft.instr, msg);
}

function fillLogFromSizer(type) {
  const draft = getSizerDraft(type);
  if (!draft) {
    showToast('Sizer', 'Add instrument, entry, stop & size first');
    return;
  }
  if ((type === 'cfd' || type === 'shares') && draft.fvgCanLog === false) {
    showToast('FVG retrace', draft.fvgMessage || 'Fix the setup to log');
    return;
  }
  openLogModal(type);
  document.getElementById('log-instr').value = draft.instr;
  document.getElementById('log-entry').value = draft.entry;
  document.getElementById('log-exit').value = draft.exit || '';
  document.getElementById('log-size').value = draft.size;
  document.getElementById('log-dir').value = draft.dir || 'long';
  const stopEl = document.getElementById('log-stop');
  if (stopEl) stopEl.value = draft.stop ?? '';
  setFlag('stop', 'yes');
  const blocked = !!(lastChallengeVerdict && lastChallengeVerdict.blocked);
  setFlag('size', draft.withinRules !== false && !blocked ? 'yes' : 'no');
}

function setFlag(type, val) {
  S.flags[type] = val;
  const yes = document.getElementById(type+'-yes');
  const no  = document.getElementById(type+'-no');
  yes.style.background = val==='yes' ? 'var(--accent)' : '';
  yes.style.color = val==='yes' ? '#070d0b' : '';
  no.style.background  = val==='no'  ? 'var(--red)' : '';
  no.style.color  = val==='no'  ? '#fff' : '';
}

function saveLog() {
  const instr = document.getElementById('log-instr').value.trim();
  const existing = S.editingTradeId
    ? S.trades.find(x => tradeId(x.id) === tradeId(S.editingTradeId))
    : null;
  const exitRaw = document.getElementById('log-exit').value;
  const exit = exitRaw !== '' && exitRaw != null ? parseFloat(exitRaw) : null;
  const pair = window.Baron?.parseForexPair?.(instr) || existing?.pair || null;
  const stopAnswered = S.flags.stop === 'yes' || S.flags.stop === 'no';
  const sizeAnswered = S.flags.size === 'yes' || S.flags.size === 'no';
  const stopOk = S.flags.stop === 'yes' || (!stopAnswered && existing?.stopOk);
  const sizeOk = S.flags.size === 'yes' || (!sizeAnswered && existing?.sizeOk);
  const stopRaw = document.getElementById('log-stop')?.value;
  const stopNum = parseFloat(stopRaw);
  const draft = {
    instr,
    entry: parseFloat(document.getElementById('log-entry').value),
    exit: Number.isFinite(exit) ? exit : null,
    size: parseFloat(document.getElementById('log-size').value),
    dir: document.getElementById('log-dir').value,
    stop: (stopRaw !== '' && Number.isFinite(stopNum)) ? stopNum : (existing?.stop ?? null),
    target: existing?.target ?? null,
    stopOk: !!stopOk,
    sizeOk: !!sizeOk,
    incomplete: !(stopAnswered && sizeAnswered),
    type: existing?.type || (pair ? 'cfd' : 'shares'),
    pair,
  };
  const blocked = !!(lastChallengeVerdict && lastChallengeVerdict.blocked);
  if (sizeOk) {
    draft.challengeFail = false;
    draft.challengeNote = '';
  } else if (blocked) {
    draft.challengeFail = true;
    draft.challengeNote = lastChallengeVerdict.note || '';
    if (challengeEnabled()) draft.book = 'challenge';
  } else if (existing?.challengeFail) {
    draft.challengeFail = true;
    draft.challengeNote = existing.challengeNote || '';
    draft.book = existing.book;
  }
  if (challengeEnabled() && !existing) draft.book = draft.book || 'challenge';
  if (!draft.instr || !draft.entry) return;
  const keepReviewing = reviewingIncompleteQueue;
  const savedId = S.editingTradeId;
  if (!commitLog(draft)) return;
  advancingIncompleteReview = true;
  closeModal('modal-log');
  advancingIncompleteReview = false;
  const title = document.querySelector('#modal-log .modal-title');
  if (title) title.innerHTML = 'Log Trade <button class="modal-close" onclick="closeModal(\'modal-log\')">✕</button>';
  const savedMsg = draft.exit != null ? 'Trade updated ✓' : 'Trade saved ✓';
  const saved = (savedId != null ? S.trades.find(x => tradeId(x.id) === tradeId(savedId)) : null)
    || S.trades[0];
  const replayReady = saved
    && !draft.incomplete
    && typeof DisciplineReplay !== 'undefined'
    && DisciplineReplay.canReplay(saved, S, typeof Baron !== 'undefined' ? Baron : null);
  if (replayReady) {
    reviewingIncompleteQueue = false;
    showToast(saved.instr || draft.instr, 'Replay this miss — see the disciplined version');
    offerDisciplineReplay(saved.id);
    return;
  }
  if (keepReviewing) {
    const remaining = incompleteBrokerFillList().filter(t => tradeId(t.id) !== tradeId(savedId));
    if (remaining.length) {
      reviewingIncompleteQueue = true;
      openTradeEditor(remaining[0].id);
      setIncompleteReviewTitle(remaining.length);
      showToast(draft.instr, savedMsg + ' · ' + remaining.length + ' remaining');
      return;
    }
    reviewingIncompleteQueue = false;
  }
  showToast(draft.instr, savedMsg);
}

function offerDisciplineReplay(id) {
  if (id == null) return;
  openDisciplineReplay(id);
}
window.offerDisciplineReplay = offerDisciplineReplay;
