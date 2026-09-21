#!/usr/bin/env node
/** Pre-email-wall intro — video then keep-score, skip, persist. Homepage autoplay stays off. */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const introSrc = fs.readFileSync(path.join(root, "js/intro.js"), "utf8");
const sandboxSrc = fs.readFileSync(path.join(root, "js/demo-sandbox.js"), "utf8");
const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
const pages = fs.readFileSync(path.join(root, ".github/workflows/pages.yml"), "utf8");
const mediaReadme = fs.readFileSync(path.join(root, "media/README.md"), "utf8");

function check(name, cond) {
  assert(cond, name);
}

const v = html.match(/var V = "(\d+)"/)[1];
const cache = sw.match(/CACHE = "runnr-v(\d+)"/)[1];
check("index.html V matches sw.js CACHE", v === cache);
check("cache is 166+", Number(v) >= 166);
check("intro.js cache-busted", html.includes("js/intro.js?v=6"));
check("intro overlay markup", html.includes('id="intro-overlay"') && html.includes('id="intro-skip"'));
check("intro video is the email-wall cut", html.includes("/media/runnr-intro-email-wall.mp4") && introSrc.includes("/media/runnr-intro-email-wall.mp4"));
check("intro poster is in the repo path", html.includes("/media/runnr-intro-email-wall.jpg") && introSrc.includes("/media/runnr-intro-email-wall.jpg"));
check("intro mp4 is in media/", fs.existsSync(path.join(root, "media/runnr-intro-email-wall.mp4")));
check("intro poster is in media/", fs.existsSync(path.join(root, "media/runnr-intro-email-wall.jpg")));
check("intro overlay starts hidden", /id="intro-overlay"[^>]*hidden/.test(html));
check("intro overlay is not parked", !html.includes("intro-parked"));
check("skip copy is skip to save your score", html.includes("Skip to save your score") && introSrc.includes("Skip to save your score"));
check("dev missing-file note is not in the page", !html.includes("Intro file is missing") && !html.includes("Parent:") && !html.includes('id="intro-missing"'));
check("intro.js does not reveal a missing-file note", !introSrc.includes("intro-missing") && introSrc.includes("this.skip("));
check("tap for sound copy", html.includes("Tap for sound") && introSrc.includes("Tap for sound"));
check("keep-score has no replay", !html.includes('id="sample-keep-replay"') && !html.slice(html.indexOf('id="modal-sample-keep"'), html.indexOf('id="modal-share"')).includes("Watch how Runnr works"));
check("landing has quiet watch", html.includes('id="sample-hero-watch"') && html.includes("Watch how Runnr works"));
check("replay does not reopen the keep-score wall", introSrc.includes("playBeforeKeepScore(null") && !introSrc.includes("showKeepScore({ skipIntro: true })"));
check("pages deploys media folder", pages.includes("media"));
check("readme says email-wall not social", mediaReadme.includes("email wall") && mediaReadme.includes("not") && /Instagram|TikTok/.test(mediaReadme));
check("public hook is a different overlay", html.includes('id="onboarding-overlay"'));
check("logged-out hook copy has no walkthrough video", !html.slice(html.indexOf('id="onboarding-overlay"'), html.indexOf("ob-hook-report")).includes("intro-video"));
check("tmp-reply-video spy-ad not used", !html.includes("tmp-reply-video") && !introSrc.includes("tmp-reply-video") && !introSrc.includes("spy"));
check("chip tour is not forced with the video", introSrc.includes("tourBlocksVideo") && introSrc.includes("tour=1") && sandboxSrc.includes("tourWantsChipPath"));
const login = fs.readFileSync(path.join(root, "sign-in/index.html"), "utf8");
check("login has Google + Apple buttons", login.includes("Continue with Google") && login.includes("Continue with Apple"));
check("login keeps email/password", login.includes('id="signin-form"') && login.includes("/api/v1/auth/login"));
check("in-app card has OAuth", html.includes("modal-sync-auth") && html.includes("Continue with Google"));
check("home footer bug/idea mailto", html.includes("home-footer-idea") && html.includes("mailto:info@thinicedigital.com") && html.includes("Found a bug or have an idea?") && html.includes("Email us."));

function loadIntro(opts) {
  const store = Object.assign({}, opts.store || {});
  const overlay = {
    className: "",
    hidden: true,
    attrs: { hidden: "" },
    classList: {
      items: new Set(),
      add(c) { this.items.add(c); overlay.className = [...this.items].join(" "); },
      remove(c) {
        String(c).split(/\s+/).forEach((x) => this.items.delete(x));
        overlay.className = [...this.items].join(" ");
      },
      toggle(c, on) { if (on) this.add(c); else this.remove(c); },
      contains(c) { return this.items.has(c); },
    },
    setAttribute(k, v) { this.attrs[k] = v; if (k === "hidden") this.hidden = true; },
    getAttribute(k) { return this.attrs[k] || ""; },
    removeAttribute(k) { delete this.attrs[k]; if (k === "hidden") this.hidden = false; },
    hasAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k); },
  };
  const listeners = {};
  const video = {
    muted: true, src: "", paused: true, dataset: {}, currentTime: 0,
    setAttribute() {}, getAttribute(k) { return k === "src" ? this.src : ""; },
    play() { this.paused = false; return Promise.resolve(); },
    pause() { this.paused = true; },
    addEventListener(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
  };
  const skip = { dataset: {}, textContent: "Skip", addEventListener() {} };
  const unmute = { dataset: {}, textContent: "", hidden: true, addEventListener() {} };
  const ctx = {
    localStorage: {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
    },
    document: {
      getElementById(id) {
        if (id === "intro-overlay") return overlay;
        if (id === "intro-video") return video;
        if (id === "intro-skip") return skip;
        if (id === "intro-unmute") return unmute;
        if (id === "intro-missing") return { dataset: {}, addEventListener() {}, hidden: true };
        return null;
      },
    },
    location: opts.location || { search: "", hash: "" },
    window: {},
    persist: opts.persist || (() => {}),
    RunnrSync: opts.RunnrSync || { isLoggedIn: () => false },
    RunnrTour: opts.RunnrTour,
    console,
  };
  ctx.window = ctx;
  vm.runInNewContext(introSrc, ctx);
  return { I: ctx.RunnrIntro, store, overlay, video, skip, unmute, ctx, listeners };
}

