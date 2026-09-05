/** Options Coach — named jobs on top of the existing Options sizer. Not a parallel calculator. */
(function (global) {
  "use strict";

  const RULE1_PCT = 0.02;
  const RULE2_PCT = 0.20;
  const MULT = 100;

  const MODES = [
    {
      id: "leaps",
      label: "LEAPS",
      title: "Size the LEAPS / long option",
      help: "Paste ticker, strike, premium, DTE, and spot. Coach sizes contracts against Rule 1 (2%), Rule 2 (20%), and Rule 3 (2:1) and shows break-even. No chain — numbers you paste.",
      focus: ["opt-instr", "opt-strike", "opt-prem", "opt-dte", "opt-spot"],
      side: "debit",
    },
    {
      id: "wheel",
      label: "Wheel",
      title: "Wheel / covered call / CSP",
      help: "Cash-secured put or covered call. Collateral and max loss go through the same 2% / 20% gates. Premium is a credit, not a yield promise.",
      focus: ["opt-instr", "opt-strike", "opt-spot", "opt-prem", "opt-existing"],
      side: "credit",
    },
    {
      id: "putcredit",
      label: "Put credit",
      title: "Put credit / defined-risk short put",
      help: "Size a short put against Rule 1 / 2. Paste the credit and the spread width — max loss is width minus credit. Without a width we treat it as cash-secured (stock-to-zero).",
      focus: ["opt-instr", "opt-strike", "opt-prem", "opt-width", "opt-existing"],
      side: "credit",
    },
    {
      id: "review",
      label: "Review",
      title: "Review this options fill",
      help: "If the journal has an options fill flagged, open Replay or the trade row. Same process flags — no invented excursion stats.",
      focus: [],
      side: "review",
    },
  ];

  const MODE_IDS = MODES.map((m) => m.id);

  function modeOf(id) {
    return MODES.find((m) => m.id === id) || MODES[0];
  }

  function num(v) {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : NaN;
  }

  function isOptionsTrade(t) {
    if (!t || typeof t !== "object") return false;
    const type = String(t.type || "").toLowerCase();
    if (type === "options" || type === "option") return true;
    if (t.optMode) return true;
    const instr = String(t.instr || "");
    return /\b(call|put|leaps|csp|wheel)\b/i.test(instr);
  }

  function isFlagged(t) {
    if (!t) return false;
    return t.sizeOk === false || t.stopOk === false || t.incomplete === true;
  }

  function flaggedOptionsTrades(trades) {
    return (trades || []).filter((t) => isOptionsTrade(t) && isFlagged(t) && !t.mergedAway);
  }

  function firstReviewable(trades, settings, baron) {
    const list = flaggedOptionsTrades(trades);
    if (!list.length) return null;
    const DR = global.DisciplineReplay;
    if (DR && typeof DR.canReplay === "function") {
      for (let i = 0; i < list.length; i++) {
        if (DR.canReplay(list[i], settings, baron)) return list[i];
      }
    }
    return list[0];
  }

  /**
   * Naive long-premium size — the bypass short modes must not use.
   * Rule 1 on credit would treat a $1 premium as $100 risk and oversize a $100-strike put.
   */
  function premiumSizedContracts(portfolio, prem) {
    const p = num(portfolio);
    const pr = num(prem);
    if (!(p > 0) || !(pr > 0)) return 0;
    return Math.floor((p * RULE1_PCT) / (pr * MULT));
  }

  function contractsFromRisk(maxRisk, riskPer) {
    if (!(riskPer > 0) || !(maxRisk > 0)) return 0;
    return Math.floor(maxRisk / riskPer);
  }

  function itmStatus(isCall, spot, strike, prem) {
    const itm = isCall ? spot > strike : spot < strike;
    if (itm) return { itm: true, label: "ITM" };
    if (Math.abs(spot - strike) < prem) return { itm: false, label: "ATM" };
    return { itm: false, label: "OTM" };
  }

  function leapsPlan(input, limits) {
    const { strike, spot, prem, target, optType, existing } = input;
    const isCall = optType !== "put";
    const riskPer = prem * MULT;
    const exposurePer = riskPer;
    const contracts = contractsFromRisk(limits.maxRisk, riskPer);
    const shown = Math.max(1, contracts);
    const totalRisk = shown * riskPer;
    const totalExposure = shown * exposurePer;
    const bePrice = isCall ? strike + prem : strike - prem;
    const status = itmStatus(isCall, spot, strike, prem);
    let rule3Pass = null;
    let rule3 = null;
    if (target) {
      const atExpiry = isCall ? Math.max(0, target - strike) : Math.max(0, strike - target);
      const profit = atExpiry - prem;
      const rr = profit > 0 ? profit / prem : 0;
      rule3Pass = rr >= 2;
      rule3 = { rr, profit, atExpiry, blocks: !rule3Pass };
    }
    const rule1Pass = totalRisk <= limits.maxRisk;
    const newTotal = existing + totalExposure;
    const rule2Pass = newTotal <= limits.maxExposure;
    return finishPlan({
      mode: "leaps",
      debit: true,
      dir: "long",
      isCall,
      riskPer,
      exposurePer,
      creditPer: 0,
      maxLossPer: riskPer,
      contracts,
      shown,
      totalRisk,
      totalExposure,
      totalCredit: 0,
      bePrice,
      status,
      rule1Pass,
      rule2Pass,
      rule3Pass,
      rule3,
      newTotal,
      existing,
      limits,
      labels: { cost: "TOTAL COST", mid: "STATUS", be: "BREAK-EVEN" },
      midValue: "status",
      beValue: "be",
    });
  }

  function wheelPlan(input, limits) {
    const kind = input.wheelKind === "cc" ? "cc" : "csp";
    const { strike, spot, prem, existing } = input;
    const isCall = kind === "cc";
    const creditPer = prem * MULT;
    const collateral = kind === "cc" ? spot * MULT : strike * MULT;
    const maxLossPer = Math.max(0, collateral - creditPer);
    const riskPer = maxLossPer;
    const exposurePer = collateral;
    const contracts = contractsFromRisk(limits.maxRisk, riskPer);
    const shown = Math.max(1, contracts);
    const totalRisk = shown * riskPer;
    const totalExposure = shown * exposurePer;
    const totalCredit = shown * creditPer;
    const bePrice = isCall ? strike + prem : strike - prem;
    const status = itmStatus(isCall, spot, strike, prem);
    const rule1Pass = riskPer > 0 && totalRisk <= limits.maxRisk;
    const newTotal = existing + totalExposure;
    const rule2Pass = newTotal <= limits.maxExposure;
    return finishPlan({
      mode: "wheel",
      debit: false,
      dir: "short",
      isCall,
      wheelKind: kind,
      riskPer,
      exposurePer,
      creditPer,
      maxLossPer,
      contracts,
      shown,
      totalRisk,
      totalExposure,
      totalCredit,
      bePrice,
      status,
      rule1Pass,
      rule2Pass,
      rule3Pass: null,
      rule3: { blocks: false, informational: true, creditPer, maxLossPer },
      newTotal,
      existing,
      limits,
      labels: {
        cost: kind === "cc" ? "NOTIONAL" : "COLLATERAL",
        mid: "CREDIT",
        be: "MAX LOSS",
      },
      midValue: "credit",
      beValue: "maxLoss",
    });
  }

  function putCreditPlan(input, limits) {
    const { strike, spot, prem, existing, width } = input;
    const creditPer = prem * MULT;
    const defined = Number.isFinite(width) && width > prem;
    const maxLossPer = defined
      ? Math.max(0, (width - prem) * MULT)
      : Math.max(0, (strike - prem) * MULT);
    const riskPer = maxLossPer;
    const exposurePer = defined ? maxLossPer : strike * MULT;
    const contracts = contractsFromRisk(limits.maxRisk, riskPer);
    const shown = Math.max(1, contracts);
    const totalRisk = shown * riskPer;
    const totalExposure = shown * exposurePer;
    const totalCredit = shown * creditPer;
    const bePrice = strike - prem;
    const status = itmStatus(false, spot, strike, prem);
    const rule1Pass = riskPer > 0 && totalRisk <= limits.maxRisk;
    const newTotal = existing + totalExposure;
    const rule2Pass = newTotal <= limits.maxExposure;
    return finishPlan({
      mode: "putcredit",
      debit: false,
      dir: "short",
      isCall: false,
      definedRisk: defined,
      width: defined ? width : null,
      riskPer,
      exposurePer,
      creditPer,
      maxLossPer,
      contracts,
      shown,
      totalRisk,
      totalExposure,
      totalCredit,
      bePrice,
      status,
      rule1Pass,
      rule2Pass,
      rule3Pass: null,
      rule3: { blocks: false, informational: true, creditPer, maxLossPer },
      newTotal,
      existing,
      limits,
      labels: { cost: "MAX LOSS", mid: "CREDIT", be: "BREAK-EVEN" },
      midValue: "credit",
      beValue: "be",
    });
  }

  function finishPlan(p) {
    const failures = [];
    const sym = p.limits.sym || "€";
    if (!p.rule1Pass) {
      failures.push(
        "Rule 1: " + (p.debit ? "cost " : "max loss ") +
          sym + Math.round(p.totalRisk).toLocaleString() +
          " exceeds 2% limit of " +
          sym + Math.round(p.limits.maxRisk).toLocaleString()
      );
    }
    const exposurePct = p.limits.portfolio > 0 ? (p.newTotal / p.limits.portfolio) * 100 : 0;
    if (!p.rule2Pass) {
      failures.push("Rule 2: total exposure " + exposurePct.toFixed(1) + "% exceeds 20% limit");
    }
    const rule3Blocks = !!(p.rule3 && p.rule3.blocks);
    if (rule3Blocks) failures.push("Rule 3: R:R below 2:1 minimum");
    p.exposurePct = exposurePct;
    p.gateFailures = failures;
    p.allClear = p.rule1Pass && p.rule2Pass && !rule3Blocks;
    p.rule3Blocks = rule3Blocks;
    p.ready = true;
    return p;
  }

  function computePlan(raw) {
    const mode = modeOf(raw && raw.mode).id;
    if (mode === "review") {
      return { mode: "review", ready: false, allClear: false, gateFailures: [] };
    }
    const strike = num(raw && raw.strike);
    const spot = num(raw && raw.spot);
    const prem = num(raw && raw.prem);
    const portfolio = num(raw && raw.portfolio);
    const existing = num(raw && raw.existing);
    const target = num(raw && raw.target);
    const width = num(raw && raw.width);
    if (!(strike > 0) || !(spot > 0) || !(prem > 0) || !(portfolio > 0)) {
      return { mode, ready: false, allClear: false, gateFailures: [] };
    }
    const limits = {
      portfolio,
      maxRisk: portfolio * RULE1_PCT,
      maxExposure: portfolio * RULE2_PCT,
      sym: (raw && raw.sym) || "€",
    };
    const input = {
      strike,
      spot,
      prem,
      target: target > 0 ? target : NaN,
      width: width > 0 ? width : NaN,
      existing: Number.isFinite(existing) && existing > 0 ? existing : 0,
      optType: raw && raw.optType === "put" ? "put" : "call",
      wheelKind: raw && raw.wheelKind === "cc" ? "cc" : "csp",
    };
    if (mode === "wheel") return wheelPlan(input, limits);
    if (mode === "putcredit") return putCreditPlan(input, limits);
    return leapsPlan(input, limits);
  }

  function usesSameGates(plan) {
    if (!plan || !plan.ready) return false;
    if (!(plan.limits.maxRisk === plan.limits.portfolio * RULE1_PCT)) return false;
    if (!(plan.limits.maxExposure === plan.limits.portfolio * RULE2_PCT)) return false;
    if (plan.mode !== "leaps" && plan.creditPer > 0 && plan.riskPer <= plan.creditPer) return false;
    return true;
  }

  const api = {
    RULE1_PCT,
    RULE2_PCT,
    MULT,
    MODES,
    MODE_IDS,
    currentMode: "leaps",
    wheelKind: "csp",
    lastPlan: null,
    modeOf,
    isOptionsTrade,
    isFlagged,
    flaggedOptionsTrades,
    firstReviewable,
    premiumSizedContracts,
    computePlan,
    usesSameGates,
    setMode(id) {
      const mode = modeOf(id);
      this.currentMode = mode.id;
      return mode;
    },
    setWheelKind(kind) {
      this.wheelKind = kind === "cc" ? "cc" : "csp";
      return this.wheelKind;
    },
  };

  global.OptionsCoach = api;
})(typeof window !== "undefined" ? window : globalThis);
