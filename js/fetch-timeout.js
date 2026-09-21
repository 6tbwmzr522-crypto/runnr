/**
 * Shared fetch-with-timeout. AbortSignal.timeout is not in all browsers.
 * Default window is 12s (8–15s band). Callers pass a longer ms when a job
 * already documents it (quote batch, broker sync, billing portal).
 *
 * Abort the request AND reject on the timer. Some hung fetch implementations
 * ignore AbortSignal; a forever spinner is worse than a duplicate reject.
 */
const RunnrFetch = (() => {
  const FETCH_TIMEOUT_MS = 12000;
  const TIMEOUT_MSG = "Request timed out — check your connection and try again";

  function isFetchTimeout(err) {
    if (!err) return false;
    if (err.name === "TimeoutError") return true;
    return /timed out/i.test(String(err.message || err));
  }

  function abortErr(name, message) {
    const e = new Error(message);
    e.name = name;
    return e;
  }

  function fetchWithTimeout(url, ms, opts) {
    const fn = typeof fetch === "function" ? fetch : null;
    if (!fn) return Promise.reject(new Error("no fetch"));
    const wait = Number(ms);
    const timeoutMs = Number.isFinite(wait) && wait > 0 ? wait : FETCH_TIMEOUT_MS;
    const ctrl = new AbortController();
    const parent = opts && opts.signal;
    const next = Object.assign({}, opts || {}, { signal: ctrl.signal });
    let settled = false;
    let timer = null;
    return new Promise((resolve, reject) => {
      const finish = (fnDone) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        if (parent && typeof parent.removeEventListener === "function") {
          parent.removeEventListener("abort", onParent);
        }
        fnDone();
      };
      const onParent = () => {
        try { ctrl.abort(); } catch (e) {}
        finish(() => reject(abortErr("AbortError", "Aborted")));
      };
      if (parent && typeof parent.addEventListener === "function") {
        parent.addEventListener("abort", onParent, { once: true });
      }
      timer = setTimeout(() => {
        try { ctrl.abort(); } catch (e) {}
        finish(() => reject(abortErr("TimeoutError", TIMEOUT_MSG)));
      }, timeoutMs);
      if (parent && parent.aborted) {
        onParent();
        return;
      }
      Promise.resolve()
        .then(() => fn(url, next))
        .then(
          (res) => finish(() => resolve(res)),
          (err) => {
            finish(() => {
              if (ctrl.signal.aborted && !(parent && parent.aborted)) {
                reject(abortErr("TimeoutError", TIMEOUT_MSG));
                return;
              }
              reject(err);
            });
          }
        );
    });
  }

  const api = { FETCH_TIMEOUT_MS, TIMEOUT_MSG, isFetchTimeout, fetchWithTimeout };
  if (typeof window !== "undefined") {
    window.RunnrFetch = api;
    window.FETCH_TIMEOUT_MS = FETCH_TIMEOUT_MS;
    window.fetchWithTimeout = fetchWithTimeout;
    window.isFetchTimeout = isFetchTimeout;
  }
  return api;
})();

if (typeof module !== "undefined" && module.exports) module.exports = RunnrFetch;
