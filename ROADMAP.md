# Runnr Roadmap

## Done

### Launch blockers — retail onboarding
- Signup Continue always enters the app; confirm-email is a dismissible reminder
- Empty cloud sign-in keeps the local sample journal
- login.html password reset uses the emailed token (`forgot-password` then `reset-password`)
- Diagnose / Push / Pull hidden from the public Sync screen (house accounts still see them)
- PWA PNG icons (192 / 512) for iOS add-to-home-screen
- Alpaca secrets no longer stored in localStorage; privacy copy matches
- House / stats emails removed from public JS — `/auth/me` returns `house` and `can_view_stats`

### Baron von Richstone — Institutional-Grade Metrics (v53)
- `CoachEngine.institutionalMetrics()` — Sortino, recovery factor, PF significance
- Coach page panel + Baron published benchmark reference
- One-pager addendum: `docs/glacifraga-institutional-metrics-addendum.md`

## Parked
- Throwaway debug account can be cleaned up whenever.
