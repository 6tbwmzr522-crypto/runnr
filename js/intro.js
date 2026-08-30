/** First signed-in home walkthrough — once per account, never on the public hook. */
const RunnrIntro = {
  KEY: "runnr_intro_v1",
  VIDEO: "/media/runnr-how-it-works.mp4",
  VIDEO_ALT: "/media/runnr-how-it-works-vo.mp4",

  localSeen() {
    try {
      return localStorage.getItem(this.KEY) === "done";
    } catch (e) {
      return false;
    }
  },

  profileSeen(state) {
    const s = state || (typeof window !== "undefined" ? window.S : null);
    if (s && (s.introWalkthroughSeen || s.intro_seen)) return true;
    if (typeof RunnrSync !== "undefined" && RunnrSync.introSeen && RunnrSync.introSeen()) return true;
    return false;
  },

  isLoggedIn() {
    return !!(typeof RunnrSync !== "undefined" && RunnrSync.isLoggedIn && RunnrSync.isLoggedIn());
  },

  shouldShow(state) {
    if (!this.isLoggedIn()) return false;
    if (this.localSeen()) return false;
    if (this.profileSeen(state)) return false;
    return true;
  },

  markSeen(state) {
    try {
      localStorage.setItem(this.KEY, "done");
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
    return !!document.getElementById("intro-overlay")?.classList.contains("open");
  },

  open() {
    const overlay = typeof document !== "undefined" ? document.getElementById("intro-overlay") : null;
    if (!overlay) return false;
    overlay.classList.add("open");
    overlay.setAttribute("aria-hidden", "false");
    const video = document.getElementById("intro-video");
    if (video) {
      video.muted = true;
      video.setAttribute("playsinline", "");
      video.setAttribute("webkit-playsinline", "");
      if (!video.getAttribute("src")) video.src = this.VIDEO;
      const play = video.play();
      if (play && typeof play.catch === "function") play.catch(() => {});
    }
    return true;
  },

  close() {
    const overlay = typeof document !== "undefined" ? document.getElementById("intro-overlay") : null;
    if (!overlay) return;
    overlay.classList.remove("open");
    overlay.setAttribute("aria-hidden", "true");
    const video = document.getElementById("intro-video");
    if (video) {
      try { video.pause(); } catch (e) {}
    }
  },

  skip(state) {
    this.markSeen(state);
    this.close();
  },

  finish(state) {
    this.markSeen(state);
    this.close();
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
    const missing = document.getElementById("intro-missing");
    if (skip && !skip.dataset.bound) {
      skip.dataset.bound = "1";
      skip.addEventListener("click", (e) => {
        e.preventDefault();
        this.skip(window.S);
      });
    }
    if (unmute && !unmute.dataset.bound) {
      unmute.dataset.bound = "1";
      unmute.addEventListener("click", () => {
        if (!video) return;
        video.muted = false;
        unmute.hidden = true;
        const play = video.play();
        if (play && typeof play.catch === "function") play.catch(() => {});
      });
    }
    if (video && !video.dataset.bound) {
      video.dataset.bound = "1";
      video.addEventListener("ended", () => this.finish(window.S));
      video.addEventListener("error", () => {
        if (video.dataset.triedAlt !== "1") {
          video.dataset.triedAlt = "1";
          video.src = this.VIDEO_ALT;
          const play = video.play();
          if (play && typeof play.catch === "function") play.catch(() => {});
          return;
        }
        if (missing) missing.hidden = false;
      });
    }
  },
};

if (typeof window !== "undefined") window.RunnrIntro = RunnrIntro;
