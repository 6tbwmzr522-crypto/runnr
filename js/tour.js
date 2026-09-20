/** Silent four-beat in-app tour — chips + spotlight, no voiceover. Replaces parked intro video. */
const RunnrTour = {
  KEY: "runnr_tour_v1",
  TICKER: "AAPL",
  MAG7: ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "GOOG", "META", "TSLA"],
  AUTO_SCORE_MS: 2000,
  EMPTY_SHELF: "Shelf fills as books sync — Mag 7 shows up first.",
  WALL_SKIP: "You can save later — next stop is Shelf.",

  step: 0,
  open: false,
  scoreSeen: false,
  startedAt: 0,
  _timer: 0,
  _advanceTimer: 0,
  _bound: false,
  _armed: false,

  COPY: {
    size: "Size one trade. Pick AAPL, set a stop, see max risk.",
    journal: "Log it. Plan without a log is just a wish.",
    score: "That's the score. Process first — P&L can wait.",
    shelf: "Shelf: who else keeps AAPL. Same ticker, other books.",
    close: "That's the loop. Size \u2192 journal \u2192 score \u2192 Shelf. You're in.",
  },

  localFlag() {
    try {
      return localStorage.getItem(this.KEY) || "";
    } catch (e) {
      return "";
    }
  },

  localSeen() {
    const v = this.localFlag();
    return v === "done" || v === "skipped";
  },

  profileSeen(state) {
    const s = state || (typeof window !== "undefined" ? window.S : null);
    if (s && (s.tourSeen || s.tour_seen)) return true;
    return false;
  },

  queryForce() {
    try {
      const loc = (typeof location !== "undefined" && location)
        || (typeof window !== "undefined" && window.location)
        || {};
      const search = String(loc.search || "");
      if (/(?:^|[?&])tour=1(?:&|$)/.test(search)) return true;
      if (/^#tour\b/i.test(String(loc.hash || ""))) return true;
    } catch (e) {}
    return false;
  },

  queryOff() {
    try {
      const loc = (typeof location !== "undefined" && location)
        || (typeof window !== "undefined" && window.location)
        || {};
      return /(?:^|[?&])tour=0(?:&|$)/.test(String(loc.search || ""));
    } catch (e) {
      return false;
    }
  },

  isLoggedIn() {
    try {
      if (typeof RunnrSync !== "undefined" && RunnrSync.isLoggedIn && RunnrSync.isLoggedIn()) return true;
    } catch (e) {}
    try {
      if (typeof localStorage !== "undefined" && localStorage.getItem("runnr_api_token")) return true;
    } catch (e) {}
    return false;
  },

  isSampleDesk(state) {
    if (this.isLoggedIn()) return false;
    const s = state || (typeof window !== "undefined" ? window.S : null);
    try {
      if (typeof RunnrDemoSandbox !== "undefined" && RunnrDemoSandbox.isDemoState) {
        return !!RunnrDemoSandbox.isDemoState(s);
      }
    } catch (e) {}
    return true;
  },

  blockingOverlay() {
    if (typeof document === "undefined") return false;
    if (document.documentElement.classList.contains("runnr-show-hook")) return true;
    if (document.documentElement.classList.contains("runnr-sample-landing")) return true;
    const hook = document.getElementById("onboarding-overlay");
    if (hook && hook.classList.contains("open")) return true;
    const hero = document.getElementById("sample-hero");
    if (hero && !hero.hidden && hero.classList.contains("open")) return true;
    if (document.getElementById("modal-sync-auth")?.classList.contains("open")) return true;
    if (typeof window !== "undefined" && window._runnrAuthPending) return true;
    return false;
  },

  shouldShow(state) {
    if (this.queryOff()) return false;
    if (this.queryForce()) return true;
    if (this.localSeen()) return false;
    if (this.profileSeen(state)) return false;
    if (this.blockingOverlay()) return false;
    return true;
  },

  isOpen() {
    return !!this.open;
  },

  allowsEmailWall() {
    if (!this.open) return true;
    const id = this.beatId();
    return id === "score" || id === "close";
  },

  beatId() {
    return ["size", "journal", "score", "shelf", "close"][this.step] || "close";
  },

  isPhone() {
    try {
      if (typeof isDesktopShell === "function") return !isDesktopShell();
    } catch (e) {}
    try {
      return !(window.matchMedia && window.matchMedia("(min-width: 1024px)").matches);
    } catch (e) {
      return true;
    }
  },

  tickerKey(raw) {
    return String(raw || "").replace(/\s*CFD\s*$/i, "").trim().toUpperCase();
  },

  isAapl(raw) {
    return this.tickerKey(raw) === this.TICKER;
  },

  markDone(state, how) {
    const flag = how === "skipped" ? "skipped" : "done";
    try {
      localStorage.setItem(this.KEY, flag);
    } catch (e) {}
    const s = state || (typeof window !== "undefined" ? window.S : null);
    if (s) {
      s.tourSeen = true;
      s.onboardingComplete = true;
    }
    try {
      localStorage.setItem("runnr_onboarding_v1", "done");
    } catch (e) {}
    if (typeof persist === "function") {
      try { persist(); } catch (e) {}
    }
    if (typeof RunnrSync !== "undefined" && typeof RunnrSync.markIntroSeen === "function") {
      RunnrSync.markIntroSeen().catch(() => {});
    }
  },

  livePlan(state) {
    const PT = typeof RunnrPretrade !== "undefined" ? RunnrPretrade : null;
    const tickerEl = typeof document !== "undefined" ? document.getElementById("pt-ticker") : null;
    const entryEl = typeof document !== "undefined" ? document.getElementById("pt-entry") : null;
    const stopEl = typeof document !== "undefined" ? document.getElementById("pt-stop") : null;
    const targetEl = typeof document !== "undefined" ? document.getElementById("pt-target") : null;
    const ticker = tickerEl ? tickerEl.value : this.TICKER;
    const input = {
      ticker,
      dir: "long",
      entry: entryEl ? entryEl.value : "",
      stop: stopEl ? stopEl.value : "",
      target: targetEl ? targetEl.value : "",
    };
    if (!PT || typeof PT.computePlan !== "function") return { ticker, ready: false, size: 0, totalRisk: 0 };
    const rails = typeof PT.normalizeRails === "function" ? PT.normalizeRails() : { bal: 10000, maxRiskPct: 2, maxDailyLossPct: 5, minRR: 1.5, propDailyDDPct: 5, propMaxDDPct: 10, sym: "€" };
    const trades = (state && state.trades) || (typeof window !== "undefined" && window.S && window.S.trades) || [];
    return PT.computePlan(input, rails, trades, new Date());
  },

  hasSizedAapl(opts) {
    const o = opts || {};
    if (o.plan && this.isAapl(o.plan.ticker) && (o.plan.ready || o.plan.size > 0 || o.plan.totalRisk > 0 || o.plan.riskPerShare > 0)) {
      return true;
    }
    if (o.skipLive) return false;
    const plan = this.livePlan(o.state);
    return this.isAapl(plan.ticker) && (plan.ready || plan.size > 0 || plan.totalRisk > 0 || plan.riskPerShare > 0);
  },

  hasJournaledAapl(opts) {
    const o = opts || {};
    if (o.journaled) return true;
    const trades = (o.trades || (o.state && o.state.trades) || (typeof window !== "undefined" && window.S && window.S.trades) || []);
    const since = o.since != null ? o.since : this.startedAt;
    return trades.some((t) => {
      if (!t || t.mergedAway || !this.isAapl(t.instr || t.sym)) return false;
      if (t.processFlag) return true;
      if (t.source === "pretrade" || t.planStatus === "approved" || t.planStatus === "blocked") {
        if (t.filledAt && Date.parse(t.filledAt) >= since) return true;
        if (t.id && Number(t.id) >= since) return true;
        return since === 0;
      }
      if (t.fromTour) return true;
      return false;
    });
  },

  emailWallOpen() {
    if (typeof document === "undefined") return false;
    const el = document.getElementById("modal-sample-keep");
    return !!(el && el.classList.contains("open"));
  },

  scoreUiVisible(opts) {
    const o = opts || {};
    if (o.scoreVisible || o.wallOpen) return true;
    if (this.scoreSeen) return true;
    if (typeof document === "undefined") return !!o.scoreVisible;
    if (this.emailWallOpen()) return true;
    const card = document.getElementById("home-discipline-card");
    const pageHome = document.getElementById("page-home");
    if (card && pageHome && pageHome.classList.contains("active")) {
      const val = document.getElementById("disc-score-val");
      if (val && String(val.textContent || "").trim() && String(val.textContent).trim() !== "—") return true;
      if (card.getBoundingClientRect().height > 0) return true;
    }
    const disc = document.getElementById("pt-stat-disc");
    if (disc && String(disc.textContent || "").trim()) return true;
    return false;
  },

  aaplBooks(opts) {
    const o = opts || {};
    if (Array.isArray(o.books)) return o.books;
    const Shelf = typeof RunnrShelf !== "undefined" ? RunnrShelf : null;
    if (Shelf && typeof Shelf.booksFor === "function") return Shelf.booksFor(this.TICKER);
    if (Shelf && typeof Shelf.books === "function") {
      return (Shelf.books() || []).filter((b) => (b.holdings || []).some((h) => h.sym === this.TICKER));
    }
    return [];
  },

  shelfReady(opts) {
    const o = opts || {};
    if (o.emptyBackup) return true;
    const books = this.aaplBooks(o);
    return books.length >= 1;
  },

  beatDone(id, opts) {
    const o = opts || {};
    if (id === "size") return this.hasSizedAapl(o);
    if (id === "journal") return this.hasJournaledAapl(o);
    if (id === "score") return this.scoreUiVisible(o);
    if (id === "shelf") return this.shelfReady(o) && (o.shelfOpen !== false ? this.shelfPageOpen(o) : true);
    if (id === "close") return false;
    return false;
  },

  shelfPageOpen(opts) {
    if (opts && opts.shelfOpen) return true;
    if (typeof document === "undefined") return !!opts && !!opts.shelfOpen;
    return !!document.getElementById("page-shelf")?.classList.contains("active");
  },

  overlay() {
    return typeof document !== "undefined" ? document.getElementById("tour-overlay") : null;
  },

  paintChip() {
    const id = this.beatId();
    const copyEl = document.getElementById("tour-chip-copy");
    const cta = document.getElementById("tour-cta");
    const alt = document.getElementById("tour-alt");
    const beatEl = document.getElementById("tour-chip-beat");
    const kicker = document.getElementById("tour-chip-kicker");
    if (!copyEl || !cta) return;
    const sample = this.isSampleDesk();
    const wall = id === "score" && this.emailWallOpen();
    let copy = this.COPY[id] || this.COPY.close;
    if (id === "shelf" && this.aaplBooks().length < 1) copy = this.EMPTY_SHELF;
    if (wall) copy = this.WALL_SKIP;
    copyEl.textContent = copy;
    if (beatEl) beatEl.textContent = String(Math.min(this.step + 1, 4));
    if (kicker) kicker.hidden = id === "close";
    alt.hidden = true;
    alt.textContent = "";
    if (id === "size") {
      cta.textContent = "Size AAPL";
    } else if (id === "journal") {
      cta.textContent = sample ? "Followed" : "Add to journal";
    } else if (id === "score") {
      cta.textContent = wall ? "Next — Shelf" : "See score";
    } else if (id === "shelf") {
      cta.textContent = "Open Shelf";
    } else {
      cta.textContent = "Done";
      alt.hidden = false;
      alt.textContent = "Score another";
    }
    const overlay = this.overlay();
    if (overlay) overlay.setAttribute("data-beat", id);
  },

  targetSelectors(id) {
    const phone = this.isPhone();
    if (id === "size") {
      return ["#pt-ticker", "#pt-output", '#nav [data-nav="sizer"]', "#pretrade-root .pt-form"];
    }
    if (id === "journal") {
      if (this.isSampleDesk()) {
        return [".pt-process-row", ".pt-process", "#pt-log", '#nav [data-nav="journal"]'];
      }
      return ["#pt-log", "#journal-list", '#nav [data-nav="journal"]', "#page-journal"];
    }
    if (id === "score") {
      return ["#disc-score-ring", "#home-discipline-card", "#pt-stat-disc", "#modal-sample-keep .modal"];
    }
    if (id === "shelf") {
      const shelfOpen = this.shelfPageOpen();
      if (phone && !shelfOpen) {
        if (typeof isMoreSheetOpen === "function" && isMoreSheetOpen()) {
          return ['#more-sheet [data-more="shelf"]'];
        }
        return ['#nav [data-nav="more"]'];
      }
      return [".shelf-focus", ".shelf-deck", "#shelf-root .shelf-card", "#page-shelf"];
    }
    return ["#home-discipline-card", "#page-home"];
  },

  firstVisible(selectors) {
    if (typeof document === "undefined") return null;
    for (let i = 0; i < selectors.length; i++) {
      const el = document.querySelector(selectors[i]);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 && r.height < 2) continue;
      if (typeof window !== "undefined" && r.height > window.innerHeight * 0.45 && i < selectors.length - 1) continue;
      return el;
    }
    return document.querySelector(selectors[0]) || null;
  },

  layoutHole() {
    const hole = document.getElementById("tour-hole");
    const chip = document.getElementById("tour-chip");
    if (!hole || !chip) return;
    const el = this.firstVisible(this.targetSelectors(this.beatId()));
    document.querySelectorAll(".tour-spot").forEach((n) => n.classList.remove("tour-spot"));
    if (!el) {
      hole.hidden = true;
      chip.style.top = "";
      chip.style.bottom = "calc(88px + var(--safe-bottom))";
      return;
    }
    el.classList.add("tour-spot");
    const r = el.getBoundingClientRect();
    const pad = 8;
    const maxW = Math.min(420, window.innerWidth - 24);
    const maxH = Math.min(160, Math.floor(window.innerHeight * 0.28));
    const w = Math.max(48, Math.min(maxW, r.width + pad * 2));
    const h = Math.max(36, Math.min(maxH, r.height + pad * 2));
    hole.hidden = false;
    hole.style.top = Math.max(6, r.top - pad) + "px";
    hole.style.left = Math.max(6, r.left - pad) + "px";
    hole.style.width = w + "px";
    hole.style.height = h + "px";
    const holeBottom = r.bottom + pad;
    const navH = 88;
    if (holeBottom > window.innerHeight - navH - 140) {
      chip.style.bottom = "";
      chip.style.top = "calc(12px + env(safe-area-inset-top, 0px))";
    } else {
      chip.style.top = "";
      chip.style.bottom = "calc(88px + var(--safe-bottom))";
    }
  },

  aaplPrimeInput() {
    const sample = this.isSampleDesk();
    if (sample) {
      return { ticker: this.TICKER, dir: "long", entry: 198, stop: 194, target: 214 };
    }
    return { ticker: this.TICKER, dir: "long" };
  },

  openSizer() {
    const PT = typeof RunnrPretrade !== "undefined" ? RunnrPretrade : null;
    const input = this.aaplPrimeInput();
    if (PT && typeof PT.prime === "function") {
      try { PT.prime(input); } catch (e) {}
    }
    if (PT && typeof PT.open === "function") {
      try { PT.open("desk"); } catch (e) {}
    } else if (typeof switchPage === "function") {
      switchPage("sizer");
    }
    if (!this.isSampleDesk()) this.ensureSignedInStop();
  },

  ensureSignedInStop() {
    const entryEl = document.getElementById("pt-entry");
    const stopEl = document.getElementById("pt-stop");
    if (!stopEl) return;
    const stop = parseFloat(stopEl.value);
    if (Number.isFinite(stop) && stop > 0) return;
    const entry = parseFloat(entryEl && entryEl.value);
    if (Number.isFinite(entry) && entry > 0) {
      stopEl.value = (Math.round(entry * 0.98 * 100) / 100).toFixed(2);
    } else {
      if (entryEl && !String(entryEl.value || "").trim()) entryEl.value = "198";
      stopEl.value = "194";
    }
    const targetEl = document.getElementById("pt-target");
    if (targetEl && !String(targetEl.value || "").trim() && Number.isFinite(entry) && entry > 0) {
      targetEl.value = (Math.round(entry * 1.08 * 100) / 100).toFixed(2);
    }
    try {
      if (typeof RunnrPretrade !== "undefined" && RunnrPretrade.render) RunnrPretrade.render();
    } catch (e) {}
  },

  journalAapl() {
    const PT = typeof RunnrPretrade !== "undefined" ? RunnrPretrade : null;
    if (!PT) return false;
    const sample = this.isSampleDesk();
    if (sample && typeof PT.journalProcess === "function") {
      const res = PT.journalProcess("followed", this.aaplPrimeInput());
      if (res && res.ok) return true;
    }
    if (typeof PT.logPlan === "function") {
      const rails = typeof PT.normalizeRails === "function" ? PT.normalizeRails() : null;
      const res = PT.logPlan(this.aaplPrimeInput(), rails);
      if (res && res.ok) {
        if (sample && typeof PT.journalProcess === "function") {
          try { PT.journalProcess("followed"); } catch (e) {}
        }
        return true;
      }
    }
    if (typeof switchPage === "function") switchPage("journal");
    return this.hasJournaledAapl();
  },

  showScore() {
    this.scoreSeen = true;
    if (this.emailWallOpen()) return;
    if (typeof switchPage === "function") switchPage("home");
    try {
      if (typeof RunnrGrowth !== "undefined" && RunnrGrowth.renderDisciplineCard) {
        RunnrGrowth.renderDisciplineCard(window.S);
      }
    } catch (e) {}
    const card = document.getElementById("home-discipline-card");
    if (card && card.scrollIntoView) {
      try { card.scrollIntoView({ block: "center", behavior: "smooth" }); } catch (e) {}
    }
  },

  openShelf() {
    try {
      if (typeof RunnrShelf !== "undefined" && typeof RunnrShelf.seedMag7Aapl === "function") {
        RunnrShelf.seedMag7Aapl();
      }
    } catch (e) {}
    const phone = this.isPhone();
    const onShelf = this.shelfPageOpen();
    if (phone && !onShelf) {
      const moreOpen = typeof isMoreSheetOpen === "function" && isMoreSheetOpen();
      if (!moreOpen && typeof openMoreSheet === "function") {
        openMoreSheet();
        this.paintChip();
        this.layoutHole();
        return;
      }
    }
    if (typeof switchPage === "function") switchPage("shelf");
    try {
      if (typeof RunnrShelf !== "undefined" && typeof RunnrShelf.showTicker === "function") {
        RunnrShelf.showTicker(this.TICKER);
      } else if (typeof RunnrShelf !== "undefined" && RunnrShelf.render) {
        RunnrShelf.render();
      }
    } catch (e) {}
  },

  runCta() {
    const id = this.beatId();
    if (id === "size") {
      this.openSizer();
      this._maybeAdvanceSoon();
      return;
    }
    if (id === "journal") {
      this.journalAapl();
      this._maybeAdvanceSoon();
      return;
    }
    if (id === "score") {
      if (this.emailWallOpen()) {
        this.scoreSeen = true;
        this.advance();
        return;
      }
      this.showScore();
      this._maybeAdvanceSoon(this.AUTO_SCORE_MS);
      return;
    }
    if (id === "shelf") {
      this.openShelf();
      this._maybeAdvanceSoon();
      return;
    }
    this.finish();
  },

  runAlt() {
    if (this.beatId() !== "close") return;
    this.finish();
    this.openSizer();
  },

  skip(state) {
    this.markDone(state, "skipped");
    this.close();
  },

  finish(state) {
    this.markDone(state, "done");
    this.close();
  },

  close() {
    this.open = false;
    this._armed = false;
    this.stopWatch();
    const overlay = this.overlay();
    if (overlay) {
      overlay.classList.remove("open");
      overlay.setAttribute("hidden", "");
      overlay.setAttribute("aria-hidden", "true");
    }
    try { document.documentElement.classList.remove("runnr-tour"); } catch (e) {}
    document.querySelectorAll(".tour-spot").forEach((n) => n.classList.remove("tour-spot"));
    this.yieldTrendDay();
  },

  start(state) {
    this.bind();
    if (this.open) return true;
    this.step = 0;
    this.scoreSeen = false;
    this.startedAt = Date.now();
    this.open = true;
    this._armed = false;
    const overlay = this.overlay();
    if (!overlay) return false;
    overlay.classList.add("open");
    overlay.removeAttribute("hidden");
    overlay.setAttribute("aria-hidden", "false");
    try { document.documentElement.classList.add("runnr-tour"); } catch (e) {}
    this.yieldTrendDay();
    this.paintChip();
    this.layoutHole();
    this.startWatch();
    return true;
  },

  yieldTrendDay() {
    try {
      if (typeof RunnrTrendDay !== "undefined" && RunnrTrendDay.paint) RunnrTrendDay.paint();
    } catch (e) {}
  },

  advance() {
    if (!this.open) return;
    this._armed = false;
    if (this._advanceTimer) {
      clearTimeout(this._advanceTimer);
      this._advanceTimer = 0;
    }
    if (this.step >= 4) {
      this.finish();
      return;
    }
    this.step += 1;
    if (this.beatId() === "score" && this.scoreUiVisible()) {
      this.scoreSeen = true;
    }
    this.paintChip();
    this.layoutHole();
    if (this.beatId() === "score" && this.scoreUiVisible()) {
      this._maybeAdvanceSoon(this.AUTO_SCORE_MS);
    }
  },

  _maybeAdvanceSoon(ms) {
    if (this._armed) return;
    this._armed = true;
    const wait = ms != null ? ms : 700;
    this._advanceTimer = setTimeout(() => {
      this._armed = false;
      if (!this.open) return;
      if (this.beatId() === "close") return;
      if (this.beatDone(this.beatId())) this.advance();
      else this.layoutHole();
    }, wait);
  },

  tick() {
    if (!this.open) return;
    this.paintChip();
    this.layoutHole();
    const id = this.beatId();
    if (id === "close") return;
    if (id === "score" && this.scoreUiVisible()) this.scoreSeen = true;
    if (this.beatDone(id) && !this._armed) {
      if (id === "score") this._maybeAdvanceSoon(this.AUTO_SCORE_MS);
      else this._maybeAdvanceSoon(id === "size" ? 900 : 500);
    }
  },

  startWatch() {
    this.stopWatch();
    this._timer = setInterval(() => this.tick(), 450);
    if (typeof window !== "undefined") {
      if (typeof window.addEventListener === "function") {
        window.addEventListener("resize", this._onLayout);
        window.addEventListener("scroll", this._onLayout, true);
      }
    }
  },

  stopWatch() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = 0;
    }
    if (this._advanceTimer) {
      clearTimeout(this._advanceTimer);
      this._advanceTimer = 0;
    }
    if (typeof window !== "undefined" && typeof window.removeEventListener === "function") {
      window.removeEventListener("resize", this._onLayout);
      window.removeEventListener("scroll", this._onLayout, true);
    }
  },

  maybeShow(state) {
    this.bind();
    if (this.open) return true;
    if (!this.shouldShow(state)) {
      if (!this.queryForce()) this.close();
      return false;
    }
    return this.start(state);
  },

  bind() {
    if (typeof document === "undefined" || this._bound) return;
    this._bound = true;
    this._onLayout = () => { if (this.open) this.layoutHole(); };
    const skip = document.getElementById("tour-skip");
    const cta = document.getElementById("tour-cta");
    const alt = document.getElementById("tour-alt");
    if (skip) {
      skip.addEventListener("click", (e) => {
        e.preventDefault();
        this.skip(typeof window !== "undefined" ? window.S : null);
      });
    }
    if (cta) {
      cta.addEventListener("click", (e) => {
        e.preventDefault();
        this.runCta();
      });
    }
    if (alt) {
      alt.addEventListener("click", (e) => {
        e.preventDefault();
        this.runAlt();
      });
    }
  },
};

if (typeof window !== "undefined") window.RunnrTour = RunnrTour;
if (typeof module !== "undefined" && module.exports) module.exports = RunnrTour;
