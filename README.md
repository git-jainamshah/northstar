# Northstar

A Canada-first research workspace and **CAD $100 live-data paper-trading pilot**. No real brokerage connection, credentials, deposits, leverage, or order execution exists in this codebase.

## What works

- Public Kraken BTC/CAD and ETH/CAD top-of-book and completed hourly candles.
- Persistent simulated account, fee/slippage-aware fills, cash and BTC benchmarks, decision journal, equity history, heartbeat, and data-quality failures.
- Explainable 12/48-hour trend baseline with 24-hour momentum filter.
- Online logistic-regression learner in **shadow mode**. Predict → score → learn on chronological completed candles; no automatic promotion into execution.
- Canada/U.S. stock, option, and futures coverage displayed honestly as unavailable/blocked. The older Discover page remains explicitly synthetic educational content.
- Local minute polling; hosted hourly GitHub Actions pilot; Vercel dashboard/API ready.

## Quick start (Node 24)

No npm dependencies or install step required.

```sh
npm test
npm run check
npm run tick      # one real-data / simulated-money observation
npm run dev       # http://127.0.0.1:4173
npm run worker    # in another terminal; continues while this machine is awake
```

Local data is stored atomically in `.runtime/state.json` (ignored by Git). Never delete it to conceal losses. The lock refuses concurrent writers; a crash may leave a lock that an operator must inspect before removing. Local and hosted ledgers are separate experiments; do not combine their P/L.

## GitHub → Vercel

1. Import the private `git-jainamshah/northstar` repository into Vercel. Root: repository root; framework: Other; output: `dist`; build: `npm run check`. Node 24.
2. Main is the production branch. Feature branches/PRs receive Vercel previews when the Git integration is enabled. CI runs tests and syntax checks.
3. The `northstar-state` branch is excluded from Vercel deployments. The hourly paper workflow creates it and commits `.northstar/state.json` using the built-in repository Actions token.
4. For the dashboard to read the private ledger, set **`NORTHSTAR_STATE_TOKEN`** as a Vercel server-side secret. Use a fine-grained GitHub token restricted to this repository with **Contents: read-only**. Never put it in frontend code, a `PUBLIC_` variable, a chat message, or Git.
5. The read-only token is optional for the public quote API; without it, the dashboard explicitly reports unknown equity/heartbeat rather than pretending the ledger is connected. The worker can run independently.
6. Check the actual workflow runs and state-branch commits before claiming monitoring is active. GitHub schedules may be delayed or dropped; Vercel free cron supports daily cadence only. This is not continuous or microsecond execution.

The workflow runs at minute 17 each hour, plus an initial main push and manual dispatch. It has a 4-minute timeout and one-writer concurrency. No paid service is provisioned. Actions consume the account's included quota; verify the account's spending controls, and do not enable paid overages for this $0 experiment. Quota exhaustion can stop runs. A dedicated worker would be needed for reliable minute polling independent of a personal computer.

## Risk and execution assumptions

- Starting cash: CAD $100; maximum invested cost per position: $20; total invested cost: $40; reserve on entry: $60.
- Long-only spot, no leverage or shorting. Options/futures disabled. USD assets blocked until verified FX support exists.
- Buys use ask + 10 bps slippage; sells use bid − 10 bps. Assumed fee: 40 bps each way. These are experimental assumptions, not a verified broker fee schedule.
- Require metadata minimum size/cost, precision, and online status. Entry size ≤10% of displayed ask quantity; exits also require displayed bid liquidity. A blocked exit leaves exposure open and is logged.
- Reject stale (>120 seconds), crossed or future books. Reject gaps, nonpositive closes, and incomplete or stale hourly history. Public book timestamps describe the latest level update, not a guaranteed executable time.
- New entries require spread ≤35 bps and a new completed hourly bar. Six-hour cooldown after fills; exits checked each tick.
- 3% position stop / 6% profit exit. Portfolio drawdown ≥5% or loss ≥CAD $2 from UTC-day starting equity latches a halt; exits attempted with valid data. A halt needs operator review and a separately audited code/state change to resume.
- Stops are not guaranteed. Hourly scheduling, gaps, outages, and liquidity can cause materially larger losses. Stale positions remain marked with their last bid and are labelled estimates.
- Equity uses estimated liquidation value after exit costs. Cost includes entry fees. Realized P/L, unrealized P/L, and fees are separate. Fees are already in P/L and must not be subtracted twice.

## Learning and validation

The learner uses prior 1-, 6-, and 24-hour returns with online regularized logistic updates. The first 100 observations warm up; subsequent chronological predictions are scored before updating weights. Scores include the initial recent historical window, not only forward-live observations. Initial history is limited to Kraken's recent 720 hourly records; this is far too little to establish broad strategy robustness. Brier score is compared with a 0.5 baseline; directional accuracy is not trading profit. The learner does not change risk, choose assets, or place simulated trades.

A candidate's future promotion would require longer licensed adjusted history, walk-forward validation across market regimes, untouched holdout periods, transaction-cost sensitivity, benchmark comparison, and a separate human-reviewed version. No claim of being the safest, best, or profitable algorithm is made.

## Architecture

- `lib/market.js`: read-only public provider adapter and quality gates.
- `lib/engine.js`: deterministic paper-only risk/execution/accounting.
- `lib/learning.js`: incremental shadow model, isolated from execution.
- `lib/store.js`: atomic local ledger and writer lock.
- `scripts/github-tick.js`: GitHub state-branch persistence with optimistic SHA updates.
- `api/market.js`: public quotes; short cache, original timestamps retained.
- `api/paper.js`: sanitized read-only paper report from the private ledger.
- `dist/`: responsive vanilla JS UI; user-generated/provider text escaped.
- `tests/`: financial arithmetic, data failure, execution, risk and learning checks.

The older `.openai/hosting.json` is a local record of the previous Sites deployment; it is excluded from the GitHub import. The old chatgpt.site remains the original static prototype until deliberately retired; the Vercel pilot is a separate deployment.

See [data coverage](docs/DATA-COVERAGE.md) for what the free pilot cannot do.

## IBKR local pilot

A read-only gateway connector and private dashboard are now available. Start with `npm run pilot` after SDK setup. See [IBKR-PILOT.md](docs/IBKR-PILOT.md) for setup, feed entitlements, limitations and restart instructions. This does not enable derivatives execution or publish brokerage data to Vercel.

## Private hosted IBKR relay

The website now shows an explicit IBKR setup/locked state. Optional private Redis storage and separate upload/view keys connect the local pilot to the hosted dashboard. See [IBKR-RELAY.md](docs/IBKR-RELAY.md). The relay does not enable derivatives execution or remove provider data delays.
