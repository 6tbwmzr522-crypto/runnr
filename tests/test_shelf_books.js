#!/usr/bin/env node
/** Smoke tests for Runnr Shelf named books. */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const shelfSrc = fs.readFileSync(path.join(root, "js/shelf.js"), "utf8");
const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");

function check(name, cond) {
  assert(cond, name);
}

const v = html.match(/var V = "(\d+)"/)[1];
const cache = sw.match(/CACHE = "runnr-v(\d+)"/)[1];
check("index.html V matches sw.js CACHE", v === cache);
check("shelf.js cache-busted at v=4", html.includes("js/shelf.js?v=4"));
check("desktop deck is six columns", html.includes("grid-template-columns:repeat(6,minmax(0,1fr))"));

const ctx = { window: {}, document: { getElementById: () => null } };
ctx.window = ctx;
vm.runInNewContext(shelfSrc, ctx);
const books = ctx.RunnrShelf.books();
check("six named books", books.length === 6);
check("Situational stays first (default selectedId fallback)", books[0].id === "situational");
check("Duquesne is not first", books[0].id !== "duquesne");

const dq = books.find((b) => b.id === "duquesne");
check("Duquesne book present", !!dq);
check("Duquesne manager", dq.manager === "Stanley Druckenmiller");
check("Duquesne legal", dq.legal === "Duquesne Family Office");
check("Duquesne filedCount is 95", dq.filedCount === 95);
check("Duquesne filedValue is $5.210860B", dq.filedValue === 5.21086e9);
check("Duquesne thesis is macro-first", dq.thesis.includes("leftover US longs"));
check("18 common-stock rows", dq.holdings.length === 18);
check("no option lines in Duquesne table", dq.holdings.every((h) => !/call|put/i.test(h.name + h.sym)));

const ntra = dq.holdings[0];
check("NTRA is top row", ntra.sym === "NTRA" && ntra.name === "Natera");
check("NTRA shares 3186306", ntra.shrs === 3186306);
check("NTRA value $864.923M", ntra.value === 864.923e6);

check("footnote omits Duquesne options and remaining names", /Duquesne options and the rest of the 95 names are omitted/.test(shelfSrc));
check("selectedId default is situational", /let selectedId = "situational"/.test(shelfSrc));

console.log("ok " + module.filename);
