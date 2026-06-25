/** Runnr growth engine — onboarding, weekly digest, share cards */
const RunnrGrowth = {
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

  shouldShowOnboarding(state) {
    if (state.onboardingComplete) return false;
    try {
      if (localStorage.getItem("runnr_onboarding_v1") === "done") return false;
    } catch (e) {}
    if (state.trades && state.trades.length >= 3) {
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

  renderDisciplineCard(state) {
    const score = CoachEngine.disciplineScore(state.trades);
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    set("disc-score-val", score.tradeCount ? score.overall + "%" : "—");
    set("disc-stop-val", score.tradeCount ? score.stopPct + "%" : "—");
    set("disc-size-val", score.tradeCount ? score.sizePct + "%" : "—");
    set("disc-streak-val", score.streak ? score.streak + "d" : "0");
    set("disc-tier-label", score.tier);
    const ring = document.getElementById("disc-score-ring");
    if (ring) {
      const pct = score.tradeCount ? score.overall : 0;
      ring.style.background = `conic-gradient(var(--accent) ${pct * 3.6}deg, var(--surface3) 0)`;
    }
    const badge = document.getElementById("tier-badge");
    if (badge && score.tradeCount) {
      const icons = { Novice: "🌱", Learning: "📈", Disciplined: "🎯", "Consistent Runner": "🏃" };
      badge.textContent = `${icons[score.tier] || "🌱"} ${score.tier.toUpperCase()}`;
    }
  },

  // ── Onboarding wizard ──
  step: 0,
  draft: {},

  open(state) {
    this.step = 0;
    this.draft = { balance: state.bal, risk: state.risk };
    document.getElementById("onboarding-overlay")?.classList.add("open");
    this.renderStep(state);
  },

  close() {
    document.getElementById("onboarding-overlay")?.classList.remove("open");
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
        <div class="ob-hero"><h2>Your trade</h2><p>Paste your worst recent trade — wins or losses.</p></div>
        <div class="field"><label>Symbol</label><input id="ob-instr" placeholder="NVDA, EURUSD..." value="${this.draft.instr || ""}"></div>
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
        <div class="ob-paywall">Unlock weekly Coach, alerts &amp; full journal — <strong>€19/mo on Whop</strong></div>
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

  analyseStep(state) {
    this.draft.instr = document.getElementById("ob-instr")?.value.trim();
    this.draft.entry = parseFloat(document.getElementById("ob-entry")?.value);
    this.draft.exit = parseFloat(document.getElementById("ob-exit")?.value);
    this.draft.size = parseFloat(document.getElementById("ob-size")?.value);
    this.draft.stop = parseFloat(document.getElementById("ob-stop")?.value);
    this.draft.dir = document.getElementById("ob-dir")?.value || "long";
    this.draft.analysis = CoachEngine.analyzeTrade(this.draft, state.bal, this.draft.risk || state.risk, state.sym);
    if (!this.draft.analysis.ok) {
      alert(this.draft.analysis.error || "Check your numbers.");
      return;
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
    const sign = d.dir === "long" ? 1 : -1;
    const pnl = Math.round((d.exit - d.entry) * sign * (d.size || 1));
    state.trades.unshift({
      id: Date.now(),
      instr: d.instr,
      dir: d.dir,
      entry: d.entry,
      exit: d.exit,
      size: d.size || 1,
      pnl,
      stopOk: d.stopOk !== false,
      sizeOk: d.sizeOk !== false,
      type: "shares",
      date: new Date().toLocaleDateString("en-GB", { month: "short", day: "numeric" }),
      incomplete: false,
      fromOnboarding: true,
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
    this.completeOnboarding(state);
    persist();
    this.close();
  },

  // ── Share discipline card ──
  drawShareCard(state, canvas) {
    const score = CoachEngine.disciplineScore(state.trades);
    const handle = state.profileHandle || "runner";
    const dpr = window.devicePixelRatio || 1;
    const W = 360;
    const H = 420;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    ctx.fillStyle = "#0f1a16";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "#00b87a";
    ctx.lineWidth = 2;
    ctx.strokeRect(12, 12, W - 24, H - 24);

    ctx.fillStyle = "#4d6b5e";
    ctx.font = "600 11px DM Sans, sans-serif";
    ctx.fillText("RUNNR · DISCIPLINE SCORE", 28, 44);

    ctx.fillStyle = "#00e5a0";
    ctx.font = "italic 700 52px Cormorant Garamond, serif";
    ctx.fillText(score.tradeCount ? score.overall + "%" : "—", 28, 110);

    ctx.fillStyle = "#8aada0";
    ctx.font = "13px DM Sans, sans-serif";
    ctx.fillText("Stop confirmation: " + (score.tradeCount ? score.stopPct + "%" : "—"), 28, 150);
    ctx.fillText("Size discipline:   " + (score.tradeCount ? score.sizePct + "%" : "—"), 28, 174);
    ctx.fillText(score.tradeCount + " trades · " + score.streak + "-day streak", 28, 210);

    ctx.fillStyle = "#4d6b5e";
    ctx.font = "11px DM Mono, monospace";
    ctx.fillText("runnr.app/u/" + handle, 28, H - 36);
    ctx.fillText("Process · not P&L", 28, H - 18);
  },

  async shareDisciplineCard(state) {
    const canvas = document.getElementById("share-canvas");
    if (!canvas) return;
    this.drawShareCard(state, canvas);
    const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
    const file = new File([blob], "runnr-discipline.png", { type: "image/png" });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ title: "My Runnr discipline score", files: [file] });
        return;
      } catch (e) {}
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "runnr-discipline.png";
    a.click();
  },

  openShareModal(state) {
    const h = document.getElementById("share-handle");
    if (h) h.value = state.profileHandle || "";
    const canvas = document.getElementById("share-canvas");
    if (canvas) this.drawShareCard(state, canvas);
    openModal("modal-share");
  },

  // ── Weekly Coach digest ──
  digestKey: "runnr_weekly_digest",

  maybeSendWeeklyDigest(state) {
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
    const d = CoachEngine.weeklyDigest(state.trades, state.sym);
    alert(`${d.pushTitle}\n\n${d.pushBody}\n\nAction: ${d.action}`);
  },
};

window.RunnrGrowth = RunnrGrowth;
