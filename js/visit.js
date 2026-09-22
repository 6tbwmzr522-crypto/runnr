/** First-party pageview beacon. Skips DNT / Global Privacy Control. No third-party analytics.
 *  Anonymous id lives in localStorage. A first-party cookie is only the fallback
 *  when storage is blocked. The server stores an HMAC of the id, never the raw value.
 */
(function () {
  var STORAGE_KEY = "runnr_vid";
  var COOKIE = "runnr_vid";
  var MAX_AGE = 60 * 60 * 24 * 400;
  var ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function privacyOptOut() {
    var dnt =
      navigator.doNotTrack === "1" ||
      window.doNotTrack === "1" ||
      navigator.msDoNotTrack === "1";
    return !!(dnt || navigator.globalPrivacyControl);
  }

  function validId(value) {
    return ID_RE.test(String(value || ""));
  }

  function uuid() {
    if (window.crypto && typeof crypto.randomUUID === "function") return crypto.randomUUID();
    var bytes = new Uint8Array(16);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(bytes);
    else {
      for (var i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    var hex = [];
    for (var j = 0; j < 16; j++) hex.push(("0" + bytes[j].toString(16)).slice(-2));
    return (
      hex.slice(0, 4).join("") +
      "-" +
      hex.slice(4, 6).join("") +
      "-" +
      hex.slice(6, 8).join("") +
      "-" +
      hex.slice(8, 10).join("") +
      "-" +
      hex.slice(10, 16).join("")
    );
  }

  function readCookie() {
    var parts = String(document.cookie || "").split("; ");
    for (var i = 0; i < parts.length; i++) {
      var pair = parts[i].split("=");
      if (pair[0] === COOKIE) {
        try {
          return decodeURIComponent(pair.slice(1).join("="));
        } catch (e) {
          return pair.slice(1).join("=");
        }
      }
    }
    return "";
  }

  function writeCookie(id) {
    var secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie =
      COOKIE +
      "=" +
      encodeURIComponent(id) +
      "; Path=/; Max-Age=" +
      MAX_AGE +
      "; SameSite=Lax" +
      secure;
  }

  function clearCookie() {
    document.cookie = COOKIE + "=; Path=/; Max-Age=0; SameSite=Lax";
  }

  function guestId() {
    if (privacyOptOut()) return "";
    var id = "";
    var storageOk = false;
    var fromCookie = "";
    try {
      id = localStorage.getItem(STORAGE_KEY) || "";
      storageOk = true;
    } catch (e) {}
    if (!validId(id)) {
      fromCookie = readCookie();
      if (validId(fromCookie)) id = fromCookie;
    }
    if (!validId(id)) id = uuid();
    if (storageOk) {
      try {
        localStorage.setItem(STORAGE_KEY, id);
        if (validId(fromCookie)) clearCookie();
        return id;
      } catch (e) {}
    }
    writeCookie(id);
    return id;
  }

  function apiBase() {
    if (window.RunnrSync && typeof window.RunnrSync.apiBase === "function") {
      return window.RunnrSync.apiBase();
    }
    return "https://api.runnr.fyi";
  }

  window.RunnrVisit = {
    guestId: guestId,
    privacyOptOut: privacyOptOut,
  };

  try {
    if (privacyOptOut()) return;
    var id = guestId();
    var url = String(apiBase()).replace(/\/$/, "") + "/api/v1/stats/hit";
    if (id) url += "?g=" + encodeURIComponent(id);
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url);
      return;
    }
    if (typeof fetch === "function") {
      fetch(url, { method: "POST", keepalive: true, mode: "cors", credentials: "omit" });
    }
  } catch (e) {}
})();
