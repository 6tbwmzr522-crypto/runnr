/**
 * Runnr app — Coach page + equity curve (uses js/coach.js).
 * Extracted from index.html (slice 1). Classic script; globals kept for onclick=.
 */
// ── COACH ─────────────────────────────────────────────────────────────────
var coachAnswers = {}; // legacy — CoachEngine used instead

function renderCoachPage() {
  try { if (window.RunnrGrowth) RunnrGrowth.renderDisciplineCard(S); } catch (e) {}
  const label = document.getElementById('coach-week-label');
  if (label) label.textContent = 'Week of ' + new Date().toLocaleDateString('en-GB', { month: 'short', day: 'numeric', year: 'numeric' });
  const unlocked = hasProAccess();
  const cta = document.getElementById('coach-upgrade-cta');
  const body = document.getElementById('coach-pro-body');
  if (cta) cta.style.display = unlocked ? 'none' : 'block';
  if (body) body.style.display = unlocked ? '' : 'none';
  if (!unlocked) {
    const list = document.getElementById('coach-insights-list');
    if (list) list.innerHTML = '';
    const ansEl = document.getElementById('coach-answer');
    if (ansEl) { ansEl.style.display = 'none'; ansEl.textContent = ''; }
    return;
  }
  const weekTrades = CoachEngine.withinDays(S.trades, 7);
  const priorTrades = CoachEngine.completed(S.trades).filter(t => {
    const d = CoachEngine.tradeDate(t);
    if (!d) return false;
    const days = (new Date() - d) / 86400000;
    return days > 7 && days <= 14;
  });
  const all = CoachEngine.metrics(S.trades);
  const week = CoachEngine.metrics(weekTrades);
  const prior = CoachEngine.metrics(priorTrades);
  const set = (id, t) => { const e = document.getElementById(id); if (e) e.textContent = t; };
  const setDelta = (id, cur, prev, suffix = 'pp') => {
    const el = document.getElementById(id);
    if (!el) return;
    if (!week.count && !prior.count) { el.textContent = '—'; el.className = 'stat-delta'; return; }
    const diff = cur - prev;
    if (Math.abs(diff) < 0.5) { el.textContent = '→ flat vs last week'; el.className = 'stat-delta'; return; }
    const up = diff > 0;
    el.textContent = `${up ? '↑' : '↓'} ${Math.abs(diff).toFixed(0)}${suffix} vs last week`;
    el.className = 'stat-delta ' + (up ? 'delta-up' : 'delta-down');
  };
  set('coach-stop-pct', week.count ? week.stopPct.toFixed(0) + '%' : (all.count ? all.stopPct.toFixed(0) + '%' : '—'));
  set('coach-size-pct', week.count ? week.sizePct.toFixed(0) + '%' : (all.count ? all.sizePct.toFixed(0) + '%' : '—'));
  const bad = weekTrades.filter(t => !t.stopOk || !t.sizeOk).length;
  const priorBad = priorTrades.filter(t => !t.stopOk || !t.sizeOk).length;
  set('coach-early-exits', week.count ? bad + '/' + week.count : (all.count ? bad + '/' + all.count : '—'));
  set('coach-gap-cost', (week.undiscPnl >= 0 ? '+' : '') + S.sym + Math.abs(Math.round(week.count ? week.undiscPnl : all.undiscPnl)).toLocaleString());
  setDelta('coach-stop-delta', week.stopPct, prior.stopPct);
  setDelta('coach-size-delta', week.sizePct, prior.sizePct);
  const undiscEl = document.getElementById('coach-undisc-delta');
  if (undiscEl) {
    if (prior.count) {
      undiscEl.textContent = `was ${priorBad}/${prior.count} last week`;
      undiscEl.className = 'stat-delta';
    } else {
      undiscEl.textContent = week.count ? `${bad} this week` : '—';
      undiscEl.className = 'stat-delta';
    }
  }

  const instBal = portfolioBaseBal() || S.bal || 10000;
  const inst = CoachEngine.institutionalMetrics(S.trades, instBal);
  const instLocked = inst.count < INST_MIN_TRADES;
  const instCard = document.getElementById('coach-institutional-card');
  if (instCard) instCard.classList.toggle('inst-locked', instLocked);

  if (instLocked) {
    set('coach-sortino', '—');
    set('coach-recovery', '—');
    set('coach-pf-inst', '—');
    const lockedVerdict = typeof t === 'function'
      ? t('coach.instLocked', { n: INST_MIN_TRADES })
      : `Unlocks at ${INST_MIN_TRADES} closed trades`;
    set('coach-sortino-verdict', lockedVerdict);
    set('coach-recovery-verdict', lockedVerdict);
    set('coach-pf-inst-verdict', inst.count ? `${inst.count} / ${INST_MIN_TRADES}` : lockedVerdict);
    ['coach-sortino', 'coach-recovery', 'coach-pf-inst'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.style.color = 'var(--text3)';
    });
    const instNote = document.getElementById('coach-inst-note');
    if (instNote) {
      instNote.textContent = inst.count
        ? (typeof t === 'function'
          ? t('coach.instLockedNote', { count: inst.count, min: INST_MIN_TRADES })
          : `${inst.count} of ${INST_MIN_TRADES} closed trades logged. Institutional metrics unlock once your sample is large enough.`)
        : (typeof t === 'function' ? t('coach.instMinNote') : 'Institutional metrics need 30+ closed trades (PF meaningful at 200+).');
    }
  } else {
  const instColor = (pass) => pass ? 'var(--accent)' : (inst.count >= 30 ? 'var(--amber)' : 'var(--text3)');
  const fmtInst = (v, digits = 2) => {
    if (!inst.count) return '—';
    if (v >= 999) return '999+';
    return v.toFixed(digits);
  };
  set('coach-sortino', fmtInst(inst.sortino));
  const sortinoEl = document.getElementById('coach-sortino');
  if (sortinoEl) sortinoEl.style.color = instColor(inst.sortinoPass);
  set('coach-sortino-verdict', inst.count
    ? (inst.sortinoPass ? '✓ above 2.0' : 'target > 2.0')
    : 'need closed trades');
  set('coach-recovery', fmtInst(inst.recoveryFactor));
  const recEl = document.getElementById('coach-recovery');
  if (recEl) recEl.style.color = instColor(inst.recoveryPass);
  set('coach-recovery-verdict', inst.count
    ? `max DD ${inst.maxDrawdownPct.toFixed(1)}%`
    : 'net ÷ max DD');
  set('coach-pf-inst', inst.count ? inst.profitFactor.toFixed(2) : '—');
  const pfInstEl = document.getElementById('coach-pf-inst');
  if (pfInstEl) pfInstEl.style.color = instColor(inst.profitFactorSignificance.pass);
  set('coach-pf-inst-verdict', inst.profitFactorSignificance.label);
  const instNote = document.getElementById('coach-inst-note');
  if (instNote) {
    if (!inst.count) {
      instNote.textContent = 'Log closed trades to compute Sortino and Recovery Factor. Profit factor needs 200+ trades before allocators treat it as real.';
    } else {
      instNote.textContent = `${inst.count} trades over ${inst.tradeYears.toFixed(1)}y · ${inst.profitFactorSignificance.detail}. Sortino penalises only downside vol (not upside). Recovery = net profit ÷ largest peak-to-trough drawdown (${S.sym}${Math.round(inst.maxDrawdownAbs).toLocaleString()}).`;
    }
  }
  }

  const list = document.getElementById('coach-insights-list');
  if (list) {
    try {
      list.innerHTML = CoachEngine.generateInsights(S.trades, S.sym).map(i => {
        try {
          return `
      <div class="coach-insight ci-${i.type}">
        <div class="ci-type">${i.title}</div>
        <div class="ci-text">${i.text}</div>
      </div>`;
        } catch (e) { return ''; }
      }).join('');
    } catch (e) { console.warn('coach insights failed', e); }
  }
}

