#!/usr/bin/env node
/** Light theme: form controls and panels follow surface tokens, not dark fills. */
"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { html, sw, css } = require("./app_src").loadAppSource();

const root = path.join(__dirname, "..");
const pretrade = fs.readFileSync(path.join(root, "css/pretrade.css"), "utf8");
const components = fs.readFileSync(path.join(root, "css/components.css"), "utf8");
const tokens = fs.readFileSync(path.join(root, "css/tokens.css"), "utf8");

let n = 0;
function check(name, cond) {
  assert(cond, name);
  n += 1;
}

const v = html.match(/var V = "(\d+)"/)[1];
const cache = sw.match(/CACHE = "runnr-v(\d+)"/)[1];
check("index.html V matches sw.js CACHE", v === cache);
check("cache is past v187", Number(v) >= 188);

check("dark scheme stays dark", /:root\s*\{[^}]*color-scheme:\s*dark/.test(tokens));
check("dark surface2 is still the navy field", /--surface2:\s*#101620/.test(tokens));
check("light scheme is light", /body\.light\s*\{[^}]*color-scheme:\s*light/.test(components));
check("light text is dark ink", /body\.light\s*\{[^}]*--text:\s*#1a1208/.test(components));
check("light field fill is cream", /body\.light\s*\{[^}]*--surface2:\s*#F0EBE3/.test(components));

const fieldRule = pretrade.match(/\.pt-field input,\.pt-field select,\.pt-log-row input\{[^}]+\}/);
check("sizer field rule exists", !!fieldRule);
check("sizer fields use surface token, not a hardcoded navy fill", fieldRule && /background:var\(--surface2\)/.test(fieldRule[0]) && !/#101620/.test(fieldRule[0]));
check("sizer field text and caret follow the theme", fieldRule && /color:var\(--text\)/.test(fieldRule[0]) && /caret-color:var\(--text\)/.test(fieldRule[0]));
check("sizer placeholders use muted text", /\.pt-log-row input::placeholder\{[^}]*color:var\(--text3\)/.test(pretrade));

check("pending plan uses page background token", /\.pt-output\{[^}]*background:var\(--bg\)/.test(pretrade) && !/\.pt-output\{[^}]*background:#080c12/.test(pretrade));
check("derived rail uses page background token", /\.pt-derived\{[^}]*background:var\(--bg\)/.test(pretrade));

check("light mode restates sizer fields", /body\.light \.pt-field input[\s\S]*background:var\(--surface2\)/.test(components));
check("light mode covers journal textarea and coach ask", /body\.light \.field textarea[\s\S]*body\.light \.coach-free-ask/.test(components));
check("light placeholders stay muted", /body\.light \.field textarea::placeholder[\s\S]*color:var\(--text3\)/.test(components));
check("light primary buttons use light ink on the darkened accent", /body\.light \.btn:not\(\.btn-ghost\):not\(\.btn-danger\)[\s\S]*color:#fff/.test(components));
check("light terminal bar is cream", /body\.light \.desk-cmd\{background:rgba\(245,242,236/.test(components));
check("light cooldown sheet uses the surface token", /body\.light #modal-cooldown \.cooldown-sheet\{background:var\(--surface\)/.test(components));
check("light trend-day checklist keeps light ink on its dark card", /body\.light #trend-day-chip \.td-check\{color:#F5F2EC\}/.test(components));

check("shared stylesheet still defines both themes", /--bg:\s*#080c12/.test(css) && /--bg:\s*#F5F2EC/.test(css));

console.log("ok", n);
