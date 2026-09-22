#!/usr/bin/env node
/** Phone Home leads with Score/Sizer; markets soup stays in DOM behind More. */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const { root, html, sw, css } = require("./app_src").loadAppSource();
const navSrc = fs.readFileSync(path.join(root, "js/app-nav.js"), "utf8");
const ob = fs.readFileSync(path.join(root, "js/onboarding.js"), "utf8");

let n = 0;
function check(name, cond) {
  assert(cond, name);
  n += 1;
}

const v = html.match(/var V = "(\d+)"/)[1];
const cache = sw.match(/CACHE = "runnr-v(\d+)"/)[1];
check("index.html V matches sw.js CACHE", v === cache);
check("cache is 175+", Number(v) >= 185);
check("pages.css cache-bust", html.includes("css/pages.css?v=20"));
check("app-nav cache-bust", html.includes("js/app-nav.js?v=6"));
check("onboarding cache-bust", html.includes("js/onboarding.js?v=41"));

const homeStart = html.indexOf('id="page-home"');
const homeEnd = html.indexOf('id="page-sizer"');
const home = html.slice(homeStart, homeEnd);
check("landing Score one trade stays the SAMPLE path", home.includes('id="home-score-one"') && home.includes('href="/?demo=1"') && home.includes("Score one trade"));
check("landing exposes Open sizer", home.includes('id="home-open-sizer"') && home.includes("Open sizer") && /home-open-sizer[^>]*switchPage\('sizer'\)/.test(home));
check("job hero also links Sizer", /home-job-links[\s\S]*switchPage\('sizer'\)/.test(home));
check("phone More toggle exists", home.includes('id="home-desk-more-toggle"') && home.includes("toggleHomeDeskMore()") && home.includes("More on this desk"));
check("soup cards are marked extra, not deleted",
  home.includes("home-watch-shelf home-desk-extra")
  && home.includes('class="fg-card home-desk-extra"')
  && home.includes("home-progress-card home-desk-extra")
  && home.includes("home-commodities-card home-desk-extra")
  && home.includes("home-markets-card home-desk-extra")
  && home.includes("home-brokers-card home-desk-extra"));
check("Fear & Greed copy remains", home.includes("CNN Fear & Greed") && home.includes("Market Sentiment"));
check("Global Markets remain", home.includes("Global Markets") && home.includes('id="home-markets-indices"'));
check("broker preview remains", home.includes("Connected Brokers") && home.includes('id="home-broker-preview"'));
check("account snapshot is tagged for phone order", home.includes("home-account-card"));

