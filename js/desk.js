/**
 * Runnr Desk — Pro market canvas.
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

  function drawChart(canvas, series) {
    if (!canvas || !series.length) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 320;
    const h = canvas.clientHeight || 180;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const ys = series.map((b) => b.c);
    const min = Math.min.apply(null, ys);
    const max = Math.max.apply(null, ys);
    const span = max - min || 1;
    const pad = 8;
    ctx.beginPath();
    series.forEach((b, i) => {
      const x = pad + (i / Math.max(series.length - 1, 1)) * (w - pad * 2);
      const y = h - pad - ((b.c - min) / span) * (h - pad * 2);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    const up = series[series.length - 1].c >= series[0].c;
    ctx.strokeStyle = up ? "#00e5a0" : "#e85d6f";
    ctx.lineWidth = 1.6;
    ctx.stroke();
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
      `<div class="brand">desk://runnr</div>` +
      `<span class="${chip}">${chipText}</span>` +
      `<span class="src" title="${source}">${source || "—"}${goldNote}</span>` +
      `<span class="clock" id="desk-clock"></span>` +
      `</div>` +
      `<div class="desk-tape">${tapeBits || '<div class="desk-empty">No tape yet</div>'}</div>` +
      `<div class="desk-grid">` +
      `<section class="desk-panel">` +
      `<h4>Watchlist heatmap</h4>` +
      `<div class="desk-heat">${heatBits || '<div class="desk-empty">Add equity setups on Watch to populate Desk.</div>'}</div>` +
      `</section>` +
      `<section class="desk-panel">` +
      `<h4>Focus · 60 sessions · ${focus || "—"}</h4>` +
      `<div class="desk-chart-box"><canvas id="desk-chart" style="width:100%;height:100%"></canvas></div>` +
      `<div class="desk-chart-meta">${
        lastBar
          ? `${bars.length} sessions ${firstBar.d} → ${lastBar.d} · last ${fmt(lastBar.c, 2)}` +
            (focusRow ? ` · ${fmtPct(focusRow.chgPct)} today` : "")
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
          `<div class="brand">desk://runnr</div></div>` +
          `<div class="desk-empty">Desk could not reach the quote API. Check sign-in / network, then retry.</div>`;
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
      const ok = await window.requirePro("Desk", { skipEmail: true });
      if (!ok) return;
    }
    window.switchPage("desk");
  }

  return { open, enter, leave, refresh };
})();
window.RunnrDesk = RunnrDesk;
