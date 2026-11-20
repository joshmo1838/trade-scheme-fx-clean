# Legacy Demo execution integration audit

Source inspected: `feature/senfx-deriv-demo-execution` (not merged).

## Verified in source
- `app/api/deriv/demo/orders/route.ts` POST checks `DERIV_DEMO_TRADING_ENABLED === "true"`, authenticates via `getDerivDemoContext`, and supports quote/buy actions.
- `lib/deriv/demo-server.ts` checks saved account type and independently queries Deriv account metadata, rejecting non-demo or inactive accounts.
- Buy path calls `senfx_demo_reserve_order` and `senfx_demo_mark_buy_attempt` before sending a purchase.
- The older `safeRisk` response explicitly reports `unlimitedDemoPractice: true` and `dailyLossLimit: null`.
- The old SQL comments say the daily loss cap is NOT ENFORCED. This violates the new rollout gate and must not be carried forward.

## Blockers before import or enablement
1. Enforce a daily loss cap atomically inside the reservation SQL, not just in browser or API JavaScript.
2. Bind the new server-side gate to every buy path; risk counters must come from a trustworthy transactionally reserved server state.
3. Reconcile current OAuth token storage and active account schema with legacy code and database migration.
4. Verify actual Deriv Demo account and current market/proposal protocol in isolated staging.
5. Add integration tests for duplicate requests, concurrency, unknown buy status, expired quotes, token expiry, account switching, emergency Stop, and settlement.
6. Keep `DERIV_DEMO_TRADING_ENABLED` unset or false until review, migrations, isolated testing, and explicit authorization.

No production migrations, broker calls, or orders are authorized by this audit.
