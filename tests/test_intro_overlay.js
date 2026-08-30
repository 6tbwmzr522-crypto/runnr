#!/usr/bin/env node
/** First signed-in walkthrough — once only, never on the public homepage hook. */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const introSrc = fs.readFileSync(path.join(root, "js/intro.js"), "utf8");
const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
const pages = fs.readFileSync(path.join(root, ".github/workflows/pages.yml"), "utf8");

function check(name, cond) {
  assert(cond, name);
}

const v = html.match(/var V = "(\d+)"/)[1];
const cache = sw.match(/CACHE = "runnr-v(\d+)"/)[1];
check("index.html V matches sw.js CACHE", v === cache);
check("intro.js cache-busted", html.includes("js/intro.js?v=1"));
check("intro overlay markup", html.includes('id="intro-overlay"') && html.includes('id="intro-skip"'));
check("intro video path", html.includes("/media/runnr-how-it-works.mp4") && introSrc.includes("/media/runnr-how-it-works.mp4"));
check("pages deploys media folder", pages.includes("media"));
check("public hook is a different overlay", html.includes('id="onboarding-overlay"'));
check("logged-out hook copy has no walkthrough video", !html.slice(html.indexOf('id="onboarding-overlay"'), html.indexOf("ob-hook-report")).includes("intro-video"));
check("tmp-reply-video spy-ad not used", !html.includes("tmp-reply-video") && !introSrc.includes("tmp-reply-video") && !introSrc.includes("spy"));
const login = fs.readFileSync(path.join(root, "login.html"), "utf8");
check("login has Google + Apple buttons", login.includes("Continue with Google") && login.includes("Continue with Apple"));
check("login keeps email/password", login.includes('id="signin-form"') && login.includes("/api/v1/auth/login"));
check("in-app card has OAuth", html.includes("modal-sync-auth") && html.includes("Continue with Google"));
check("home footer bug/idea mailto", html.includes("home-footer-idea") && html.includes("mailto:info@thinicedigital.com") && html.includes("Found a bug or have an idea?") && html.includes("Email us."));

function loadIntro(opts) {
  const store = Object.assign({}, opts.store || {});
  const overlay = { className: "", classList: {
    items: new Set(),
    add(c) { this.items.add(c); overlay.className = [...this.items].join(" "); },
    remove(c) { this.items.delete(c); overlay.className = [...this.items].join(" "); },
    contains(c) { return this.items.has(c); },
  }, setAttribute() {}, getAttribute() { return ""; } };
  const video = { muted: true, src: "", paused: true, dataset: {},
    setAttribute() {}, getAttribute(k) { return k === "src" ? this.src : ""; },
    play() { this.paused = false; return Promise.resolve(); },
    pause() { this.paused = true; },
    addEventListener() {},
  };
  const ctx = {
    localStorage: {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
    },
    document: {
      getElementById(id) {
        if (id === "intro-overlay") return overlay;
        if (id === "intro-video") return video;
        if (id === "intro-skip" || id === "intro-unmute" || id === "intro-missing") return { dataset: {}, addEventListener() {}, hidden: true };
        return null;
      },
    },
    window: {},
    persist: opts.persist || (() => {}),
    RunnrSync: opts.RunnrSync || { isLoggedIn: () => false },
    console,
  };
  ctx.window = ctx;
  vm.runInNewContext(introSrc, ctx);
  return { I: ctx.RunnrIntro, store, overlay, video, ctx };
}

const unsigned = loadIntro({ RunnrSync: { isLoggedIn: () => false } });
check("logged-out home does not show intro", unsigned.I.shouldShow({}) === false);

const first = loadIntro({ RunnrSync: { isLoggedIn: () => true, introSeen: () => false } });
check("first signed-in visit wants overlay", first.I.shouldShow({}) === true);
first.I.maybeShow({});
check("overlay opens on first signed-in home", first.overlay.classList.contains("open"));
first.I.skip({ introWalkthroughSeen: false });
check("skip writes localStorage", first.store.runnr_intro_v1 === "done");
check("skip closes overlay", first.overlay.classList.contains("open") === false);
check("second visit skips overlay", first.I.shouldShow({}) === false);

const profiled = loadIntro({
  store: {},
  RunnrSync: { isLoggedIn: () => true, introSeen: () => true },
});
check("profile intro_seen suppresses overlay", profiled.I.shouldShow({}) === false);

const stateSeen = loadIntro({
  RunnrSync: { isLoggedIn: () => true, introSeen: () => false },
});
check("profile JSON flag suppresses overlay", stateSeen.I.shouldShow({ introWalkthroughSeen: true }) === false);

const replay = loadIntro({
  store: { runnr_intro_v1: "done" },
  RunnrSync: { isLoggedIn: () => true, introSeen: () => false },
});
check("localStorage seen-state does not replay", replay.I.shouldShow({}) === false);

console.log("test_intro_overlay: ok");
