/** First-party pageview beacon. Skips DNT / Global Privacy Control. No third-party analytics. */
(function () {
  try {
    var dnt =
      navigator.doNotTrack === "1" ||
      window.doNotTrack === "1" ||
      navigator.msDoNotTrack === "1";
    if (dnt || navigator.globalPrivacyControl) return;
    var base =
      window.RunnrSync && typeof window.RunnrSync.apiBase === "function"
        ? window.RunnrSync.apiBase()
        : "https://api.runnr.fyi";
    var url = String(base).replace(/\/$/, "") + "/api/v1/stats/hit";
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url);
      return;
    }
    if (typeof fetch === "function") {
      fetch(url, { method: "POST", keepalive: true, mode: "cors", credentials: "omit" });
    }
  } catch (e) {}
})();
