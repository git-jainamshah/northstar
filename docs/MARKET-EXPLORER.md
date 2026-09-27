# Market explorer

Markets supports company/ticker search for Canadian and U.S. stock/ETF listings, underlying option-chain discovery (expiry, strike, call/put), futures roots by exchange and actual listed expiry, and locally saved watchlists. This replaces the fixed instrument-only display. It is searchable IBKR coverage, not a downloaded complete exchange catalog or simultaneous stream of every symbol.

Select an exact contract to request historical trade OHLCV candles at 1m, 5m, 1h or 1d. Charts support zoom, earlier/later navigation and keyboard/hover candle inspection. Up to 300 bars are retained; daily dates are session dates. Sessions are displayed consecutively. History is a one-shot request; use Refresh chart for new bars. Latest historical candles may be incomplete. Missing history is never reconstructed from sparse quote snapshots. Crypto uses actual completed Kraken hourly OHLCV candles.

The production browser POSTs an allowlisted read-only command to /api/explore using the existing private session cookie and same-origin check. Redis stores one workspace request for 180 seconds, rate limited to one per two seconds. The Mac receives it on its next 30-second relay upload, validates it, and asks the existing IBKR socket connection. Results return on the next upload; allow up to 60 seconds plus IBKR/provider response time. New requests replace the previous selection. Only one chart quote subscription is retained. Multiple browser windows share this single personal workspace.

The local pilot uses the same commands through its loopback-only server and polls results every two seconds. The relay cannot execute orders, run arbitrary code or request arbitrary URLs. Existing writer/viewer keys do not change. Keep the Mac and Gateway running. Historical permissions are distinct from delayed quote availability: denied requests show the IBKR error code. Option expiry/strike combinations are verified as exact contracts when selected; not every combination exists. Standard option chains appear before adjusted chains.

Validation: 70 Node tests and 10 Python tests. Real Gateway checks on September 27 returned AAPL stock candles (156 five-minute bars), MES December 2026 futures candles (180), SPY option chains, and SPY September 28 772 call candles (162). These are historical data checks, not observed paper executions or proof of live entitlements. An adjusted SPY option returned code 162 and was correctly shown as unavailable.

## Default board and background updates

Markets always shows a curated starter board: RY, SHOP, AAPL, MSFT; XIU, SPY, QQQ; MES, MNQ, CL; and the pilot SPY call/put. These are observation examples, not recommendations or a ranking. IBKR resolves the exact contracts and the connector subscribes independently of the page selection. Missing quotes stay visible as unavailable. The browser only requests historical bars when an instrument is selected.

Rendering patches existing DOM nodes instead of replacing the page on each poll. Focused forms and hovered/keyboard-inspected charts are preserved during background changes. Polling continues independently of typing, and automatic refresh does not introduce loading spinners or entrance animations.

Personal email/password sign-in replaces manual key pairing. Sessions renew during authenticated visits; new browsers sign in normally. See AUTH.md for password recovery and session protection.
