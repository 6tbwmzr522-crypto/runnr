#!/usr/bin/env node
/** Quote herd: concurrency cap, list vs detail TTL, backoff, cache bust. */
"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");

let n = 0;
function check(name, cond) {
  assert(cond, name);
  n += 1;
}

const v = html.match(/var V = "(\d+)"/)[1];
const cache = sw.match(/CACHE = "runnr-v(\d+)"/)[1];
check("index.html V matches sw.js CACHE", v === cache);
check("PWA cache bust is 117+", Number(v) >= 117);

check("quote fetch concurrency is 3 or 4", /const QUOTE_FETCH_CONCURRENCY = ([34]);/.test(html));
check("fetchYahooChart acquires a slot", /async function fetchYahooChart[\s\S]{0,80}acquireQuoteSlot\(/.test(html));
check("fetchYahooChart releases the slot", /async function fetchYahooChart[\s\S]{0,900}releaseQuoteSlot\(/.test(html));
check("list refresh TTL is longer than detail", /const STOCK_LIST_CACHE_MS = 120000/.test(html) && /const STOCK_CACHE_MS = 90000/.test(html));
check("detail modal still uses STOCK_CACHE_MS", /stockCache\[cacheKey\]\.ts < STOCK_CACHE_MS/.test(html));
check("watchlist refresh uses list TTL", /STOCK_LIST_CACHE_MS/.test(html) && /quoteBackoffUntil/.test(html));
check("502/stale streak backs off refresh", /quoteErrorStreak\+\+/.test(html) && /Prices delayed/.test(html));
check("last good price kept on fetch failure", /last\.price > 0 && !last\.estimated/.test(html));
check("swr counts as live for the banner", /status === 'hit' \|\| status === 'swr' \|\| status === 'refresh'/.test(html));
check("traffic banner copy stays honest", html.includes("High traffic — live prices may lag. Journal &amp; Alpaca sync still work."));

console.log("ok " + n + " checks");
