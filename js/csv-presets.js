/**
 * Broker CSV presets — map common export headers to Runnr fills or closed trades.
 * Fill-mode rows go through RunnrSync.importOrders + FIFO pairing.
 */
const RunnrCsvPresets = (() => {
  const PRESETS = [
    {
      id: "auto",
      label: "Auto-detect",
      mode: "auto",
      tip: "We’ll match headers to a known broker export.",
    },
    {
      id: "generic",
      label: "Generic",
      mode: "closed",
      tip: "Needs symbol + entry/exit or P&L columns.",
      detect: (h) => h.includes("symbol") || h.includes("ticker") || h.includes("instrument"),
    },
    {
      id: "ibkr",
      label: "IBKR",
      mode: "fills",
      tip: "Activity Flex CSV or Trades section — Buy/Sell + Symbol + Quantity + T. Price.",
      detect: (h) =>
        (h.includes("symbol") || h.includes("underlyingsymbol")) &&
        (h.includes("buysell") || h.includes("buy/sell") || h.includes("t. price") || h.includes("tradeprice")),
      symbol: ["symbol", "underlyingSymbol", "UnderlyingSymbol"],
      side: ["buysell", "buy/sell", "side", "Buy/Sell"],
      qty: ["quantity", "qty", "Quantity"],
      price: ["t. price", "tradeprice", "price", "TradePrice", "t price"],
      date: ["datetime", "date/time", "dateTime", "tradeDate", "Date/Time", "date"],
      skip: (row, get) => {
        const asset = (get(row, ["asset category", "assetcategory", "Asset Category"]) || "").toLowerCase();
        if (asset && !/stock|equity|etf|adr|fund/.test(asset) && /option|future|forex|bond|warrant/.test(asset)) {
          return true;
        }
        const disc = (get(row, ["datadiscriminator", "DataDiscriminator"]) || "").toLowerCase();
        if (disc && disc !== "order" && disc !== "trade" && disc !== "") {
          // Keep Order/Trade rows; skip SubTotal/Total
          if (/subtotal|total|summary/.test(disc)) return true;
        }
        return false;
      },
    },
    {
      id: "t212",
      label: "Trading 212",
      mode: "fills",
      tip: "History export — Action, Time, Ticker, No. of shares, Price / share.",
      detect: (h) =>
        h.includes("action") &&
        (h.includes("ticker") || h.includes("isin")) &&
        (h.includes("no. of shares") || h.includes("no of shares") || h.includes("shares")),
      symbol: ["ticker", "Ticker", "isin"],
      side: ["action", "Action"],
      qty: ["no. of shares", "no of shares", "shares", "Number of shares"],
      price: ["price / share", "price/share", "price per share", "Price / share"],
      date: ["time", "Time", "date"],
      skip: (row, get) => {
        const action = (get(row, ["action", "Action"]) || "").toLowerCase();
        return !/market|limit|buy|sell|fill/.test(action) || /dividend|interest|deposit|withdraw|card/.test(action);
      },
      sideMap: (raw) => {
        const s = String(raw || "").toLowerCase();
        if (/sell/.test(s)) return "sell";
        if (/buy/.test(s)) return "buy";
        return null;
      },
    },
    {
      id: "etoro",
      label: "eToro",
      mode: "closed",
      tip: "Account Statement / closed positions — Instrument + Open/Close Rate or Profit.",
      detect: (h) =>
        (h.includes("instrument") || h.includes("action")) &&
        (h.includes("open rate") || h.includes("close rate") || h.includes("profit") || h.includes("units")),
      closed: {
        symbol: ["instrument", "Instrument", "ticker", "symbol"],
        entry: ["open rate", "Open Rate", "open", "entry"],
        exit: ["close rate", "Close Rate", "close", "exit"],
        size: ["units", "Units", "amount", "Quantity", "quantity"],
        pnl: ["profit", "Profit", "net profit", "Net Profit", "pnl"],
        date: ["close date", "Close Date", "date", "Date", "open date"],
        side: ["type", "Type", "action", "Action", "direction"],
      },
    },
    {
      id: "degiro",
      label: "Degiro",
      mode: "fills",
      tip: "Transactions export (CSV). Product + Quantity + Price. Semicolon OK.",
      detect: (h) =>
        (h.includes("product") || h.includes("isin")) &&
        (h.includes("quantity") || h.includes("aantal")) &&
        (h.includes("price") || h.includes("koers") || h.includes("value")),
      symbol: ["product", "Product", "isin", "ISIN", "symbol"],
      side: ["buysell", "buy/sell", "description", "omschrijving", "Action"],
      qty: ["quantity", "Quantity", "aantal", "Aantal"],
      price: ["price", "Price", "koers", "Koers"],
      date: ["date", "Date", "datum", "Datum", "tijd", "Time"],
      skip: (row, get) => {
        const desc = (get(row, ["description", "omschrijving", "Description"]) || "").toLowerCase();
        if (/dividend|interest|fee|cost|deposit|withdrawal|flatex|cash/.test(desc) && !/buy|sell|koop|verkoop/.test(desc)) {
          return true;
        }
        return false;
      },
      sideMap: (raw) => {
        const s = String(raw || "").toLowerCase();
        if (/sell|verkoop|s\b/.test(s)) return "sell";
        if (/buy|koop|b\b/.test(s)) return "buy";
        // Degiro often encodes side via signed quantity
        return null;
      },
      signedQtyIsSide: true,
    },
    {
      id: "schwab",
      label: "Schwab",
      mode: "fills",
      tip: "Transaction History — Action, Symbol, Quantity, Price.",
      detect: (h) =>
        h.includes("action") &&
        h.includes("symbol") &&
        (h.includes("quantity") || h.includes("qty")) &&
        h.includes("price"),
      symbol: ["symbol", "Symbol"],
      side: ["action", "Action"],
      qty: ["quantity", "Quantity", "qty"],
      price: ["price", "Price"],
      date: ["date", "Date", "as of"],
      skip: (row, get) => {
        const action = (get(row, ["action", "Action"]) || "").toLowerCase();
        return !/buy|sell|bought|sold/.test(action) || /dividend|interest|transfer|journal|fee|tax/.test(action);
      },
      sideMap: (raw) => {
        const s = String(raw || "").toLowerCase();
        if (/sell|sold/.test(s)) return "sell";
        if (/buy|bought/.test(s)) return "buy";
        return null;
      },
    },
  ];

  function list() {
    return PRESETS.map(({ id, label, tip, mode }) => ({ id, label, tip, mode }));
  }

  function get(id) {
    return PRESETS.find((p) => p.id === id) || PRESETS[0];
  }

  function normHeader(h) {
    return String(h || "")
      .replace(/^\uFEFF/, "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  function detectDelimiter(sample) {
    const line = String(sample || "").split(/\r?\n/).find((l) => l.trim()) || "";
    const commas = (line.match(/,/g) || []).length;
    const semis = (line.match(/;/g) || []).length;
    return semis > commas ? ";" : ",";
  }

  function parseRow(line, delim) {
    const out = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = !inQ;
      } else if (ch === delim && !inQ) {
        out.push(cur.trim());
        cur = "";
      } else {
        cur += ch;
      }
    }
    out.push(cur.trim());
    return out;
  }

  function field(row, keys) {
    const map = {};
    Object.keys(row).forEach((k) => {
      map[normHeader(k)] = row[k];
    });
    for (const k of keys || []) {
      const v = map[normHeader(k)];
      if (v != null && String(v).trim() !== "") return String(v).trim();
    }
    return "";
  }

  function num(val) {
    if (val == null || val === "") return null;
    const n = parseFloat(String(val).replace(/[€$£,\s]/g, "").replace(/\.(?=.*\.)/g, ""));
    return Number.isFinite(n) ? n : null;
  }

  /** European numbers like 1.234,56 */
  function numLoose(val) {
    if (val == null || val === "") return null;
    let s = String(val).trim().replace(/[€$£\s]/g, "");
    if (/\d,\d{1,2}$/.test(s) && s.includes(".")) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else if (/\d,\d{1,2}$/.test(s)) {
      s = s.replace(",", ".");
    }
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : null;
  }

  function parseDateIso(raw) {
    if (!raw) return null;
    const s = String(raw).trim();
    // IBKR: 20240115;153045 or 20240115
    const ib = s.match(/^(\d{4})(\d{2})(\d{2})(?:;(\d{2})(\d{2})(\d{2}))?/);
    if (ib) {
      const iso = `${ib[1]}-${ib[2]}-${ib[3]}T${ib[4] || "12"}:${ib[5] || "00"}:${ib[6] || "00"}Z`;
      const d = Date.parse(iso);
      return Number.isNaN(d) ? null : new Date(d).toISOString();
    }
    // DD/MM/YYYY or DD-MM-YYYY
    const eu = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (eu) {
      let y = parseInt(eu[3], 10);
      if (y < 100) y += 2000;
      const iso = `${y}-${String(eu[2]).padStart(2, "0")}-${String(eu[1]).padStart(2, "0")}T${String(eu[4] || 12).padStart(2, "0")}:${eu[5] || "00"}:${eu[6] || "00"}Z`;
      const d = Date.parse(iso);
      if (!Number.isNaN(d)) return new Date(d).toISOString();
    }
    const d = Date.parse(s);
    return Number.isNaN(d) ? null : new Date(d).toISOString();
  }

  function headerSet(headers) {
    return new Set(headers.map(normHeader));
  }

  function detectPreset(headers) {
    const h = [...headerSet(headers)];
    const scored = PRESETS.filter((p) => p.id !== "auto" && p.id !== "generic" && typeof p.detect === "function")
      .map((p) => ({ p, ok: p.detect(h) }))
      .filter((x) => x.ok);
    if (scored.length) return scored[0].p;
    return get("generic");
  }

  /**
   * Parse raw CSV text → array of row objects.
   * Skips preamble until a plausible header row is found.
   */
  function parseCsvText(text, preferredDelim) {
    const raw = String(text || "").replace(/^\uFEFF/, "");
    const delim = preferredDelim || detectDelimiter(raw);
    const lines = raw.split(/\r?\n/).filter((l) => l.trim());
    if (!lines.length) return { rows: [], headers: [], delim, headerLine: 0 };

    let headerIdx = 0;
    let headers = parseRow(lines[0], delim).map((h) => h.replace(/^\uFEFF/, "").trim());
    const looksLikeHeader = (cols) => {
      const joined = cols.map(normHeader).join("|");
      return /symbol|ticker|instrument|product|action|quantity|qty|shares|buy|sell|pnl|profit|price|date|time|isin/.test(
        joined
      );
    };
    const isRepeatHeader = (cols) => {
      if (cols.length !== headers.length) return false;
      const a = cols.map(normHeader);
      const b = headers.map(normHeader);
      // Exact header echo only — do not treat "Market buy" data rows as headers
      return a.every((h, i) => h === b[i]);
    };
    if (!looksLikeHeader(headers)) {
      for (let i = 0; i < Math.min(lines.length, 40); i++) {
        const cols = parseRow(lines[i], delim);
        if (looksLikeHeader(cols)) {
          headerIdx = i;
          headers = cols.map((h) => h.replace(/^\uFEFF/, "").trim());
          break;
        }
      }
    }

    const rows = [];
    for (let i = headerIdx + 1; i < lines.length; i++) {
      const cols = parseRow(lines[i], delim);
      if (!cols.some((c) => String(c).trim())) continue;
      if (isRepeatHeader(cols)) continue;
      const row = {};
      headers.forEach((h, j) => {
        row[h] = cols[j] ?? "";
      });
      rows.push(row);
    }
    return { rows, headers, delim, headerLine: headerIdx };
  }

  function toFills(rows, preset) {
    const orders = [];
    let skipped = 0;
    const get = field;
    rows.forEach((row, i) => {
      if (preset.skip && preset.skip(row, get)) {
        skipped++;
        return;
      }
      let qty = numLoose(get(row, preset.qty || ["qty", "quantity", "shares"])) ?? num(get(row, preset.qty || []));
      let side = null;
      const sideRaw = get(row, preset.side || ["side", "action", "buysell"]);
      if (preset.sideMap) side = preset.sideMap(sideRaw);
      if (!side) {
        const s = sideRaw.toLowerCase();
        if (/sell|sold|verkoop|short/.test(s)) side = "sell";
        else if (/buy|bought|koop|long/.test(s)) side = "buy";
      }
      if (!side && preset.signedQtyIsSide && qty != null) {
        side = qty < 0 ? "sell" : "buy";
        qty = Math.abs(qty);
      }
      if (qty != null) qty = Math.abs(qty);
      const symbol = get(row, preset.symbol || ["symbol", "ticker", "instrument", "product"]).toUpperCase();
      const price =
        numLoose(get(row, preset.price || ["price", "filled_avg_price", "avg_price"])) ??
        num(get(row, preset.price || []));
      const filledAt = parseDateIso(get(row, preset.date || ["date", "time", "datetime", "timestamp"]));
      if (!symbol || !side || !(qty > 0) || !(price > 0)) {
        skipped++;
        return;
      }
      // Skip option-like tickers
      if (/[CP]\d{6,}/.test(symbol) && symbol.length >= 10) {
        skipped++;
        return;
      }
      const id = `csv:${preset.id}:${symbol}:${side}:${filledAt || i}:${qty}:${price}`;
      orders.push({
        id,
        symbol,
        side,
        qty,
        filled_qty: qty,
        filled_avg_price: price,
        status: "filled",
        submitted_at: filledAt,
        filled_at: filledAt,
      });
    });
    return { orders, skipped };
  }

  function toClosed(rows, preset) {
    const map = preset.closed || {
      symbol: preset.symbol || ["symbol", "ticker", "instrument"],
      entry: ["entry", "entry_price", "open", "open rate", "price"],
      exit: ["exit", "exit_price", "close", "close rate", "close_price"],
      size: ["size", "qty", "quantity", "shares", "units"],
      pnl: ["pnl", "pl", "profit", "net_pnl", "realized_pnl", "profit_loss"],
      date: ["date", "time", "timestamp", "close_date", "exit_date", "close date"],
      side: ["side", "direction", "type", "action"],
    };
    const trades = [];
    let skipped = 0;
    rows.forEach((row, i) => {
      const instr = field(row, map.symbol).toUpperCase();
      if (!instr) {
        skipped++;
        return;
      }
      const sideRaw = field(row, map.side).toLowerCase();
      const dir = /sell|short/.test(sideRaw) ? "short" : "long";
      const entry = numLoose(field(row, map.entry)) ?? num(field(row, map.entry));
      const exit = numLoose(field(row, map.exit)) ?? num(field(row, map.exit));
      const rawSize = numLoose(field(row, map.size)) ?? num(field(row, map.size));
      const size = rawSize != null && Number(rawSize) !== 0 ? Math.abs(Number(rawSize)) : 1;
      let pnl = numLoose(field(row, map.pnl)) ?? num(field(row, map.pnl));
      const filledAt = parseDateIso(field(row, map.date));
      const date = filledAt
        ? new Date(filledAt).toLocaleDateString("en-GB", { month: "short", day: "numeric" })
        : field(row, map.date).slice(0, 12) ||
          new Date().toLocaleDateString("en-GB", { month: "short", day: "numeric" });
      if (pnl == null && entry != null && exit != null) {
        pnl = Math.round((dir === "long" ? exit - entry : entry - exit) * size);
      }
      if (entry == null && exit == null && pnl == null) {
        skipped++;
        return;
      }
      trades.push({
        instr,
        dir,
        entry: entry ?? (dir === "long" ? exit : null),
        exit: exit ?? (dir === "short" ? entry : null),
        size: Math.abs(size),
        pnl: pnl ?? 0,
        date,
        filledAt,
        externalId: `csv:${preset.id}:${instr}:${date}:${entry ?? exit ?? pnl}:${size}`,
      });
    });
    return { trades, skipped };
  }

  function normalize(text, presetId) {
    const parsed = parseCsvText(text);
    if (!parsed.rows.length) {
      return { ok: false, error: "No data rows found — check CSV headers.", parsed };
    }
    let preset = get(presetId || "auto");
    if (preset.id === "auto") preset = detectPreset(parsed.headers);
    const mode = preset.mode === "auto" ? "closed" : preset.mode;
    if (mode === "fills") {
      const { orders, skipped } = toFills(parsed.rows, preset);
      return {
        ok: orders.length > 0,
        mode: "fills",
        preset,
        orders,
        skipped,
        parsed,
        error: orders.length ? null : "No fills matched this preset — try another or Generic.",
      };
    }
    const { trades, skipped } = toClosed(parsed.rows, preset);
    return {
      ok: trades.length > 0,
      mode: "closed",
      preset,
      trades,
      skipped,
      parsed,
      error: trades.length ? null : "No trades matched — need symbol + entry/exit or P&L.",
    };
  }

  return {
    list,
    get,
    detectPreset,
    parseCsvText,
    normalize,
    field,
    num: numLoose,
  };
})();

window.RunnrCsvPresets = RunnrCsvPresets;
