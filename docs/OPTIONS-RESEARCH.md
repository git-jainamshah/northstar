# Options research pilot

This is a separate CAD $10,000 fictional ledger. The original CAD $100 crypto account remains independent. The local worker never calls IBKR order or account APIs. Futures are observation-only.

## Running it

Run `npm run pilot` from the project. It starts Gateway quote collection, the options simulator and local dashboard (port 4176). When `.env.ibkr.local` exists, it also starts the existing private hosted relay. Do not additionally run `npm run relay` at the same time. Keep the Mac awake and Gateway signed in. Restart the command after a Mac restart; no system login service is installed.

`npm run options` starts only the simulator for troubleshooting. Its lock prevents concurrent writers. `.runtime/options-state.json` is the durable ledger; `.runtime/options-report.json` is its private display projection. Neither file is committed. A malformed ledger stops the worker rather than resetting its capital.

Production receives allowlisted quote and fictional research fields every 30 seconds. Local evaluation runs every second; this is not a subsecond execution service. Hosted quotes stay private using the existing eight-hour browser cookie. Connection controls are under Connection settings / Connect workspace. Keys remain server-side except the existing manual private-view login; no credentials are embedded in website assets.

## Data requirements

- One exact nearest eligible SPY call returned by IBKR's actual option chain, whole contract multiplier 100. Contract selection refreshes on UTC date change. Existing contracts remain subscribed until expiry day ends.
- Entitled **live** bid, ask, bid size and ask size, each no older than 10 seconds. At least one contract must be displayed on both sides. Local receipt times, not exchange timestamps.
- Live USD/CAD (IDEALPRO) bid/ask no older than 120 seconds, used for simulated conversion at each leg.
- Delayed, frozen, crossed, missing, errored, stale and disconnected data cannot produce trades. A feed gap clears model warmup.
- Regular New York weekday hours only; stop entries and request liquidation from 15:55. Holiday/early-close calendar is not integrated: missing quotes stop fills, and an open position can remain unresolved. Do not use this pilot for real orders.

## Model and execution

This is an experimental rules-based momentum projection, **not a trained ML policy or calibrated probability of profit**. Thirteen observations over at least two minutes project the option premium trend five minutes forward. Drift is capped at ±10%. The range uses two historical standard deviations scaled to the horizon; it is a scenario, not a confidence interval or maximum loss.

An entry needs projected net profit above CAD $2 after costs, spread ≤5%, and premium plus fee ≤CAD $1,000 and available cash. One long call contract at a time, no expiry-day entry, no shorts/leverage. Costs are explicit assumptions: USD $1 commission per leg plus 0.1% adverse slippage, current bid/ask spread and current FX spread. These are not a broker commission schedule. No liquidity queue model exists; shown size does not guarantee a real execution.

Every paper order waits at least one second for a **later two-sided option quote**; entry conditions are rechecked. Unfilled intents expire after 30 seconds. Exit after five minutes, at 10% loss/15% gain after costs, a risk stop, or session close. A 60-second cooldown follows exit. Entries halt at CAD $300 daily equity loss or $500 peak drawdown; the halt persists for review. Stops only execute with valid data and can be exceeded. Missing exit quotes retain the position, flag valuation stale and gap the chart. Expired unresolved holdings are not silently settled or marked to zero; manual reconciliation is needed.

The entry projection is frozen when the buy fills. Predicted/actual P&L and direction accuracy include only five-minute exits executed within 10 seconds of the target; stop/target/late exits are excluded. Win rate includes all closed trades, net of costs. Lifetime counters persist beyond the retained 1,000-fill local journal; hosted UI retains 40 fills and 240 equity observations.

## Validation

`npm test`, `npm run check`, `npm run test:ibkr`. Synthetic quotes are used only in unit tests, never substituted for the real pilot feed.
