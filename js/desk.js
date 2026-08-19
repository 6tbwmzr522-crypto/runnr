/**
 * Runnr Terminal — Pro market canvas.
 * Universe = watchlist equities. Quotes via /api/v1/desk (Alpaca IEX when connected).
 */
const RunnrDesk = (() => {
  const TOKEN_KEY = "runnr_api_token";
  let timer = null;
  let clockTimer = null;
  let focus = "";
  let rows = [];
  let bars = [];
  let source = "";
  let alpaca = false;
  let alive = false;

  function apiBase() {
    return (window.RunnrSync && RunnrSync.apiBase()) || "https://api.runnr.fyi";
  }
  function authHeaders() {
    const h = { Accept: "application/json" };
    try {
      const t = localStorage.getItem(TOKEN_KEY);
      if (t) h.Authorization = "Bearer " + t;
    } catch (e) {}
    return h;
  }
  function esc(s) {
    return String(s || "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c]));
  }

  function brandTitle() {
    if (window.RunnrSync && typeof RunnrSync.terminalTitle === "function") {
      return RunnrSync.terminalTitle();
    }
    return "Terminal";
  }
  function cls(pct) {
    return pct > 0.02 ? "desk-up" : pct < -0.02 ? "desk-dn" : "";
  }
  function fmt(n, d) {
    if (n == null || isNaN(n)) return "—";
    return Number(n).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function fmtChg(n) {
    if (n == null || isNaN(n)) return "—";
    const s = n > 0 ? "+" : "";
    return s + fmt(n, Math.abs(n) < 1 ? 3 : 2);
  }
  function fmtPct(n) {
    if (n == null || isNaN(n)) return "—";
    const s = n > 0 ? "+" : "";
    return s + Number(n).toFixed(2) + "%";
  }

  function isEquity(sym) {
    const s = String(sym || "").toUpperCase();
    if (!s) return false;
    if (s.includes("/") || s.includes("=") || s.endsWith("-USD")) return false;
    if (/^[A-Z]{6}$/.test(s)) return false;
    return /^[A-Z.]{1,6}$/.test(s);
  }

  function universe() {
    const w = (window.S && S.watchlist) || [];
    const fromWatch = w
      .map((x) => String(x.quoteSym || x.sym || "").toUpperCase())
      .filter(isEquity);
    const uniq = [...new Set(fromWatch)];
    return uniq.length ? uniq : ["AAPL", "MSFT", "NVDA", "META", "GOOGL"];
  }

  async function getJson(path) {
    const res = await fetch(apiBase() + path, { headers: authHeaders(), cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  }

  function root() {
    return document.getElementById("desk-root");
  }

  function tickClock() {
    const el = document.getElementById("desk-clock");
    if (!el) return;
    const n = new Date();
    el.textContent = n.toISOString().slice(11, 19) + "Z";
  }

  function sma(series, n) {
    const out = new Array(series.length).fill(null);
    let sum = 0;
    for (let i = 0; i < series.length; i++) {
      sum += Number(series[i].c);
      if (i >= n) sum -= Number(series[i - n].c);
      if (i >= n - 1) out[i] = sum / n;
    }
    return out;
  }

  function drawChart(canvas, series) {
    if (!canvas || !series.length) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 320;
    const h = canvas.clientHeight || 220;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const UP = "#00e5a0";
    const DN = "#e85d6f";
    const n = series.length;
    const padL = 8;
    const padR = 46;
    const padT = 8;
    const padB = 4;
    const volH = Math.max(32, Math.floor(h * 0.2));
    const gap = 10;
    const priceH = Math.max(80, h - padT - padB - volH - gap);
    const plotW = Math.max(40, w - padL - padR);
    const slot = plotW / n;
    const bodyW = Math.max(2, Math.min(7, slot * 0.62));
    const ma20 = sma(series, 20);
    const ma50 = sma(series, 50);

    let lo = Infinity;
    let hi = -Infinity;
    let vmax = 0;
    series.forEach((b, i) => {
      const o = b.o != null ? b.o : b.c;
      const hh = b.h != null ? b.h : Math.max(o, b.c);
      const ll = b.l != null ? b.l : Math.min(o, b.c);
      lo = Math.min(lo, ll);
      hi = Math.max(hi, hh);
      if (ma20[i] != null) { lo = Math.min(lo, ma20[i]); hi = Math.max(hi, ma20[i]); }
      if (ma50[i] != null) { lo = Math.min(lo, ma50[i]); hi = Math.max(hi, ma50[i]); }
      vmax = Math.max(vmax, b.v || 0);
    });
    const padPx = (hi - lo) * 0.08 || 1;
    lo -= padPx;
    hi += padPx;
    const span = hi - lo || 1;

    function yPrice(v) {
      return padT + (1 - (v - lo) / span) * priceH;
    }
    function xAt(i) {
      return padL + slot * (i + 0.5);
    }

    ctx.strokeStyle = "rgba(201,169,110,0.12)";
    ctx.lineWidth = 1;
    ctx.font = "10px Jost, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    for (let g = 0; g <= 4; g++) {
      const y = padT + (priceH * g) / 4;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(w - padR, y);
      ctx.stroke();
      const val = hi - (span * g) / 4;
      ctx.fillStyle = "rgba(245,242,236,0.38)";
      ctx.fillText(val.toFixed(val >= 100 ? 1 : 2), w - padR + 5, y);
    }

    series.forEach((b, i) => {
      const o = b.o != null ? b.o : b.c;
      const c = b.c;
      const hh = b.h != null ? b.h : Math.max(o, c);
      const ll = b.l != null ? b.l : Math.min(o, c);
      const up = c >= o;
      const col = up ? UP : DN;
      const x = xAt(i);
      ctx.strokeStyle = col;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, yPrice(hh));
      ctx.lineTo(x, yPrice(ll));
      ctx.stroke();
      const top = yPrice(Math.max(o, c));
      const bot = yPrice(Math.min(o, c));
      ctx.fillStyle = col;
      ctx.fillRect(x - bodyW / 2, top, bodyW, Math.max(1, bot - top));
    });

    function strokeMa(arr, color, width) {
      ctx.beginPath();
      let started = false;
      arr.forEach((v, i) => {
        if (v == null) return;
        const x = xAt(i);
        const y = yPrice(v);
        if (!started) { ctx.moveTo(x, y); started = true; }
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.stroke();
    }
    strokeMa(ma20, "#C9A96E", 1.5);
    strokeMa(ma50, "rgba(245,242,236,0.38)", 1.2);

    const volTop = padT + priceH + gap;
    series.forEach((b, i) => {
      const o = b.o != null ? b.o : b.c;
      const up = b.c >= o;
      const vh = vmax ? ((b.v || 0) / vmax) * volH : 0;
      const x = xAt(i);
      ctx.fillStyle = up ? "rgba(0,229,160,0.4)" : "rgba(232,93,111,0.4)";
      ctx.fillRect(x - bodyW / 2, volTop + volH - Math.max(1, vh), bodyW, Math.max(1, vh));
    });

    ctx.fillStyle = "rgba(201,169,110,0.85)";
    ctx.font = "9px Jost, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("MA20", padL, padT);
    ctx.fillStyle = "rgba(245,242,236,0.4)";
    ctx.fillText("MA50", padL + 42, padT);
  }

  function render() {
    const el = root();
    if (!el) return;
    const eqRows = rows.filter((r) => r.kind !== "METAL");
    const metal = rows.find((r) => r.kind === "METAL");
    const focusRow = eqRows.find((r) => r.sym === focus) || eqRows[0];
    if (focusRow && !focus) focus = focusRow.sym;

    const tapeBits = rows
      .map((r) => {
        const on = r.sym === focus ? " on" : "";
        return (
          `<button type="button" class="tick${on}" data-sym="${r.sym}">` +
          `<div class="k">${r.sym}</div>` +
          `<div class="v num">${fmt(r.last, r.sym === "XAU" ? 2 : 2)}</div>` +
          `<div class="chg ${cls(r.chgPct)}">${fmtChg(r.chg)} (${fmtPct(r.chgPct)})</div>` +
          `</button>`
        );
      })
      .join("");

    const heatBits = eqRows
      .map((r) => {
        const tone = r.chgPct > 0.02 ? "up" : r.chgPct < -0.02 ? "dn" : "";
        const on = r.sym === focus ? " on" : "";
        return (
          `<button type="button" class="desk-cell ${tone}${on}" data-sym="${r.sym}">` +
          `<div class="k">${r.sym}</div>` +
          `<div class="v">${fmt(r.last, 2)}</div>` +
          `<div class="p ${cls(r.chgPct)}">${fmtPct(r.chgPct)}</div>` +
          `</button>`
        );
      })
      .join("");

    const lastBar = bars[bars.length - 1];
    const firstBar = bars[0];
    const chip = alpaca ? "chip live" : "chip";
    const chipText = alpaca ? "ALPACA IEX" : "LIVE";
    const goldNote = metal ? ` · XAU ${fmt(metal.last, 2)} spot` : "";

    el.innerHTML =
      `<div class="desk-cmd">` +
      `<button type="button" class="back" id="desk-back">← Runnr</button>` +
      `<div class="brand">${esc(brandTitle())}</div>` +
      `<span class="${chip}">${chipText}</span>` +
      `<span class="src" title="${source}">${source || "—"}${goldNote}</span>` +
      `<span class="clock" id="desk-clock"></span>` +
      `</div>` +
      `<div class="desk-tape">${tapeBits || '<div class="desk-empty">No tape yet</div>'}</div>` +
      `<div class="desk-grid">` +
      `<section class="desk-panel">` +
      `<h4>Watchlist heatmap</h4>` +
      `<div class="desk-heat">${heatBits || '<div class="desk-empty">Add equity setups on Watch to populate the Terminal.</div>'}</div>` +
      `</section>` +
      `<section class="desk-panel">` +
      `<h4>Focus · 60 sessions · ${focus || "—"} · candles</h4>` +
      `<div class="desk-chart-box"><canvas id="desk-chart" style="width:100%;height:100%"></canvas></div>` +
      `<div class="desk-chart-meta">${
        lastBar
          ? `${bars.length} sessions ${firstBar.d} → ${lastBar.d} · O ${fmt(lastBar.o ?? lastBar.c, 2)} H ${fmt(lastBar.h ?? lastBar.c, 2)} L ${fmt(lastBar.l ?? lastBar.c, 2)} C ${fmt(lastBar.c, 2)}` +
            (focusRow ? ` · ${fmtPct(focusRow.chgPct)} today` : "") +
            " · MA20 gold · MA50 · volume"
          : "Loading chart…"
      }</div>` +
      `</section>` +
      `</div>`;

    const back = document.getElementById("desk-back");
    if (back) back.onclick = () => window.switchPage("watchlist");
    el.querySelectorAll("[data-sym]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const sym = btn.getAttribute("data-sym");
        if (!sym || sym === "XAU") return;
        focus = sym;
        loadBars(sym).then(render);
        render();
      });
    });
    tickClock();
    requestAnimationFrame(() => {
      const c = document.getElementById("desk-chart");
      if (c) drawChart(c, bars);
    });
  }

  async function loadSnap() {
    const syms = universe();
    if (!focus || !syms.includes(focus)) focus = syms[0];
    const j = await getJson("/api/v1/desk/snapshot?symbols=" + encodeURIComponent(syms.join(",")));
    rows = j.rows || [];
    source = j.source || "";
    alpaca = !!j.alpaca;
  }

  async function loadBars(sym) {
    const j = await getJson("/api/v1/desk/bars/" + encodeURIComponent(sym || focus || "AAPL"));
    bars = j.bars || [];
    if (j.source && !source.includes(j.source)) source = (source ? source + " · " : "") + j.source;
  }

  async function refresh() {
    if (!alive) return;
    try {
      await loadSnap();
      await loadBars(focus);
      render();
    } catch (e) {
      const el = root();
      if (el && !rows.length) {
        el.innerHTML =
          `<div class="desk-cmd"><button type="button" class="back" id="desk-back">← Runnr</button>` +
          `<div class="brand">${esc(brandTitle())}</div></div>` +
          `<div class="desk-empty">Terminal could not reach the quote API. Check sign-in / network, then retry.</div>`;
        const back = document.getElementById("desk-back");
        if (back) back.onclick = () => window.switchPage("watchlist");
      }
    }
  }

  function enter() {
    if (timer) { clearInterval(timer); timer = null; }
    if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
    alive = true;
    const app = document.getElementById("app");
    if (app) app.classList.add("desk-wide");
    render();
    refresh();
    timer = setInterval(refresh, 45000);
    clockTimer = setInterval(tickClock, 1000);
  }

  function leave() {
    alive = false;
    const app = document.getElementById("app");
    if (app) app.classList.remove("desk-wide");
    if (timer) { clearInterval(timer); timer = null; }
    if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
  }

  async function open() {
    if (typeof window.requirePro === "function") {
      const ok = await window.requirePro("Terminal", { skipEmail: true });
      if (!ok) return;
    }
    if (window.RunnrSync && RunnrSync.isLoggedIn && RunnrSync.isLoggedIn()) {
      const existing = window.S && window.S.firstName;
      const house = typeof RunnrSync.houseFirstName === "function"
        ? RunnrSync.houseFirstName(RunnrSync.sessionEmail())
        : "";
      const n = (typeof RunnrSync.normalizeFirstName === "function"
        ? RunnrSync.normalizeFirstName(existing || house)
        : (existing || house));
      if (n && window.S && !window.S.firstName) {
        if (typeof RunnrSync.applyFirstName === "function") RunnrSync.applyFirstName(n);
        else window.S.firstName = n;
        if (typeof RunnrSync.updateFirstName === "function") {
          RunnrSync.updateFirstName(n).catch(() => {});
        }
      }
    }
    window.switchPage("desk");
  }

  return { open, enter, leave, refresh };
})();
window.RunnrDesk = RunnrDesk;
