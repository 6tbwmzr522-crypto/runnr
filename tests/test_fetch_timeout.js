#!/usr/bin/env node
/** Shared fetch-with-timeout: abort hung loaders, keep happy-path fetch. */
"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { html, src, sw, scripts } = require("./app_src").loadAppSource();
const RunnrFetch = require("../js/fetch-timeout.js");

let n = 0;
function check(name, cond) {
  assert(cond, name);
  n += 1;
}

const v = html.match(/var V = "(\d+)"/)[1];
const cache = sw.match(/CACHE = "runnr-v(\d+)"/)[1];
check("index.html V matches sw.js CACHE", v === cache);
check("cache is 177+", Number(v) >= 177);
check("fetch-timeout.js is loaded before sync.js", html.indexOf("js/fetch-timeout.js?v=1") < html.indexOf("js/sync.js?v=72"));
check("fetch-timeout.js is in the script list", scripts.includes("js/fetch-timeout.js"));
check("quotes no longer define a private fetchWithTimeout", !/function fetchWithTimeout\(/.test(fs.readFileSync(path.join(__dirname, "..", "js/app-quotes.js"), "utf8")));
check("default timeout is 12s", RunnrFetch.FETCH_TIMEOUT_MS === 12000);
check("sync request uses the shared helper", src.includes("timedFetch(apiBase() + path") && src.includes("defaultTimeoutMs()"));
check("health and stats fetches time out", src.includes('timedFetch(apiBase() + "/health"') && src.includes('timedFetch(apiBase() + "/api/v1/stats"'));
check("desk snapshot uses timedGet", /function getJson[\s\S]{0,180}timedGet\(/.test(src));
check("watchlist empty remark is not a forever spinner", /function renderRemarkHtml[\s\S]{0,900}autoRemarkError/.test(src) && /function renderRemarkHtml[\s\S]{0,1100}return '';/.test(src));
check("price failure paints lp-error not a blink", src.includes("Price unavailable — tap ↻ Refresh") && src.includes("function livePricePendingHtml"));
check("coach ask clears loading on failure", src.includes("Asking Coach…") && src.includes("Coach timed out — try again."));
check("quote batch keeps a longer documented timeout", /fetchWithTimeout\(base \+ '\/api\/v1\/quotes\/batch', 20000/.test(src));
check("watch brief keeps 15s", /fetchWithTimeout\(url, 15000\)/.test(src));
check("IBKR/T212 sync keep 90s", src.includes("90000") && /t212\/sync[\s\S]{0,40}90000/.test(src));

(async () => {
  const origFetch = global.fetch;
  global.fetch = () => new Promise(() => {});
  const started = Date.now();
  let err = null;
  try {
    await RunnrFetch.fetchWithTimeout("https://example.test/hang", 40, {});
  } catch (e) {
    err = e;
  }
  const elapsed = Date.now() - started;
  check("hung fetch rejects as TimeoutError", err && err.name === "TimeoutError");
  check("timeout helper uses the timeout message", RunnrFetch.isFetchTimeout(err) === true);
  check("hung fetch does not wait far past the window", elapsed < 500);

  global.fetch = async (url, opts) => {
    check("happy-path fetch receives an abort signal", !!(opts && opts.signal));
    return { ok: true, status: 200, url };
  };
  const res = await RunnrFetch.fetchWithTimeout("https://example.test/live", 80, { method: "GET" });
  check("happy-path fetch resolves", res && res.ok === true && res.url === "https://example.test/live");

  const parent = new AbortController();
  global.fetch = () => new Promise(() => {});
  const p = RunnrFetch.fetchWithTimeout("https://example.test/parent", 5000, { signal: parent.signal });
  parent.abort();
  let parentErr = null;
  try { await p; } catch (e) { parentErr = e; }
  check("parent abort is not relabeled a timeout", parentErr && parentErr.name !== "TimeoutError");

  global.fetch = origFetch;
  console.log("ok", n);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
