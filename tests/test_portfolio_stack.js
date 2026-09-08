#!/usr/bin/env node
/** Portfolio phone stack — IW scroll order, Runnr honesty. Home job stays PR #30. */
"use strict";

const assert = require("assert");

const { html, src, sw, css } = require("./app_src").loadAppSource();

let n = 0;
function check(name, cond) {
  assert(cond, name);
  n += 1;
}

function extractTopFn(src, name) {
  const start = src.indexOf("function " + name + "(");
  if (start < 0) return "";
  let i = src.indexOf("{", start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return "";
}

const v = html.match(/var V = "(\d+)"/)[1];
const cache = sw.match(/CACHE = "runnr-v(\d+)"/)[1];
check("index.html V matches sw.js CACHE", v === cache);
check("cache is 123+", Number(v) >= 123);

const portStart = html.indexOf('id="page-portfolio"');
const portEnd = html.indexOf('id="page-desk"');
check("portfolio page exists before desk", portStart > 0 && portEnd > portStart);
const port = html.slice(portStart, portEnd);

function idx(needle) {
  return port.indexOf(needle);
}

const hero = idx('class="port-hero"');
const curve = idx('id="port-equity-canvas"');
const kpis = idx('id="port-kpis"');
const recent = idx('id="port-recent-card"');
const cta = idx('id="port-cta"');
const more = idx('id="port-more-kpis"');
const wave = idx("port-wave-card");

check("stack order hero → curve → 3 kpis → recent → primary CTA",
  hero >= 0 && curve > hero && kpis > curve && recent > kpis && cta > recent);
check("session wave sits after the primary stack", wave > cta);
check("P&L extras sit after the primary CTA", more > cta);

const kpiBlock = port.slice(kpis, port.indexOf("</div>", port.indexOf("Incomplete")) + 6);
const kpiCards = (port.slice(kpis, recent).match(/class="kpi"/g) || []).length;
check("primary KPI row has exactly 3 cards", kpiCards === 3);
check("primary KPIs are process flags, not win rate",
  port.slice(kpis, recent).includes("Stop-ok")
  && port.slice(kpis, recent).includes("Size-ok")
  && port.slice(kpis, recent).includes("Incomplete")
  && !/Win Rate/.test(port.slice(kpis, recent)));
check("win rate is not the hero story",
  !/Win Rate/.test(port.slice(hero, recent))
  && port.slice(more).includes("Win Rate"));

check("hero keeps journal / book P&L", port.includes('id="port-total-pnl"') && port.includes("Total P&L"));
check("no invented AUM copy", !/\bAUM\b/i.test(port));
check("recent list and journal jump exist",
  port.includes('id="port-recent-list"')
  && /switchPage\('journal'\)/.test(port.slice(recent, cta)));
check("primary CTA is a fat mint button",
  /id="port-cta"[^>]*class="btn port-cta"/.test(port)
  || /class="btn port-cta"[^>]*id="port-cta"/.test(port));
check("CTA reuses Home job runner",
  src.includes("function renderPortCta")
  && /function renderPortCta[\s\S]*primaryJob[\s\S]*runHomeJob/.test(src));
check("recent rows open editor or Replay",
  src.includes("function openPortRecentTrade")
  && /openDisciplineReplay/.test(extractTopFn(src, "openPortRecentTrade"))
  && /openTradeEditor/.test(extractTopFn(src, "openPortRecentTrade")));
check("incomplete rate uses pending / logged, not invented expectancy",
  /pendingTrades\.length \/ totalLogged/.test(src)
  && !/expectancy/i.test(port)
  && !/function fake|invented/.test(extractTopFn(src, "loadPortfolio")));

const banned = /Copy Portfolio|Pelosi|Nancy|InsiderWave|Insider Wave|Capitol|smart money|copy.?trad/i;
check("no Copy Portfolio / Pelosi / InsiderWave strings", !banned.test(html) && !banned.test(port));

const homeJobFn = extractTopFn(src, "runHomeJob") + extractTopFn(src, "focusSizerForNextTrade");
check("Home job hero markup unchanged",
  html.includes('id="home-job-hero"')
  && html.includes('id="home-job-cta"')
  && html.includes('class="btn home-job-cta"'));
check("Home job function still reviews / replays / sizes",
  src.includes("function runHomeJob")
  && /job\.id === 'log'/.test(homeJobFn)
  && /job\.id === 'review'/.test(homeJobFn)
  && /job\.id === 'replay'/.test(homeJobFn)
  && /focusSizerForNextTrade/.test(homeJobFn));
check("Home still sizes CFD by default",
  src.includes("function focusSizerForNextTrade")
  && /focusSizerForNextTrade[\s\S]*cfd-instr/.test(homeJobFn));
check("guest still hides Home job and Portfolio CTA",
  css.includes("html.runnr-guest #home-job-hero")
  && css.includes("html.runnr-guest .port-cta-wrap"));
check("quiet mode still hides session wave, not the stack",
  css.includes("html.runnr-quiet .port-wave-card")
  && !/html\.runnr-quiet \.port-hero/.test(css)
  && !/html\.runnr-quiet #port-cta/.test(css));

check("Options Coach file is untouched by this stack", html.includes("js/options-coach.js?v=1"));
check("FVG strip file is untouched by this stack", html.includes("js/fvg-retrace.js?v=1"));
check("Home quiet helper cache-bust unchanged", html.includes("js/desk-quiet.js?v=2"));

void kpiBlock;

console.log("ok " + n);
