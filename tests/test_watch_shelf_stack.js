#!/usr/bin/env node
/** Desktop Watch shelf must stay in flow above Market Sentiment / Progress. */
"use strict";

const assert = require("assert");
const { html, sw, css } = require("./app_src").loadAppSource();

let n = 0;
function check(name, cond) {
  assert(cond, name);
  n += 1;
}

const v = html.match(/var V = "(\d+)"/)[1];
const cache = sw.match(/CACHE = "runnr-v(\d+)"/)[1];
check("index.html V matches sw.js CACHE", v === cache);
check("cache is 137+", Number(v) >= 137);

const desk = css.match(/@media \(min-width:1024px\)\{([\s\S]*)$/);
check("desktop shell media query exists", !!desk);
const d = desk[1];

check("watch shelf spans the framed grid", d.includes("#page-home .home-frame > .home-watch-shelf"));
check("sentiment and progress remain sibling cards", html.includes('class="fg-card"')
  && html.includes('class="card home-progress-card"')
  && html.includes('class="card home-watch-shelf"'));
check("watch shelf markup sits before sentiment", html.indexOf('class="card home-watch-shelf"') < html.indexOf('class="fg-card"'));
check("progress sits after sentiment", html.indexOf('class="fg-card"') < html.indexOf('class="card home-progress-card"'));

const shelfRule = d.match(/#page-home \.home-frame > \.home-watch-shelf\{([^}]+)\}/);
check("desktop watch-shelf override exists", !!shelfRule);
check("watch-shelf height is content-sized", /height:\s*auto/.test(shelfRule[1]));
check("watch-shelf min-height is min-content", /min-height:\s*min-content/.test(shelfRule[1]));

const trackRule = d.match(/#page-home \.watch-shelf-track\{([^}]+)\}/);
check("desktop watch-shelf-track rule exists", !!trackRule);
check("track does not flex-grow into a collapsed row", /flex:\s*0 0 auto/.test(trackRule[1]));
check("track min-height is min-content", /min-height:\s*min-content/.test(trackRule[1]));
check("track no longer uses flex:1 min-height:0", !/flex:\s*1/.test(trackRule[1]) && !/min-height:\s*0/.test(trackRule[1]));

check("mobile track stays a horizontal scroller", /@media/.test(css)
  && /\.watch-shelf-track\{display:flex;gap:8px;overflow-x:auto/.test(css));
check("quiet desk still hides the shelf", css.includes("html.runnr-quiet .home-watch-shelf"));

console.log("ok " + n);
