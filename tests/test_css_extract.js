#!/usr/bin/env node
/** Slice 2 extract: inline app stylesheet moved to css/*.css, cache bump, cascade kept. */
"use strict";

const assert = require("assert");
const { html, sw, css, stylesheets } = require("./app_src").loadAppSource();

let n = 0;
function check(name, cond) {
  assert(cond, name);
  n += 1;
}

const v = html.match(/var V = "(\d+)"/)[1];
const cache = sw.match(/CACHE = "runnr-v(\d+)"/)[1];
check("index.html V matches sw.js CACHE", v === cache);
check("cache is 132+", Number(v) >= 132);

const appCss = [
  "css/tokens.css",
  "css/layout.css",
  "css/components.css",
  "css/pages.css",
];
appCss.forEach((f) => {
  const pin = f === "css/pages.css" ? "?v=4" : f === "css/components.css" ? "?v=2" : "?v=1";
  check(f + " is loaded with cache-bust", html.includes(f + pin));
  check(f + " is in the stylesheet list", stylesheets.includes(f));
});

check("desk.css still loads first", stylesheets[0] === "css/desk.css");
check("extracted sheets follow desk.css in original order",
  stylesheets.indexOf("css/tokens.css") === 1
  && stylesheets.indexOf("css/layout.css") === 2
  && stylesheets.indexOf("css/components.css") === 3
  && stylesheets.indexOf("css/pages.css") === 4);
check("legal.css is not loaded on the app page", !stylesheets.includes("css/legal.css"));
check("no giant inline style block remains", !/<style[\s>]/.test(html));
check("index.html is under 160KB after css extract", Buffer.byteLength(html) < 160000);

check("tokens still define dark + fonts", /--bg:\s*#080c12/.test(css) && /--font-head:/.test(css));
check("light mode tokens still exist", /body\.light\s*\{/.test(css) && /--bg:\s*#F5F2EC/.test(css));
check("desktop shell media query kept", /@media \(min-width:1024px\)\{/.test(css));
check("desktop hover media query kept", /@media \(min-width:1024px\) and \(hover:hover\)\{/.test(css));
check("guest hook still hides the desk", css.includes("html.runnr-show-hook #app{visibility:hidden"));
check("guest landing desktop override kept",
  css.includes("#page-home .home-frame > .home-landing-card{display:none}")
  && css.includes("html.runnr-guest #page-home .home-frame > .home-landing-card{display:flex}"));

console.log("ok", n);
