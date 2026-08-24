/** Runnr session wave — mind traces from the journal. Portfolio owns the canvas. */
const RunnrWave = (() => {
  const SERIES = [
    { key: "patience", color: "#4da6ff", amp: 0.92, wobble: 1.15 },
    { key: "hesitation", color: "#eab308", amp: 0.62, wobble: 1.7 },
    { key: "process", color: "#00e5a0", amp: 1.0, wobble: 0.9 },
    { key: "heat", color: "#fb923c", amp: 0.7, wobble: 2.1 },
    { key: "tilt", color: "#ff4d6d", amp: 0.78, wobble: 1.4 },
  ];

  let playing = false;
  let cursor = 1;
  let raf = 0;
  let lastTs = 0;
  let model = emptyModel();

  function emptyModel() {
    return {
      samples: [],
      tickers: [],
      scores: { patience: 0, hesitation: 0, process: 0, heat: 0, tilt: 0 },
      coherence: 0,
      reading: 0,
      tier: "Novice",
      stopPct: 0,
      sizePct: 0,
      headline: "Log a close — the wave needs a session.",
      labels: [],
    };
  }

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  function mindOf(t, prev, maxAbs) {
    const stop = !!t.stopOk;
    const size = !!t.sizeOk;
    const incomplete = !!t.incomplete;
    const pnl = Number(t.pnl) || 0;
    const process = Math.round((stop ? 50 : 0) + (size ? 50 : 0));
    let tilt = 0;
    if (!stop) tilt += 55;
    if (prev && Number(prev.pnl) < 0 && Number(t.size) > Number(prev.size || 0)) tilt += 28;
    if (incomplete && !stop) tilt += 12;
    tilt = clamp(tilt, 0, 100);
    const hesitation = incomplete ? 72 : size ? 10 : 38;
    const patience = stop && !incomplete ? (pnl > 0 ? 100 : 76) : stop ? 48 : 16;
    const heat = maxAbs ? clamp(Math.round((Math.abs(pnl) / maxAbs) * 100), 4, 100) : 18;
    return { patience, hesitation, process, heat, tilt, instr: t.instr || "—", date: t.date || "", pnl };
  }

  function build(trades) {
    const list = (trades || []).filter((t) => t && !t.mergedAway && !t.disciplineOnly);
    const dated = list.slice().sort((a, b) => {
      const engine = typeof CoachEngine !== "undefined" ? CoachEngine : null;
      const da = engine?.tradeDate?.(a)?.getTime?.() || 0;
      const db = engine?.tradeDate?.(b)?.getTime?.() || 0;
      return da - db;
    });
    const maxAbs = Math.max(...dated.map((t) => Math.abs(Number(t.pnl) || 0)), 1);
    const samples = dated.map((t, i) => mindOf(t, dated[i - 1], maxAbs));
    const scores = { patience: 0, hesitation: 0, process: 0, heat: 0, tilt: 0 };
    if (samples.length) {
      SERIES.forEach((s) => {
        scores[s.key] = Math.round(samples.reduce((n, p) => n + p[s.key], 0) / samples.length);
      });
    }
    const engine = typeof CoachEngine !== "undefined" ? CoachEngine : null;
    const disc = engine?.disciplineScore?.(trades) || { overall: 0, tier: "Novice", stopPct: 0, sizePct: 0 };
    const coherence = samples.length
      ? clamp(Math.round(scores.process * 0.45 + scores.patience * 0.2 + (100 - scores.tilt) * 0.25 + (100 - scores.hesitation) * 0.1), 0, 100)
      : 0;
    const worst = samples.slice().sort((a, b) => b.tilt - a.tilt || a.process - b.process)[0];
    let headline = "Log a close — the wave needs a session.";
    if (worst && samples.length) {
      if (worst.tilt >= 40) headline = "Tilt on " + worst.instr + ". Process burned.";
      else if (scores.process >= 80) headline = "Process held across " + samples.length + " names.";
      else headline = worst.instr + " — keep the stop, keep the size.";
    }
    const tickers = [];
    const seen = {};
    dated.forEach((t) => {
      const n = String(t.instr || "").trim();
      if (!n || seen[n]) return;
      seen[n] = true;
      tickers.push(n);
    });
    model = {
      samples,
      tickers,
      scores,
      coherence,
      reading: disc.overall || coherence,
      tier: disc.tier || "Novice",
      stopPct: disc.stopPct || 0,
      sizePct: disc.sizePct || 0,
      headline,
      labels: samples.map((s) => ({ instr: s.instr, date: s.date })),
    };
    if (cursor > 1) cursor = 1;
    return model;
  }

  function atCursor() {
    const n = model.samples.length;
    if (!n) return model.scores;
    const idx = clamp(Math.round(cursor * (n - 1)), 0, n - 1);
    const slice = model.samples.slice(0, idx + 1);
    const scores = {};
    SERIES.forEach((s) => {
      scores[s.key] = Math.round(slice.reduce((n, p) => n + p[s.key], 0) / slice.length);
    });
    return scores;
  }

  function labelAtCursor() {
    const n = model.labels.length;
    if (!n) return "—";
    const idx = clamp(Math.round(cursor * (n - 1)), 0, n - 1);
    return model.labels[idx].date || model.labels[idx].instr || "—";
  }

  function paintCanvas(cvs, progress) {
    if (!cvs) return;
    const dpr = window.devicePixelRatio || 1;
    const cssW = cvs.clientWidth || 640;
    const cssH = cvs.clientHeight || 240;
    if (cvs.width !== Math.floor(cssW * dpr) || cvs.height !== Math.floor(cssH * dpr)) {
      cvs.width = Math.floor(cssW * dpr);
      cvs.height = Math.floor(cssH * dpr);
    }
    const ctx = cvs.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    const samples = model.samples;
    const mid = cssH * 0.52;
    const amp = cssH * 0.34;
    const shown = Math.max(2, Math.ceil(samples.length * progress) || 2);
    const light = document.body?.classList?.contains("light");

    ctx.strokeStyle = light ? "rgba(90,74,48,0.16)" : "rgba(201,169,110,0.12)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, mid);
    ctx.lineTo(cssW, mid);
    ctx.stroke();

    SERIES.forEach((s, si) => {
      ctx.beginPath();
      const n = Math.max(shown, 2);
      for (let i = 0; i < n; i++) {
        const p = samples[Math.min(i, samples.length - 1)] || { [s.key]: 40 };
        const x = (i / (n - 1)) * cssW;
        const v = (Number(p[s.key]) || 0) / 100;
        const wob = Math.sin(i * s.wobble + si * 0.7) * 0.12 + Math.sin(i * 0.35 + progress * 2) * 0.05;
        const y = mid - (v * 2 - 1) * amp * s.amp + wob * amp * 0.18;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = s.color;
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = s.key === "process" || s.key === "tilt" ? 2.1 : 1.35;
      ctx.stroke();
      ctx.globalAlpha = 0.08;
      ctx.lineTo(cssW, mid);
      ctx.lineTo(0, mid);
      ctx.closePath();
      ctx.fillStyle = s.color;
      ctx.fill();
      ctx.globalAlpha = 1;
    });

    if (samples.length) {
      ctx.font = "500 10px Jost, sans-serif";
      ctx.textAlign = "center";
      const n = Math.max(shown, 2);
      const used = {};
      samples.slice(0, shown).forEach((p, i) => {
        const name = p.instr;
        if (!name || used[name]) return;
        used[name] = true;
        const x = (i / Math.max(n - 1, 1)) * cssW;
        ctx.fillStyle = light ? "rgba(26,22,16,0.55)" : "rgba(245,242,236,0.55)";
        ctx.fillText(name, clamp(x, 28, cssW - 28), 16);
        ctx.strokeStyle = light ? "rgba(26,22,16,0.14)" : "rgba(245,242,236,0.18)";
        ctx.beginPath();
        ctx.moveTo(x, 22);
        ctx.lineTo(x, cssH - 8);
        ctx.stroke();
      });
    }

    const px = progress * cssW;
    ctx.strokeStyle = "rgba(232,201,122,0.7)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px, 8);
    ctx.lineTo(px, cssH - 8);
    ctx.stroke();
  }

  function paintUi() {
    const scores = atCursor();
    SERIES.forEach((s) => {
      const bar = document.getElementById("wave-bar-" + s.key);
      const val = document.getElementById("wave-val-" + s.key);
      if (bar) bar.style.width = (scores[s.key] || 0) + "%";
      if (val) val.textContent = String(scores[s.key] || 0);
    });
    const coh = document.getElementById("wave-coherence");
    if (coh) coh.textContent = String(model.coherence);
    const read = document.getElementById("wave-reading");
    if (read) read.textContent = String(model.reading);
    const tier = document.getElementById("wave-tier");
    if (tier) tier.textContent = "Tier · " + model.tier;
    const meta = document.getElementById("wave-read-meta");
    if (meta) meta.textContent = "Stop " + model.stopPct + "% · Size " + model.sizePct + "%";
    const head = document.getElementById("wave-headline");
    if (head) head.textContent = model.headline;
    const stamp = document.getElementById("wave-stamp");
    if (stamp) stamp.textContent = labelAtCursor();
    const ticks = document.getElementById("wave-tickers");
    if (ticks) {
      ticks.innerHTML = model.tickers.slice(0, 12).map((n) => {
        const s = String(n).replace(/[&<>"']/g, (c) => ({
          "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
        }[c]));
        return "<span>" + s + "</span>";
      }).join("");
    }
    const slider = document.getElementById("wave-slider");
    if (slider && document.activeElement !== slider) slider.value = String(Math.round(cursor * 1000));
    const btn = document.getElementById("wave-play");
    if (btn) btn.textContent = playing ? "Pause" : "Play";
    const cvs = document.getElementById("wave-canvas");
    paintCanvas(cvs, model.samples.length ? cursor : 1);
  }

  function tick(ts) {
    if (!playing) return;
    if (!lastTs) lastTs = ts;
    const dt = Math.min(0.05, (ts - lastTs) / 1000);
    lastTs = ts;
    cursor += dt * 0.12;
    if (cursor >= 1) {
      cursor = 1;
      playing = false;
    }
    paintUi();
    if (playing) raf = requestAnimationFrame(tick);
  }

  function play() {
    if (!model.samples.length) return;
    if (cursor >= 1) cursor = 0;
    playing = true;
    lastTs = 0;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(tick);
    paintUi();
  }

  function pause() {
    playing = false;
    cancelAnimationFrame(raf);
    paintUi();
  }

  function toggle() {
    if (playing) pause();
    else play();
  }

  function scrub(v) {
    cursor = clamp(Number(v) / 1000, 0, 1);
    pause();
  }

  function render(trades) {
    build(trades);
    cursor = 1;
    pause();
    paintUi();
  }

  function onResize() {
    paintUi();
  }

  return { render, toggle, scrub, pause, play, paintUi, onResize, model: () => model };
})();
window.RunnrWave = RunnrWave;
