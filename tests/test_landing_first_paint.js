#!/usr/bin/env node
/** Logged-out home first paint: no live loaders, one CTA, real pricing. */
"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert");

const { root, html, src, sw, css } = require("./app_src").loadAppSource();
const ob = fs.readFileSync(path.join(root, "js/onboarding.js"), "utf8");

function check(name, cond) {
  assert(cond, name);
}

const v = html.match(/var V = "(\d+)"/)[1];
const cache = sw.match(/CACHE = "runnr-v(\d+)"/)[1];
check("index.html V matches sw.js CACHE", v === cache);
check("onboarding cache-bust", html.includes("js/onboarding.js?v=36"));
check("demo sandbox is loaded", html.includes("js/demo-sandbox.js?v=3"));
check("demo chrome is persistent on the guest desk", html.includes('id="demo-chrome"') && html.includes('id="demo-chrome-cta"') && html.includes("SAMPLE · not your book"));
check("demo=1 skips the first-paint hook", html.includes("demo=1") && /runnr_hook_v1[\s\S]*demo=1|demo=1[\s\S]*runnr_hook_v1/.test(html));

const hookStart = html.indexOf('id="onboarding-overlay"');
const hookEnd = html.indexOf('id="intro-overlay"');
const hook = html.slice(hookStart, hookEnd);
check("hook headline is its own h2", /<h2>Trading discipline, not a broker<\/h2>/.test(hook));
const hero = hook.slice(hook.indexOf('class="ob-hero"'), hook.indexOf('data-runnr-proof'));
check("80% is not in the hook hero", !/80%/.test(hero));
check("hook shows Alex Runner SAMPLE proof", hook.includes("Alex Runner") && hook.includes("SAMPLE") && hook.includes("Open SAMPLE desk") && hook.includes('href="/?demo=1"'));
check("hook has one Start free CTA", (hook.match(/Start free/g) || []).length >= 1);
check("hook Start free goes to login", hook.includes('id="ob-hook-start"') && hook.includes('href="/login.html"'));
check("hook does not duplicate Sign in blocks", !/card-title[^>]*>Sign in/.test(hook) && (hook.match(/>Sign in</g) || []).length === 0);
check("hook pricing is the real offer", hook.includes("7-day trial") && hook.includes("€19/month") && hook.includes("€190/year"));
check("no invented 30-trade free tier", !html.includes("30 journal") && !html.includes("30 trades/month"));
check("js hook matches html CTA", ob.includes('id="ob-hook-start"') && ob.includes("Start free") && ob.includes("View sample"));

check("guest class hides live market widgets", css.includes("html.runnr-guest .fg-card") && css.includes("html.runnr-guest .home-markets-card") && css.includes("html.runnr-guest .home-commodities-card"));
check("guest class hides challenge remaining card", css.includes("html.runnr-guest #home-challenge-card"));
check("hook hides the desk", css.includes("html.runnr-show-hook #app{visibility:hidden"));
check("overlay is full viewport", css.includes("#onboarding-overlay{position:fixed;inset:0;width:100%") && css.includes("max-width:none"));
check("guest header drops smashed Terminal+balance", css.includes("html.runnr-guest #header .header-desk-btn") && css.includes("html.runnr-guest .header-bal-settings"));

check("home landing card has pricing + Start free", html.includes('id="home-landing"') && html.includes('id="home-start-free"') && html.includes("Start free · 7-day trial · then €19/month or €190/year"));
check("signed-in desktop hides the guest landing card", css.includes("#page-home .home-frame > .home-landing-card{display:none}")
  && css.includes("html.runnr-guest #page-home .home-frame > .home-landing-card{display:flex}"));
check("SAMPLE desk hides the guest landing card", css.includes("html.runnr-demo .home-landing-card")
  && css.includes("html.runnr-demo #page-home .home-frame > .home-landing-card{display:none !important}"));
check("landing title stays a separate line", html.includes('class="home-landing-title">Trading discipline, not a broker'));
check("landing card is full-width on desktop", css.includes("#page-home .home-frame > .home-landing-card"));
check("80% lives only in the progress card", html.includes("Need 80%+ stop confirmation over 20 trades"));

check("guest fetches are gated", src.includes("function isGuestLanding(") && src.includes("function startMarketFeedsIfAllowed(") && src.includes("if (isGuestLanding()) return"));
check("init no longer always starts feeds", src.includes("startMarketFeedsIfAllowed()") && !/setTimeout\(\(\) => \{\s*try \{ startFeedTimer\(\); \}/.test(src));
check("fear-greed fetch bails for guests", /async function fetchFearGreed\(\) \{\s*if \(isGuestLanding\(\)\) return;/.test(src));
check("home markets fetch bails for guests", /async function refreshHomeMarkets\(\) \{\s*if \(isGuestLanding\(\)\) return;/.test(src));

check("email/password login kept", fs.readFileSync(path.join(root, "login.html"), "utf8").includes('id="signin-form"'));
check("login page states 7-day trial", fs.readFileSync(path.join(root, "login.html"), "utf8").includes("7-day trial"));
check("report is gated to trial or Pro", fs.readFileSync(path.join(root, "report/index.html"), "utf8").includes("Start your 7-day trial") && fs.readFileSync(path.join(root, "report/index.html"), "utf8").includes("/api/v1/auth/me"));
check("report expired CTA hits billing=upgrade", fs.readFileSync(path.join(root, "report/index.html"), "utf8").includes("/?billing=upgrade"));
check("app handles billing=upgrade", src.includes("billing=upgrade") && /openUpgrade\(['"]Your 7-day trial has ended['"]\)/.test(src));
check("intro overlay not removed", html.includes('id="intro-overlay"') && html.includes("/media/runnr-how-it-works.mp4"));
check("footer mailto kept", html.includes("mailto:info@thinicedigital.com"));

console.log("test_landing_first_paint: ok");
