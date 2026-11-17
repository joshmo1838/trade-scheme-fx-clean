# SENFX execution architecture and release gates

## Intent and hard boundaries
Build one reusable strategy engine plus a separately authorized broker execution adapter. No code in this document authorizes trading.
The existing website uses Vercel Next.js, Supabase Auth/Postgres and Deriv. Current `CustomerBotCenter` runs **browser-bound paper simulations**. Its public tick socket cannot survive a closed tab. The separate `worker/senfx-forward-worker.mjs` is one R_100 research-only forward tester, not an authenticated customer execution worker.

The existing PR #6 (`feature/senfx-deriv-demo-execution`) is an **unmerged** manual-only Demo contract lifecycle implementation. Do not merge or enable it based on a passing build alone. It also includes an unlimited-Demo-learning upgrade; validate order-level limits, account isolation and reconciliation before considering release.

## Live architecture
- Browser (Vercel): Next.js single-screen workspace and explicit customer commands; **never** send authenticated Deriv WebSocket OTPs or encrypted bearer tokens to the browser.
- Supabase: customer ownership policies, encrypted server-only Deriv connections, bot strategy drafts and versions, desired vs observed worker state, command IDs, current orders, immutable audit events and trade history. Use row-level security and least-privilege service credentials.
- Control plane (Vercel authenticated API): validate requested bot start/pause/resume/stop, exact customer and active account identity, mode (paper vs Demo), strategy version, current features, and order-risk controls; persist an idempotent command, rather than opening a long-lived socket.
- Worker (separately deployed, continuously supervised service): lease one bot session at a time, restore durable state after restart, consume market prices, call the **same tested pure evaluator** as the browser, and obtain server-side authorization for any broker proposal/buy/sell. Stop after disconnect, expiry, account switch or risk limit. Use backoff and heartbeat; do not automatically retry an ambiguous purchase.
- Broker adapter: Deriv Demo account **only** for phase 1. Request a fresh proposal, require explicit user confirmation for initial manual Demo trades, reconcile purchased contracts and settlement from Deriv's authoritative responses. No Real account execution path.
- Observability: live status, heartbeat age, quote latency, order state and contract ID (per customer only), errors, emergency-stop acknowledgements, alerting, and evidence that no unauthorized trades were placed.

## Execution phases and pass criteria
1. **Shared strategy paper evaluator (this pull request).** Extract the SMA presets from the browser into `lib/bots/paper-strategy.ts`; fail closed on bad data and add CI regression tests. Existing paper execution and Supabase risk reservation remain unchanged. No actual broker buys.
2. **Manual Demo lifecycle on isolated Preview.** Rebase/review PR #6 against current main; review both Demo SQL migrations and all security/ownership/risk controls; test an isolated database rollback smoke suite. Register an exact Preview OAuth callback with Deriv. Keep production `DERIV_DEMO_TRADING_ENABLED` disabled; for Preview test one manually confirmed Demo quote, buy, open contract, sell and settlement end-to-end, including disconnection, timeout, duplicate submission, and unknown purchase reconciliation. Require a QA report before merge.
3. **Persistent control-plane bot states.** Introduce `bot_execution_runs` and `bot_execution_commands` with customer/Deriv account ownership and idempotency, state transitions `stopped -> starting -> running <-> paused -> stopping -> stopped`, stale-heartbeat handling, and emergency stop. No unattended broker buys yet.
4. **Persistent paper worker.** Reuse the tested pure strategy function; put public tick socket and task state in worker, keep browser as controller only. Verify it runs after closing browser and can be stopped safely from another device. Check all paper risk reservations and audit rows on server.
5. **Gated strategy-driven Demo worker.** Initially one customer, one bot, one Demo account, one open contract. Compare quotes to Demo API actual contract terms; enforce configured per-trade, session and stop-loss limits, max position concurrency, and no stale execution after pause. Persist/reconcile every order, and prove idempotency under worker restart.
6. **Bot marketplace and strategy versions.** Publish each strategy only after validating its entry/exit logic, supported markets and contracts, limitations, audit trail, backtest with realistic contract pricing, and forward Demo results. The names shown in the video are product concepts, not validated strategies.
7. **Broader staged rollout.** Canary users and safe alerts; load tests, rate limit tests, multi-account isolation, security audits, operator runbooks and rollback. No profit guarantees. Real-money support requires a separate legal/compliance and technical release decision and explicit authorization.

## Required negative tests
- Anonymous requests and other users' IDs cannot read orders, control bots or fetch tokens.
- Selecting a Real account cannot trigger a Demo or Real purchase.
- Replaying a command/order ID never causes a second purchase; ambiguous buys block rather than retry.
- Pausing and stopping persists and prevents new orders after acknowledgement.
- Deriv disconnected, stale prices, expired OAuth, invalid proposal, worker restart, database outage and risk enforcement failure all stop safely.
- One customer cannot see another customer's balance, execution settings or contract history.
- A Vercel deployment alone is never treated as proof of working bots.

## Current deployment
Release only the newest reviewed, CI-passing GitHub `main` once the existing Vercel deployment limit allows it. Do not change Deriv auth scopes, credentials, payments, existing production trading flags, or merge PR #6 as part of a deployment quota retry. Confirm the deployed SHA and actual publicly reachable routes.