const unsigned = loadIntro({ RunnrSync: { isLoggedIn: () => false } });
check("logged-out home does not show homepage intro", unsigned.I.shouldShow({}) === false);
check("homepage autoplay stays parked", unsigned.I.ENABLED === false);
check("wall path is enabled", unsigned.I.WALL_ENABLED === true);
check("first guest keep-score wants the video", unsigned.I.shouldPlayBeforeKeepScore({}) === true);

unsigned.I.maybeShow({});
check("parked homepage intro does not open", unsigned.overlay.classList.contains("open") === false);
check("parked homepage intro does not autoplay", unsigned.video.paused === true);

const first = loadIntro({ RunnrSync: { isLoggedIn: () => false } });
check("playBeforeKeepScore opens overlay", first.I.playBeforeKeepScore(() => { first.ctx.wallOpened = true; }) === true);
check("overlay opens on first keep-score", first.overlay.classList.contains("open"));
check("skip label is painted", first.skip.textContent === "Skip to save your score");
check("tap for sound is shown", first.unmute.hidden === false && first.unmute.textContent === "Tap for sound");
check("video starts muted so skip still works", first.video.muted === true && first.video.paused === false);
check("wall is not opened until skip/end", first.ctx.wallOpened !== true);
first.I.skip({});
check("skip writes localStorage", first.store.runnr_intro_v1 === "skipped");
check("skip closes overlay", first.overlay.classList.contains("open") === false);
check("skip then opens the email wall", first.ctx.wallOpened === true);
check("returner is not forced", first.I.shouldPlayBeforeKeepScore({}) === false);

const ended = loadIntro({ RunnrSync: { isLoggedIn: () => false } });
ended.I.playBeforeKeepScore(() => { ended.ctx.wallOpened = true; });
ended.I.finish({});
check("end writes done", ended.store.runnr_intro_v1 === "done");
check("end opens the email wall", ended.ctx.wallOpened === true);

const signed = loadIntro({ RunnrSync: { isLoggedIn: () => true, introSeen: () => false } });
check("signed-in keep-score skips video", signed.I.shouldPlayBeforeKeepScore({}) === false);
signed.I.ENABLED = true;
check("first signed-in visit wants overlay only if homepage enabled", signed.I.shouldShow({}) === true);

const profiled = loadIntro({
  store: {},
  RunnrSync: { isLoggedIn: () => true, introSeen: () => true },
});
check("profile intro_seen suppresses homepage overlay", profiled.I.shouldShow({}) === false);

const replay = loadIntro({
  store: { runnr_intro_v1: "done" },
  RunnrSync: { isLoggedIn: () => false },
});
check("localStorage seen-state does not replay by default", replay.I.shouldPlayBeforeKeepScore({}) === false);
check("force replay still plays", replay.I.shouldPlayBeforeKeepScore({ force: true }) === true);
replay.ctx.RunnrDemoSandbox = { showKeepScore() { replay.ctx.wallOpened = true; return true; } };
check("landing replay opens the video", replay.I.replay() === true && replay.overlay.classList.contains("open") === true);
replay.I.finish({});
check("landing replay does not reopen keep-score", replay.ctx.wallOpened !== true);
check("?intro=1 replays", loadIntro({
  store: { runnr_intro_v1: "done" },
  location: { search: "?intro=1", hash: "" },
}).I.shouldPlayBeforeKeepScore({}) === true);

const tourForce = loadIntro({
  location: { search: "?demo=1&tour=1", hash: "" },
});
check("?tour=1 does not stack chips + video", tourForce.I.shouldPlayBeforeKeepScore({}) === false);

const tourOpen = loadIntro({
  RunnrTour: { isOpen: () => true, queryForce: () => false },
});
check("open chip tour does not steal the email-wall video", tourOpen.I.shouldPlayBeforeKeepScore({}) === true);

const broken = loadIntro({ RunnrSync: { isLoggedIn: () => false } });
broken.I.bind();
broken.I.playBeforeKeepScore(() => { broken.ctx.wallOpened = true; });
broken.video.src = "/media/runnr-intro-email-wall.mp4";
(broken.listeners.error || []).forEach((fn) => fn());
check("first video error tries the fallback cut", broken.video.src === "/media/runnr-how-it-works.mp4" && broken.ctx.wallOpened !== true);
(broken.listeners.error || []).forEach((fn) => fn());
check("fallback error skips to the email wall", broken.ctx.wallOpened === true);
check("fallback error closes the overlay", broken.overlay.classList.contains("open") === false);
check("fallback error leaves no missing-file note", broken.skip.textContent === "Skip to save your score");

console.log("test_intro_overlay: ok");
