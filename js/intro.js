/** Pre-email-wall intro — SAMPLE keep-score only. Homepage autoplay stays off. */
const RunnrIntro = {
  KEY: "runnr_intro_v1",
  VIDEO: "/media/runnr-intro-email-wall.mp4",
  VIDEO_ALT: "/media/runnr-how-it-works.mp4",
  POSTER: "/media/runnr-intro-email-wall.jpg",
  // Parked homepage autoplay. Wall path is the dedicated replacement.
  ENABLED: false,
  WALL_ENABLED: true,
  SKIP_LABEL: "Skip to save your score",
  SOUND_LABEL: "Tap for sound",
  _pendingKeep: null,
  _playingForKeep: false,

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
    if (s && (s.introWalkthroughSeen || s.intro_seen)) return true;
    if (typeof RunnrSync !== "undefined" && RunnrSync.introSeen && RunnrSync.introSeen()) return true;
    return false;
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

  loc() {
    return (typeof location !== "undefined" && location)
      || (typeof window !== "undefined" && window.location)
      || {};
  },

  queryForce() {
    try {
      const loc = this.loc();
      const search = String(loc.search || "");
      if (/(?:^|[?&])intro=1(?:&|$)/.test(search)) return true;
      if (/^#intro\b/i.test(String(loc.hash || ""))) return true;
    } catch (e) {}
    return false;
  },

  queryTourForce() {
    try {
      const loc = this.loc();
      if (/(?:^|[?&])tour=1(?:&|$)/.test(String(loc.search || ""))) return true;
      if (/^#tour\b/i.test(String(loc.hash || ""))) return true;
    } catch (e) {}
    return false;
  },

  tourBlocksVideo() {
    if (this.queryTourForce()) return true;
    try {
      if (typeof RunnrTour !== "undefined" && typeof RunnrTour.queryForce === "function" && RunnrTour.queryForce()) {
        return true;
      }
    } catch (e) {}
    return false;
  },

  shouldShow(state) {
    if (!this.ENABLED) return false;
    if (!this.isLoggedIn()) return false;
    if (this.localSeen()) return false;
    if (this.profileSeen(state)) return false;
    return true;
  },

  shouldPlayBeforeKeepScore(opts) {
    if (!this.WALL_ENABLED) return false;
    const o = opts || {};
    if (o.skipIntro) return false;
    if (this.isLoggedIn()) return false;
    if (o.force || o.replay) return true;
    if (this.queryForce()) return true;
    if (this.tourBlocksVideo()) return false;
    if (this.localSeen()) return false;
    return true;
  },

  markSeen(state, how) {
    const flag = how === "skipped" ? "skipped" : "done";
    try {
      localStorage.setItem(this.KEY, flag);
    } catch (e) {}
    const s = state || (typeof window !== "undefined" ? window.S : null);
    if (s) s.introWalkthroughSeen = true;
    if (typeof persist === "function") {
      try { persist(); } catch (e) {}
    }
    if (typeof RunnrSync !== "undefined" && typeof RunnrSync.markIntroSeen === "function") {
      RunnrSync.markIntroSeen().catch(() => {});
    }
  },

  isOpen() {
    if (typeof document === "undefined") return false;
    const overlay = document.getElementById("intro-overlay");
    if (!overlay) return false;
    return overlay.classList.contains("open") && !overlay.hasAttribute("hidden");
  },

  paintSkip() {
    const skip = typeof document !== "undefined" ? document.getElementById("intro-skip") : null;
    if (skip) skip.textContent = this.SKIP_LABEL;
  },

  paintSound(show) {
    const unmute = typeof document !== "undefined" ? document.getElementById("intro-unmute") : null;
    const overlay = typeof document !== "undefined" ? document.getElementById("intro-overlay") : null;
    if (unmute) {
      unmute.textContent = this.SOUND_LABEL;
      unmute.hidden = !show;
    }
    if (overlay) overlay.classList.toggle("intro-sound-on", !show);
  },

  open(opts) {
    const o = opts || {};
    const forKeep = !!o.forKeep;
    if (!forKeep && !this.ENABLED) {
      this.close();
      return false;
    }
    if (forKeep && !this.WALL_ENABLED && !o.force) {
      this.close();
      return false;
    }
    const overlay = typeof document !== "undefined" ? document.getElementById("intro-overlay") : null;
    if (!overlay) return false;
    overlay.classList.remove("intro-parked");
    overlay.classList.add("open");
    overlay.removeAttribute("hidden");
    overlay.setAttribute("aria-hidden", "false");
    this.paintSkip();
    this.paintSound(true);
    try {
      if (typeof RunnrTour !== "undefined" && RunnrTour.isOpen && RunnrTour.isOpen() && typeof RunnrTour.close === "function") {
        RunnrTour.close();
      }
    } catch (e) {}
    const video = document.getElementById("intro-video");
    if (video) {
      video.muted = true;
      video.setAttribute("playsinline", "");
      video.setAttribute("webkit-playsinline", "");
      if (!video.getAttribute("poster")) video.setAttribute("poster", this.POSTER);
      if (!video.getAttribute("src") || video.getAttribute("src") !== this.VIDEO) {
        video.src = this.VIDEO;
      }
      try { video.currentTime = 0; } catch (e) {}
      const play = video.play();
      if (play && typeof play.catch === "function") play.catch(() => {});
    }
    return true;
  },

  close() {
    const overlay = typeof document !== "undefined" ? document.getElementById("intro-overlay") : null;
    if (!overlay) return;
    overlay.classList.remove("open", "intro-sound-on");
    overlay.setAttribute("hidden", "");
    overlay.setAttribute("aria-hidden", "true");
    const video = document.getElementById("intro-video");
    if (video) {
      try { video.pause(); } catch (e) {}
      try { video.removeAttribute("autoplay"); } catch (e) {}
    }
    this.paintSound(true);
  },

  consumePendingKeep() {
    const fn = this._pendingKeep;
    this._pendingKeep = null;
    this._playingForKeep = false;
    if (typeof fn === "function") {
      try { fn(); } catch (e) {}
    }
  },

  cancelPendingKeep() {
    this._pendingKeep = null;
    this._playingForKeep = false;
  },

  playBeforeKeepScore(onDone, opts) {
    this._pendingKeep = typeof onDone === "function" ? onDone : null;
    this._playingForKeep = true;
    const opened = this.open(Object.assign({ forKeep: true }, opts || {}));
    if (!opened) {
      this.consumePendingKeep();
      return false;
    }
    return true;
  },

  skip(state) {
    this.markSeen(state, "skipped");
    this.close();
    this.consumePendingKeep();
  },

  finish(state) {
    this.markSeen(state, "done");
    this.close();
    this.consumePendingKeep();
  },

  replay() {
    // Landing / ?intro=1 replay only. Do not reopen the keep-score wall mid-OAuth.
    return this.playBeforeKeepScore(null, { force: true, replay: true });
  },

  maybeShow(state) {
    if (!this.shouldShow(state)) {
      this.close();
      return false;
    }
    return this.open();
  },

  bind() {
    if (typeof document === "undefined") return;
    const skip = document.getElementById("intro-skip");
    const unmute = document.getElementById("intro-unmute");
    const video = document.getElementById("intro-video");
    this.paintSkip();
    if (unmute && !unmute.textContent) unmute.textContent = this.SOUND_LABEL;
    if (skip && !skip.dataset.bound) {
      skip.dataset.bound = "1";
      skip.addEventListener("click", (e) => {
        e.preventDefault();
        this.skip(typeof window !== "undefined" ? window.S : null);
      });
    }
    const tapSound = () => {
      if (!video) return;
      try { video.currentTime = 0; } catch (e) {}
      video.muted = false;
      this.paintSound(false);
      const play = video.play();
      if (play && typeof play.catch === "function") play.catch(() => {});
    };
    if (unmute && !unmute.dataset.bound) {
      unmute.dataset.bound = "1";
      unmute.addEventListener("click", (e) => {
        if (e && e.preventDefault) e.preventDefault();
        tapSound();
      });
    }
    if (video && !video.dataset.bound) {
      video.dataset.bound = "1";
      if (!video.getAttribute("poster")) video.setAttribute("poster", this.POSTER);
      video.addEventListener("ended", () => this.finish(typeof window !== "undefined" ? window.S : null));
      video.addEventListener("error", () => {
        if (video.dataset.triedAlt !== "1" && this.VIDEO_ALT && video.getAttribute("src") !== this.VIDEO_ALT) {
          video.dataset.triedAlt = "1";
          video.src = this.VIDEO_ALT;
          const play = video.play();
          if (play && typeof play.catch === "function") play.catch(() => {});
          return;
        }
        // Quiet skip. Never surface a missing-file or parent path in the UI.
        this.skip(typeof window !== "undefined" ? window.S : null);
      });
    }
  },
};

if (typeof window !== "undefined") window.RunnrIntro = RunnrIntro;
if (typeof module !== "undefined" && module.exports) module.exports = RunnrIntro;
