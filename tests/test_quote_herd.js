#!/usr/bin/env node
/** Quote herd: concurrency cap, list vs detail TTL, backoff, cache bust. */
"use strict";

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
check("quotes live in app-quotes.js", html.includes("js/app-quotes.js?v=1"));
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

console.log("ok " + n + " checks");
