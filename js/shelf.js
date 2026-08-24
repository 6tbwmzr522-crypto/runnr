/** Runnr Shelf — named books (disclosed longs) + your journal. */
const RunnrShelf = (() => {
  /** Q2 2026 13F longs, as of 30 Jun, filed 14 Aug. Not a live scrape. Not fund NAV. */
  const BOOKS = [
    {
      id: "situational",
      short: "Situational",
      manager: "Leopold Aschenbrenner",
      legal: "Situational Awareness LP",
      thesis: "The AI physical stack — memory, power, compute.",
      filedCount: 23,
      filedValue: 20.17e9,
      sleeves: true,
      holdings: [
        { sym: "SNDK", name: "SanDisk", shrs: 2495344, value: 5.67e9, sleeve: "semi" },
        { sym: "MU", name: "Micron Technology", shrs: 4828786, value: 5.57e9, sleeve: "semi" },
        { sym: "BE", name: "Bloom Energy", shrs: 6272808, value: 1.90e9, sleeve: "energy" },
        { sym: "TSM", name: "Taiwan Semiconductor", shrs: 2649035, value: 1.27e9, sleeve: "semi" },
        { sym: "NBIS", name: "Nebius Group", shrs: 4464260, value: 1.23e9, sleeve: "ai" },
        { sym: "CRWV", name: "CoreWeave", shrs: 7479558, value: 744.52e6, sleeve: "ai" },
        { sym: "CORZ", name: "Core Scientific", shrs: 26008473, value: 665.56e6, sleeve: "energy" },
        { sym: "STM", name: "STMicroelectronics", shrs: 7802700, value: 584.34e6, sleeve: "semi" },
        { sym: "APLD", name: "Applied Digital", shrs: 15384616, value: 469.02e6, sleeve: "ai" },
        { sym: "RIOT", name: "Riot Platforms", shrs: 17100000, value: 468.20e6, sleeve: "energy" },
        { sym: "IREN", name: "IREN Limited", shrs: 9474099, value: 433.25e6, sleeve: "energy" },
        { sym: "CLSK", name: "CleanSpark", shrs: 12276139, value: 178.62e6, sleeve: "energy" },
        { sym: "SOI", name: "Solaris Energy", shrs: 1129621, value: 90.89e6, sleeve: "energy" },
        { sym: "BTDR", name: "Bitdeer", shrs: 3439450, value: 54.58e6, sleeve: "ai" },
        { sym: "TE", name: "T1 Energy", shrs: 4900000, value: 46.45e6, sleeve: "energy" },
        { sym: "HIVE", name: "HIVE Digital", shrs: 9133726, value: 33.25e6, sleeve: "energy" },
        { sym: "BW", name: "Babcock & Wilcox", shrs: 2027451, value: 28.59e6, sleeve: "energy" },
        { sym: "PUMP", name: "ProPetro", shrs: 1960382, value: 28.11e6, sleeve: "energy" },
        { sym: "VSH", name: "Vishay", shrs: 375000, value: 20.17e6, sleeve: "semi" },
      ],
    },
    {
      id: "berkshire",
      short: "Berkshire",
      manager: "Warren Buffett",
      legal: "Berkshire Hathaway",
      thesis: "Operating earnings first — the public book is the remainder.",
      filedCount: 29,
      filedValue: 299.25e9,
      holdings: [
        { sym: "AAPL", name: "Apple", shrs: 227917808, value: 65.95e9 },
        { sym: "AXP", name: "American Express", shrs: 151610700, value: 51.28e9 },
        { sym: "KO", name: "Coca-Cola", shrs: 400000000, value: 32.51e9 },
        { sym: "GOOGL", name: "Alphabet Class A", shrs: 78791167, value: 28.16e9 },
        { sym: "BAC", name: "Bank of America", shrs: 483394015, value: 27.54e9 },
        { sym: "CVX", name: "Chevron", shrs: 84375856, value: 13.99e9 },
        { sym: "OXY", name: "Occidental Petroleum", shrs: 264941431, value: 12.87e9 },
        { sym: "CB", name: "Chubb", shrs: 34249183, value: 11.67e9 },
        { sym: "MCO", name: "Moody's", shrs: 24669778, value: 11.17e9 },
        { sym: "GOOG", name: "Alphabet Class C", shrs: 27188433, value: 9.61e9 },
        { sym: "KHC", name: "Kraft Heinz", shrs: 325634818, value: 7.69e9 },
        { sym: "DVA", name: "DaVita", shrs: 28880209, value: 6.43e9 },
        { sym: "DAL", name: "Delta Air Lines", shrs: 57320000, value: 5.37e9 },
        { sym: "SIRI", name: "SiriusXM", shrs: 124807117, value: 3.69e9 },
        { sym: "VRSN", name: "Verisign", shrs: 8989880, value: 2.26e9 },
      ],
    },
    {
      id: "pershing",
      short: "Pershing",
      manager: "Bill Ackman",
      legal: "Pershing Square",
      thesis: "Concentrated quality — platforms and compounders.",
      filedCount: 15,
      filedValue: 19.47e9,
      holdings: [
        { sym: "UBER", name: "Uber", shrs: 34326200, value: 2.48e9 },
        { sym: "BN", name: "Brookfield", shrs: 57481047, value: 2.45e9 },
        { sym: "MSFT", name: "Microsoft", shrs: 6206730, value: 2.32e9 },
        { sym: "AMZN", name: "Amazon", shrs: 8563857, value: 2.04e9 },
        { sym: "HHH", name: "Howard Hughes", shrs: 27852064, value: 1.993e9 },
        { sym: "QSR", name: "Restaurant Brands", shrs: 25821284, value: 1.87e9 },
        { sym: "META", name: "Meta", shrs: 3196062, value: 1.80e9 },
        { sym: "V", name: "Visa", shrs: 3270470, value: 1.12e9 },
        { sym: "MA", name: "Mastercard", shrs: 2124646, value: 1.09e9 },
        { sym: "SPGI", name: "S&P Global", shrs: 2593155, value: 1.06e9 },
        { sym: "NFLX", name: "Netflix", shrs: 13081465, value: 934e6 },
        { sym: "SEG", name: "Seaport Entertainment", shrs: 5023780, value: 133.6e6 },
        { sym: "HTZ", name: "Hertz", shrs: 14991599, value: 34e6 },
      ],
    },
    {
      id: "appaloosa",
      short: "Appaloosa",
      manager: "David Tepper",
      legal: "Appaloosa LP",
      thesis: "Cyclicals and platforms — size what the tape will pay.",
      filedCount: 27,
      filedValue: 7.73e9,
      holdings: [
        { sym: "AMZN", name: "Amazon", shrs: 5000000, value: 1.1917e9 },
        { sym: "MU", name: "Micron Technology", shrs: 975000, value: 1.13e9 },
        { sym: "TSM", name: "Taiwan Semiconductor", shrs: 1650000, value: 788e6 },
        { sym: "GOOG", name: "Alphabet Class C", shrs: 1850000, value: 653.66e6 },
        { sym: "UBER", name: "Uber", shrs: 7700000, value: 555.2e6 },
        { sym: "EWY", name: "iShares MSCI South Korea", shrs: 2400000, value: 489.6e6 },
        { sym: "META", name: "Meta", shrs: 675000, value: 380.2e6 },
        { sym: "VST", name: "Vistra", shrs: 2200000, value: 351.4e6 },
        { sym: "NVDA", name: "NVIDIA", shrs: 1500000, value: 305.1e6 },
        { sym: "NRG", name: "NRG Energy", shrs: 1800000, value: 257.1e6 },
        { sym: "BABA", name: "Alibaba", shrs: 2000000, value: 191.96e6 },
        { sym: "BA", name: "Boeing", shrs: 800000, value: 173.176e6 },
        { sym: "LRCX", name: "Lam Research", shrs: 382500, value: 165.7e6 },
        { sym: "BIDU", name: "Baidu", shrs: 1295000, value: 148.006e6 },
        { sym: "AAL", name: "American Airlines", shrs: 7500000, value: 135.525e6 },
        { sym: "AMD", name: "AMD", shrs: 197500, value: 114.73e6 },
        { sym: "CRWV", name: "CoreWeave", shrs: 1100000, value: 107.3e6 },
        { sym: "ASML", name: "ASML", shrs: 50000, value: 99.472e6 },
        { sym: "AVGO", name: "Broadcom", shrs: 150000, value: 56.7e6 },
        { sym: "QCOM", name: "Qualcomm", shrs: 250000, value: 46.2e6 },
      ],
    },
    {
      id: "icahn",
      short: "Icahn",
      manager: "Carl Icahn",
      legal: "Icahn Capital",
      thesis: "Control, energy, and the names he already runs.",
      filedCount: 12,
      filedValue: 8.26e9,
      holdings: [
        { sym: "IEP", name: "Icahn Enterprises", shrs: 618393343, value: 4.4586e9 },
        { sym: "CVI", name: "CVR Energy", shrs: 71201875, value: 1.9609e9 },
        { sym: "UAN", name: "CVR Partners", shrs: 4164274, value: 464.23e6 },
        { sym: "CTRI", name: "Centuri Holdings", shrs: 14336044, value: 433.52e6 },
        { sym: "IFF", name: "IFF", shrs: 4275000, value: 338.67e6 },
        { sym: "SATS", name: "EchoStar", shrs: 1404542, value: 142.56e6 },
        { sym: "JBLU", name: "JetBlue", shrs: 20658179, value: 118.37e6 },
        { sym: "MNRO", name: "Monro", shrs: 5078573, value: 86.89e6 },
        { sym: "CZR", name: "Caesars", shrs: 2440109, value: 73.64e6 },
        { sym: "SD", name: "SandRidge Energy", shrs: 5054907, value: 69.25e6 },
        { sym: "AEP", name: "American Electric Power", shrs: 434710, value: 59.5e6 },
        { sym: "BLCO", name: "Bausch + Lomb", shrs: 3500000, value: 58e6 },
      ],
    },
  ];

  const SLEEVES = [
    { id: "all", label: "All" },
    { id: "semi", label: "Semiconductors" },
    { id: "ai", label: "AI infrastructure" },
    { id: "energy", label: "Energy" },
  ];

  let tab = "shelf";
  let selectedId = "situational";
  let sleeve = "all";
  let pulling = false;

  function esc(s) {
    return String(s || "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function bookOf(id) {
    return BOOKS.find((b) => b.id === id) || BOOKS[0];
  }

  function normSym(s) {
    return String(s || "").replace(/\s+CFD$/i, "").trim().toUpperCase();
  }

  function yourBook() {
    const pnl = {};
    const names = {};
    (window.S?.trades || []).forEach((t) => {
      if (!t || t.mergedAway || t.disciplineOnly) return;
      const key = normSym(t.instr || t.sym);
      if (!key) return;
      const n = window.Baron?.resolveTradePnl?.(t);
      const v = n != null ? n : Number(t.pnl);
      if (Number.isFinite(v)) pnl[key] = (pnl[key] || 0) + v;
      names[key] = t.instr || t.sym || key;
    });
    (window.S?.watchlist || []).forEach((w) => {
      if (!w || (typeof isFactoryDemoWatchItem === "function" && isFactoryDemoWatchItem(w))) return;
      const key = normSym(w.sym);
      if (!key || pnl[key] != null) return;
      names[key] = w.sym;
      pnl[key] = null;
    });
    return { pnl, names };
  }

  function mark(sym) {
    const lp = window.liveprices && window.liveprices[sym];
    if (!lp || !lp.price || String(lp.timestamp || "").endsWith(" est")) return null;
    return lp;
  }

  function usd(n, digits) {
    if (n == null || !isFinite(n)) return "—";
    const abs = Math.abs(n);
    if (abs >= 1e9) return "$" + (n / 1e9).toFixed(digits != null ? digits : abs >= 10e9 ? 1 : 2) + "B";
    if (abs >= 1e6) return "$" + (n / 1e6).toFixed(digits != null ? digits : abs >= 100e6 ? 1 : 2) + "M";
    if (abs >= 1000) return "$" + Math.round(n).toLocaleString();
    return "$" + n.toFixed(2);
  }

  function money(n) {
    const sym = (window.S && S.sym) || "€";
    if (n == null || !isFinite(n)) return "—";
    const sign = n > 0 ? "+" : n < 0 ? "−" : "";
    return sign + sym + Math.round(Math.abs(n)).toLocaleString();
  }

  function pct(n) {
    if (n == null || !isFinite(n)) return "—";
    const sign = n > 0 ? "+" : "";
    return sign + n.toFixed(1) + "%";
  }

  function shrsFmt(n) {
    if (!n) return "—";
    if (n >= 1e6) return (n / 1e6).toFixed(n >= 10e6 ? 1 : 2) + "M";
    return Math.round(n).toLocaleString();
  }

  function liveBookPct(book) {
    let filed = 0;
    let marked = 0;
    let covered = 0;
    book.holdings.forEach((h) => {
      const m = mark(h.sym);
      if (!m) return;
      filed += h.value;
      marked += m.price * h.shrs;
      covered += 1;
    });
    if (!filed || !covered) return { pct: null, covered: 0, n: book.holdings.length };
    return { pct: ((marked - filed) / filed) * 100, covered, n: book.holdings.length };
  }

  function top5Pct(book) {
    const total = book.filedValue || book.holdings.reduce((s, h) => s + h.value, 0);
    const top = book.holdings.slice().sort((a, b) => b.value - a.value).slice(0, 5);
    return total ? (top.reduce((s, h) => s + h.value, 0) / total) * 100 : 0;
  }

  function sharedRow(book, yours) {
    const hit = book.holdings.find((h) => Object.prototype.hasOwnProperty.call(yours.pnl, h.sym));
    if (!hit) return null;
    return { holding: hit, pnl: yours.pnl[hit.sym], label: yours.names[hit.sym] || hit.sym };
  }

  function classOf(t) {
    const type = String(t.type || "").toLowerCase();
    if (type === "cfd" || /cfd/i.test(t.instr || t.sym || "")) return "CFD";
    if (type === "crypto" || /usd$|btc|eth/i.test(t.instr || t.sym || "")) return "CRYPTO";
    if (type === "option" || /[CP]\d{6,}/.test(String(t.instr || t.sym || "").toUpperCase())) return "OPTION";
    return "SH";
  }

  function journalRows() {
    const out = [];
    (window.S?.trades || []).forEach((t) => {
      if (!t || t.mergedAway || t.disciplineOnly) return;
      const open = window.Baron?.isOpenTrade?.(t);
      const size = Number(t.size);
      const px = Number(t.exit) || Number(t.entry) || 0;
      out.push({
        date: t.date || "—",
        issuer: String(t.instr || t.sym || "—").trim() || "—",
        klass: classOf(t),
        shrs: Number.isFinite(size) && size ? size : "—",
        value: size && px ? size * px : null,
        side: (t.dir || "").toUpperCase() || "—",
        disc: t.stopOk && t.sizeOk ? "SOLE" : t.incomplete ? "DFND" : (t.stopOk || t.sizeOk) ? "SHARED" : "OTR",
        status: open ? "OPEN" : "CLOSED",
      });
    });
    (window.S?.watchlist || []).forEach((w) => {
      if (!w || (typeof isFactoryDemoWatchItem === "function" && isFactoryDemoWatchItem(w))) return;
      out.push({
        date: "WATCH",
        issuer: String(w.sym || "—").trim(),
        klass: classOf(w),
        shrs: "—",
        value: null,
        side: (w.dir || "").toUpperCase() || "LONG",
        disc: Number(w.stop) && Number(w.target) ? "SOLE" : "DFND",
        status: "DECLARED",
      });
    });
    return out;
  }

  async function pullMarks(book) {
    if (typeof fetchYahooChart !== "function") return;
    const need = [...new Set((book ? [book] : BOOKS).flatMap((b) => b.holdings.map((h) => h.sym)))];
    const missing = need.filter((s) => !mark(s));
    if (!missing.length) return;
    pulling = true;
    try {
      for (let i = 0; i < missing.length; i += 8) {
        const slice = missing.slice(i, i + 8);
        await Promise.all(slice.map(async (sym) => {
          try {
            const json = await fetchYahooChart(sym, "1d", "5d");
            const result = json && json.chart && json.chart.result && json.chart.result[0];
            const meta = result && result.meta;
            if (!meta) return;
            const price = parseFloat(meta.regularMarketPrice || meta.previousClose);
            const prev = parseFloat(meta.previousClose || meta.chartPreviousClose || price);
            if (!price || isNaN(price)) return;
            const change = price - prev;
            const changePct = prev > 0 ? (change / prev) * 100 : 0;
            const now = new Date();
            const ts = now.getHours() + ":" + String(now.getMinutes()).padStart(2, "0");
            if (!window.liveprices) window.liveprices = {};
            window.liveprices[sym] = { price, change, changePct, timestamp: ts, stale: json._runnrCache === "stale", sym };
          } catch (e) { /* leave unmarked */ }
        }));
      }
    } finally {
      pulling = false;
    }
  }

  function standHtml(book, yours) {
    const shared = sharedRow(book, yours);
    const top = top5Pct(book);
    const sharedCopy = shared
      ? `<b>${esc(shared.holding.sym)}</b><span>In the filing and the journal.</span>`
      : `<b>—</b><span>No names in both books yet.</span>`;
    return `<div class="shelf-stand">
      <div class="shelf-stand-cell">
        <div class="k">Shared</div>
        ${sharedCopy}
      </div>
      <div class="shelf-stand-cell">
        <div class="k">Top 5</div>
        <b>${top.toFixed(0)}%</b>
        <span>of ${esc(book.short)}</span>
      </div>
      <div class="shelf-stand-cell">
        <div class="k">Filing</div>
        <b>${esc(String(book.filedCount))}</b>
        <span>holdings · ${esc(usd(book.filedValue, 1))} disclosed</span>
      </div>
    </div>`;
  }

  function cardsHtml(yours) {
    return `<div class="shelf-deck">${BOOKS.map((b) => {
      const live = liveBookPct(b);
      const on = b.id === selectedId;
      const shared = sharedRow(b, yours);
      const cls = "shelf-card" + (on ? " on" : "") + (live.pct != null && live.pct < 0 ? " down" : "");
      return `<button type="button" class="${cls}" data-book="${esc(b.id)}">
        <div class="sc-name">${esc(b.short)}</div>
        <div class="sc-mgr">${esc(b.manager)}</div>
        <div class="sc-pct ${live.pct == null ? "" : live.pct >= 0 ? "up" : "dn"}">${esc(pct(live.pct))}</div>
        ${shared ? `<div class="sc-you">You hold ${esc(shared.holding.sym)}</div>` : ""}
      </button>`;
    }).join("")}</div>`;
  }

  function filtersHtml(book) {
    if (!book.sleeves) return "";
    return `<div class="shelf-filters">${SLEEVES.map((s) =>
      `<button type="button" class="shelf-filter${sleeve === s.id ? " on" : ""}" data-sleeve="${esc(s.id)}">${esc(s.label)}</button>`
    ).join("")}</div>`;
  }

  function blotterHtml(book, yours) {
    const rows = book.holdings.filter((h) => sleeve === "all" || h.sleeve === sleeve);
    const body = rows.map((h) => {
      const m = mark(h.sym);
      const last = m ? m.price : h.value / h.shrs;
      const chg = m ? m.changePct : null;
      const day = m ? m.change * h.shrs : null;
      const mv = m ? m.price * h.shrs : h.value;
      const you = Object.prototype.hasOwnProperty.call(yours.pnl, h.sym);
      const youPnl = you ? yours.pnl[h.sym] : null;
      const youTag = you
        ? `<span class="shelf-you">${youPnl == null ? "WATCH" : "YOU " + money(youPnl)}</span>`
        : "";
      const chgCls = chg == null ? "" : chg >= 0 ? "up" : "dn";
      const dayCls = day == null ? "" : day >= 0 ? "up" : "dn";
      return `<tr>
        <td>
          <div class="shelf-issuer">${esc(h.sym)} ${youTag}</div>
          <div class="shelf-filer">${esc(h.name)}</div>
        </td>
        <td class="shelf-num">${m ? esc(fmtLast(last)) : "—"}</td>
        <td class="shelf-num ${chgCls}">${esc(pct(chg))}</td>
        <td class="shelf-num ${dayCls}">${day == null ? "—" : esc(usd(day))}</td>
        <td class="shelf-num">${esc(shrsFmt(h.shrs))}</td>
        <td class="shelf-num">${esc(usd(mv))}</td>
      </tr>`;
    }).join("");
    return `<div class="shelf-book-head">
      <div>
        <div class="shelf-kicker">${esc(book.legal)} — Long book</div>
        <div class="shelf-book-meta">Filed 14 Aug 2026 · snapshot 30 Jun 2026 · live marks are last print, not NAV</div>
      </div>
      <div class="shelf-thesis">${esc(book.thesis)}</div>
    </div>
    ${filtersHtml(book)}
    <div class="shelf-table-wrap"><table class="shelf-table">
      <thead><tr>
        <th>Name</th><th class="num">Last</th><th class="num">1D</th><th class="num">Day P&amp;L</th><th class="num">Shrs</th><th class="num">Mkt value</th>
      </tr></thead>
      <tbody>${body}</tbody>
    </table></div>
    <div class="shelf-footnote">Disclosed 13F longs as of 30 Jun 2026, filed 14 Aug. Live marks revalue that snapshot at last print — not the fund's live book, not a scrape. Four smaller Situational names without a public ticker are omitted from the table.</div>`;
  }

  function fmtLast(p) {
    if (p == null || !isFinite(p)) return "—";
    if (p >= 1000) return p.toLocaleString(undefined, { maximumFractionDigits: 0 });
    if (p >= 100) return p.toFixed(2);
    if (p >= 1) return p.toFixed(2);
    return p.toFixed(4);
  }

  function yourBookHtml() {
    const list = journalRows();
    if (!list.length) {
      return '<div class="empty-state"><div class="es-icon">▤</div>No names in your book yet. Log a trade or add a Watch setup.</div>';
    }
    const body = list.map((r) => `<tr>
      <td>${esc(r.date)}</td>
      <td><div class="shelf-issuer">${esc(r.issuer)}</div></td>
      <td>${esc(r.klass)}</td>
      <td class="shelf-num">${esc(r.shrs)}</td>
      <td class="shelf-num">${r.value == null ? "—" : esc(((window.S && S.sym) || "€") + Math.round(r.value).toLocaleString())}</td>
      <td>${esc(r.side)}</td>
      <td><span class="shelf-disc ${r.disc.toLowerCase()}">${esc(r.disc)}</span></td>
      <td>${esc(r.status)}</td>
    </tr>`).join("");
    return `<div class="shelf-book-head">
      <div>
        <div class="shelf-kicker">Your book</div>
        <div class="shelf-book-meta">Journal + Watch — the names you actually run.</div>
      </div>
    </div>
    <div class="shelf-table-wrap"><table class="shelf-table">
      <thead><tr>
        <th>Date</th><th>Name</th><th>Class</th><th class="num">Size</th><th class="num">Value</th><th>Side</th><th>Discretion</th><th>Status</th>
      </tr></thead>
      <tbody>${body}</tbody>
    </table></div>
    <div class="shelf-footnote">Discretion maps your flags: SOLE = stop and size confirmed, SHARED = one flag missed, DFND = defined / needs levels, OTR = other.</div>`;
  }

  function paint() {
    const el = document.getElementById("shelf-root") || document.getElementById("shelf-blotter");
    if (!el) return;
    const book = bookOf(selectedId);
    const yours = yourBook();
    const tabs = `<div class="shelf-tabs">
      <button type="button" class="shelf-tab${tab === "shelf" ? " on" : ""}" data-tab="shelf">The Shelf</button>
      <button type="button" class="shelf-tab${tab === "book" ? " on" : ""}" data-tab="book">Your book</button>
    </div>`;
    if (tab === "book") {
      el.innerHTML = `<div class="shelf-kicker">The Shelf · your marks</div>
        <h3 class="shelf-title">The mind behind the flags</h3>
        ${tabs}${yourBookHtml()}`;
    } else {
      el.innerHTML = `<div class="shelf-kicker">The Shelf · live marks</div>
        <h3 class="shelf-title">Where you stand</h3>
        ${standHtml(book, yours)}
        ${tabs}
        ${cardsHtml(yours)}
        ${blotterHtml(book, yours)}`;
    }
    el.querySelectorAll("[data-tab]").forEach((btn) => {
      btn.addEventListener("click", () => { tab = btn.dataset.tab; paint(); });
    });
    el.querySelectorAll("[data-book]").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectedId = btn.dataset.book;
        sleeve = "all";
        paint();
        pullMarks(bookOf(selectedId)).then(paint);
      });
    });
    el.querySelectorAll("[data-sleeve]").forEach((btn) => {
      btn.addEventListener("click", () => { sleeve = btn.dataset.sleeve; paint(); });
    });
  }

  function render() {
    paint();
    pullMarks(bookOf(selectedId)).then(paint).then(() => pullMarks().then(paint));
  }

  return { render, paint, books: () => BOOKS, yourBook, sharedRow, liveBookPct, select(id) { selectedId = id; sleeve = "all"; render(); } };
})();
window.RunnrShelf = RunnrShelf;
