#!/usr/bin/env node
/** Silent four-beat tour — skip, progress, AAPL shelf seed. Intro video stays parked. */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const root = path.join(__dirname, "..");
const { html, sw, css, src } = require("./app_src").loadAppSource();
const tourSrc = fs.readFileSync(path.join(root, "js/tour.js"), "utf8");
const shelfSrc = fs.readFileSync(path.join(root, "js/shelf.js"), "utf8");
const introSrc = fs.readFileSync(path.join(root, "js/intro.js"), "utf8");

let n = 0;
function check(name, cond) {
  assert(cond, name);
  n += 1;
}

const v = html.match(/var V = "(\d+)"/)[1];
const cache = sw.match(/CACHE = "runnr-v(\d+)"/)[1];
check("index.html V matches sw.js CACHE", v === cache);
check("cache is 162+", Number(v) >= 162);
check("tour.js cache-busted", html.includes("js/tour.js?v=2"));
check("tour loads after parked intro", html.indexOf("js/intro.js") < html.indexOf("js/tour.js"));
check("homepage intro autoplay stays off", introSrc.includes("ENABLED: false") && /id="intro-overlay"[^>]*hidden/.test(html));
check("tour overlay markup", html.includes('id="tour-overlay"') && html.includes('id="tour-skip"') && html.includes('id="tour-cta"') && html.includes('id="tour-chip-copy"'));
check("Skip tour copy", html.includes("Skip tour"));
check("storyboard CTAs in markup", html.includes("Size AAPL") && html.includes("Score another"));
check("tour CSS spotlight + chip", css.includes("#tour-overlay") && css.includes("#tour-chip") && css.includes("#tour-hole") && css.includes("#tour-skip"));
check("tour sits above keep-score wall", /#tour-overlay\{[^}]*z-index:10050/.test(css.replace(/\s+/g, "")));
check("empty Mag 7 backup copy", tourSrc.includes("Shelf fills as books sync — Mag 7 shows up first.") && shelfSrc.includes("Shelf fills as books sync — Mag 7 shows up first."));
check("email wall soft-skip copy", tourSrc.includes("You can save later — next stop is Shelf."));
check("default ticker is AAPL only", tourSrc.includes('TICKER: "AAPL"') && !/TICKER:.+NVDA/.test(tourSrc));
check("beats are size journal score shelf close", /"size", "journal", "score", "shelf", "close"/.test(tourSrc));
check("score auto-advance is ~2s", tourSrc.includes("AUTO_SCORE_MS: 2000"));
check("does not re-enable intro video", !tourSrc.includes("ENABLED: true") && introSrc.includes("ENABLED: false"));
check("demo-sandbox holds email wall mid-tour", src.includes("tourBlocksWall") && src.includes("allowsEmailWall"));
check("boot binds and maybeShows tour", src.includes("RunnrTour?.bind") && src.includes("RunnrTour?.maybeShow"));
check("phone shelf still lives in More", html.includes('data-more="shelf"') && html.includes('id="more-sheet"'));

function loadTour(opts) {
  const store = Object.assign({}, opts.store || {});
  const overlay = {
    className: "",
    hidden: true,
    classList: {
      items: new Set(),
      add(c) { this.items.add(c); overlay.className = [...this.items].join(" "); },
      remove(c) { this.items.delete(c); overlay.className = [...this.items].join(" "); },
      contains(c) { return this.items.has(c); },
    },
    setAttribute() {},
    getAttribute() { return ""; },
    removeAttribute() {},
  };
  const els = {
    "tour-overlay": overlay,
    "tour-chip-copy": { textContent: "" },
    "tour-cta": { textContent: "", addEventListener() {} },
    "tour-alt": { textContent: "", hidden: true, addEventListener() {} },
    "tour-skip": { addEventListener() {} },
    "tour-chip-beat": { textContent: "1" },
    "tour-chip-kicker": { hidden: false },
    "tour-hole": { hidden: true, style: {} },
    "tour-chip": { style: {} },
  };
  const ctx = {
    localStorage: {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
    },
    document: {
      documentElement: { classList: { contains() { return false; }, add() {}, remove() {} } },
      getElementById(id) { return els[id] || null; },
      querySelector() { return null; },
      querySelectorAll() { return []; },
    },
    window: {},
    location: opts.location || { search: "", hash: "" },
    persist: opts.persist || (() => {}),
    RunnrSync: opts.RunnrSync || { isLoggedIn: () => !!opts.loggedIn },
    RunnrDemoSandbox: opts.RunnrDemoSandbox || { isDemoState: () => !!opts.sample },
    S: opts.state || { trades: [] },
    console,
    setInterval() { return 1; },
    clearInterval() {},
    setTimeout(fn) { return 1; },
    clearTimeout() {},
    Date,
    module: undefined,
  };
  ctx.window = ctx;
  vm.runInNewContext(tourSrc, ctx);
  return { T: ctx.RunnrTour, store, overlay, ctx };
}

const guest = loadTour({ sample: true });
check("SAMPLE desk wants tour on first visit", guest.T.shouldShow(guest.ctx.S) === true);

const signed = loadTour({ loggedIn: true, RunnrSync: { isLoggedIn: () => true } });
check("signed-in book wants tour on first visit", signed.T.shouldShow({}) === true);

guest.T.skip(guest.ctx.S);
check("skip writes localStorage", guest.store.runnr_tour_v1 === "skipped");
check("skip closes overlay", guest.T.isOpen() === false);
check("skip does not nag next visit", guest.T.shouldShow(guest.ctx.S) === false);

const done = loadTour({ store: { runnr_tour_v1: "done" }, sample: true });
check("completed tour does not nag", done.T.shouldShow({}) === false);

const forced = loadTour({ store: { runnr_tour_v1: "done" }, location: { search: "?tour=1", hash: "" }, sample: true });
check("?tour=1 replays", forced.T.shouldShow({}) === true);

check("beat 1 done when AAPL size output exists", guest.T.hasSizedAapl({
  plan: { ticker: "AAPL", ready: true, size: 40, totalRisk: 160 },
  skipLive: true,
}) === true);
check("beat 1 ignores other tickers", guest.T.hasSizedAapl({
  plan: { ticker: "NVDA", ready: true, size: 10 },
  skipLive: true,
}) === false);
check("beat 1 incomplete without stop", guest.T.hasSizedAapl({
  plan: { ticker: "AAPL", ready: false, size: 0 },
  skipLive: true,
}) === false);

check("beat 2 done on new AAPL journal row", guest.T.hasJournaledAapl({
  trades: [{ id: 9e12, instr: "AAPL", source: "pretrade", planStatus: "approved" }],
  since: 1,
}) === true);
check("beat 2 done on SAMPLE Followed", guest.T.hasJournaledAapl({
  trades: [{ id: 4, instr: "AAPL CFD", processFlag: "followed", isDemo: true }],
  since: 1,
}) === true);
check("beat 2 ignores factory AAPL without process", guest.T.hasJournaledAapl({
  trades: [{ id: 9, instr: "AAPL", isDemo: true, stopOk: true }],
  since: 1e15,
}) === false);

check("beat 3 done when score UI visible", guest.T.scoreUiVisible({ scoreVisible: true }) === true);
check("beat 3 done when keep-score wall is open", guest.T.scoreUiVisible({ wallOpen: true }) === true);
check("email wall blocked mid-size", (guest.T.step = 0, guest.T.open = true, guest.T.allowsEmailWall() === false));
check("email wall allowed on score beat", (guest.T.step = 2, guest.T.open = true, guest.T.allowsEmailWall() === true));
guest.T.open = false;
guest.T.step = 0;

check("close copy is the loop", guest.T.COPY.close.includes("Size") && guest.T.COPY.close.includes("Shelf") && guest.T.COPY.close.includes("You're in"));
check("journal SAMPLE CTA is Followed", guest.T.isSampleDesk() === true);

const shelfCtx = { window: {}, document: { getElementById: () => null } };
shelfCtx.window = shelfCtx;
vm.runInNewContext(shelfSrc, shelfCtx);
const books = shelfCtx.RunnrShelf.books();
const aaplBooks = shelfCtx.RunnrShelf.booksFor("AAPL");
check("six named books remain", books.length === 6);
check("AAPL seeded on 2-3 demo books plus Berkshire", aaplBooks.length >= 3);
check("Situational Pershing Appaloosa hold AAPL", ["situational", "pershing", "appaloosa"].every((id) => aaplBooks.some((b) => b.id === id)));
check("Berkshire still has the 13F AAPL", books.find((b) => b.id === "berkshire").holdings.some((h) => h.sym === "AAPL" && !h.seed));
check("seeded AAPL is marked demo", aaplBooks.some((b) => (b.holdings || []).some((h) => h.sym === "AAPL" && h.seed)));
check("Duquesne holdings count unchanged", books.find((b) => b.id === "duquesne").holdings.length === 18);
check("Mag 7 is not empty", shelfCtx.RunnrShelf.mag7Books().length >= 1);
check("seed is idempotent", (shelfCtx.RunnrShelf.seedMag7Aapl(), shelfCtx.RunnrShelf.booksFor("AAPL").length === aaplBooks.length));
check("shelfReady with AAPL books", guest.T.shelfReady({ books: aaplBooks }) === true);
check("empty shelf uses backup", guest.T.COPY.shelf.includes("who else keeps AAPL") && guest.T.EMPTY_SHELF.includes("Mag 7"));

const dq = books.find((b) => b.id === "duquesne");
check("Duquesne is not first", books[0].id === "situational");
check("Duquesne still 18 common-stock rows", dq.holdings.length === 18);

console.log("test_tour: ok " + n);
