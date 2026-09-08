"use strict";
/**
 * Concatenate index.html + every js/*.js and css/*.css the PWA loads so
 * source-level checks still work after the inline-script / stylesheet extract.
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

  const stylesheets = [];
  const cssRe = /<link rel="stylesheet" href="(css\/[^"?]+)(?:\?[^"]*)?"/g;
  while ((m = cssRe.exec(html))) stylesheets.push(m[1]);
  const inlineCss = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((x) => x[1]).join("\n");
  const css = stylesheets.map(read).join("\n") + (inlineCss ? "\n" + inlineCss : "");
  return {
    root,
    html,
    sw,
    js,
    css,
    src: html + "\n" + js,
    scripts: srcs,
    stylesheets,
  };
}

module.exports = { root, read, loadAppSource };
