#!/usr/bin/env node
/** Shelf must be reachable on the phone bar; Terminal/Desk stays desktop-only. */
"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");

function check(name, cond) {
  assert(cond, name);
}

const v = html.match(/var V = "(\d+)"/)[1];
const cache = sw.match(/CACHE = "runnr-v(\d+)"/)[1];
check("index.html V matches sw.js CACHE", v === cache);

const shelfBtn = html.match(/<button class="nav-btn[^"]*" type="button" data-nav="shelf"[^>]*>/);
check("shelf nav button exists", !!shelfBtn);
check("shelf nav is not desktop-only", !shelfBtn[0].includes("nav-desktop-only"));

const deskBtn = html.match(/<button class="nav-btn[^"]*" type="button" data-nav="desk"[^>]*>/);
check("desk/terminal nav button exists", !!deskBtn);
check("desk/terminal stays desktop-only", deskBtn[0].includes("nav-desktop-only"));

const navCss = html.match(/#nav\{[^}]+\}/);
check("#nav is horizontally scrollable on phone", navCss && /overflow-x:auto/.test(navCss[0]));

const btnCss = html.match(/\.nav-btn\{[^}]+\}/);
check(".nav-btn does not shrink below a readable min-width", btnCss && /min-width:68px/.test(btnCss[0]) && /flex:1 0 auto/.test(btnCss[0]));

check("shelf table keeps sideways scroll", html.includes(".shelf-table{width:100%;border-collapse:collapse;font-size:12px;min-width:640px}") && html.includes(".shelf-table-wrap{overflow:auto"));

console.log("test_mobile_shelf_nav: ok");
