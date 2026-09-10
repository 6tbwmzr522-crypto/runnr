#!/usr/bin/env node
/** Public Alex Runner SAMPLE proof — engine numbers, not testimonials. */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const { root, html, sw, css } = require("./app_src").loadAppSource();
const sandboxSrc = fs.readFileSync(path.join(root, "js/demo-sandbox.js"), "utf8");
const coachSrc = fs.readFileSync(path.join(root, "js/coach.js"), "utf8");
const baronSrc = fs.readFileSync(path.join(root, "js/baron.js"), "utf8");
const ob = fs.readFileSync(path.join(root, "js/onboarding.js"), "utf8");

let n = 0;
function check(name, cond) {
  assert(cond, name);
  n += 1;
}

const v = html.match(/var V = "(\d+)"/)[1];
const cache = sw.match(/CACHE = "runnr-v(\d+)"/)[1];
check("index.html V matches sw.js CACHE", v === cache);
check("cache is 135+", Number(v) >= 135);
check("demo-sandbox cache-bust", html.includes("js/demo-sandbox.js?v=3"));
check("onboarding cache-bust", html.includes("js/onboarding.js?v=36"));
check("pages.css cache-bust", html.includes("css/pages.css?v=3"));

const hookStart = html.indexOf('id="onboarding-overlay"');
const hookEnd = html.indexOf('id="intro-overlay"');
const hook = html.slice(hookStart, hookEnd);
const heroStart = hook.indexOf('class="ob-hero"');
const heroEnd = hook.indexOf("</div>", hook.indexOf("<h2>Trading discipline"));
const hero = hook.slice(heroStart, heroEnd);
check("80% is not hardcoded in the hook hero", !/80%/.test(hero));
check("hook proof card is present", hook.includes('data-runnr-proof') && hook.includes("Alex Runner") && hook.includes("SAMPLE"));
check("hook proof story", hook.includes("Stops held, size leaked."));
check("hook proof is not a testimonial", hook.includes("not a customer testimonial") && hook.includes("not live AUM"));
check("hook proof has SAMPLE desk CTA", hook.includes('href="/?demo=1"') && hook.includes("Open SAMPLE desk"));
check("hook proof has trial CTA", hook.includes("Start free · 7-day trial") && hook.includes('class="btn runnr-proof-cta-start"'));
check("hook proof brands runnr.fyi", hook.includes("runnr.fyi"));
check("hook static proof does not invent the score", !/80%/.test(hook) && !/2,528/.test(hook) && !/1,190/.test(hook));

const landing = html.slice(html.indexOf('id="home-landing"'), html.indexOf('id="home-job-hero"'));
check("landing proof card is present", landing.includes('data-runnr-proof') && landing.includes("Alex Runner ·") && landing.includes("SAMPLE"));
check("landing View sample opens the desk", landing.includes('id="home-view-sample"') && landing.includes('href="/?demo=1"'));
check("no fake trader count", !/700 traders/i.test(html) && !/700 traders/i.test(sandboxSrc));
check("no fake quote marks as testimonials", !/“I (cut|saved|made)/i.test(html) && !/&quot;I (cut|saved|made)/i.test(html));

check("js hook still has Start free + View sample", ob.includes('id="ob-hook-start"') && ob.includes("Start free") && ob.includes("View sample"));
check("renderHook injects proofCardHtml", ob.includes("proofCardHtml") && ob.includes("paintProof"));
check("proof CSS is mobile-first stacked CTAs", css.includes(".runnr-proof-actions") && css.includes(".runnr-proof-brand") && css.includes("grid-template-columns:1fr 1fr"));
check("demo desk does not repeat the landing proof card", css.includes("html.runnr-demo #page-home .home-frame > .home-landing-card{display:none !important}"));
check("proof ring uses engine pct var", css.includes("--proof-pct"));

