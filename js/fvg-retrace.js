/** FVG retrace — when/where filter on the existing CFD / shares sizer. Not a calculator. */
(function (global) {
  "use strict";

  function num(v) {
    if (v === "" || v == null) return NaN;
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : NaN;
  }

  function confirmValue(v) {
    if (v === true || v === "yes") return "yes";
    if (v === false || v === "no") return "no";
    return "";
  }

  function inUse(input) {
    if (!input || typeof input !== "object") return false;
    const high = num(input.high);
    const low = num(input.low);
    const confirm = confirmValue(input.confirm);
    return Number.isFinite(high) || Number.isFinite(low) || confirm === "yes" || confirm === "no";
  }

  /**
   * @returns {{
   *   used: boolean,
   *   ready: boolean,
   *   canLog: boolean,
   *   confirmOk: boolean,
   *   stopOk: boolean,
   *   setup?: string,
   *   reason?: string,
   *   message?: string,
   *   dir?: string,
   *   zoneHigh?: number,
   *   zoneLow?: number
   * }}
   */
  function evaluate(input) {
    const raw = input || {};
    const confirm = confirmValue(raw.confirm);
    const dir = raw.dir === "short" ? "short" : "long";
    let high = num(raw.high);
    let low = num(raw.low);
    const stop = num(raw.stop);

    if (!inUse(raw)) {
      return { used: false, ready: true, canLog: true, confirmOk: true, stopOk: true };
    }

    if (Number.isFinite(high) && Number.isFinite(low) && high < low) {
      const swap = high;
      high = low;
      low = swap;
    }

    if (!(Number.isFinite(high) && Number.isFinite(low) && high > low)) {
      return {
        used: true,
        ready: false,
        canLog: false,
        confirmOk: confirm === "yes",
        stopOk: false,
        reason: "not-ready",
        message: "Not ready — paste FVG high and low.",
        dir,
      };
    }

    if (confirm !== "yes") {
      return {
        used: true,
        ready: true,
        canLog: false,
        confirmOk: false,
        stopOk: false,
        reason: "no-confirm",
        message: "No confirmation in the zone — cannot log as a clean setup.",
        dir,
        zoneHigh: high,
        zoneLow: low,
      };
    }

    const stopBeyond = Number.isFinite(stop) && (dir === "long" ? stop < low : stop > high);
    if (!stopBeyond) {
      return {
        used: true,
        ready: true,
        canLog: false,
        confirmOk: true,
        stopOk: false,
        reason: "stop-inside",
        message: "Stop belongs beyond the FVG (long: below the low; short: above the high).",
        dir,
        zoneHigh: high,
        zoneLow: low,
      };
    }

    return {
      used: true,
      ready: true,
      canLog: true,
      confirmOk: true,
      stopOk: true,
      setup: "fvg",
      dir,
      zoneHigh: high,
      zoneLow: low,
    };
  }

  const api = { evaluate, inUse };
  global.FvgRetrace = api;
})(typeof window !== "undefined" ? window : globalThis);