async function askCoach(el) {
  if (!(await requirePro('Coach'))) return;
  const q = el.textContent;
  const ans = CoachEngine.answerQuestion(S.trades, q, S.sym, S.bal, S.risk);
  const ansEl = document.getElementById('coach-answer');
  ansEl.textContent = ans;
  ansEl.style.display = 'block';
  ansEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
async function askCoachFree() {
  if (!(await requirePro('Coach'))) return;
  const input = document.getElementById('coach-free-ask');
  const q = (input?.value || '').trim();
  if (!q) return;
  const ans = CoachEngine.answerQuestion(S.trades, q, S.sym, S.bal, S.risk);
  const ansEl = document.getElementById('coach-answer');
  ansEl.textContent = ans;
  ansEl.style.display = 'block';
  ansEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
window.askCoachFree = askCoachFree;

// ── EQUITY CURVE ──────────────────────────────────────────────────────────
function drawEquityCurve() {
  const canvas = document.getElementById('equity-canvas');
  if (!canvas) return;
  if (!hasProAccess()) return;
  const cmp = CoachEngine.equityComparison(S.trades, S.bal);
  const actual = cmp.actual.length > 1 ? cmp.actual : [0, cmp.actualEnd];
  const ideal = cmp.ideal.length > 1 ? cmp.ideal : [0, cmp.idealEnd];

  const dpr = window.devicePixelRatio || 1;
  canvas.width = canvas.offsetWidth * dpr;
  canvas.height = 120 * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  const cw = canvas.offsetWidth, ch = 120;
  const n = actual.length;

  function toX(i) { return (i / (n - 1)) * cw; }
  function toY(v, min, max) { return ch - 16 - ((v - min) / (max - min)) * (ch - 32); }

  const allVals = [...actual, ...ideal];
  const mn = Math.min(...allVals, 0) - 50;
  const mx = Math.max(...allVals, 50) + 50;

  ctx.clearRect(0, 0, cw, ch);
  ctx.beginPath();
  ctx.moveTo(toX(0), toY(ideal[0], mn, mx));
  ideal.forEach((v, i) => { if (i > 0) ctx.lineTo(toX(i), toY(v, mn, mx)); });
  ctx.strokeStyle = '#00e5a0';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(toX(0), toY(actual[0], mn, mx));
  actual.forEach((v, i) => { if (i > 0) ctx.lineTo(toX(i), toY(v, mn, mx)); });
  ctx.strokeStyle = '#ff4d6d';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 3]);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.font = '10px Cormorant Garamond, serif';
  ctx.fillStyle = '#00e5a0';
  ctx.fillText((cmp.idealEnd >= 0 ? '+' : '') + S.sym + Math.round(cmp.idealEnd).toLocaleString(), toX(n - 1) - 60, toY(ideal[n - 1], mn, mx) - 6);
  ctx.fillStyle = '#ff4d6d';
  ctx.fillText((cmp.actualEnd >= 0 ? '+' : '') + S.sym + Math.round(cmp.actualEnd).toLocaleString(), toX(n - 1) - 52, toY(actual[n - 1], mn, mx) + 14);
}
