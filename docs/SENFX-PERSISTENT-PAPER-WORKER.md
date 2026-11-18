# SENFX Phase 4: persistent, customer-controlled PAPER worker

**Status:** implementation/CI preview. This is not a Deriv Demo broker contract engine.
The worker consumes only Deriv PUBLIC ticks; it never sends any authenticated trading request.
Existing `worker/senfx-forward-worker.mjs` is a separate research worker; **do not replace its Railway start command**.

## Code and relationships
- `worker/senfx-customer-paper-worker.mjs`: separate Node.js 22+ service, off by default. Reads customer paper run intent and market ticks, computes the exact same learning presets as the Bot Center via `lib/bots/paper-strategy.ts`, requests risk-checked illustrative 5-tick paper entries, and settles them through the existing stored paper reservation RPCs. No customer Deriv OAuth token is used.
- `supabase/senfx-persistent-bot-controls.sql`: Phase 3 command queue and RLS, prerequisite.
- `supabase/senfx-paper-risk-controls.sql`: existing paper risk ledger and reservation RPCs, prerequisite.
- `supabase/senfx-persistent-paper-worker.sql`: Phase 4 migration. Implements short, exclusive leases; atomic control revision checks; stops/pauses cancel unfinished paper reservations; server-verified entries and settlements; one open position per run.
- `/api/bot-control` and `/bot-controls`: show live worker connection only while both its database lease and heartbeat are fresh. Stale workers show **OFFLINE / UNVERIFIED**.
- `tests/paper-worker.test.mjs` and `supabase/tests/senfx-persistent-paper-worker-smoke-test.sql`: static safety checks and isolated PostgreSQL lifecycle tests.

## Release order (do not skip)
1. Full GitHub CI green, including isolated PostgreSQL migration + risk reservation tests.
2. Review current production schema and preexisting paper risk rows. Apply `supabase/senfx-persistent-bot-controls.sql` **only once reviewed**, then `supabase/senfx-persistent-paper-worker.sql`. The latter requires the existing paper risk controls. Back up database first, plan rollback, and perform RLS/permissions audit. Never paste the service-role key into chat or source code.
3. Create a **separate** Railway worker service connected to this repository. It must not inherit the existing forward-worker service start command from `railway.json`. Override the new worker's start command with `npm run worker:paper`; configure **one replica**, restart on failure, and use a private variable `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in that service only.
4. Keep `SENFX_PAPER_WORKER_ENABLED=false` until a dedicated test environment is ready. Start a test instance with `SENFX_PAPER_WORKER_ENABLED=true` only in that **separate worker service**. Do not enable any `DERIV_DEMO_TRADING_ENABLED`, Real, broker-buy or autonomous order environment flag.
5. Keep the website's `SENFX_BOT_CONTROL_ENABLED` unset/false until the worker has passed authenticated tests: customer bot selection, saved stake/daily loss limit, Start → fresh public prices → observed running → paper result, Pause/Stop cancellation, Resume, multi-device Stop, worker restart, stale lease, disconnected feed, RLS cross-tenant isolation and no broker trades.
6. Only then enable `SENFX_BOT_CONTROL_ENABLED=true` in an approved Preview website environment and test again. For production, obtain explicit release approval and confirm actual metrics and rollback readiness.

## Safety and limits
- **Paper only.** Simulated outcome after five distinct subsequent quote timestamps, with illustrative 1:1 payoff; this is not Deriv contract pricing and says nothing about future win rate.
- At most ten recently updated customer runs per worker process in the current implementation; no multi-worker horizontal scaling is promised.
- Browser closing does not stop a deployed independent worker. The service must actually be hosted, running and connected for this to work. Cloud uptime is not guaranteed.
- SQL refuses paper entries when the lease expires, a different worker owns the run, the saved command version changes, the run is paused/stopped, a trade is already open, the bot is not published or selected, or the daily paper-risk budget is exhausted.
- Any uncertain or disconnected paper reservation remains conservatively held until a worker can reconcile or cancel it. No automatic retry of an unknown outcome.
- A queued Start command is never proof of a running worker. Check `workerConnected`, `observed_state`, heartbeat and lease.
- Do not merge the separate Deriv Demo purchase PR #17 or unfinished PR #6 as part of this phase. No real-money execution is in scope.

## Developer commands
```sh
npm run test:engine
npm run test:controls
npm run test:paper-worker
npm run typecheck
npm run build
# New, private Railway worker service only, after migrations and verification:
npm run worker:paper
```

## Phase 8: simulated public-feed outage test

The independent hermetic worker CI job now launches the **actual paper worker**
in a second scenario. The test-only WebSocket disconnects permanently after
210 virtual public ticks, refusing reconnection without contacting Deriv.
The test verifies that the worker had first reported `running`, later
reports `starting` instead of falsely staying connected, does not reserve
new simulated risk while offline, and can acknowledge Stop without a feed.
This is separate from the successful normal Start → settlement → Pause →
Resume → Stop scenario, and separate from real PostgreSQL/GoTrue RLS checks.

A simulated outage is NOT proof that deployed Railway's network, hosted
Supabase operations, or live Deriv public feed have been tested. The worker
remains disabled in the hosted QA service.
