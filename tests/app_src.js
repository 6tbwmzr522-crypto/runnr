"use strict";
/**
 * Concatenate index.html + every js/*.js the PWA loads so source-level
 * checks still work after the inline-script extract.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function loadAppSource() {
  const html = read("index.html");
  const sw = read("sw.js");
  const srcs = [];
  const re = /<script src="(js\/[^"?]+)(?:\?[^"]*)?"/g;
  let m;
  while ((m = re.exec(html))) srcs.push(m[1]);
  const js = srcs.map(read).join("\n");
  return { root, html, sw, js, src: html + "\n" + js, scripts: srcs };
}

module.exports = { root, read, loadAppSource };
