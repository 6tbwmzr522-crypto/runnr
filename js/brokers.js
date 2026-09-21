/**
 * Canonical Runnr broker catalog — ids, display names, marks, and connect mode.
 * Home parade, Connect cards, and CSV handoff all read this list.
 */
const RunnrBrokers = (() => {
  const CATALOG = Object.freeze([
    Object.freeze({
      id: "alpaca",
      code: "Alpaca",
      name: "Alpaca",
      mark: "ALP",
      bg: "#f5d542",
      color: "#000",
      live: true,
      syncKey: "alpaca",
    }),
    Object.freeze({
      id: "ibkr",
      code: "IBKR",
      name: "IBKR",
      mark: "IBKR",
      bg: "#cc0000",
      color: "#fff",
      live: true,
      csv: true,
      csvPreset: "ibkr",
      kind: "flex",
      syncKey: "ibkr",
    }),
    Object.freeze({
      id: "t212",
      code: "Trading 212",
      name: "Trading 212",
      mark: "T212",
      bg: "#00a7e1",
      color: "#fff",
      live: true,
      csv: true,
      csvPreset: "t212",
      syncKey: "t212",
    }),
    Object.freeze({
      id: "etoro",
      code: "eToro",
      name: "eToro",
      mark: "eToro",
      bg: "#6FCF97",
      color: "#000",
      csv: true,
      csvPreset: "etoro",
    }),
    Object.freeze({
      id: "degiro",
      code: "Degiro",
      name: "Degiro",
      mark: "Degiro",
      bg: "#e30613",
      color: "#fff",
      csv: true,
      csvPreset: "degiro",
    }),
    Object.freeze({
      id: "schwab",
      code: "Schwab",
      name: "Schwab",
      mark: "Schwab",
      bg: "#00a0df",
      color: "#fff",
      csv: true,
      csvPreset: "schwab",
    }),
  ]);

  function list() {
    return CATALOG.slice();
  }

  function byCode(code) {
    const key = String(code || "");
    return CATALOG.find((b) => b.code === key || b.id === key) || null;
  }

  function byId(id) {
    return CATALOG.find((b) => b.id === id) || null;
  }

  function names() {
    return CATALOG.map((b) => b.name);
  }

  function escapeAttr(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;");
  }

  function logoHtml(b) {
    if (!b) return "";
    return `<div class="bk-logo" style="background:${escapeAttr(b.bg)};color:${escapeAttr(b.color)}">${escapeAttr(b.mark)}</div>`;
  }

  function chipClass(b, connected) {
    if (connected) return "on";
    if (b.live) return "live";
    if (b.csv) return "csv";
    return "soon";
  }

  function chipTitle(b, connected) {
    if (connected) return b.name + " · connected";
    if (b.live) return b.name + " · read-only sync";
    if (b.csv) return b.name + " · CSV import";
    return b.name + " · coming soon";
  }

  function paradeHtml(connectedIds) {
    const on = connectedIds || {};
    return `<div class="broker-chip-parade" role="list">${CATALOG.map((b) => {
      const connected = !!(on[b.id] || on[b.syncKey]);
      const kind = chipClass(b, connected);
      return `<button type="button" class="broker-chip ${kind}" role="listitem" title="${escapeAttr(chipTitle(b, connected))}" onclick="connectBroker('${escapeAttr(b.code)}')">${escapeAttr(b.name)}</button>`;
    }).join("")}</div>`;
  }

  return { list, byCode, byId, names, logoHtml, paradeHtml, chipClass, CATALOG };
})();
if (typeof window !== "undefined") window.RunnrBrokers = RunnrBrokers;
