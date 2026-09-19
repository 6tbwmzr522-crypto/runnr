#!/usr/bin/env node
/** Shelf is reachable from the phone More sheet; Terminal/Desk stays desktop-only. */
"use strict";

const assert = require("assert");

const { html, sw, css } = require("./app_src").loadAppSource();

function check(name, cond) {
  assert(cond, name);
}

const v = html.match(/var V = "(\d+)"/)[1];
const cache = sw.match(/CACHE = "runnr-v(\d+)"/)[1];
check("index.html V matches sw.js CACHE", v === cache);

const shelfBtn = html.match(/<button class="nav-btn[^"]*" type="button" data-nav="shelf"[^>]*>/);
check("shelf nav button exists", !!shelfBtn);
check("shelf nav is not desktop-only", !shelfBtn[0].includes("nav-desktop-only"));
check("shelf nav is a phone-more item", shelfBtn[0].includes("nav-phone-more"));

const deskBtn = html.match(/<button class="nav-btn[^"]*" type="button" data-nav="desk"[^>]*>/);
check("desk/terminal nav button exists", !!deskBtn);
check("desk/terminal stays desktop-only", deskBtn[0].includes("nav-desktop-only"));

const navCss = css.match(/#nav\{[^}]+\}/);
check("#nav does not scroll sideways on phone", navCss && /overflow-x:hidden/.test(navCss[0]) && !/overflow-x:auto/.test(navCss[0]));

const btnCss = css.match(/\.nav-btn\{[^}]+\}/);
check(".nav-btn shares the five-tab bar", btnCss && /min-width:0/.test(btnCss[0]) && /flex:1 1 0/.test(btnCss[0]));

check("phone More sheet lists Watch Portfolio Shelf", html.includes('id="more-sheet"')
  && html.includes('data-more="watchlist"')
  && html.includes('data-more="portfolio"')
  && html.includes('data-more="shelf"'));
check("phone More sheet does not list Terminal", !/id="more-sheet"[\s\S]*data-more="desk"/.test(html)
  && !/id="more-sheet-panel"[\s\S]*header\.terminal/.test(html));

check("shelf table keeps sideways scroll", css.includes(".shelf-table{width:100%;border-collapse:collapse;font-size:12px;min-width:640px}") && css.includes(".shelf-table-wrap{overflow:auto"));

console.log("test_mobile_shelf_nav: ok");
