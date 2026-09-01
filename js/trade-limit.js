/**
 * Free-plan journal cap — manual entries and imported fills share one bucket.
 * Explicit demo seed rows (isDemo / seed) and merged-away pair legs do not count.
 * Bare ids 1–4 without that flag do count.
 */
(function (global) {
  "use strict";

  const FREE_TRADE_LIMIT = 10;
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

  const api = {
    FREE_TRADE_LIMIT,
    IMPORT_SOURCES,
    isImportedJournalTrade,
    isDemoJournalTrade,
    isCountableJournalTrade,
    countJournalTradesForLimit,
    canAddJournalTrade,
    journalTradeSlotsRemaining,
    isUnlimitedJournal,
  };

  global.RunnrTradeLimit = api;
  global.FREE_TRADE_LIMIT = FREE_TRADE_LIMIT;
})(typeof window !== "undefined" ? window : globalThis);
