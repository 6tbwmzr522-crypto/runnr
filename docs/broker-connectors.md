# Runnr broker connectors

Plan for read-only broker sync beyond Alpaca. Implementation agent: Cursor skill `.cursor/skills/broker-connectors/`.

## Principles

- Read-only (no order placement)
- Encrypted API secrets
- Normalize to a common fill/position shape for `js/sync.js` pairing
- CSV fallback when APIs are unavailable
- Paid entitlement (Runnr Pro) + verified email

## Top 10

| Platform | Path |
|----------|------|
| Alpaca | **Live** — API sync |
| Interactive Brokers | **Live** — Flex Web Service + CSV preset |
| Trading 212 | **CSV preset** for all accounts; **operator API** (`T212_API_KEY` / `T212_API_SECRET`) is house-only (`RUNNR_BOSS_EMAILS` / `email_is_boss`) |
| eToro | **CSV preset** |
| Robinhood | No official API — CSV if exportable; no scraping |
| Charles Schwab | **CSV preset** → OAuth Trader API later |
| Fidelity | CSV |
| Degiro | **CSV preset** |
| Saxo | OpenAPI when app registered |
| Plus500 / IG | CSV / IG API research |

Detail and status table: `.cursor/skills/broker-connectors/platforms.md`.

## Near-term work

1. ~~CSV header presets for IBKR, T212, eToro, Degiro, Schwab~~
2. ~~IBKR Flex token connect (encrypted), pull closed trades~~
3. Saxo / Schwab OAuth when app credentials available
4. Fidelity + IG CSV presets

## Out of scope

- Order execution
- Scraping broker mobile/web sessions
- Glacifraga / institutional branding in retail UI
