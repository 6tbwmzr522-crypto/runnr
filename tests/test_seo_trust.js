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
  check(rel + " redirects to /sign-in/", src.includes('location.replace("/sign-in/"') && src.includes("location.search"));
  check(rel + " keeps a real href", /href="\/sign-in\/"/.test(src));
  check(rel + " canonical is /sign-in/", src.includes('href="https://runnr.fyi/sign-in/"'));
  check(rel + " is noindex", src.includes('name="robots" content="noindex"'));
}
assertAlias("login.html");
assertAlias("signin/index.html");
assertAlias("start/index.html");
check("sitemap omits login.html", !sitemap.includes("login.html"));

const login = read("sign-in/index.html");
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
check("login form lives on /sign-in/", login.includes('id="signin-form"') && login.includes("7-day trial") && login.includes('rel="canonical" href="https://runnr.fyi/sign-in/"'));
check("sign-in script is root-relative", login.includes('src="/js/visit.js?v=2"'));
check("home has no crawler spinner copy", !html.includes("Fetching CNN Fear") && !html.includes("↻ Loading") && !html.includes(">LOADING<") && !html.includes("Fetching prices...") && !html.includes("Loading market data"));
check("fear and greed first paint is static", html.includes("CNN Fear &amp; Greed is a mood gauge for the session."));

console.log("test_seo_trust: ok");
