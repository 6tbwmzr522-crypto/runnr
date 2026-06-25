# Runnr

Mobile-first trading discipline app: position sizing, journal, watchlist, portfolio analytics, and Coach insights.

Pairs with **Glacifraga Baron** — same 38-ticker universe and 1% / 2× ATR / 4× ATR risk model.

## Features

- **Sizer** — CFD, shares (Baron preset), options (3-rule gate), crypto
- **Watch** — live prices, entry-zone alerts, push notifications
- **Journal** — discipline flags, CSV import/export
- **Coach** — insights from your real trade data
- **Portfolio** — equity curve, discipline donut, heatmap
- **PWA** — installable, offline shell for the app shell

## Run locally

```bash
cd ~/Desktop/runnr
python3 -m http.server 8080
# open http://localhost:8080
```

Or open `index.html` via a local server (required for service worker).

## Deploy (GitHub Pages)

1. Create repo `runnr` on GitHub
2. Push this folder:

```bash
git init
git add .
git commit -m "Runnr v1 — PWA, Baron, Coach"
git remote add origin git@github.com:YOUR_USER/runnr.git
git push -u origin main
```

3. Repo **Settings → Pages → Source: GitHub Actions**
4. The workflow `.github/workflows/pages.yml` publishes on push to `main`

Live URL: `https://YOUR_USER.github.io/runnr/`

## Project layout

```
runnr/
  index.html          # main app
  js/baron.js         # Baron 38-ticker sizing
  js/coach.js         # journal insight engine
  manifest.webmanifest
  sw.js               # offline cache
  icons/
```

## Data

All journal/watchlist data stays in **localStorage** on your device (`runnr_state`, `runnr_alerts`).
