#!/usr/bin/env node
/** Quote herd: concurrency cap, list vs detail TTL, backoff, cache bust. */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");
const { html, src, sw } = require("./app_src").loadAppSource();

let n = 0;
function check(name, cond) {
  assert(cond, name);
  n += 1;
}

const v = html.match(/var V = "(\d+)"/)[1];
const cache = sw.match(/CACHE = "runnr-v(\d+)"/)[1];
check("index.html V matches sw.js CACHE", v === cache);
check("PWA cache bust is 117+", Number(v) >= 117);
check("quotes live in app-quotes.js", html.includes("js/app-quotes.js?v=4"));
check("watchlist poll uses quotes/batch", /\/api\/v1\/quotes\/batch/.test(src) && /async function fetchQuotesBatch/.test(src));
check("refreshAllPrices does not Promise.all per symbol", /async function refreshAllPrices[\s\S]{0,1800}fetchQuotesBatch\(/.test(src));
check("feed poll backs off on high stale ratio", /FEED_POLL_MAX_MS/.test(src) && /function setFeedPollInterval/.test(src));
check("journal sync is not tied to FEED_POLL_MS", !/runSync\([\s\S]{0,40}FEED_POLL/.test(src));

check("quote fetch concurrency is 3 or 4", /(?:const|let|var) QUOTE_FETCH_CONCURRENCY = ([34]);/.test(src));
check("fetchYahooChart acquires a slot", /async function fetchYahooChart[\s\S]{0,80}acquireQuoteSlot\(/.test(src));
check("fetchYahooChart releases the slot", /async function fetchYahooChart[\s\S]{0,900}releaseQuoteSlot\(/.test(src));
check("list refresh TTL is longer than detail", /(?:const|let|var) STOCK_LIST_CACHE_MS = 120000/.test(src) && /(?:const|let|var) STOCK_CACHE_MS = 90000/.test(src));
check("detail modal still uses STOCK_CACHE_MS", /stockCache\[cacheKey\]\.ts < STOCK_CACHE_MS/.test(src));
check("watchlist refresh uses list TTL", /STOCK_LIST_CACHE_MS/.test(src) && /quoteBackoffUntil/.test(src));
check("502/stale streak backs off refresh", /quoteErrorStreak\+\+/.test(src) && /Prices delayed/.test(src));
check("last good price kept on fetch failure", /last\.price > 0 && !last\.estimated/.test(src));
check("swr counts as live for the banner", /status === 'hit' \|\| status === 'swr' \|\| status === 'refresh'/.test(src));
check("traffic banner copy stays honest",
  html.includes("Live prices may lag. Journal &amp; Alpaca sync still work.")
  && src.includes("Live prices may lag. Journal & Alpaca sync still work.")
  && !/High traffic — live prices may lag/.test(src));
check("company-name aliases live in normalizeQuoteSymbol",
  /QUOTE_NAME_ALIASES/.test(src) && /TESLA:\s*'TSLA'/.test(src)
  && /if \(QUOTE_NAME_ALIASES\[s\]\) return QUOTE_NAME_ALIASES\[s\]/.test(src));
check("pretrade sizer resolves through the same quote helper",
  /async function fetchSizerQuote[\s\S]{0,240}resolveQuoteSymbol/.test(src));

function loadQuotes(fetchImpl) {
  const timeoutSrc = fs.readFileSync(path.join(__dirname, "..", "js/fetch-timeout.js"), "utf8");
  const quotesSrc = fs.readFileSync(path.join(__dirname, "..", "js/app-quotes.js"), "utf8");
  const ctx = {
    S: { watchlist: [] },
    Baron: { EQUITIES: ["AAPL", "TSLA", "MSFT"], COMMODITIES: [] },
    console,
    Date,
    Math,
    Number,
    String,
    Boolean,
    Array,
    Object,
    parseFloat,
    parseInt,
    isNaN,
    Infinity,
    JSON,
    Promise,
    setTimeout,
    clearTimeout,
    AbortController,
    Error,
    encodeURIComponent,
    fetch: fetchImpl,
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.runInNewContext(timeoutSrc + "\n" + quotesSrc, ctx);
  return ctx;
}

const q = loadQuotes(async () => { throw new Error("network should not run for normalize"); });
const aliases = {
  tesla: "TSLA",
  TESLA: "TSLA",
  apple: "AAPL",
  google: "GOOGL",
  alphabet: "GOOGL",
  amazon: "AMZN",
  microsoft: "MSFT",
  nvidia: "NVDA",
  nvidea: "NVDA",
  meta: "META",
  facebook: "META",
  netflix: "NFLX",
};
Object.keys(aliases).forEach((name) => {
  check(name + " normalizes to " + aliases[name], q.normalizeQuoteSymbol(name) === aliases[name]);
});
check("real tickers stay themselves", q.normalizeQuoteSymbol("TSLA") === "TSLA" && q.normalizeQuoteSymbol("AAPL") === "AAPL");
check("crypto suffix still applies after aliases", q.normalizeQuoteSymbol("BTC") === "BTC-USD");
check("pair symbols are left alone", q.normalizeQuoteSymbol("EURUSD=") === "EURUSD=");

const probed = [];
const live = loadQuotes(async (url) => {
  probed.push(String(url));
  const want = String(url).includes("/TSLA");
  return {
    ok: want,
    headers: { get: () => "miss" },
    json: async () => ({
      chart: { result: [{ meta: { regularMarketPrice: 364.12, previousClose: 360 } }] },
    }),
  };
});
live.resolveQuoteSymbol("TESLA").then((resolved) => {
  check("resolveQuoteSymbol maps TESLA to TSLA", resolved === "TSLA");
  check("TESLA resolve probes Yahoo as TSLA", probed.some((u) => u.includes("/TSLA")) && !probed.some((u) => /\/TESLA(?:\?|$)/.test(u)));
  return live.fetchLivePrice("TESLA", resolved);
}).then((data) => {
  check("TESLA fetchLivePrice uses TSLA and returns a price", data && data.quoteSym === "TSLA" && data.price === 364.12 && !data.estimated);
  console.log("ok " + n + " checks");
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
