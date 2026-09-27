# IBKR local data pilot

This connector reads market data using the official IBKR TWS Python SDK and a logged-in IB Gateway/TWS. It never requests account balances, positions, or credentials and contains no order placement calls. The existing crypto strategy and saved portfolio are unchanged. The separate options research simulator uses eligible quotes; see OPTIONS-RESEARCH.md. No broker execution is enabled.

## Start / stop

After the SDK setup below, keep IB Gateway logged in and run `npm run pilot` from the repository. Open http://127.0.0.1:4176/#markets. Ctrl+C stops both the connector and local web server. Your Mac must remain awake. This is a foreground pilot, not an installed login service.

The local portfolio is the existing `.runtime/state.json`, separate from the hosted paper ledger. The pilot does not start the crypto trading worker. Use Markets and Algorithm to inspect the IBKR data connection.

The connector detects localhost ports 4002, 4001, 7497 and 7496 in that order (paper ports first). To select a specific port, run `npm run ibkr -- --port 4001` and `PORT=4176 npm run dev` separately. The default API client ID is 73, configurable with `--client-id`. A single-writer process lock prevents conflicting snapshots. Only one Northstar connector should run.

## SDK setup (Mac / Linux)

Download the official Mac/Unix TWS API package from https://interactivebrokers.github.io/ and review its terms. The tested package is 10.50.02, Python package `ibapi==10.50.2`, with `protobuf==5.29.5`. Install in an isolated environment; do not commit or redistribute the downloaded SDK:

```sh
python3 -m venv .runtime/ibkr-venv
# Replace the following path with the extracted official SDK directory.
.runtime/ibkr-venv/bin/pip install /path/to/IBJts/source/pythonclient
npm run pilot
```

The SDK and virtual environment are ignored under `.runtime/`. Python 3.14 was used on this Mac. `fcntl` locking means this launcher currently targets Mac/Linux.

## Gateway settings

Use IB Gateway API settings to permit local socket clients and keep Read-Only API enabled. If asked to approve a local API connection, check that it is Northstar on localhost. Do not expose the socket port publicly. Market data entitlements are separate from login and API connectivity. No subscription or snapshot purchase is performed by the connector.

## Small instrument universe

- Canadian stock: RY, CAD, SMART with TSE primary exchange.
- U.S. ETF: SPY, USD, SMART.
- Futures: earliest unexpired MES contract returned by IBKR, CME, USD.
- Option: a SPY call and put selected from the actual chain using the nearest strike to an actual underlying last/close/ask, with the next available expiry at least tomorrow (UTC). IBKR must confirm the exact contract. This is a connectivity probe, not a recommendation or strategy selection.

This is not all-market coverage. Contract expiry selection refreshes on connector restart/reconnect; restart before the next session when testing expiring instruments. The chain may return no qualifying contract or underlying price, in which case the UI remains unavailable.

## Data integrity and recovery

The connector requests market-data type 3: live data is returned when entitled; otherwise IBKR may return delayed data. The UI uses IBKR's data-type callbacks and delayed tick codes to distinguish live, frozen, delayed, delayed-frozen and unknown. Missing bids/asks remain missing; last reported trades are shown separately and may be from an earlier session.

`receivedAt` is local receipt time, not exchange event time. Quotes older than 120 seconds on either side, invalid/crossed quotes, unknown modes, errors and disconnected feeds cannot qualify as live simulation inputs. The separate options simulator applies its own stricter execution checks and allows explicitly delayed research; see OPTIONS-RESEARCH.md.

Heartbeat checks run every 15 seconds; lack of a response for 45 seconds triggers reconnect. Reconnection uses bounded 2–60 second backoff, exact contract discovery and resubscription. Authentication, gateway approval and entitlement failures still require user action. Restarting resets the bounded 1,800-point per-instrument observation chart; no historical bars are fabricated. Gaps in usable quotes are represented as chart gaps.

The worker atomically writes `.runtime/ibkr.json` with restricted file permissions every second. The local server marks a snapshot offline after 10 seconds without a write. Browser checks every 2 seconds are local reads, not IBKR REST requests. No account identifiers, credentials or raw account-bearing gateway errors are saved.

## Hosted Northstar

The hosted `/api/ibkr` endpoint now shows an explicit setup or locked state. It cannot reach this Mac's localhost gateway directly. An optional authenticated outbound relay can publish private snapshots once configured; see [IBKR-RELAY.md](IBKR-RELAY.md). Without that separate relay, no quotes are uploaded. Quotes are never written to GitHub.

## Troubleshooting delayed instead of live data

`reqMarketDataType(3)` already means "live where entitled, delayed otherwise" — IBKR ignores the delayed request when live is available, so no code change is needed to prioritise a subscription. If quotes still show delayed after subscribing, the terminal running `npm run pilot` now prints the reason IBKR gave, per symbol:

- `[IBKR data] SYMBOL: live|delayed|frozen|delayed-frozen` — every time a symbol's feed type changes.
- `[IBKR <code>] SYMBOL: <reason>` — whenever IBKR reports an entitlement or session code for that symbol.

Common codes and what they mean:

| Code | Meaning | What to do |
| --- | --- | --- |
| 10197 | Another session (Client Portal, IBKR Mobile, or a second TWS/Gateway login) is holding the live feed for this account. | Close Client Portal and the mobile app, then restart Gateway. Only one session can hold live entitlements at a time. |
| 354 / 10167 | Live subscription missing or not yet propagated to the API. | Confirm the subscription covers this exact exchange, then wait one trading session — IBKR entitlements can take time to reach the API layer after purchase. |
| 10168 | No entitlement at all; delayed data is also unavailable for this instrument. | Check the subscription actually covers this instrument/exchange. |
| 10089 / 10090 / 10091 | An additional market-data add-on is required for part or all of this request. | Review the specific add-on (e.g. streaming, snapshot bundle) against what was purchased. |
| 326 | Another Northstar connector is already using this API client ID. | Stop the other process; only one connector should run at a time. |
| 502 / 504 | Cannot reach, or not connected to, the Gateway API port. | Check Gateway is running, logged in, and API access is enabled in its settings. |

The Markets page's connection strip surfaces the same information in plain language: a live/delayed count per feed, and a one-line hint keyed off the most recent code above (see `FEED_HINTS` in `dist/ibkr.js`).

## Validation

`npm test`, `npm run check`, and `npm run test:ibkr` verify quote freshness, feed-type handling, malformed/crossed prices, gaps, bounded history, UI currency/escaping and isolation of the public endpoint. For a bounded live check: `npm run ibkr -- --seconds 30` (stop any existing worker first).
