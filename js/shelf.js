/** Runnr Shelf — 13F-style blotter of the book (journal + watch). */
const RunnrShelf = (() => {
  /** Public, well-known 13F associations — not live filings, not AUM. */
  const KNOWN_FILERS = {
    AAPL: "Berkshire Hathaway",
    "AAPL CFD": "Berkshire Hathaway",
    KO: "Berkshire Hathaway",
    BAC: "Berkshire Hathaway",
    AXP: "Berkshire Hathaway",
    AMZN: "large growth filers",
    MSFT: "large growth filers",
    NVDA: "growth filers",
    GOOGL: "growth filers",
    META: "growth filers",
    TSLA: "growth filers",
    GLD: "gold sleeves",
    IAU: "gold sleeves",
    COPX: "materials sleeves",
    XOM: "energy sleeves",
    JPM: "financials sleeves",
  };

  function esc(s) {
    return String(s || "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c]));
  }

  function classOf(t) {
    const type = String(t.type || "").toLowerCase();
    if (type === "cfd" || /cfd/i.test(t.instr || t.sym || "")) return "CFD";
    if (type === "crypto" || /usd$|btc|eth/i.test(t.instr || t.sym || "")) return "CRYPTO";
    if (type === "option" || /[CP]\d{6,}/.test(String(t.instr || t.sym || "").toUpperCase())) return "OPTION";
    return "SH";
  }

  function issuerOf(t) {
    return String(t.instr || t.sym || "—").trim() || "—";
  }

  function shrs(t) {
    const n = Number(t.size);
    return Number.isFinite(n) && n ? n : "—";
  }

  function valueOf(t) {
    const size = Number(t.size) || 0;
    const px = Number(t.exit) || Number(t.entry) || 0;
    if (!size || !px) return null;
    return size * px;
  }

  function discretion(t) {
    if (t.stopOk && t.sizeOk) return "SOLE";
    if (t.incomplete) return "DFND";
    if (t.stopOk || t.sizeOk) return "SHARED";
    return "OTR";
  }

  function rows() {
    const out = [];
    (window.S?.trades || []).forEach((t) => {
      if (!t || t.mergedAway || t.disciplineOnly) return;
      const open = window.Baron?.isOpenTrade?.(t);
      out.push({
        date: t.date || "—",
        issuer: issuerOf(t),
        klass: classOf(t),
        shrs: shrs(t),
        value: valueOf(t),
        side: (t.dir || "").toUpperCase() || "—",
        disc: discretion(t),
        putcall: classOf(t) === "OPTION" ? "CALL/PUT" : "—",
        status: open ? "OPEN" : "CLOSED",
        source: "journal",
        stopOk: !!t.stopOk,
        sizeOk: !!t.sizeOk,
      });
    });
    (window.S?.watchlist || []).forEach((w) => {
      if (!w || (typeof isFactoryDemoWatchItem === "function" && isFactoryDemoWatchItem(w))) return;
      out.push({
        date: "WATCH",
        issuer: issuerOf(w),
        klass: classOf(w),
        shrs: "—",
        value: null,
        side: (w.dir || "").toUpperCase() || "LONG",
        disc: Number(w.stop) && Number(w.target) ? "SOLE" : "DFND",
        putcall: "—",
        status: "DECLARED",
        source: "watch",
        stopOk: !!Number(w.stop),
        sizeOk: !!Number(w.target),
      });
    });
    return out;
  }

  function fmtVal(v) {
    if (v == null || !isFinite(v)) return "—";
    const sym = (window.S && S.sym) || "€";
    return sym + Math.round(v).toLocaleString();
  }

  function render() {
    const el = document.getElementById("shelf-blotter");
    if (!el) return;
    const list = rows();
    if (!list.length) {
      el.innerHTML = '<div class="empty-state"><div class="es-icon">▤</div>No names on the shelf yet. Log a trade or add a Watch setup.</div>';
      return;
    }
    const body = list.map((r) => {
      const filer = KNOWN_FILERS[r.issuer] || KNOWN_FILERS[String(r.issuer).replace(/\s+CFD$/i, "")] || "";
      return `<tr>
        <td>${esc(r.date)}</td>
        <td>
          <div class="shelf-issuer">${esc(r.issuer)}</div>
          ${filer ? `<div class="shelf-filer">Often named in 13F · ${esc(filer)}</div>` : ""}
        </td>
        <td>${esc(r.klass)}</td>
        <td class="shelf-num">${esc(r.shrs)}</td>
        <td class="shelf-num">${esc(fmtVal(r.value))}</td>
        <td>${esc(r.side)}</td>
        <td>${esc(r.putcall)}</td>
        <td><span class="shelf-disc ${r.disc.toLowerCase()}">${esc(r.disc)}</span></td>
        <td>${esc(r.status)}</td>
      </tr>`;
    }).join("");
    el.innerHTML = `<div class="shelf-table-wrap"><table class="shelf-table">
      <thead>
        <tr>
          <th>Date</th>
          <th>Name of issuer</th>
          <th>Title of class</th>
          <th>Shrs / prn amt</th>
          <th>Value</th>
          <th>Side</th>
          <th>Put / call</th>
          <th>Investment discretion</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table></div>
    <div class="shelf-footnote">Discretion maps your flags: SOLE = stop and size confirmed, SHARED = one flag missed, DFND = defined / needs levels, OTR = other. Filer notes are well-known 13F names — not a live filing scrape.</div>`;
  }

  return { render, rows };
})();
window.RunnrShelf = RunnrShelf;
