/**
 * Tesla-desk helpers — one job on Home, quiet chrome until 3 real trades.
 * Countable trades reuse RunnrTradeLimit (imports count, demo seeds do not).
 */
(function (global) {
  "use strict";

  const QUIET_TRADE_THRESHOLD = 3;
  const INCOMPLETE_WALL_THRESHOLD = 5;
  const MORE_KEY = "runnr_desk_more";

  function tradeLimit() {
    return global.RunnrTradeLimit || null;
  }

  function replay() {
    return global.DisciplineReplay || null;
  }

  function countableTrades(trades) {
    const TL = tradeLimit();
    if (TL && typeof TL.countJournalTradesForLimit === "function") {
      return TL.countJournalTradesForLimit(trades);
    }
    return (trades || []).filter((t) => t && !t.mergedAway && !t.isDemo && !t.seed).length;
  }

  function isMoreExpanded(storage) {
    const store = storage || (typeof localStorage !== "undefined" ? localStorage : null);
    try {
      return !!(store && store.getItem(MORE_KEY) === "1");
    } catch (e) {
      return false;
    }
  }

  function expandMore(storage) {
    const store = storage || (typeof localStorage !== "undefined" ? localStorage : null);
    try {
      if (store) store.setItem(MORE_KEY, "1");
    } catch (e) {}
    return true;
  }

  function isQuiet(trades, storage) {
    if (isMoreExpanded(storage)) return false;
    return countableTrades(trades) < QUIET_TRADE_THRESHOLD;
  }

  function isBrokerFill(t) {
    const DR = replay();
    if (DR && typeof DR.isBrokerFill === "function") return DR.isBrokerFill(t);
    const src = t && t.source;
    return src === "alpaca" || src === "ibkr" || src === "t212";
  }

  function brokerFillProgress(trades) {
    const fills = (trades || []).filter((t) => t && isBrokerFill(t) && !t.mergedAway);
    const incomplete = fills.filter((t) => t.incomplete);
    return {
      total: fills.length,
      incomplete: incomplete.length,
      reviewed: Math.max(0, fills.length - incomplete.length),
    };
  }

  function firstReplayableTrade(trades, settings, baron) {
    const DR = replay();
    if (DR && typeof DR.firstReplayableTrade === "function") {
      return DR.firstReplayableTrade(trades, settings, baron);
    }
    if (!DR || typeof DR.canReplay !== "function") return null;
    const list = trades || [];
    for (let i = 0; i < list.length; i++) {
      if (DR.canReplay(list[i], settings, baron)) return list[i];
    }
    return null;
  }

  function primaryJob(trades, settings, baron) {
    const DR = replay();
    const pending = DR && typeof DR.firstIncompleteBrokerFill === "function"
      ? DR.firstIncompleteBrokerFill(trades)
      : null;
    const pendingCount = DR && typeof DR.incompleteBrokerFills === "function"
      ? DR.incompleteBrokerFills(trades).length
      : 0;
    if (pending) {
      const progress = brokerFillProgress(trades);
      const count = pendingCount || progress.incomplete || 1;
      return {
        id: "review",
        title: count === 1 ? "1 fill needs flags" : count + " fills to review",
        sub: progress.total
          ? progress.reviewed + " of " + progress.total + " reviewed"
          : "One fill at a time — Stop and Size.",
        cta: "Review next incomplete",
        tradeId: pending.id,
      };
    }
    const miss = firstReplayableTrade(trades, settings, baron);
    if (miss) {
      return {
        id: "replay",
        title: "Replay your last miss",
        sub: (miss.instr || "Last trade") + " — see the disciplined version",
        cta: "Replay Disciplined",
        tradeId: miss.id,
      };
    }
    return {
      id: "size",
      title: "Size the next trade",
      sub: "Pick a stop. The size follows.",
      cta: "Size the next trade",
      tradeId: null,
    };
  }

  const api = {
    QUIET_TRADE_THRESHOLD,
    INCOMPLETE_WALL_THRESHOLD,
    MORE_KEY,
    countableTrades,
    isMoreExpanded,
    expandMore,
    isQuiet,
    brokerFillProgress,
    firstReplayableTrade,
    primaryJob,
  };

  global.RunnrDeskQuiet = api;
})(typeof window !== "undefined" ? window : globalThis);