function freshCtx() {
  const store = {};
  const nodes = [];
  function el(tag) {
    const attrs = {};
    const children = [];
    const node = {
      tag,
      attrs,
      children,
      dataset: {},
      style: { setProperty() {} },
      textContent: "",
      innerHTML: "",
      querySelector(sel) {
        return this.querySelectorAll(sel)[0] || null;
      },
      querySelectorAll(sel) {
        const out = [];
        const walk = (n) => {
          if (!n || n === this && sel.startsWith("[")) {
            /* include descendants only */
          }
          if (n !== this) {
            if (sel.startsWith("[data-proof=") && n.attrs && n.attrs["data-proof"] === sel.slice(13, -2)) out.push(n);
            if (sel === "[data-runnr-proof]" && n.attrs && n.attrs["data-runnr-proof"] !== undefined) out.push(n);
            if (sel === "[data-runnr-proof-host]" && n.attrs && Object.prototype.hasOwnProperty.call(n.attrs, "data-runnr-proof-host")) out.push(n);
            if (sel === ".runnr-proof-score" && n.attrs && String(n.attrs.class || "").includes("runnr-proof-score")) out.push(n);
            if (sel === ".runnr-proof-cta-start" && n.attrs && String(n.attrs.class || "").includes("runnr-proof-cta-start")) out.push(n);
            if (sel === ".runnr-proof-cta-desk" && n.attrs && String(n.attrs.class || "").includes("runnr-proof-cta-desk")) out.push(n);
          }
          (n.children || []).forEach(walk);
        };
        if (sel === "[data-runnr-proof]" && this.attrs && this.attrs["data-runnr-proof"] !== undefined) out.push(this);
        (this.children || []).forEach(walk);
        if (sel.startsWith("[data-proof=")) {
          const key = sel.slice(13, -2);
          const deep = [];
          const visit = (n) => {
            if (n.attrs && n.attrs["data-proof"] === key) deep.push(n);
            (n.children || []).forEach(visit);
          };
          visit(this);
          return deep;
        }
        return out;
      },
      addEventListener() {},
    };
    nodes.push(node);
    return node;
  }
  const ctx = {
    window: {},
    localStorage: {
      getItem(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
      setItem(k, v) { store[k] = String(v); },
    },
    sessionStorage: {
      _s: {},
      getItem(k) { return Object.prototype.hasOwnProperty.call(this._s, k) ? this._s[k] : null; },
      setItem(k, v) { this._s[k] = String(v); },
    },
    location: { hostname: "localhost", search: "", pathname: "/", href: "http://localhost/" },
    navigator: { userAgent: "node", sendBeacon() { return true; } },
    document: {
      readyState: "complete",
      getElementById() { return null; },
      documentElement: { classList: { toggle() {}, add() {}, remove() {} } },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      addEventListener() {},
      createElement: el,
    },
    console,
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  return ctx;
}

const ctx = freshCtx();
vm.runInNewContext(baronSrc, ctx);
vm.runInNewContext(coachSrc, ctx);
vm.runInNewContext(sandboxSrc, ctx);

const SB = ctx.RunnrDemoSandbox;
const Coach = ctx.CoachEngine;
check("proofModel is exported", typeof SB.proofModel === "function");
check("proofCardHtml is exported", typeof SB.proofCardHtml === "function");

const now = new Date("2026-09-09T12:00:00.000Z");
const book = SB.factoryTrades(now);
const score = Coach.disciplineScore(book);
const metrics = Coach.metrics(book);
const proof = SB.proofModel(now);

check("proof score matches CoachEngine", proof.overall === score.overall && proof.tier === score.tier);
check("proof stop/size match CoachEngine", proof.stopPct === score.stopPct && proof.sizePct === score.sizePct);
check("proof P&L matches CoachEngine", proof.discPnl === metrics.discPnl && proof.undiscPnl === metrics.undiscPnl);
check("Alex Runner SAMPLE labels", proof.name === "Alex Runner" && proof.badge === "SAMPLE" && /SAMPLE/.test(proof.kicker));
check("story is stops held, size leaked", /stops held,\s*size leaked/i.test(proof.story));
check("disclaimer forbids testimonial/AUM reading", /not a customer testimonial/i.test(proof.disclaimer) && /not live AUM/i.test(proof.disclaimer));
check("proof CTAs", proof.deskHref === "/?demo=1" && proof.trialHref === "/login.html" && /7-day trial/.test(proof.trialLabel));
check("loud brand", proof.brand === "runnr.fyi");
check("expected sandbox band", proof.overall >= 78 && proof.overall <= 85 && proof.tier === "Consistent Runner");
check("expected sandbox split", proof.stopPct === 95 && proof.sizePct === 71);
check("expected sandbox P&L", proof.discPnl === 2528 && proof.undiscPnl === -1190);
check("formatted euro P&L", proof.discPnlLabel === "€2,528" && proof.undiscPnlLabel === "-€1,190");
check("leak label is size leaks", proof.leakLabel === "size leaks");

const markup = SB.proofCardHtml();
check("markup is SAMPLE-labelled", markup.includes("Alex Runner") && markup.includes("SAMPLE") && markup.includes("not a customer testimonial"));
check("markup CTAs", markup.includes('href="/?demo=1"') && markup.includes("Open SAMPLE desk") && markup.includes("Start free · 7-day trial") && markup.includes("runnr.fyi"));
check("markup does not hard-code engine numbers", !/80%/.test(markup) && !/2,528/.test(markup) && !/1,190/.test(markup));
check("markup placeholders wait for paintProof", markup.includes('data-proof="overall">—') && markup.includes('data-proof="disc">—'));

const card = {
  attrs: { "data-runnr-proof": "" },
  children: [],
  style: { setProperty() {} },
  querySelector(sel) {
    return this.querySelectorAll(sel)[0] || null;
  },
  querySelectorAll(sel) {
    if (!sel.startsWith('[data-proof="')) return sel === ".runnr-proof-score" ? [this] : [];
    const key = sel.slice(13, -2);
    const found = { textContent: "", attrs: { "data-proof": key } };
    this["_" + key] = found;
    return [found];
  },
};
SB.paintProof = SB.paintProof;
const filled = {};
const fakeCard = {
  querySelector(sel) { return sel === ".runnr-proof-score" ? { style: { setProperty(k, v) { filled.pct = v; } } } : null; },
  querySelectorAll(sel) {
    if (!sel.startsWith('[data-proof="')) return [];
    const key = sel.slice(13, -2);
    if (!filled[key]) filled[key] = { textContent: "" };
    return [filled[key]];
  },
};
const paintCtx = {
  querySelectorAll(sel) {
    if (sel === "[data-runnr-proof-host]") return [];
    if (sel === "[data-runnr-proof]") return [fakeCard];
    return [];
  },
};
const painted = SB.paintProof(paintCtx);
check("paintProof writes engine labels", painted.overallLabel === "80%" && filled.overall.textContent === "80%");
check("paintProof disc/leak text", filled.disc.textContent === "€2,528" && filled.leak.textContent === "-€1,190");
check("paintProof stop vs size", filled.stop.textContent === "95%" && filled.size.textContent === "71%");
check("paintProof tier", filled.tier.textContent === "Consistent Runner");

console.log("test_alex_runner_proof: ok " + n);
