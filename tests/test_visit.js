#!/usr/bin/env node
/** Anonymous visitor id: localStorage first, cookie only if storage is blocked, skip DNT/GPC. */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const root = path.join(__dirname, "..");
const src = fs.readFileSync(path.join(root, "js/visit.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");

function check(name, cond) {
  assert(cond, name);
}

const v = html.match(/var V = "(\d+)"/)[1];
const cache = sw.match(/CACHE = "runnr-v(\d+)"/)[1];
check("index.html V matches sw.js CACHE", v === cache);
check("home loads visit.js", html.includes("js/visit.js?v=2"));

function cookieJar() {
  const jar = {};
  return {
    get cookie() {
      return Object.keys(jar)
        .map((k) => k + "=" + jar[k])
        .join("; ");
    },
    set cookie(value) {
      const part = String(value).split(";")[0];
      const eq = part.indexOf("=");
      const name = part.slice(0, eq).trim();
      const raw = part.slice(eq + 1);
      const maxAge = /Max-Age=0/.test(value);
      if (!name) return;
      if (maxAge) delete jar[name];
      else jar[name] = raw;
    },
  };
}

function run(opts) {
  const store = Object.assign({}, opts.store || {});
  const hits = [];
  const doc = cookieJar();
  if (opts.cookie) doc.cookie = opts.cookie;
  const storage = opts.storage || {
    getItem(k) {
      return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null;
    },
    setItem(k, v) {
      store[k] = String(v);
    },
  };
  const ctx = {
    navigator: Object.assign(
      {
        userAgent: "node",
        sendBeacon(url) {
          hits.push(url);
          return true;
        },
      },
      opts.navigator || {}
    ),
    location: { protocol: opts.protocol || "https:", hostname: "runnr.fyi" },
    document: doc,
    localStorage: storage,
    crypto: {
      randomUUID() {
        return "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
      },
    },
    fetch() {},
  };
  ctx.window = ctx;
  vm.runInNewContext(src, ctx);
  return { hits, store, cookie: doc.cookie, visit: ctx.RunnrVisit };
}

const fresh = run({});
check("beacon includes guest id", fresh.hits.length === 1 && /[?&]g=aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/.test(fresh.hits[0]));
check("id is stored in localStorage", fresh.store.runnr_vid === "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
check("localStorage path does not set a cookie", fresh.cookie === "");

const again = run({ store: { runnr_vid: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" } });
check("same id is reused", /g=aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/.test(again.hits[0]));

const dnt = run({ navigator: { doNotTrack: "1" } });
check("DNT sends no beacon", dnt.hits.length === 0);
check("DNT writes no id", dnt.store.runnr_vid === undefined);
check("DNT guestId is empty", dnt.visit.guestId() === "");
check("DNT still writes nothing after guestId()", dnt.store.runnr_vid === undefined);

const gpc = run({ navigator: { globalPrivacyControl: true } });
check("GPC sends no beacon", gpc.hits.length === 0);
check("GPC writes no id", gpc.store.runnr_vid === undefined);

const blocked = run({
  storage: {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
  },
});
check("blocked storage falls back to a cookie", /runnr_vid=aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/.test(blocked.cookie));
check("cookie id is on the beacon", /g=aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/.test(blocked.hits[0]));

const fromCookie = run({
  cookie: "runnr_vid=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
});
check("cookie id is copied into localStorage", fromCookie.store.runnr_vid === "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
check("cookie is cleared once localStorage works", fromCookie.cookie === "");
check("beacon uses the cookie id", /g=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/.test(fromCookie.hits[0]));

console.log("test_visit: ok");
