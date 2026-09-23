# Data coverage and operational limits

Reviewed 2026-09-23. No paid subscription or exchange entitlement was purchased.

| Coverage | Pilot status | Requirements before enabling |
|---|---|---|
| Kraken BTC/CAD, ETH/CAD | Live public quotes and hourly candles | No account/key; venue-specific, not all crypto markets |
| TSX, TSXV, Canadian ETFs | Not connected | Confirm provider entitlement, venue vs consolidated coverage, delay, redistribution/non-display permissions, adjusted history, exchange calendar |
| U.S. stocks and ETFs | Not connected | Verify venue/consolidated coverage, FX, timestamps, corporate actions, fractional execution assumptions |
| Canadian options | Not connected; execution blocked | Montréal Exchange coverage, contract definitions, option chains, bid/ask liquidity, multiplier, expiry, exercise/assignment, fees |
| U.S. options | Not connected; execution blocked | Licensed OPRA coverage or explicitly limited venue data; contract and lifecycle engine |
| Canadian/U.S. futures | Not connected; execution blocked | Exchange-specific feeds, actual contract specifications, expiry/roll, tick values and verified margin requirements |

One free API has not been verified to supply all requested instruments with executable real-time consolidated quotes. Do not replace missing data with delayed scraped prices while labelling them live.

Twelve Data documents Canadian NEO-L venue coverage for Canadian listings; this is not evidence of an entitlement to every Canadian venue or a full consolidated book. Databento's venue directory is useful for U.S. futures/options research, but it must not be assumed to cover TSX or Montréal Exchange without confirmation.

Public crypto data enables a technical pilot; it does not make crypto appropriate for a particular person's savings. The CAD $100 balance here is fictional.

## Sources

- Kraken OHLC: https://docs.kraken.com/api-reference/market-data/get-ohlc-data (last candle is unfinished; maximum 720 recent entries).
- Kraken order book: https://docs.kraken.com/api-reference/market-data/get-order-book
- Kraken instrument metadata: https://docs.kraken.com/api-reference/market-data/get-tradable-asset-pairs
- Canadian coverage: https://support.twelvedata.com/en/articles/15303158-canadian-equities-market-data
- Databento venues: https://databento.com/venues
- Vercel cron limits: https://vercel.com/docs/cron-jobs/usage-and-pricing
- GitHub schedule limitations: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule

## Before interpreting results

This system has no microsecond latency target. The hourly worker and candle model cannot measure high-frequency opportunities. Paper fills omit queue priority, market impact beyond assumed slippage, partial fills, and tax. They are an approximation, not evidence of actual broker execution. A few winning trades do not establish statistical confidence. The dashboard should display losses and idle periods without selecting only favourable examples.
