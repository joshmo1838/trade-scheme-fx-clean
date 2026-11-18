# SENFX offline worker lifecycle QA

This is **not** a real Supabase, Deriv Demo, Deriv Real, or production integration test.

The test starts the actual \`worker/senfx-customer-paper-worker.mjs\` as a
separate Node.js process. Two test-only module shims replace the Supabase client
and public Deriv WebSocket. They forbid outbound HTTP access and reject any
unexpected RPC, non-public WebSocket, endpoint, or secret.

The synthetic scenario exercises actual worker orchestration:
START accepted, fresh synthetic market feed, signal creation, mock server risk
reservation, five-tick mock settlement, PAUSE, RESUME, and STOP. The parent
asserts event order and exactly one paper reserve/settlement. A child-process
timeout fails CI rather than leaving a worker process running.

Use \`npm run test:worker-e2e\` to run locally. This is included in GitHub CI.

**Limits:** The mock does not prove real websocket compatibility, cloud uptime,
live Supabase RLS policies, authenticated customer actions, broker pricing,
market profitability, or successful production activation. Those still need a
reviewed isolated backend and authorized end-to-end tests. Keep both actual
trading and production paper-worker controls disabled.
