/**
 * Journal countable-trade rules + trial/Pro entitlement.
 * Explicit demo seed rows (isDemo / seed) and merged-away pair legs do not count.
 * Bare ids 1–4 without that flag do count.
 * Entitlement is a 7-day trial (or Stripe Pro), not a free trade-count cap.
 */
(function (global) {
  "use strict";

  const SCORE_SHARE_MIN_TRADES = 3;
  const TRIAL_DAYS = 7;
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

  function billingOf(sync) {
    const RS = sync || global.RunnrSync;
    if (RS && typeof RS.billing === "function") return RS.billing() || {};
    return {};
  }

  function isUnlimitedJournal(sync) {
    const RS = sync || global.RunnrSync;
    if (RS && typeof RS.isPro === "function" && RS.isPro()) return true;
    const b = billingOf(sync);
    if (b && b.enabled === false) return true;
    return false;
  }

  function isPaidPro(sync) {
    const RS = sync || global.RunnrSync;
    const b = billingOf(sync);
    if (b && b.enabled === false) return true;
    if (RS && typeof RS.isHouse === "function" && RS.isHouse()) return true;
    const status = String((b && b.status) || "").toLowerCase();
    const plan = String((b && b.plan) || "").toLowerCase();
    return status === "active" || plan === "boss";
  }

  function journalTrades(trades) {
    if (trades) return trades;
    return (global.S && global.S.trades) || [];
  }

  function canAddJournalTrade(addCount, trades, sync) {
    const n = addCount == null ? 1 : addCount;
    if (n <= 0) return true;
    return isUnlimitedJournal(sync);
  }

  function journalTradeSlotsRemaining(trades, sync) {
    if (isUnlimitedJournal(sync)) return Infinity;
    return 0;
  }

  function countableTradeList(trades) {
    return (trades || []).filter(isCountableJournalTrade);
  }

  function scoreShareUnlocked(trades, sync) {
    const n = countJournalTradesForLimit(journalTrades(trades));
    if (n >= SCORE_SHARE_MIN_TRADES) return true;
    if (n >= 1 && isPaidPro(sync)) return true;
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

  function trialDaysLeft(sync) {
    const b = billingOf(sync);
    const n = Number(b && b.trialDaysLeft);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  }

  function trialActive(sync) {
    const b = billingOf(sync);
    return !!(b && b.trialActive);
  }

  function freeSlotsLabel(trades, sync) {
    if (isUnlimitedJournal(sync)) {
      if (trialActive(sync) && !isPaidPro(sync)) {
        const days = trialDaysLeft(sync);
        if (days <= 0) return "Last day of trial";
        if (days === 1) return "1 day left in trial";
        return days + " days left in trial";
      }
      return "";
    }
    const RS = sync || global.RunnrSync;
    const loggedIn = RS && typeof RS.isLoggedIn === "function" && RS.isLoggedIn();
    if (loggedIn) return "Trial ended — upgrade to keep Runnr";
    return "Sign in to start your 7-day trial";
  }

  const api = {
    SCORE_SHARE_MIN_TRADES,
    TRIAL_DAYS,
    IMPORT_SOURCES,
    isImportedJournalTrade,
    isDemoJournalTrade,
    isCountableJournalTrade,
    countableTradeList,
    countJournalTradesForLimit,
    canAddJournalTrade,
    journalTradeSlotsRemaining,
    isUnlimitedJournal,
    isPaidPro,
    scoreShareUnlocked,
    scoreShareLockCopy,
    freeSlotsLabel,
    trialDaysLeft,
    trialActive,
  };

  global.RunnrTradeLimit = api;
})(typeof window !== "undefined" ? window : globalThis);
