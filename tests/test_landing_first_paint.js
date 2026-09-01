#!/usr/bin/env node
/** Logged-out home first paint: no live loaders, one CTA, real pricing. */
"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const ob = fs.readFileSync(path.join(root, "js/onboarding.js"), "utf8");
const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");

function check(name, cond) {
  assert(cond, name);
}

const v = html.match(/var V = "(\d+)"/)[1];
const cache = sw.match(/CACHE = "runnr-v(\d+)"/)[1];
check("index.html V matches sw.js CACHE", v === cache);
check("onboarding cache-bust", html.includes("js/onboarding.js?v=29"));

const hookStart = html.indexOf('id="onboarding-overlay"');
const hookEnd = html.indexOf('id="intro-overlay"');
const hook = html.slice(hookStart, hookEnd);
check("hook headline is its own h2", /<h2>Trading discipline, not a broker<\/h2>/.test(hook));
check("80% is not in the hook hero", !/80%/.test(hook));
check("hook has one Start free CTA", (hook.match(/Start free/g) || []).length >= 1);
check("hook Start free goes to login", hook.includes('id="ob-hook-start"') && hook.includes('href="/login.html"'));
check("hook does not duplicate Sign in blocks", !/card-title[^>]*>Sign in/.test(hook) && (hook.match(/>Sign in</g) || []).length === 0);
check("hook pricing is the real offer", hook.includes("10 journal trades") && hook.includes("€19/month") && hook.includes("€190/year"));
check("no invented 30-trade free tier", !html.includes("30 journal") && !html.includes("30 trades/month"));
check("js hook matches html CTA", ob.includes('id="ob-hook-start"') && ob.includes("Start free") && ob.includes("View sample"));

check("guest class hides live market widgets", html.includes("html.runnr-guest .fg-card") && html.includes("html.runnr-guest .home-markets-card") && html.includes("html.runnr-guest .home-commodities-card"));
check("guest class hides challenge remaining card", html.includes("html.runnr-guest #home-challenge-card"));
check("hook hides the desk", html.includes("html.runnr-show-hook #app{visibility:hidden"));
check("overlay is full viewport", html.includes("#onboarding-overlay{position:fixed;inset:0;width:100%") && html.includes("max-width:none"));
check("guest header drops smashed Terminal+balance", html.includes("html.runnr-guest #header .header-desk-btn") && html.includes("html.runnr-guest .header-bal-settings"));

check("home landing card has pricing + Start free", html.includes('id="home-landing"') && html.includes('id="home-start-free"') && html.includes("Start free · 10 journal trades · then €19/month or €190/year"));
check("landing title stays a separate line", html.includes('class="home-landing-title">Trading discipline, not a broker'));
check("landing card is full-width on desktop", html.includes("#page-home .home-frame > .home-landing-card"));
check("80% lives only in the progress card", html.includes("Need 80%+ stop confirmation over 20 trades"));

check("guest fetches are gated", html.includes("function isGuestLanding(") && html.includes("function startMarketFeedsIfAllowed(") && html.includes("if (isGuestLanding()) return"));
check("init no longer always starts feeds", html.includes("startMarketFeedsIfAllowed()") && !/setTimeout\(\(\) => \{\s*try \{ startFeedTimer\(\); \}/.test(html));
check("fear-greed fetch bails for guests", /async function fetchFearGreed\(\) \{\s*if \(isGuestLanding\(\)\) return;/.test(html));
check("home markets fetch bails for guests", /async function refreshHomeMarkets\(\) \{\s*if \(isGuestLanding\(\)\) return;/.test(html));

check("email/password login kept", fs.readFileSync(path.join(root, "login.html"), "utf8").includes('id="signin-form"'));
check("intro overlay not removed", html.includes('id="intro-overlay"') && html.includes("/media/runnr-how-it-works.mp4"));
check("footer mailto kept", html.includes("mailto:info@thinicedigital.com"));

console.log("test_landing_first_paint: ok");
