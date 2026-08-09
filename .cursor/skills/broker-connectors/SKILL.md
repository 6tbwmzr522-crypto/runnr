---
name: broker-connectors
description: >-
  Plan and implement Runnr read-only broker connectors (Alpaca pattern, OAuth,
  CSV fallbacks). Use when adding or improving broker sync for Interactive Brokers,
  Trading 212, eToro, Robinhood, Schwab, Fidelity, Degiro, Saxo, Plus500, IG, or
  any trading-platform API / CSV import work in the runnr repository.
---

# Runnr broker connectors

You are the **broker-connector agent** for the Runnr repo. Goal: expand read-only trade/position sync beyond Alpaca, following existing Runnr patterns, without placing orders.

## Non-negotiables

1. **Read-only only** — never place, modify, or cancel orders.
2. **Encrypt secrets at rest** — reuse `app.crypto_util.encrypt` / `decrypt` and `broker_connections` (or an equivalent encrypted store).
3. **Same client import contract** — sync payloads must work with `js/sync.js` `importOrders` + `pairAlpacaRoundTrips` (or a shared rename). Prefer normalizing to Alpaca-like order/position shapes.
4. **Gate behind Runnr Pro + verified email** — match Alpaca (client `requirePro` / server auth).
5. **CSV is the universal fallback** — if official API is partner-only, scrape-blocked, or ToS-hostile, ship documented CSV mapping first; do not reverse-engineer private apps.
6. **Do not invent live prices** — never synthesize broker fills; fail clearly.

## Reference implementation (Alpaca)

| Layer | Path |
|-------|------|
| API routes | `api/app/routers/brokers.py` |
| Models | `api/app/models/brokers.py` |
| Client sync | `js/sync.js` (`connectAlpaca`, `runSync`, `importOrders`, `pairAlpacaRoundTrips`) |
| UI | Sync page in `index.html` (`connectBroker`, broker cards) |
| Storage | `broker_connections` table in `api/app/db.py` |

Pattern to copy per broker:

1. `POST /api/v1/brokers/{id}/connect` — validate credentials, encrypt, save.
2. `GET /api/v1/brokers/{id}/status` — equity / positions count / connected flag.
3. `GET /api/v1/brokers/{id}/sync` — closed fills + open positions (+ equity).
4. Normalize each fill to: `id`, `symbol`, `side`, `qty`/`filled_qty`, `filled_avg_price`, `status`, `filled_at`.
5. Client: import → FIFO pair buy/sell → journal + portfolio.

## Top 10 platforms (priority order)

See [platforms.md](platforms.md) for status, access type, and recommended approach.

Ship order:

1. Harden **Alpaca** (done — pairing + equity).
2. Expand **CSV presets** for IBKR, T212, eToro, Degiro, Schwab exports (fastest retail win).
3. **IBKR Client Portal / Flex** if Web API keys available.
4. **Trading 212** — public API if/when stable; else CSV.
5. Remaining brokers: OAuth/partner only → document + CSV until access exists.

## Workflow when asked to add a broker

1. Classify: **Official API / OAuth partner / CSV-only / Blocked**.
2. Update `docs/broker-connectors.md` and `platforms.md` status.
3. If API: implement connect/status/sync mirroring Alpaca; add UI card on Sync page.
4. If CSV: add named preset in CSV import (header aliases + sample row tip).
5. Tests: smoke-test normalize + pairing with fixture fills (no live keys in git).
6. Never commit API keys or `.env`.

## Output expectations

- Prefer small PRs: one broker or one CSV preset at a time.
- Mention ToS/API access limits honestly in the PR summary.
- Keep Runnr retail-pure: no Glacifraga/Baron branding in UI.
