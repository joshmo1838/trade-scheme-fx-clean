# SENFX Phase 3: persistent PAPER bot control plane

This code is **not** a Deriv execution engine. It records a customer's requested PAPER bot state so that a future independently deployed and validated worker can act on it. It does not trade and does not guarantee that any bot is running.

## Architecture
- `/bot-controls`: customer-only status/command screen. It intentionally displays **requested** vs **worker-observed** state separately.
- `/api/bot-control`: authenticated API. Returns disabled status when `SENFX_BOT_CONTROL_ENABLED` is not exactly `true`; this is the production default. `POST` is same-origin and only accepts `start`, `pause`, `resume`, `stop` for a customer-owned published paper bot.
- `lib/bots/control-state.ts`: deterministic pure state model, with no Deriv API or trader token.
- `supabase/senfx-persistent-bot-controls.sql`: two isolated, RLS-protected tables. Only the Supabase service role can enqueue a command through the atomic RPC. Clients have read-only row access to their own data.
- `bot_execution_runs.desired_state`: **requested** state, not execution.
- `bot_execution_runs.observed_state`: reported only by a separately deployed trusted worker, never mutated by this API.
- `bot_execution_runs.control_version`: monotonically increasing revision. A future worker must recheck the **latest version** and desired state immediately before entering any trade.
- `bot_execution_commands.id`: command idempotency key. Reusing it with a different customer, bot or action fails. Repeating the identical command returns its original revision without enqueueing a second command.
- `worker_id`, `heartbeat_at`, `lease_expires_at`: placeholders for a worker lease/heartbeat protocol. **No leasing/worker claim logic is implemented in Phase 3.**

## Deployment gates
1. Run `npm run test:controls`, `npm run typecheck`, `npm run build`, and the isolated PostgreSQL smoke test in GitHub CI.
2. Review the migration and test its RLS/policies before applying it to a real Supabase project; **do not apply it to production automatically**.
3. Keep `SENFX_BOT_CONTROL_ENABLED` absent or `false` in production until a persistent paper-only worker is deployed and verified. The API returns disabled by default and has no broker-buy code.
4. The worker must lease one run, atomically verify customer/market/account ownership and paper risk permissions before each paper entry, respect the last control revision, send durable heartbeat/observed-state updates, and fail closed on stale lease or stopped intent. Test crash, reconnect, account switch, duplicate commands and multi-device Stop.
5. Only after paper worker integration/ownership tests should the feature flag be enabled in a dedicated Preview environment. **No real-money trading or Deriv Demo contract purchase is authorized by this project phase.**

## Testing
`tests/bot-control.test.mjs` tests the state machine and checks SQL access boundaries. The CI PostgreSQL smoke test creates two synthetic customers and checks start/pause/resume/stop transitions, command replay, rejection of unpublished/unconfigured/foreign bots, service-only RPC execution, RLS cross-tenant isolation and the guarantee that no queued action falsely marks a worker as running.

## Current production behavior
The existing `CustomerBotCenter` browser paper simulator continues unchanged. These commands do not start that browser simulation. The feature remains OFF until the separate worker exists, and the UI explicitly shows that limitation. PR #17 for manual Deriv Demo broker execution is separate and **must not** be merged or activated by Phase 3.
