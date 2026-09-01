# Top 10 broker platforms — Runnr connector plan

Status legend: **done** · **csv** · **api-planned** · **oauth-blocked** · **research**

| # | Platform | Access reality | Runnr approach | Status |
|---|----------|----------------|----------------|--------|
| 1 | **Alpaca** | Official REST API, keys | Connect / status / sync + FIFO pairing | **done** |
| 2 | **Interactive Brokers** | Client Portal Web API, Flex queries, OAuth for some apps | Flex Web Service + CSV preset | **done** (Flex) / csv |
| 3 | **Trading 212** | Public API (Invest / Stocks ISA) + CSV export | CSV preset for all; operator env-key import is house-only (`email_is_boss`) | **done** (API house-only + csv) |
| 4 | **eToro** | No general retail trading API; CSV/history export | CSV preset only | **csv** done |
| 5 | **Robinhood** | No official public trading API for third parties | CSV if user export exists; do not scrape | **oauth-blocked** / csv |
| 6 | **Charles Schwab** | Trader API (OAuth) after TD merge — partner approval | CSV preset; OAuth later | **csv** done |
| 7 | **Fidelity** | No open retail trade API | CSV / brokerage export | **csv** |
| 8 | **Degiro** | Unofficial/community APIs fragile; CSV export | CSV preset | **csv** done |
| 9 | **Saxo** | OpenAPI (app registration) | OAuth app when credentials available | **api-planned** |
| 10 | **Plus500 / IG** | Mostly CFD; IG has limited dealer APIs | CSV / IG REST if account type allows | **csv** / research |

## Recommended build sequence

1. CSV presets for IBKR Activity Flex, T212 history, eToro account statement, Degiro transactions, Schwab “realized gain/loss”.
2. IBKR Flex Web Service (token in encrypted `broker_connections`).
3. Saxo OpenAPI (read-only scopes).
4. Schwab Trader API after OAuth app approval.
5. ~~T212 public API (Invest / Stocks ISA) — history/orders + positions, env keys on the API.~~

## Normalized fill shape (all connectors)

```json
{
  "id": "broker-unique-id",
  "symbol": "AAPL",
  "side": "buy",
  "qty": 10,
  "filled_qty": 10,
  "filled_avg_price": 190.5,
  "status": "filled",
  "submitted_at": "2026-01-01T15:00:00Z",
  "filled_at": "2026-01-01T15:00:01Z"
}
```

Positions (open):

```json
{
  "symbol": "AAPL",
  "qty": 10,
  "avg_entry_price": 190.5,
  "market_value": 1950,
  "unrealized_pl": 45
}
```

## CSV preset checklist

For each broker preset document:

- Example filename / export path in the broker UI
- Required columns (and aliases)
- Date timezone notes
- Options / FX rows (skip or map)
- Link from Sync page “CSV Import” help text
