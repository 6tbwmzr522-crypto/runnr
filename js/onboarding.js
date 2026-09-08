/** Runnr growth engine — first-minute hook, onboarding, weekly digest, share cards */
const RunnrGrowth = {
  HOOK_KEY: "runnr_hook_v1",
  DEMO_TRADE: {
    instr: "NVDA",
    dir: "long",
    entry: 120,
    exit: 114,
    size: 85,
    stop: 117.6,
    stopOk: false,
    sizeOk: false,
  },

  isDemoOrEmpty(state) {
    if (typeof RunnrSync !== "undefined" && typeof RunnrSync.isDemoState === "function") {
      return !!RunnrSync.isDemoState(state);
    }
    const trades = (state && state.trades) || [];
    return !trades.some((t) => t && t.source);
  },

  shouldShowHook(state) {
    try {
      if (localStorage.getItem(this.HOOK_KEY) === "done") return false;
    } catch (e) {}
    if (typeof RunnrSync !== "undefined" && RunnrSync.isLoggedIn?.()) return false;
    if (!this.isDemoOrEmpty(state)) return false;
    return true;
  },

  completeHook() {
    try { localStorage.setItem(this.HOOK_KEY, "done"); } catch (e) {}
    try { document.documentElement.classList.remove("runnr-show-hook"); } catch (e) {}
  },

  shouldShowOnboarding(state) {
    if (state.onboardingComplete) return false;
    try {
      if (localStorage.getItem("runnr_onboarding_v1") === "done") return false;
    } catch (e) {}
    // Sample journal (ids 1–4) must not count as “already onboarded”.
    const real = ((state && state.trades) || []).filter((t) => t && t.source);
    if (real.length >= 3) {
      this.completeOnboarding(state);
      return false;
    }
    return true;
  },

  completeOnboarding(state) {
    state.onboardingComplete = true;
    try { localStorage.setItem("runnr_onboarding_v1", "done"); } catch (e) {}
  },

  renderHomeBanner(state) {
    const el = document.getElementById("home-coach-banner");
    if (!el) return;
    const d = CoachEngine.weeklyDigest(state.trades, state.sym);
    el.querySelector("span").textContent = d.bannerText;
  },

  scoreTrades(state) {
    const TL = window.RunnrTradeLimit;
    const all = (state && state.trades) || [];
    if (TL && typeof TL.countableTradeList === "function") return TL.countableTradeList(all);
    return all.filter((t) => t && !t.mergedAway && !t.isDemo && !t.seed);
  },

  scoreShareUnlocked(state) {
    const TL = window.RunnrTradeLimit;
    if (TL && typeof TL.scoreShareUnlocked === "function") {
      return TL.scoreShareUnlocked((state && state.trades) || []);
    }
    return this.scoreTrades(state).length >= 3;
  },

  scoreShareLockCopy(state) {
    const TL = window.RunnrTradeLimit;
    if (TL && typeof TL.scoreShareLockCopy === "function") {
      return TL.scoreShareLockCopy((state && state.trades) || []);
    }
    return "Log 3 trades to unlock your score & share card";
  },

  renderDisciplineCard(state) {
    const unlocked = this.scoreShareUnlocked(state);
    const lockCopy = this.scoreShareLockCopy(state);
    const scoreTrades = this.scoreTrades(state);
    const score = unlocked
      ? CoachEngine.disciplineScore(scoreTrades)
      : { overall: 0, stopPct: 0, sizePct: 0, streak: 0, tradeCount: 0, tier: "—" };
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    set("disc-score-val", unlocked && score.tradeCount ? score.overall + "%" : "—");
    set("disc-stop-val", unlocked && score.tradeCount ? score.stopPct + "%" : "—");
    set("disc-size-val", unlocked && score.tradeCount ? score.sizePct + "%" : "—");
    set("disc-streak-val", unlocked && score.streak ? score.streak + "d" : "0");
    set("disc-tier-label", unlocked ? score.tier : "Locked");
    const ring = document.getElementById("disc-score-ring");
    if (ring) {
      const pct = unlocked && score.tradeCount ? score.overall : 0;
      ring.style.background = `conic-gradient(var(--accent) ${pct * 3.6}deg, var(--surface3) 0)`;
    }
    const card = document.getElementById("home-discipline-card");
    if (card) card.classList.toggle("disc-locked", !unlocked);
    const note = document.getElementById("disc-unlock-note");
    if (note) {
      note.hidden = unlocked;
      note.textContent = lockCopy;
    }
    const shareBtn = document.getElementById("home-share-btn");
    if (shareBtn) {
      shareBtn.textContent = unlocked
        ? (typeof t === "function" ? t("home.share") : "Share ↗")
        : "Unlock";
      shareBtn.setAttribute("aria-disabled", unlocked ? "false" : "true");
    }
    const coachReady = document.getElementById("coach-share-ready");
    const coachLocked = document.getElementById("coach-share-locked");
    if (coachReady) coachReady.hidden = !unlocked;
    if (coachLocked) {
      coachLocked.hidden = unlocked;
      const lockLine = coachLocked.querySelector("[data-share-lock-copy]");
      if (lockLine) lockLine.textContent = lockCopy || "Log 3 trades to unlock your score & share card";
    }
    const badge = document.getElementById("tier-badge");
    if (badge) {
      if (!unlocked) badge.textContent = "🌱 NOVICE";
      else if (score.tradeCount) {
        const icons = { Novice: "🌱", Learning: "📈", Disciplined: "🎯", "Consistent Runner": "🏃" };
        badge.textContent = `${icons[score.tier] || "🌱"} ${score.tier.toUpperCase()}`;
      }
    }
  },

  // ── Onboarding wizard ──
  step: 0,
  draft: {},
  mode: "",

  openHook() {
    this.mode = "hook";
    const overlay = document.getElementById("onboarding-overlay");
    if (!overlay) return;
    overlay.classList.add("open", "hook-mode");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "What Runnr is");
    const body = document.getElementById("ob-body");
    if (body && !body.querySelector(".ob-hook")) this.renderHook();
    document.documentElement.classList.add("runnr-show-hook");
  },

  renderHook() {
    const body = document.getElementById("ob-body");
    if (!body) return;
    body.innerHTML = `
      <div class="ob-hook">
        <div class="ob-hero">
          <div class="ob-kicker">You do not trade here</div>
          <h2>Trading discipline, not a broker</h2>
          <p>Sizer, journal, score, streak, and session wave. Not a P&amp;L tracker.</p>
        </div>
        <dl class="ob-hook-pills">
          <div class="ob-hook-pill"><dt>Sizer</dt><dd>Account, risk %, and a stop</dd></div>
          <div class="ob-hook-pill"><dt>Journal</dt><dd>Flags skipped stops and oversized trades</dd></div>
          <div class="ob-hook-pill"><dt>Coach</dt><dd>Report on the one trade that hurt</dd></div>
          <div class="ob-hook-pill"><dt>Terminal</dt><dd>Session clocks, heatmap, chart — look without paying</dd></div>
        </dl>
        <p class="ob-hook-price">Start free · 5 journal trades · then €19/month or €190/year</p>
        <p class="ob-hook-sample">Sample journal is labeled SAMPLE. Those numbers are not yours.</p>
        <div class="ob-hook-actions">
          <a class="btn" id="ob-hook-start" href="/login.html">Start free</a>
          <button type="button" class="btn btn-ghost" id="ob-hook-enter">View sample</button>
          <a class="ob-hook-secondary" id="ob-hook-report" href="/report/">Score one trade</a>
        </div>
      </div>`;
  },

  dismissHook(state) {
    this.completeHook();
    if (state) this.completeOnboarding(state);
    if (typeof persist === "function") persist();
    this.close();
  },

  hideHookPaint() {
    try { document.documentElement.classList.remove("runnr-show-hook"); } catch (e) {}
    const overlay = document.getElementById("onboarding-overlay");
    if (overlay && this.mode !== "wizard") {
      overlay.classList.remove("open", "hook-mode");
    }
  },

  bootGate(state) {
    if (document.getElementById("modal-sync-auth")?.classList.contains("open")) {
      this.hideHookPaint();
      return;
    }
    if (window._runnrAuthPending) {
      this.hideHookPaint();
      return;
    }
    if (!window.RunnrSync?.isLoggedIn?.() && document.getElementById("page-sync")?.classList.contains("active")) {
      this.hideHookPaint();
      return;
    }
    if (this.shouldShowHook(state)) {
      this.openHook();
      return;
    }
    this.hideHookPaint();
    if (typeof RunnrIntro !== "undefined" && RunnrIntro.shouldShow?.(state)) {
      return;
    }
    if (this.shouldShowOnboarding(state)) this.open(state);
  },

  open(state) {
    this.mode = "wizard";
    this.step = 0;
    this.draft = { balance: state.bal, risk: state.risk };
    const overlay = document.getElementById("onboarding-overlay");
    overlay?.classList.remove("hook-mode");
    overlay?.classList.add("open");
    document.documentElement.classList.remove("runnr-show-hook");
    this.renderStep(state);
  },

  close() {
    const overlay = document.getElementById("onboarding-overlay");
    overlay?.classList.remove("open", "hook-mode");
    document.documentElement.classList.remove("runnr-show-hook");
    this.mode = "";
  },

  renderStep(state) {
    const body = document.getElementById("ob-body");
    const prog = document.getElementById("ob-progress");
    if (!body) return;
    const steps = 4;
    if (prog) prog.style.width = ((this.step + 1) / steps * 100) + "%";

    if (this.step === 0) {
      body.innerHTML = `
        <div class="ob-hero">
          <div class="ob-kicker">Free · 2 minutes</div>
          <h2>What did your last trade <em>really</em> cost you?</h2>
          <p>Not the P&amp;L — the cost of oversizing, skipping stops, and breaking your rules.</p>
        </div>
        <button class="btn" onclick="RunnrGrowth.nextStep(S)">Analyse my last trade</button>
        <button class="btn btn-ghost" style="margin-top:10px" onclick="RunnrGrowth.useDemo(S)">Try with example trade</button>
      `;
    } else if (this.step === 1) {
      body.innerHTML = `
        <div class="ob-hero"><h2>Your account</h2><p>Used to calculate proper position size.</p></div>
        <div class="field"><label>Balance</label><input id="ob-bal" type="number" value="${this.draft.balance || state.bal}"></div>
        <div class="field"><label>Risk % per trade</label><input id="ob-risk" type="number" step="0.5" value="${this.draft.risk || state.risk}"></div>
        <button class="btn" onclick="RunnrGrowth.saveAccountStep(S)">Continue</button>
      `;
    } else if (this.step === 2) {
      body.innerHTML = `
        <div class="ob-hero"><h2>Your trade</h2><p>Paste your worst recent trade — or compare up to 4 tickers with the same size.</p></div>
        <div class="field"><label>Symbol(s)</label><input id="ob-instr" placeholder="NVDA, AAPL, BTC — up to 4" value="${this.draft.instr || ""}"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div class="field"><label>Entry</label><input id="ob-entry" type="number" placeholder="0.00" value="${this.draft.entry || ""}"></div>
          <div class="field"><label>Exit</label><input id="ob-exit" type="number" placeholder="0.00" value="${this.draft.exit || ""}"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div class="field"><label>Size (units/shares)</label><input id="ob-size" type="number" placeholder="0" value="${this.draft.size || ""}"></div>
          <div class="field"><label>Stop (optional)</label><input id="ob-stop" type="number" placeholder="0.00" value="${this.draft.stop || ""}"></div>
        </div>
        <div class="field"><label>Direction</label>
          <select id="ob-dir"><option value="long" ${this.draft.dir !== "short" ? "selected" : ""}>Long</option><option value="short" ${this.draft.dir === "short" ? "selected" : ""}>Short</option></select>
        </div>
        <button class="btn" onclick="RunnrGrowth.analyseStep(S)">Show me the cost</button>
      `;
    } else if (this.step === 3) {
      const multi = this.draft.multiAnalysis;
      if (multi && multi.length > 1) {
        const rows = multi.map(a => {
          const cost = a.oversizeCost > 0 ? state.sym + Math.round(a.oversizeCost).toLocaleString() : "✓";
          const costColor = a.oversizeCost > 0 ? "var(--red)" : "var(--accent)";
          return `<tr>
            <td style="font-weight:700">${a.instr}</td>
            <td>${a.actualShares} → <strong>${a.properShares}</strong></td>
            <td style="color:${costColor}">${cost}</td>
          </tr>`;
        }).join("");
        const worst = multi.reduce((a, b) => (b.oversizeCost > a.oversizeCost ? b : a), multi[0]);
        body.innerHTML = `
          <div class="ob-hero"><h2>Compare tickers</h2><p>Same entry/exit/size — rules cap each symbol differently.</p></div>
          <div class="ob-compare" style="display:block;overflow-x:auto">
            <table style="width:100%;font-size:12px;border-collapse:collapse">
              <thead><tr style="color:var(--text3);text-align:left">
                <th style="padding:6px 4px">Symbol</th>
                <th style="padding:6px 4px">You → Rules</th>
                <th style="padding:6px 4px">Discipline cost</th>
              </tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
          <p class="ob-insight" style="margin-top:12px">Worst oversize: <strong>${worst.instr}</strong> — ${worst.headline}</p>
          <div class="card-sm" style="margin:12px 0">
            <div style="font-size:12px;color:var(--text2);margin-bottom:8px">Were your discipline flags correct?</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button class="btn btn-sm btn-ghost" id="ob-stop-y" onclick="RunnrGrowth.setObFlag('stop',true)">Stop confirmed ✓</button>
              <button class="btn btn-sm btn-ghost" id="ob-stop-n" onclick="RunnrGrowth.setObFlag('stop',false)">No stop ✗</button>
            </div>
          </div>
          <button class="btn" onclick="RunnrGrowth.finish(S)">Save &amp; start my journal</button>
          <div class="ob-paywall" style="cursor:pointer" onclick="typeof openUpgrade==='function'&&openUpgrade()">Unlock Coach, alerts, broker sync &amp; CSV — <strong>€19/mo</strong></div>
        `;
        this.draft.stopOk = worst.suggestedStopOk;
        this.draft.sizeOk = worst.suggestedSizeOk;
        return;
      }
      const a = this.draft.analysis;
      if (!a || !a.ok) {
        body.innerHTML = `<p>Could not analyse trade.</p><button class="btn" onclick="RunnrGrowth.step=2;RunnrGrowth.renderStep(S)">Back</button>`;
        return;
      }
      const costColor = a.oversizeCost > 0 ? "var(--red)" : "var(--accent)";
      body.innerHTML = `
        <div class="ob-aha">
          <div class="ob-aha-label">${a.instr} · ${a.actualPnl >= 0 ? "+" : ""}${state.sym}${Math.abs(a.actualPnl).toLocaleString()} actual</div>
          <div class="ob-aha-cost" style="color:${costColor}">${a.oversizeCost > 0 ? state.sym + Math.round(a.oversizeCost).toLocaleString() : "✓"}</div>
          <div class="ob-aha-sub">${a.headline}</div>
          <p class="ob-insight">${a.insight}</p>
          <div class="ob-compare">
            <div><span>You traded</span><strong>${a.actualShares} units</strong></div>
            <div><span>Rules said</span><strong>${a.properShares} units</strong></div>
            <div><span>At ${this.draft.risk}% risk</span><strong>${state.sym}${a.riskAmount}</strong></div>
          </div>
        </div>
        <div class="card-sm" style="margin:12px 0">
          <div style="font-size:12px;color:var(--text2);margin-bottom:8px">Were your discipline flags correct?</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-sm btn-ghost" id="ob-stop-y" onclick="RunnrGrowth.setObFlag('stop',true)">Stop confirmed ✓</button>
            <button class="btn btn-sm btn-ghost" id="ob-stop-n" onclick="RunnrGrowth.setObFlag('stop',false)">No stop ✗</button>
          </div>
        </div>
        <button class="btn" onclick="RunnrGrowth.finish(S)">Save &amp; start my journal</button>
        <div class="ob-paywall" style="cursor:pointer" onclick="typeof openUpgrade==='function'&&openUpgrade()">Unlock Coach, alerts, broker sync &amp; CSV — <strong>€19/mo</strong></div>
      `;
      this.draft.stopOk = a.suggestedStopOk;
      this.draft.sizeOk = a.suggestedSizeOk;
    }
  },

  nextStep(state) { this.step++; this.renderStep(state); },

  useDemo(state) {
    Object.assign(this.draft, this.DEMO_TRADE);
    state.bal = state.bal || 10000;
    state.risk = state.risk || 1;
    this.step = 2;
    this.renderStep(state);
  },

  saveAccountStep(state) {
    this.draft.balance = parseFloat(document.getElementById("ob-bal")?.value) || state.bal;
    this.draft.risk = parseFloat(document.getElementById("ob-risk")?.value) || state.risk;
    state.bal = this.draft.balance;
    state.risk = this.draft.risk;
    persist();
    this.step = 2;
    this.renderStep(state);
  },

  parseSymbols(raw) {
    return [...new Set(String(raw || "").split(/[,\s;/]+/).map(s => s.trim().toUpperCase()).filter(Boolean))].slice(0, 4);
  },

  analyseStep(state) {
    const raw = document.getElementById("ob-instr")?.value.trim() || "";
    const symbols = this.parseSymbols(raw);
    if (!symbols.length) {
      alert("Enter at least one symbol (e.g. NVDA or NVDA, AAPL, BTC).");
      return;
    }
    this.draft.instr = symbols.join(", ");
    this.draft.symbols = symbols;
    this.draft.entry = parseFloat(document.getElementById("ob-entry")?.value);
    this.draft.exit = parseFloat(document.getElementById("ob-exit")?.value);
    this.draft.size = parseFloat(document.getElementById("ob-size")?.value);
    this.draft.stop = parseFloat(document.getElementById("ob-stop")?.value);
    this.draft.dir = document.getElementById("ob-dir")?.value || "long";
    const risk = this.draft.risk || state.risk;
    const bal = state.bal;

    if (symbols.length > 1) {
      this.draft.multiAnalysis = symbols.map(sym => CoachEngine.analyzeTrade(
        { ...this.draft, instr: sym },
        bal,
        risk,
        state.sym
      )).filter(a => a.ok);
      if (!this.draft.multiAnalysis.length) {
        alert("Check your numbers — could not analyse any symbol.");
        return;
      }
      this.draft.analysis = null;
    } else {
      this.draft.analysis = CoachEngine.analyzeTrade({ ...this.draft, instr: symbols[0] }, bal, risk, state.sym);
      this.draft.multiAnalysis = null;
      if (!this.draft.analysis.ok) {
        alert(this.draft.analysis.error || "Check your numbers.");
        return;
      }
    }
    this.step = 3;
    this.renderStep(state);
  },

  setObFlag(type, ok) {
    if (type === "stop") this.draft.stopOk = ok;
    else this.draft.sizeOk = ok;
  },

  finish(state) {
    const d = this.draft;
    const symbols = d.symbols && d.symbols.length > 1 ? d.symbols : [d.instr || (d.symbols && d.symbols[0]) || "—"];
    if (typeof canAddJournalTrade === "function" && !canAddJournalTrade(symbols.length)) {
      if (typeof openUpgrade === "function") {
        if (typeof openJournalLimitUpgrade === "function") openJournalLimitUpgrade();
        else openUpgrade(`Free plan · ${window.FREE_TRADE_LIMIT || 5} trades (includes imports)`);
      } else {
        alert("Free plan journal limit reached. Upgrade for unlimited trades.");
      }
      return;
    }
    const sign = d.dir === "long" ? 1 : -1;
    const dateStr = new Date().toLocaleDateString("en-GB", { month: "short", day: "numeric" });
    symbols.forEach((instr, i) => {
      const pnl = Math.round((d.exit - d.entry) * sign * (d.size || 1));
      const row = {
        id: Date.now() + i,
        instr,
        dir: d.dir,
        entry: d.entry,
        exit: d.exit,
        size: d.size || 1,
        pnl,
        stopOk: d.stopOk !== false,
        sizeOk: d.sizeOk !== false,
        type: "shares",
        date: dateStr,
        incomplete: false,
        fromOnboarding: true,
      };
      if (typeof DisciplineReplay !== "undefined" && DisciplineReplay.stampTrade) {
        DisciplineReplay.stampTrade(row, state, typeof Baron !== "undefined" ? Baron : null);
      }
      state.trades.unshift(row);
    });
    this.completeOnboarding(state);
    persist();
    this.close();
    if (typeof updateHomeStats === "function") updateHomeStats();
    if (typeof renderJournal === "function") renderJournal();
    if (typeof renderCoachPage === "function") renderCoachPage();
    switchPage("coach");
  },

  skip(state) {
    if (this.mode === "hook" || document.getElementById("onboarding-overlay")?.classList.contains("hook-mode")) {
      this.dismissHook(state);
      return;
    }
    this.completeOnboarding(state);
    persist();
    this.close();
  },

  // ── Share discipline card ──
  shareVariant: "weekly",
  SHARE_WEEKLY: { w: 360, h: 700 },
  SHARE_SCORE: { w: 360, h: 420 },

  prepareShareCanvas(canvas, w, h) {
    const dpr = (typeof window !== "undefined" && window.devicePixelRatio) || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  },

  roundRectPath(ctx, x, y, w, h, r) {
    const rad = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  },

  wrapShareText(ctx, text, x, y, maxW, lineH, maxLines) {
    const words = String(text || "").split(/\s+/).filter(Boolean);
    let line = "";
    let n = 0;
    const measure = (s) => {
      try { return ctx.measureText(s).width; } catch (e) { return String(s).length * 7; }
    };
    for (let i = 0; i < words.length; i++) {
      const test = line ? line + " " + words[i] : words[i];
      if (measure(test) > maxW && line) {
        ctx.fillText(line, x, y + n * lineH);
        line = words[i];
        n += 1;
        if (n >= maxLines - 1) {
          const rest = [line].concat(words.slice(i + 1)).join(" ");
          let clipped = rest;
          while (clipped.length > 1 && measure(clipped + "…") > maxW) clipped = clipped.slice(0, -1);
          ctx.fillText(clipped === rest ? rest : clipped + "…", x, y + n * lineH);
          return;
        }
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, x, y + n * lineH);
  },

  weeklyShareModel(state) {
    return CoachEngine.weeklyShareModel(this.scoreTrades(state), {
      sym: state.sym || "€",
      riskPct: state.risk,
      handle: state.profileHandle || "",
      now: state.shareNow,
    });
  },

  drawShareRing(ctx, cx, cy, r, pct) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = "#161d28";
    ctx.lineWidth = 9;
    ctx.lineCap = "butt";
    ctx.stroke();
    const p = Number(pct);
    if (Number.isFinite(p) && p > 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.min(100, p) / 100 * Math.PI * 2);
      ctx.strokeStyle = "#00e5a0";
      ctx.lineWidth = 9;
      ctx.lineCap = "round";
      ctx.stroke();
    }
  },

  drawLoudBrandFooter(ctx, x, y, w, h, handleUrl) {
    this.roundRectPath(ctx, x, y, w, h, 12);
    ctx.fillStyle = "rgba(0, 229, 160, 0.10)";
    ctx.fill();
    ctx.strokeStyle = "#00e5a0";
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.fillStyle = "#00e5a0";
    ctx.font = "700 34px Jost, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("runnr.fyi", x + w / 2, y + (handleUrl ? 38 : 42));

    ctx.fillStyle = "#C9A96E";
    ctx.font = "italic 500 13px Cormorant Garamond, serif";
    ctx.fillText("Discipline OS · Process · not P&L", x + w / 2, y + (handleUrl ? 58 : 64));

    if (handleUrl) {
      ctx.fillStyle = "rgba(245,242,236,0.45)";
      ctx.font = "500 11px Jost, sans-serif";
      ctx.fillText(handleUrl, x + w / 2, y + h - 14);
    }
    ctx.textAlign = "left";
  },

  drawShareCard(state, canvas) {
    const score = CoachEngine.disciplineScore(this.scoreTrades(state));
    const handle = state.profileHandle || "runner";
    const W = this.SHARE_SCORE.w;
    const H = this.SHARE_SCORE.h;
    const ctx = this.prepareShareCanvas(canvas, W, H);

    ctx.fillStyle = "#080c12";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "#C9A96E";
    ctx.lineWidth = 2;
    ctx.strokeRect(12, 12, W - 24, H - 24);

    ctx.fillStyle = "rgba(201,169,110,0.7)";
    ctx.font = "500 11px Jost, sans-serif";
    ctx.fillText("RUNNR · DISCIPLINE SCORE", 28, 44);

    ctx.fillStyle = "#00e5a0";
    ctx.font = "italic 700 52px Cormorant Garamond, serif";
    ctx.fillText(score.tradeCount ? score.overall + "%" : "—", 28, 110);

    ctx.fillStyle = "rgba(245,242,236,0.55)";
    ctx.font = "13px Jost, sans-serif";
    ctx.fillText("Stop confirmation: " + (score.tradeCount ? score.stopPct + "%" : "—"), 28, 150);
    ctx.fillText("Size discipline:   " + (score.tradeCount ? score.sizePct + "%" : "—"), 28, 174);
    ctx.fillText(score.tradeCount + " trades · " + score.streak + "-day streak", 28, 210);

    ctx.fillStyle = "rgba(201,169,110,0.5)";
    ctx.font = "11px Cormorant Garamond, serif";
    ctx.fillText("runnr.fyi/u/" + handle, 28, H - 36);
    ctx.fillText("Process · not P&L", 28, H - 18);
  },

  drawWeeklyDigestCard(state, canvas) {
    const card = this.weeklyShareModel(state);
    const W = this.SHARE_WEEKLY.w;
    const H = this.SHARE_WEEKLY.h;
    const ctx = this.prepareShareCanvas(canvas, W, H);
    const pad = 20;

    ctx.fillStyle = "#080c12";
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "#C9A96E";
    ctx.font = "italic 500 22px Cormorant Garamond, serif";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("runnr", pad, 36);

    const pill = "WEEKLY DIGEST";
    ctx.font = "600 9px Jost, sans-serif";
    const pillW = Math.max(92, (ctx.measureText ? ctx.measureText(pill).width : 70) + 16);
    const pillX = W - pad - pillW;
    this.roundRectPath(ctx, pillX, 18, pillW, 20, 10);
    ctx.strokeStyle = "#00e5a0";
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = "#00e5a0";
    ctx.textAlign = "center";
    ctx.fillText(pill, pillX + pillW / 2, 32);
    ctx.textAlign = "left";

    ctx.fillStyle = "rgba(245,242,236,0.42)";
    ctx.font = "500 11px Jost, sans-serif";
    ctx.fillText(card.dateLabel, pad, 56);

    ctx.fillStyle = "#E8C97A";
    ctx.font = "italic 400 22px Cormorant Garamond, serif";
    ctx.fillText("This week's", pad, 88);
    ctx.font = "italic 500 34px Cormorant Garamond, serif";
    ctx.fillText("discipline report", pad, 122);

    const ringX = pad + 44;
    const ringY = 188;
    this.drawShareRing(ctx, ringX, ringY, 38, card.overall);
    ctx.fillStyle = "#F5F2EC";
    ctx.font = "700 22px Jost, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(card.overallLabel, ringX, ringY + 8);
    ctx.textAlign = "left";

    const metaX = 124;
    ctx.fillStyle = "rgba(245,242,236,0.38)";
    ctx.font = "600 9px Jost, sans-serif";
    ctx.fillText("DISCIPLINE SCORE", metaX, 158);
    ctx.fillStyle = "#00e5a0";
    ctx.font = "italic 600 22px Cormorant Garamond, serif";
    ctx.fillText(card.tier, metaX, 184);
    ctx.fillStyle = "rgba(245,242,236,0.72)";
    ctx.font = "400 12px Jost, sans-serif";
    ctx.fillText(card.tradeCount + " trades logged", metaX, 206);
    ctx.fillText(card.streak ? card.streak + "-day streak held" : "no active streak", metaX, 224);

    const cells = [
      { v: card.stopLabel, l: "STOP DISCIPLINE" },
      { v: card.sizeLabel, l: "SIZE DISCIPLINE" },
      { v: card.pfLabel, l: "PROFIT FACTOR" },
      { v: card.winLabel, l: "WIN RATE" },
    ];
    const gap = 8;
    const gridX = pad;
    const gridY = 252;
    const cellW = (W - pad * 2 - gap) / 2;
    const cellH = 58;
    cells.forEach((c, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = gridX + col * (cellW + gap);
      const y = gridY + row * (cellH + gap);
      this.roundRectPath(ctx, x, y, cellW, cellH, 8);
      ctx.fillStyle = "#101620";
      ctx.fill();
      ctx.fillStyle = "#F5F2EC";
      ctx.font = "600 22px Jost, sans-serif";
      ctx.fillText(c.v, x + 12, y + 28);
      ctx.fillStyle = "rgba(245,242,236,0.38)";
      ctx.font = "600 8px Jost, sans-serif";
      ctx.fillText(c.l, x + 12, y + 46);
    });

    const pnlY = gridY + cellH * 2 + gap * 2 + 6;
    const pnlH = 64;
    const pnlW = cellW;
    [
      { title: "DISCIPLINED P&L", value: card.discPnlLabel, sub: "followed", color: "#00e5a0" },
      { title: "UNDISCIPLINED P&L", value: card.undiscPnlLabel, sub: card.leakLabel, color: "#e85d6f" },
    ].forEach((c, i) => {
      const x = gridX + i * (pnlW + gap);
      this.roundRectPath(ctx, x, pnlY, pnlW, pnlH, 8);
      ctx.fillStyle = "#101620";
      ctx.fill();
      ctx.fillStyle = "rgba(245,242,236,0.38)";
      ctx.font = "600 8px Jost, sans-serif";
      ctx.fillText(c.title, x + 12, pnlY + 16);
      ctx.fillStyle = c.color;
      ctx.font = "600 20px Jost, sans-serif";
      ctx.fillText(c.value, x + 12, pnlY + 38);
      ctx.fillStyle = "rgba(245,242,236,0.42)";
      ctx.font = "400 11px Jost, sans-serif";
      ctx.fillText(c.sub, x + 12, pnlY + 54);
    });

    const noteY = pnlY + pnlH + 10;
    this.roundRectPath(ctx, pad, noteY, W - pad * 2, 52, 8);
    ctx.fillStyle = "#101620";
    ctx.fill();
    ctx.fillStyle = "rgba(245,242,236,0.82)";
    ctx.font = "400 12px Jost, sans-serif";
    this.wrapShareText(ctx, card.coachNote, pad + 12, noteY + 20, W - pad * 2 - 24, 16, 2);

    const prog = card.progress || { label: "PROGRESS TO ELITE RUNNER", ratio: 0, detail: "" };
    const progY = noteY + 70;
    ctx.fillStyle = "rgba(245,242,236,0.38)";
    ctx.font = "600 9px Jost, sans-serif";
    ctx.fillText(prog.label, pad, progY);
    this.roundRectPath(ctx, pad, progY + 10, W - pad * 2, 7, 4);
    ctx.fillStyle = "#161d28";
    ctx.fill();
    const fillW = Math.max(0, Math.min(1, Number(prog.ratio) || 0)) * (W - pad * 2);
    if (fillW > 0) {
      this.roundRectPath(ctx, pad, progY + 10, fillW, 7, 4);
      ctx.fillStyle = "#00e5a0";
      ctx.fill();
    }
    ctx.fillStyle = "rgba(245,242,236,0.42)";
    ctx.font = "400 11px Jost, sans-serif";
    ctx.fillText(prog.detail, pad, progY + 34);

    this.drawLoudBrandFooter(ctx, pad, H - 108, W - pad * 2, 88, card.handleUrl);
  },

  drawActiveShareCard(state, canvas) {
    if (!canvas) return;
    if (this.shareVariant === "score") this.drawShareCard(state, canvas);
    else this.drawWeeklyDigestCard(state, canvas);
  },

  setShareVariant(variant, state) {
    this.shareVariant = variant === "score" ? "score" : "weekly";
    document.querySelectorAll("[data-share-variant]").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-share-variant") === this.shareVariant);
    });
    const note = document.getElementById("share-card-note");
    if (note) {
      note.textContent = this.shareVariant === "score"
        ? "Process only — no P&L on the score card."
        : "Loud runnr.fyi footer — built for TikTok / Reels. Process P&L (followed vs leaks).";
    }
    const canvas = document.getElementById("share-canvas");
    if (canvas) this.drawActiveShareCard(state, canvas);
  },

  redrawShareFromHandle(state) {
    const input = document.getElementById("share-handle");
    if (input) state.profileHandle = input.value;
    if (typeof persist === "function") persist();
    const canvas = document.getElementById("share-canvas");
    if (canvas) this.drawActiveShareCard(state, canvas);
  },

  async shareDisciplineCard(state) {
    if (!this.scoreShareUnlocked(state)) {
      this.openShareModal(state);
      return;
    }
    const canvas = document.getElementById("share-canvas");
    if (!canvas) return;
    try { await document.fonts?.ready; } catch (e) {}
    this.drawActiveShareCard(state, canvas);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const weekly = this.shareVariant !== "score";
    const filename = weekly ? "runnr-weekly-discipline.png" : "runnr-discipline.png";
    const title = weekly ? "My Runnr weekly discipline report" : "My Runnr discipline score";
    const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
    if (!blob) {
      const dataUrl = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = filename;
      a.click();
      return;
    }
    const file = new File([blob], filename, { type: "image/png" });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ title, files: [file] });
        return;
      } catch (e) {}
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  },

  applyShareModalLock(state) {
    const unlocked = this.scoreShareUnlocked(state);
    const lockedEl = document.getElementById("share-locked");
    const canvas = document.getElementById("share-canvas");
    const variants = document.querySelector(".share-variant-row");
    const handleField = document.getElementById("share-handle")?.closest(".field");
    const download = document.getElementById("share-download-btn");
    const note = document.getElementById("share-card-note");
    if (lockedEl) {
      lockedEl.hidden = unlocked;
      const line = lockedEl.querySelector("[data-share-lock-copy]");
      if (line) line.textContent = this.scoreShareLockCopy(state);
    }
    if (canvas) canvas.style.display = unlocked ? "" : "none";
    if (variants) variants.style.display = unlocked ? "" : "none";
    if (handleField) handleField.style.display = unlocked ? "" : "none";
    if (download) download.style.display = unlocked ? "" : "none";
    if (note) note.style.display = unlocked ? "" : "none";
    return unlocked;
  },

  openShareModal(state, variant) {
    const unlocked = this.applyShareModalLock(state);
    if (!unlocked) {
      openModal("modal-share");
      return;
    }
    this.shareVariant = variant === "score" ? "score" : "weekly";
    const h = document.getElementById("share-handle");
    if (h) h.value = state.profileHandle || "";
    this.setShareVariant(this.shareVariant, state);
    openModal("modal-share");
    setTimeout(() => {
      const canvas = document.getElementById("share-canvas");
      if (canvas) this.drawActiveShareCard(state, canvas);
    }, 80);
  },

  // ── Weekly Coach digest ──
  digestKey: "runnr_weekly_digest",

  maybeSendWeeklyDigest(state) {
    if (typeof RunnrSync !== "undefined" && typeof RunnrSync.isPro === "function" && !RunnrSync.isPro()) return;
    if (state.coachDigestEnabled === false) return;
    let meta = {};
    try { meta = JSON.parse(localStorage.getItem(this.digestKey) || "{}"); } catch (e) {}

    const now = Date.now();
    const weekMs = 7 * 86400000;
    const last = meta.lastSent || 0;
    if (now - last < weekMs) return;

    const day = new Date().getDay();
    const hour = new Date().getHours();
    if (day !== 0 || hour < 17) return;

    const recentTrade = state.trades.some((t) => {
      const d = CoachEngine.parseTradeDate(t.date);
      return d && (now - d) / 86400000 < 2;
    });
    if (recentTrade) return;

    const d = CoachEngine.weeklyDigest(state.trades, state.sym);
    if (Notification.permission === "granted" && alertState?.enabled !== false) {
      try {
        new Notification(d.pushTitle, { body: d.pushBody, tag: "runnr-weekly-coach" });
      } catch (e) {}
    }
    try {
      localStorage.setItem(this.digestKey, JSON.stringify({ lastSent: now }));
    } catch (e) {}
  },

  scheduleDigestCheck(state) {
    this.maybeSendWeeklyDigest(state);
    setInterval(() => this.maybeSendWeeklyDigest(state), 3600000);
  },

  previewWeeklyDigest(state) {
    if (!this.scoreShareUnlocked(state)) {
      this.openShareModal(state);
      return;
    }
    if (typeof requirePro === "function") {
      requirePro("Coach").then((ok) => {
        if (!ok) return;
        const d = CoachEngine.weeklyDigest(this.scoreTrades(state), state.sym);
        alert(`${d.pushTitle}\n\n${d.pushBody}\n\nAction: ${d.action}`);
      });
      return;
    }
    const d = CoachEngine.weeklyDigest(this.scoreTrades(state), state.sym);
    alert(`${d.pushTitle}\n\n${d.pushBody}\n\nAction: ${d.action}`);
  },
};

window.RunnrGrowth = RunnrGrowth;
