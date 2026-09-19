#!/usr/bin/env node
/** Phone bar is five tabs + More sheet. Watch / Portfolio / Shelf stay off the bar. */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const { root, html, sw, css } = require("./app_src").loadAppSource();
const navSrc = fs.readFileSync(path.join(root, "js/app-nav.js"), "utf8");

let n = 0;
function check(name, cond) {
  assert(cond, name);
  n += 1;
}

const v = html.match(/var V = "(\d+)"/)[1];
const cache = sw.match(/CACHE = "runnr-v(\d+)"/)[1];
check("index.html V matches sw.js CACHE", v === cache);
check("cache is 160+", Number(v) >= 160);

const navBlock = html.match(/<div id="nav">([\s\S]*?)<\/div>/);
check("nav block exists", !!navBlock);
const navHtml = navBlock[1];
check("phone primary tabs are Home Sizer Journal Coach More",
  /data-nav="home"/.test(navHtml)
  && /data-nav="sizer"/.test(navHtml)
  && /data-nav="journal"/.test(navHtml)
  && /data-nav="coach"/.test(navHtml)
  && /data-nav="more"/.test(navHtml));
check("Watch Portfolio Shelf are phone-more, not bar tabs",
  /nav-phone-more[^>]*data-nav="watchlist"/.test(navHtml)
  && /nav-phone-more[^>]*data-nav="portfolio"/.test(navHtml)
  && /nav-phone-more[^>]*data-nav="shelf"/.test(navHtml));
check("Coach is not a phone-more or advanced item",
  !/nav-phone-more[^>]*data-nav="coach"/.test(navHtml)
  && !/nav-advanced[^>]*data-nav="coach"/.test(navHtml));
check("Terminal stays desktop-only and out of the More sheet",
  /nav-desktop-only[^>]*data-nav="desk"/.test(navHtml)
  && !/data-more="desk"/.test(html));

const sheetStart = html.indexOf('id="more-sheet"');
const sheetEnd = html.indexOf("<!-- Alert Toast");
const sheet = sheetStart >= 0 && sheetEnd > sheetStart ? html.slice(sheetStart, sheetEnd) : "";
check("More sheet lists only Watch Portfolio Shelf",
  !!sheet
  && /data-more="watchlist"/.test(sheet)
  && /data-more="portfolio"/.test(sheet)
  && /data-more="shelf"/.test(sheet)
  && (sheet.match(/data-more="/g) || []).length === 3);

check("phone CSS hides sheet destinations and keeps More",
  css.includes(".nav-phone-more{display:none}")
  && css.includes(".nav-btn-more{display:flex}")
  && css.includes("#more-sheet{position:absolute;inset:0;z-index:12;display:none}"));
check("desktop CSS restores Watch Portfolio Shelf and hides More",
  /@media \(min-width:1024px\)\{[\s\S]*\.nav-phone-more\{display:flex\}/.test(css)
  && /@media \(min-width:1024px\)\{[\s\S]*\.nav-btn-more,#more-sheet\{display:none !important\}/.test(css)
  && /@media \(min-width:1024px\)\{[\s\S]*\.nav-desktop-only\{display:flex\}/.test(css));

const navCss = css.match(/#nav\{[^}]+\}/);
check("phone #nav overflow is hidden", navCss && /overflow-x:hidden/.test(navCss[0]));

function fakeClassList() {
  const set = new Set();
  return {
    add(c) { set.add(c); },
    remove(c) { set.delete(c); },
    contains(c) { return set.has(c); },
    toggle(c, on) { if (on) set.add(c); else set.delete(c); },
    _has: set,
  };
}

function fakeEl(attrs) {
  const el = {
    attrs: Object.assign({ hidden: false }, attrs),
    classList: fakeClassList(),
    hidden: !!attrs.hidden,
    dataset: {},
    listeners: {},
    getAttribute(name) { return this.attrs[name]; },
    setAttribute(name, value) { this.attrs[name] = String(value); },
    addEventListener(type, fn) { this.listeners[type] = fn; },
  };
  return el;
}

const buttons = ["home", "sizer", "watchlist", "journal", "coach", "portfolio", "desk", "shelf", "more"].map((nav) => {
  const extra = {};
  if (nav === "more") extra["aria-expanded"] = "false";
  extra["data-nav"] = nav;
  const el = fakeEl(extra);
  return el;
});
const sheetEl = fakeEl({ id: "more-sheet", hidden: true, "aria-hidden": "true" });
sheetEl.hidden = true;
const panelEl = fakeEl({ id: "more-sheet-panel" });

const ctx = {
  window: {},
  document: {
    getElementById(id) {
      if (id === "more-sheet") return sheetEl;
      if (id === "more-sheet-panel") return panelEl;
      return null;
    },
    querySelector(sel) {
      if (sel === "#nav .nav-btn-more") return buttons.find((b) => b.getAttribute("data-nav") === "more");
      return null;
    },
    querySelectorAll(sel) {
      if (sel === "#nav .nav-btn") return buttons;
      return [];
    },
    addEventListener() {},
  },
  matchMedia(q) {
    return { matches: q.includes("1024") && ctx._desktop };
  },
};
ctx.window = ctx;
ctx.globalThis = ctx;
ctx._desktop = false;
vm.runInNewContext(navSrc, ctx);

check("phone More pages are watchlist portfolio shelf",
  ctx.isPhoneMorePage("watchlist")
  && ctx.isPhoneMorePage("portfolio")
  && ctx.isPhoneMorePage("shelf")
  && !ctx.isPhoneMorePage("coach")
  && !ctx.isPhoneMorePage("desk"));

ctx.currentNavKey = "home";
ctx.openMoreSheet();
check("opening More sheet marks it open and highlights More",
  sheetEl.classList.contains("open")
  && sheetEl.hidden === false
  && buttons.find((b) => b.getAttribute("data-nav") === "more").classList.contains("active")
  && !buttons.find((b) => b.getAttribute("data-nav") === "home").classList.contains("active"));

ctx.closeMoreSheet();
ctx.currentNavKey = "watchlist";
ctx.paintNavActive("watchlist");
check("Watch on phone keeps More highlighted",
  buttons.find((b) => b.getAttribute("data-nav") === "more").classList.contains("active")
  && !buttons.find((b) => b.getAttribute("data-nav") === "watchlist").classList.contains("active"));

ctx.paintNavActive("coach");
check("Coach on phone highlights Coach not More",
  buttons.find((b) => b.getAttribute("data-nav") === "coach").classList.contains("active")
  && !buttons.find((b) => b.getAttribute("data-nav") === "more").classList.contains("active"));

ctx._desktop = true;
ctx.paintNavActive("watchlist");
check("Watch on desktop highlights Watch in the side nav",
  buttons.find((b) => b.getAttribute("data-nav") === "watchlist").classList.contains("active")
  && !buttons.find((b) => b.getAttribute("data-nav") === "more").classList.contains("active"));

ctx.openMoreSheet();
check("More sheet does not open on desktop", !sheetEl.classList.contains("open"));

console.log("ok " + n);
