#!/usr/bin/env node
/** Public sign-in URLs, robots/sitemap, and no Mac/iPhone workaround copy. */
"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { root, html, sw } = require("./app_src").loadAppSource();

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function check(name, cond) {
  assert(cond, name);
}

const v = html.match(/var V = "(\d+)"/)[1];
const cache = sw.match(/CACHE = "runnr-v(\d+)"/)[1];
check("index.html V matches sw.js CACHE", v === cache);

const robots = read("robots.txt");
check("robots allows crawlers", /User-agent:\s*\*/i.test(robots) && /Allow:\s*\//.test(robots));
check("robots points at sitemap", robots.includes("Sitemap: https://runnr.fyi/sitemap.xml"));
check("robots hides stats", /Disallow:\s*\/stats\.html/.test(robots) && /Disallow:\s*\/stats\b/.test(robots));

const sitemap = read("sitemap.xml");
[
  "https://runnr.fyi/",
  "https://runnr.fyi/sample/",
  "https://runnr.fyi/login.html",
  "https://runnr.fyi/sign-in/",
  "https://runnr.fyi/report/",
  "https://runnr.fyi/privacy/",
  "https://runnr.fyi/terms/",
  "https://runnr.fyi/refund/",
].forEach((u) => check("sitemap lists " + u, sitemap.includes("<loc>" + u + "</loc>")));
check("sitemap omits stats", !/stats/i.test(sitemap));

const pagesYml = read(".github/workflows/pages.yml");
check("Pages copies robots and sitemap", pagesYml.includes("robots.txt") && pagesYml.includes("sitemap.xml"));
check("Pages copies sign-in aliases", pagesYml.includes("sign-in") && pagesYml.includes("signin") && /\bstart\b/.test(pagesYml));

function assertAlias(rel) {
  const src = read(rel);
  check(rel + " redirects to login.html", src.includes('location.replace("/login.html"') && src.includes("location.search"));
  check(rel + " keeps a real href", /href="\/login\.html"/.test(src));
  check(rel + " canonical is login.html", src.includes('href="https://runnr.fyi/login.html"'));
}
assertAlias("sign-in/index.html");
assertAlias("signin/index.html");
assertAlias("start/index.html");

const login = read("login.html");
const i18n = read("js/i18n.js");
const apology = /works reliably on iPhone|freeze on Safari|Simple sign-in for iPhone|Use the sign-in page — it works|in-app form can freeze/i;
check("home has no iPhone workaround apology", !apology.test(html));
check("login has no iPhone workaround apology", !apology.test(login));
check("i18n has no iPhone workaround apology", !apology.test(i18n));

check("Open sign-in page is a real /sign-in href", /href="\/sign-in"[^>]*data-i18n="sync\.openSignIn"/.test(html));
check("header Sign in is a real /sign-in href", /id="header-sync-pill"[^>]*href="\/sign-in"/.test(html));
check("hook Start free is a real /sign-in href", /id="ob-hook-start"[^>]*href="\/sign-in"/.test(html));
check("demo chrome CTA is a real /sign-in href", /id="demo-chrome-cta"[^>]*href="\/sign-in"/.test(html));
check("home landing pitch is static HTML", html.includes("Trading discipline, not a broker") && html.includes("Sizer, journal, score, streak, and session wave"));
check("login form still lives on login.html", login.includes('id="signin-form"') && login.includes("7-day trial"));

console.log("test_seo_trust: ok");
