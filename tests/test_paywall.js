#!/usr/bin/env node
/** Freemium gates: Coach, Alerts, broker API, billing cache, demo flag. */
"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
const syncSrc = fs.readFileSync(path.join(root, "js/sync.js"), "utf8");
const limitSrc = fs.readFileSync(path.join(root, "js/trade-limit.js"), "utf8");
const brokersPy = fs.readFileSync(path.join(root, "api/app/routers/brokers.py"), "utf8");
const billingUtil = fs.readFileSync(path.join(root, "api/app/billing_util.py"), "utf8");
const tradeLimitPy = fs.readFileSync(path.join(root, "api/app/trade_limit.py"), "utf8");

let n = 0;
function check(name, cond) {
  assert(cond, name);
  n += 1;
}

const v = html.match(/var V = "(\d+)"/)[1];
const cache = sw.match(/CACHE = "runnr-v(\d+)"/)[1];
check("index.html V matches sw.js CACHE", v === cache);

check("askCoach requires Pro", /async function askCoach[\s\S]{0,120}requirePro\(\s*['"]Coach['"]\)/.test(html));
check("askCoachFree requires Pro", /async function askCoachFree[\s\S]{0,120}requirePro\(\s*['"]Coach['"]\)/.test(html));
check("renderCoachPage uses hasProAccess", /function renderCoachPage[\s\S]{0,400}hasProAccess\(\)/.test(html));
check("Coach upgrade CTA exists", html.includes('id="coach-upgrade-cta"') && html.includes("Unlock Coach"));
check("Coach insights live in pro body", html.includes('id="coach-pro-body"'));

check("toggleNotifications requires Alerts", /async function toggleNotifications[\s\S]{0,200}requirePro\(\s*['"]Alerts['"]\)/.test(html));
check("requestNotifPermission requires Alerts", /async function requestNotifPermission[\s\S]{0,80}requirePro\(\s*['"]Alerts['"]\)/.test(html));
check("checkPriceAlerts requires hasProAccess", /function checkPriceAlerts[\s\S]{0,120}hasProAccess\(\)/.test(html));

check("broker connect/sync call _require_pro_broker", (brokersPy.match(/_require_pro_broker\(user\)/g) || []).length >= 6);
check("alpaca connect gated before TradingClient", /def connect_alpaca[\s\S]{0,120}_require_pro_broker/.test(brokersPy));
check("t212 sync gated", /def t212_sync[\s\S]{0,80}_require_pro_broker/.test(brokersPy));

check("billing cache helper is fail-closed", syncSrc.includes("function failClosedBilling") && /pro:\s*false/.test(syncSrc));
check("no fail-open default object", !/let billingCache = \{\s*pro:\s*true/.test(syncSrc));
check("refresh failure does not fail open", syncSrc.includes("if (!billingKnown) billingCache = failClosedBilling()"));
check("isPro treats billing off as unlimited", /function isPro\(\)[\s\S]{0,80}!billingCache\.enabled/.test(syncSrc));

check("subscription_is_pro does not grant on plan alone", !/return pl in \{/.test(billingUtil));
check("subscription_is_pro uses PRO_STATUSES", billingUtil.includes("return st in PRO_STATUSES"));

check("demo exclusion is explicit flag", /t\.isDemo === true/.test(limitSrc) && /seed === true/.test(limitSrc));
check("python demo exclusion is explicit flag", tradeLimitPy.includes('trade.get("isDemo") is True'));
check("python no longer uses DEMO_TRADE_IDS", !/DEMO_TRADE_IDS/.test(tradeLimitPy));
check("shipped seeds are flagged isDemo", /id:\s*1,\s*isDemo:\s*true/.test(html) && /id:\s*4,\s*isDemo:\s*true/.test(html));

console.log("ok", n);
