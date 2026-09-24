# Private hosted IBKR relay

The existing Gateway and Python connector stay on your Mac. A separate Node uploader sends an allowlisted quote snapshot over HTTPS every 30 seconds to Northstar on Vercel. Private Redis storage holds only the newest snapshot, expires it after five minutes, and atomically rejects older/duplicate snapshots. The hosted dashboard checks every 15 seconds while visible and unlocked. IBKR's own live/delayed data entitlement remains unchanged.

This is a single-owner pilot. It does not place orders, implement derivatives paper trading, upload account holdings, or make Gateway's socket publicly accessible. The original crypto ledger still has its independent hourly worker.

## Provision storage

In the Vercel team Storage page, create **Upstash for Redis**, choose the **Free** plan, and connect it to **northstar / Production** only. Do not upgrade to a paid plan for this pilot. The Marketplace installation requires accepting Vercel and Upstash terms; the owner must approve this step.

The backend accepts either `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`, or the Marketplace's `KV_REST_API_URL` / `KV_REST_API_TOKEN`. Use the read/write REST token, because the server must write snapshots. These values stay server-side; never put them in `dist`, GitHub, chat, or variables prefixed `NEXT_PUBLIC_`.

The database should be dedicated to this app. Redis credentials belong only on Vercel; the local uploader needs only its restricted Northstar ingest key.

## Configure access keys

Run `npm run setup:relay` once from this repository. It generates two independent 256-bit random keys without printing them:

- `.env.ibkr.local`: local upload URL and ingest key; loaded automatically by `npm run relay`.
- `.runtime/ibkr-hosted.env`: `NORTHSTAR_IBKR_INGEST_TOKEN` and `NORTHSTAR_IBKR_VIEW_TOKEN`, to import into Vercel Production environment variables.
- `.runtime/ibkr-view-key.txt`: the viewing key to enter in Northstar's **Unlock feed** form.

All three files are gitignored and mode 0600. Do not overwrite them or run setup again to rotate keys accidentally. Keep the writer and viewer keys different. Vercel must have both keys and the storage credentials; otherwise the website shows **Setup required** and returns no data. Redeploy after configuring the variables.

The allowed login origin defaults to `https://northstar-pi-pied.vercel.app`. For a future custom domain, set `NORTHSTAR_PUBLIC_ORIGIN` to that exact HTTPS origin, update `.env.ibkr.local` to the corresponding ingest URL, and redeploy. Preview deployments intentionally cannot authenticate against the production origin and should not receive production secrets.

## Run and view

1. Keep IB Gateway logged in and run `npm run pilot` (connector plus local dashboard).
2. In another terminal in this repository, run `npm run relay`.
3. Open the production Northstar website and use **Unlock feed** in Portfolio, Algorithm or Markets. Enter the viewing key from the private local file. Select **Futures → US** or **Options → US** to inspect the connected instruments.

The viewing key is exchanged for an eight-hour signed, Secure, HttpOnly, SameSite=Strict cookie. It is never saved in localStorage or embedded in a URL. **Lock feed** expires the cookie and clears displayed quotes. Rotating `NORTHSTAR_IBKR_VIEW_TOKEN` revokes all existing sessions. Login/logout enforce the configured origin; all private responses are `no-store`. These keys are deliberately high entropy; they are not user-chosen passwords or a multi-user authentication system.

Ctrl+C stops the relay. Closing Gateway, sleeping the Mac, stopping the connector, or losing connectivity will interrupt data. The uploader rejects snapshots older than 15 seconds, never rewrites source timestamps, and uses bounded 30-second to five-minute backoff. It records only a status and destination origin in `.runtime/ibkr-relay-status.json`, without secrets or quotes. The hosted view becomes disconnected after 90 seconds without a current source snapshot. After five minutes the stored snapshot expires entirely. Local freshness remains ten seconds for the worker and two minutes for bid/ask observations.

Only four initial instrument probes are configured. The relay carries up to the last 120 observed midpoint points per instrument; it is not a historical database. Native CAD/USD denominations and delayed/frozen labels remain intact. Qualifying as a fresh quote still does not enable execution.

## Costs and limits

Upstash's Free plan currently lists 500K monthly commands and 10 GB monthly bandwidth. Uploads every 30 seconds plus one visible dashboard checking every 15 seconds are intentionally modest, but scripting, additional tabs, retries, and other clients affect usage. Monitor the actual dashboard; free-plan exhaustion should produce an explicit unavailable state, never a silent paid upgrade. Vercel has its own usage limits. This pilot is not a tick-by-tick hosted feed.

Sources: https://upstash.com/pricing/redis and https://upstash.com/docs/redis/features/restapi.

## Deployment verification

- Before secrets/storage are configured: `/api/ibkr` must return `setup-required` with empty assets, and the page must visibly explain the missing setup.
- After configuration but before login: it must return `locked` with no storage read or quote payload.
- A valid writer must upload while an unsigned browser still cannot read that data.
- After unlocking: verify source timestamps, relay receipt time, instrument currency and feed type against the local pilot.
- After stopping the uploader: verify disconnected state after 90 seconds and empty/waiting state after storage expiry.

Tests exercise access separation, cookie expiry and key rotation, cross-origin rejection, input size/schema constraints, field allowlisting, stale-source handling, unavailable storage, and explicit setup/locked UI states. End-to-end deployment verification still requires provisioning the actual database and environment variables.
