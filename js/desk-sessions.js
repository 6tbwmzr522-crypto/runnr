/**
 * Runnr Terminal — DST-safe cash-session clock (NYSE, LSE, TSE, HKEX, SSE).
 * Holidays are never inferred.
 */
const RunnrSessions = (() => {
  const M = (h, m) => h * 60 + (m || 0);
  const MARKETS = [
    { id: "SSE", name: "Shanghai", tz: "Asia/Shanghai",
      segments: [[M(9, 30), M(11, 30)], [M(13, 0), M(15, 0)]], lunch: [M(11, 30), M(13, 0)], pre: null },
    { id: "HKEX", name: "Hong Kong", tz: "Asia/Hong_Kong",
      segments: [[M(9, 30), M(12, 0)], [M(13, 0), M(16, 0)]], lunch: [M(12, 0), M(13, 0)], pre: null },
    { id: "TSE", name: "Tokyo", tz: "Asia/Tokyo",
      segments: [[M(9, 0), M(11, 30)], [M(12, 30), M(15, 30)]], lunch: [M(11, 30), M(12, 30)], pre: null },
    { id: "LSE", name: "London", tz: "Europe/London",
      segments: [[M(8, 0), M(16, 30)]], lunch: null, pre: null },
    { id: "NYSE", name: "New York", tz: "America/New_York",
      segments: [[M(9, 30), M(16, 0)]], lunch: null, pre: [M(4, 0), M(9, 30)] },
  ];

  const _dtfCache = {};
  function _dtf(tz) {
    return _dtfCache[tz] || (_dtfCache[tz] = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, weekday: "short",
    }));
  }

  function partsInTz(date, tz) {
    const o = {};
    _dtf(tz).formatToParts(date).forEach((x) => { o[x.type] = x.value; });
    return {
      y: +o.year, mo: +o.month, d: +o.day,
      wd: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(o.weekday),
      min: (+o.hour % 24) * 60 + (+o.minute), sec: +o.second,
    };
  }

  function tzOffsetMs(utcMs, tz) {
    const w = partsInTz(new Date(utcMs), tz);
    const wallAsUtc = Date.UTC(w.y, w.mo - 1, w.d, Math.floor(w.min / 60), w.min % 60, w.sec);
    return wallAsUtc - utcMs;
  }

  function zonedToUtc(y, mo, d, minutes, tz) {
    const guess = Date.UTC(y, mo - 1, d, Math.floor(minutes / 60), minutes % 60);
    let utc = guess - tzOffsetMs(guess, tz);
    const off2 = tzOffsetMs(utc, tz);
    const utc2 = guess - off2;
    if (utc2 !== utc) utc = utc2;
    return utc;
  }

  function stateAt(mkt, now) {
    const w = partsInTz(now, mkt.tz);
    const mins = w.min + w.sec / 60;
    let state;
    if (w.wd === 0 || w.wd === 6) state = "CLOSED";
    else if (mkt.pre && mins >= mkt.pre[0] && mins < mkt.pre[1]) state = "PRE";
    else if (mkt.segments.some((s) => mins >= s[0] && mins < s[1])) state = "OPEN";
    else if (mkt.lunch && mins >= mkt.lunch[0] && mins < mkt.lunch[1]) state = "LUNCH";
    else state = "CLOSED";

    const cands = [];
    for (let add = 0; add <= 4; add++) {
      const base = new Date(Date.UTC(w.y, w.mo - 1, w.d + add));
      const yy = base.getUTCFullYear();
      const mm = base.getUTCMonth() + 1;
      const dd = base.getUTCDate();
      const wd = partsInTz(new Date(zonedToUtc(yy, mm, dd, 720, mkt.tz)), mkt.tz).wd;
      if (wd === 0 || wd === 6) continue;
      if (mkt.pre) {
        cands.push({ utc: zonedToUtc(yy, mm, dd, mkt.pre[0], mkt.tz), state: "PRE" });
        cands.push({ utc: zonedToUtc(yy, mm, dd, mkt.pre[1], mkt.tz), state: "OPEN" });
      }
      mkt.segments.forEach((s, i) => {
        cands.push({ utc: zonedToUtc(yy, mm, dd, s[0], mkt.tz), state: "OPEN" });
        const isLast = i === mkt.segments.length - 1;
        cands.push({ utc: zonedToUtc(yy, mm, dd, s[1], mkt.tz), state: isLast ? "CLOSED" : "LUNCH" });
      });
      if (mkt.lunch) cands.push({ utc: zonedToUtc(yy, mm, dd, mkt.lunch[1], mkt.tz), state: "OPEN" });
    }
    const nowMs = now.getTime();
    const future = cands.filter((c) => c.utc > nowMs + 500).sort((a, b) => a.utc - b.utc);
    let next = null;
    for (const c of future) {
      if (c.state !== state) { next = c; break; }
    }
    const nextVerb = !next ? "—" :
      (next.state === "OPEN" ? "opens" : next.state === "PRE" ? "pre" : next.state === "LUNCH" ? "lunch" : "closes");
    return {
      state,
      nextVerb,
      countdownMs: next ? next.utc - nowMs : null,
    };
  }

  function fmtCountdown(ms) {
    if (ms == null) return "—";
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    const pad = (x) => String(x).padStart(2, "0");
    return (h > 0 ? h + ":" : "") + pad(m) + ":" + pad(ss);
  }

  function fmtLocal(now, tz) {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false,
    }).format(now);
  }

  function rows(now) {
    now = now || new Date();
    return MARKETS.map((mkt) => {
      const st = stateAt(mkt, now);
      return {
        id: mkt.id,
        name: mkt.name,
        local: fmtLocal(now, mkt.tz),
        state: st.state,
        nextVerb: st.nextVerb,
        countdown: fmtCountdown(st.countdownMs),
      };
    });
  }

  return { MARKETS, rows, fmtCountdown };
})();
window.RunnrSessions = RunnrSessions;