const phoneCss = css.match(/@media \(max-width:1023px\)\{([\s\S]*?)\n\/\* ── PHONE MORE SHEET/);
check("phone home-trim media query exists", !!phoneCss);
const phone = phoneCss ? phoneCss[1] : "";
check("phone parks extras until expanded", phone.includes("#page-home:not(.home-desk-expanded) .home-desk-extra{display:none}"));
check("phone conversion order is loop then landing then job then score",
  phone.includes("#page-home .runnr-loop{order:1}")
  && phone.includes("#page-home .home-landing-card{order:2}")
  && phone.includes("#page-home .home-job-hero{order:3}")
  && phone.includes("#page-home #home-discipline-card{order:5}"));
check("phone landing puts Score CTA before the proof card",
  phone.includes(".home-landing-card .ob-hook-actions{order:4}")
  && phone.includes(".home-landing-card [data-runnr-proof-host]{order:8}"));
check("phone toggle is not the five-tab More sheet",
  phone.includes("html:not(.runnr-guest):not(.runnr-quiet) .home-desk-more-toggle")
  && css.includes(".nav-btn-more{display:flex}")
  && /data-nav="more"/.test(html));

const desk = css.match(/@media \(min-width:1024px\)\{([\s\S]*)$/);
check("desktop shell media query exists", !!desk);
const d = desk[1];
check("desktop still uses direct-child home-frame grid",
  d.includes("#page-home .home-frame > .home-watch-shelf")
  && d.includes("#page-home .home-frame > .home-brokers-card")
  && d.includes("#page-home .home-frame > .home-landing-card{display:none}"));
check("desktop hides the phone desk-more toggle", d.includes(".home-desk-more-toggle{display:none !important}"));
check("desktop does not display:none the extras", !/#page-home:not\(\.home-desk-expanded\) \.home-desk-extra\{display:none\}/.test(d));

check("hook CTA paints before proof via CSS order",
  css.includes(".ob-hook .ob-hook-actions{order:3}")
  && css.includes(".ob-hook .runnr-loop{order:2}")
  && css.includes(".ob-hook .runnr-proof{order:8}"));
check("hook Free/Pro lines sit by price order",
  css.includes(".ob-hook .runnr-trial-delta{order:5}")
  && css.includes(".ob-hook .runnr-readonly{order:6}"));
check("hook feature pills collapse behind What you get",
  html.includes('class="ob-hook-more"')
  && html.includes("<summary>What you get</summary>")
  && ob.includes('class="ob-hook-more"')
  && ob.includes("<summary>What you get</summary>"));
check("hook Start free is still /sign-in",
  /id="ob-hook-start"[^>]*href="\/sign-in"/.test(html)
  && ob.includes('href="/sign-in"'));
check("SAMPLE keep-score OAuth wall is intact",
  html.includes('id="modal-sample-keep"')
  && html.includes("Continue with Google")
  && html.includes("Continue with Apple")
  && html.includes("/sign-in?keep=1"));
check("intro video overlay is intact",
  html.includes('id="intro-overlay"')
  && html.includes("/media/runnr-intro-email-wall.mp4"));
check("Trend day chip is intact", html.includes('id="trend-day-chip"') && html.includes('id="trend-day-overlay"'));
check("five-tab phone nav is unchanged",
  /data-nav="home"/.test(html)
  && /data-nav="sizer"/.test(html)
  && /data-nav="journal"/.test(html)
  && /data-nav="coach"/.test(html)
  && /data-nav="more"/.test(html));

function fakeClassList() {
  const set = new Set();
  return {
    add(c) { set.add(c); },
    remove(c) { set.delete(c); },
    contains(c) { return set.has(c); },
    toggle(c, on) {
      if (on) set.add(c);
      else set.delete(c);
    },
    _has: set,
  };
}

function fakeEl(attrs) {
  const el = {
    attrs: Object.assign({}, attrs),
    classList: fakeClassList(),
    hidden: !!attrs.hidden,
    textContent: attrs.textContent || "",
    getAttribute(name) { return this.attrs[name]; },
    setAttribute(name, value) { this.attrs[name] = String(value); },
    addEventListener() {},
  };
  return el;
}

const pageHome = fakeEl({ id: "page-home" });
const toggleBtn = fakeEl({
  id: "home-desk-more-toggle",
  "aria-expanded": "false",
  textContent: "More on this desk",
});
toggleBtn.textContent = "More on this desk";
const sheetEl = fakeEl({ id: "more-sheet", hidden: true, "aria-hidden": "true" });
sheetEl.hidden = true;

const ctx = {
  window: {},
  document: {
    getElementById(id) {
      if (id === "page-home") return pageHome;
      if (id === "home-desk-more-toggle") return toggleBtn;
      if (id === "more-sheet") return sheetEl;
      return null;
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
  },
  matchMedia() {
    return { matches: !!ctx._desktop, addEventListener() {}, addListener() {} };
  },
};
ctx.window = ctx;
ctx.globalThis = ctx;
ctx._desktop = false;
vm.runInNewContext(navSrc, ctx);

check("phone toggle opens extras without opening the nav More sheet",
  ctx.toggleHomeDeskMore() === undefined
  && ctx.isHomeDeskExpanded() === true
  && pageHome.classList.contains("home-desk-expanded")
  && toggleBtn.getAttribute("aria-expanded") === "true"
  && toggleBtn.textContent === "Hide desk extras"
  && !sheetEl.classList.contains("open"));

ctx.toggleHomeDeskMore();
check("second tap collapses extras again",
  ctx.isHomeDeskExpanded() === false
  && toggleBtn.getAttribute("aria-expanded") === "false"
  && toggleBtn.textContent === "More on this desk");

ctx.toggleHomeDeskMore();
ctx._desktop = true;
ctx.toggleHomeDeskMore();
check("desktop toggle is a no-op that keeps extras visible in CSS",
  ctx.isHomeDeskExpanded() === false);

console.log("test_mobile_home_trim: ok " + n);
