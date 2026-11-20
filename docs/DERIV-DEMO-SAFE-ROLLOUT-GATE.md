# Deriv Demo Safe Rollout — Integration Gate

Status: development only; no broker execution enabled by this document.

## Existing assets
- Production main: existing customer Deriv OAuth and paper research workspace.
- Source branch `feature/senfx-deriv-demo-execution`: Demo order API, console, server session helper and SQL migrations; these are NOT integrated into main.

## Mandatory gates before merge
1. Adapt Demo order code to current main without replacing the existing OAuth callback, customer account selection, or paper-bot paths.
2. Fail closed for any Real account ID/type; server verifies the account is a Deriv virtual/demo account on every request and before any buy. Never accept client-only demo assertions.
3. Broker execution feature flag defaults OFF, including preview; no auto-start or background orders. Require explicit per-order customer action and same-origin authenticated session.
4. Add hard per-order stake, concurrent order, daily loss, aggregate exposure and rate limits; reject orders when limits cannot be confirmed. Do not import the older unlimited-learning daily-loss bypass.
5. Implement idempotent order reservations, uncertain-buy reconciliation, broker-confirmed settlement, and emergency Stop that prevents new orders. Never blindly retry an uncertain purchase.
6. Audit and test token handling, RLS, service-role boundaries, CSRF/origin checks and account ownership; no credentials in client logs.
7. Dry-run SQL against an isolated test database, verify rollback and existing production schema compatibility; never apply migrations to production as part of this PR.
8. Run TypeScript, build, route, auth, paper-worker, 15-bot regression and Demo integration tests. Record actual outputs and Vercel preview results.
9. Test one customer-authorized Deriv Demo order end-to-end only in a separately approved isolated test environment. No live-money orders.
10. Review exact commit SHA and obtain separate approval before production merge, DB migration, feature enablement, or any real-money rollout.

Do not merge this document-only branch as proof that execution is implemented or tested.
