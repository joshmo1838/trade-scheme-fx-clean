# SENFX R_100 continuous forward paper worker

This worker is separate from the Vercel website. It runs as one persistent Railway service and subscribes only to Deriv's public R_100 market-data feed. It does not authenticate a customer Deriv account, place orders, or use real funds.

## Prerequisites

- Node.js 22 or newer.
- A Supabase project used by this SENFX deployment.
- Railway service connected to this repository.
- Apply `supabase/senfx-forward-worker.sql` in the Supabase SQL Editor.

## Railway service configuration

Create a new Railway service from this GitHub repository and set the service root to the repository root.

Railway detects `railway.json`; the start command is:

```sh
npm run worker:forward
```

Set exactly one replica for this service. Do not run multiple copies of the same forward-test worker.

Add these Railway Variables (secrets must be entered in Railway, never committed to Git):

- `SUPABASE_URL`: Supabase project URL.
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service-role key. Treat this as a password; never put it in browser code or Vercel public variables.
- `SENFX_FORWARD_RUN_ID`: optional; defaults to `r100-strict-v1`.

Node.js 22+ is required for the built-in WebSocket client. Railway should restart the process after an unexpected exit.

## What it does

- Restores the saved run state from Supabase.
- Uses the most recent completed historical one-minute candles only to warm up indicators on a brand-new run; these candles are not counted as forward-test trades.
- Subscribes to public R_100 ticks and constructs one-minute OHLC candles.
- Keeps the Strategy Lab's current strict rules: EMA 9/21/50 alignment; RSI 52–67 CALL or 33–48 PUT; simplified ADX-like strength >= 23; ATR/price < 0.4%; three-price confirmation; 55-bar warm-up; one paper position at a time; outcome after five subsequent completed one-minute candles.
- Persists run state and each completed paper outcome to Supabase.
- Reconnects with exponential backoff up to 30 seconds.
- Stops after 200 completed forward paper trades.

## Research limitations

The existing ADX-like formula is a simplified directional-strength calculation, not a fully Wilder-smoothed ADX. Outcomes are five-bar directional comparisons with illustrative +1R/-1R results, not Deriv contract payouts. No spread, slippage, contract pricing, or payout structure is modeled. Historical replay and forward results must be reported separately.

The worker can continue if the user's computer is off, but only while the Railway service remains deployed and running and its billing/usage limits allow it. A cloud host cannot guarantee uninterrupted uptime; monitor Railway service health and logs.

## Existing browser-only results

The previous Strategy Lab's forward results lived in browser memory and were not saved. Do not silently add the previously displayed three wins to the cloud sample: they cannot be independently reconstructed from the old page state. The new persisted sample begins with the cloud worker's first completed trade after deployment.
