/**
 * Free-plan journal cap — manual entries and imported fills share one bucket.
 * Explicit demo seed rows (isDemo / seed) and merged-away pair legs do not count.
 * Bare ids 1–4 without that flag do count.
 */
(function (global) {
  "use strict";

  const FREE_TRADE_LIMIT = 10;
  const SCORE_SHARE_MIN_TRADES = 3;
  const IMPORT_SOURCES = new Set(["alpaca", "csv", "ibkr", "t212"]);

  function isImportedJournalTrade(t) {
    return !!(t && IMPORT_SOURCES.has(t.source));
  }

  function isDemoJournalTrade(t) {
    return !!(t && (t.isDemo === true || t.seed === true));
  }

  function isCountableJournalTrade(t) {
    return !!(t && typeof t === "object" && !t.mergedAway && !isDemoJournalTrade(t));
  }

  function countJournalTradesForLimit(trades) {
    return (trades || []).filter(isCountableJournalTrade).length;
  }

  function isUnlimitedJournal(sync) {
    const RS = sync || global.RunnrSync;
    if (RS && typeof RS.isPro === "function" && RS.isPro()) return true;
    const b = RS && typeof RS.billing === "function" ? RS.billing() : null;
    if (b && b.enabled === false) return true;
    return false;
  }

  function journalTrades(trades) {
    if (trades) return trades;
    return (global.S && global.S.trades) || [];
  }

  function canAddJournalTrade(addCount, trades, sync) {
    const n = addCount == null ? 1 : addCount;
    if (isUnlimitedJournal(sync)) return true;
    return countJournalTradesForLimit(journalTrades(trades)) + n <= FREE_TRADE_LIMIT;
  }

  function journalTradeSlotsRemaining(trades, sync) {
    if (isUnlimitedJournal(sync)) return Infinity;
    return Math.max(0, FREE_TRADE_LIMIT - countJournalTradesForLimit(journalTrades(trades)));
  }

  function countableTradeList(trades) {
    return (trades || []).filter(isCountableJournalTrade);
  }

  function scoreShareUnlocked(trades, sync) {
    const n = countJournalTradesForLimit(journalTrades(trades));
    if (n >= SCORE_SHARE_MIN_TRADES) return true;
    if (n >= 1 && isUnlimitedJournal(sync)) return true;
    return false;
  }

  function scoreShareLockCopy(trades, sync) {
    if (scoreShareUnlocked(trades, sync)) return "";
    const n = countJournalTradesForLimit(journalTrades(trades));
    const left = Math.max(0, SCORE_SHARE_MIN_TRADES - n);
    if (n <= 0 || left >= SCORE_SHARE_MIN_TRADES) {
      return "Log 3 trades to unlock your score & share card";
    }
    return left === 1
      ? "Log 1 more trade to unlock your score & share card"
      : "Log " + left + " more trades to unlock your score & share card";
  }

  function freeSlotsLabel(trades, sync) {
    if (isUnlimitedJournal(sync)) return "";
    const used = countJournalTradesForLimit(journalTrades(trades));
    const rem = Math.max(0, FREE_TRADE_LIMIT - used);
    if (used === 0) return FREE_TRADE_LIMIT + " free slots left";
    if (rem === 0) return "0 of " + FREE_TRADE_LIMIT + " free trades left";
    return rem + " of " + FREE_TRADE_LIMIT + " free trades left";
  }

  const api = {
    FREE_TRADE_LIMIT,
    SCORE_SHARE_MIN_TRADES,
    IMPORT_SOURCES,
    isImportedJournalTrade,
    isDemoJournalTrade,
    isCountableJournalTrade,
    countableTradeList,
    countJournalTradesForLimit,
    canAddJournalTrade,
    journalTradeSlotsRemaining,
    isUnlimitedJournal,
    scoreShareUnlocked,
    scoreShareLockCopy,
    freeSlotsLabel,
  };

  global.RunnrTradeLimit = api;
  global.FREE_TRADE_LIMIT = FREE_TRADE_LIMIT;
})(typeof window !== "undefined" ? window : globalThis);
