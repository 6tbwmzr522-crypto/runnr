/**
 * Light revenge / overtrade brake — consecutive logged LOSS outcomes only.
 * SAMPLE/demo: warn-only sheet. Signed-in free/trial: cool-down gate with override.
 * Does not invent broker fills; uses journal/plan WIN·LOSS·BE chips.
 */
(function (global) {
  "use strict";

  const LOSS_STREAK = 3;
  const COOLDOWN_MS = 15 * 60 * 1000;
  const MODAL_ID = "modal-cooldown";

  function S() {
    return global.S || (global.window && global.window.S) || {};
  }

  function persist() {
    if (typeof global.persist === "function") global.persist();
  }

  function isLoggedIn() {
    try {
      if (global.RunnrSync && typeof RunnrSync.isLoggedIn === "function" && RunnrSync.isLoggedIn()) {
        return true;
      }
    } catch (e) {}
    try {
      if (global.localStorage && localStorage.getItem("runnr_api_token")) return true;
    } catch (e) {}
    return false;
  }

  function isSampleBook(state) {
    const st = state || S();
    try {
      if (global.RunnrDemoSandbox && typeof RunnrDemoSandbox.isDemoState === "function") {
        return !!RunnrDemoSandbox.isDemoState(st);
      }
    } catch (e) {}
    return !isLoggedIn();
  }

  function mode(state) {
    if (isLoggedIn()) return "hard";
    if (isSampleBook(state)) return "soft";
    return "soft";
  }

  function loggedOutcome(t) {
    const o = String((t && t.outcome) || "").toLowerCase();
    if (o === "loss") return "loss";
    if (o === "win") return "win";
    if (o === "be" || o === "breakeven") return "be";
    return "";
  }

  function outcomeRows(trades) {
    return (trades || []).filter((t) => t && !t.mergedAway && loggedOutcome(t));
  }

  function consecutiveLoggedLosses(trades) {
    const rows = outcomeRows(trades);
    let n = 0;
    for (let i = 0; i < rows.length; i++) {
      if (loggedOutcome(rows[i]) === "loss") n += 1;
      else break;
    }
    return n;
  }

  function streakKey(trades) {
    const rows = outcomeRows(trades);
    const ids = [];
    for (let i = 0; i < rows.length; i++) {
      if (loggedOutcome(rows[i]) !== "loss") break;
      ids.push(String(rows[i].id));
    }
    return ids.join(",");
  }

  function cooldownState(state) {
    const st = state || S();
    if (!st.cooldown || typeof st.cooldown !== "object") st.cooldown = {};
    return st.cooldown;
  }

  function remainingMs(cd, now) {
    const until = Number(cd && cd.until) || 0;
    const t = typeof now === "number" ? now : Date.now();
    return Math.max(0, until - t);
  }

  function inspect(trades, now, state) {
    const st = state || S();
    const list = trades || st.trades || [];
    const t = typeof now === "number" ? now : Date.now();
    const cd = cooldownState(st);
    const left = remainingMs(cd, t);
    const m = mode(st);
    const streak = consecutiveLoggedLosses(list);
    const active = left > 0;
    return {
      active: active,
      remainingMs: left,
      minutes: left > 0 ? Math.max(1, Math.ceil(left / 60000)) : 0,
      mode: m,
      hard: m === "hard" && active,
      soft: m === "soft",
      reason: cd.reason || "loss-streak",
      streak: streak,
      threshold: LOSS_STREAK,
      broke: !!cd.broke,
      until: Number(cd.until) || 0,
      sample: isSampleBook(st),
    };
  }

  function shouldBlockLog(trades, now, state) {
    return inspect(trades, now, state).hard === true;
  }

  function armIfNeeded(trades, now, state) {
    const st = state || S();
    const list = trades || st.trades || [];
    const t = typeof now === "number" ? now : Date.now();
    const streak = consecutiveLoggedLosses(list);
    const cd = cooldownState(st);
    const key = streakKey(list);
    if (streak < LOSS_STREAK) return inspect(list, t, st);
    if (cd.broke && key && key === cd.overrideKey) return inspect(list, t, st);
    if (remainingMs(cd, t) > 0) return inspect(list, t, st);
    if (cd.armedKey === key && Number(cd.until) > 0) return inspect(list, t, st);
    st.cooldown = {
      until: t + COOLDOWN_MS,
      startedAt: t,
      reason: "loss-streak",
      streak: streak,
      mode: mode(st),
      armedKey: key,
      broke: false,
    };
    persist();
    return inspect(list, t, st);
  }

  function stampBroke(trades) {
    const rows = outcomeRows(trades);
    for (let i = 0; i < rows.length; i++) {
      if (loggedOutcome(rows[i]) === "loss") {
        rows[i].brokeCooldown = true;
        const note = String(rows[i].challengeNote || "").trim();
        if (!/broke cool-down/i.test(note)) {
          rows[i].challengeNote = note ? note + " · broke cool-down" : "broke cool-down";
        }
        return rows[i];
      }
    }
    return null;
  }

  function override(now, state) {
    const st = state || S();
    const t = typeof now === "number" ? now : Date.now();
    const cd = cooldownState(st);
    const key = streakKey(st.trades);
    st.cooldown = Object.assign({}, cd, {
      until: 0,
      broke: true,
      brokeAt: t,
      overrideKey: key || cd.armedKey || "",
    });
    stampBroke(st.trades);
    persist();
    if (typeof global.renderJournal === "function") global.renderJournal();
    if (typeof global.updateHomeStats === "function") global.updateHomeStats();
    return inspect(st.trades, t, st);
  }

  function copyFor(view) {
    const mins = view && view.minutes ? view.minutes : 15;
    if (view && view.mode === "soft") {
      return "Three logged losses in a row. SAMPLE warning — sit on hands for " +
        mins + " minutes. You can still size.";
    }
    return "Three logged losses in a row. Sit on hands for " + mins +
      " minutes. Override still logs “broke cool-down”.";
  }

  function timerLabel(view) {
    if (!view || !view.active) return "";
    if (view.minutes <= 1) return "About a minute left";
    return view.minutes + " minutes left";
  }

  function paintSheet(view) {
    const doc = global.document;
    if (!doc) return false;
    const copy = doc.getElementById("cooldown-copy");
    const timer = doc.getElementById("cooldown-timer");
    const overrideBtn = doc.getElementById("cooldown-override");
    const waitBtn = doc.getElementById("cooldown-wait");
    const modal = doc.getElementById(MODAL_ID);
    if (copy) copy.textContent = copyFor(view);
    if (timer) {
      timer.textContent = timerLabel(view);
      timer.hidden = !view || !view.active;
    }
    if (overrideBtn) {
      overrideBtn.hidden = false;
      overrideBtn.textContent = view && view.mode === "soft"
        ? "Keep sizing — warning only"
        : "Trade anyway — log broke cool-down";
    }
    if (waitBtn) waitBtn.textContent = "I'll wait";
    if (modal) modal.classList.toggle("cooldown-soft", !!(view && view.mode === "soft"));
    return true;
  }

  function openModal() {
    const doc = global.document;
    if (!doc) return false;
    if (typeof global.openModal === "function") {
      global.openModal(MODAL_ID);
      return true;
    }
    const el = doc.getElementById(MODAL_ID);
    if (!el) return false;
    el.classList.add("open");
    return true;
  }

  function closeSheet() {
    if (typeof global.closeModal === "function") {
      global.closeModal(MODAL_ID);
      return true;
    }
    const el = global.document && document.getElementById(MODAL_ID);
    if (el) el.classList.remove("open");
    return true;
  }

  function showSheet(trades, now, state) {
    const view = inspect(trades, now, state);
    paintSheet(view);
    return openModal();
  }

  function afterOutcome(trades, now, state) {
    const st = state || S();
    const list = trades || st.trades || [];
    const before = inspect(list, now, st);
    const view = armIfNeeded(list, now, st);
    if (view && view.active && (view.remainingMs > 0) && (!before.active || view.until !== before.until)) {
      showSheet(list, now, st);
    } else if (view && view.active && view.hard) {
      showSheet(list, now, st);
    }
    return view;
  }

  function bind() {
    const doc = global.document;
    if (!doc || doc.documentElement.dataset.cooldownBound === "1") return;
    doc.documentElement.dataset.cooldownBound = "1";
    doc.addEventListener("click", function (e) {
      const t = e.target;
      if (!t || !t.closest) return;
      if (t.closest("#cooldown-wait") || t.closest("#modal-cooldown .modal-close")) {
        closeSheet();
        return;
      }
      if (t.closest("#cooldown-override")) {
        override(Date.now());
        closeSheet();
        if (typeof global.showToast === "function") {
          showToast("Cool-down", mode() === "soft" ? "SAMPLE warning noted" : "Broke cool-down — logged");
        }
      }
    });
  }

  const api = {
    LOSS_STREAK,
    COOLDOWN_MS,
    MODAL_ID,
    mode,
    loggedOutcome,
    consecutiveLoggedLosses,
    inspect,
    shouldBlockLog,
    armIfNeeded,
    override,
    copyFor,
    timerLabel,
    paintSheet,
    showSheet,
    afterOutcome,
    bind,
  };

  global.RunnrCooldown = api;
  if (global.document && global.document.readyState !== "loading") bind();
  else if (global.document) global.document.addEventListener("DOMContentLoaded", bind);
})(typeof window !== "undefined" ? window : globalThis);
