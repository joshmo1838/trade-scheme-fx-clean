# Trade Scheme FX 3.0 — Safe integration baseline

Status: implementation branch; **not production ready**.

## Baselines and rollback
- Production main SHA at branch creation: `cfe0146052a5e6e902f119ea1ac99d92ac4339c5`.
- AI suite preview baseline: `8f2642a392cf8eafd329986e6c6c897967010af0`.
- AI suite divergence observed: 64 ahead / 122 behind main; common ancestor `cb568243635d9c997ea0e413eb1ab1fe5a54ae76`.
- New branch starts from production main to preserve current working code.
- Rollback requires retaining the production SHA and verifying deployment/DB restore separately; no database migration is authorized merely by this document.

## Integration sequence
1. Inventory current production dashboard, auth, existing 15 bot strategies, Deriv account selection, Supabase schema and open PRs. Do not rename strategies or delete routes.
2. Integrate AI suite components selectively, with conflict-aware review against latest main; retain existing dashboard behavior and security controls.
3. Build one responsive trading workspace with accessible navigation, live chart, bot management, research, Time Machine, Smart Entry, Risk Guardian, portfolio and history. Keep authentication routes.
4. Verify official Deriv API contracts before wiring market data, proposals, Demo-only orders, balance reset and markup reporting. Markup stays disabled.
5. Add offline mocks, account-type isolation, idempotency, emergency-stop, concurrency and rate-limit tests. No broker purchase without independently verified safety gate and direct customer Demo-session consent.
6. Validate typecheck/build, security, all bot strategy regression tests, preview and independent release gate. Verify backup and restore before production changes. Merge only when green.

## Fail-closed invariants
- Never enable Real-money automated execution.
- Never reset Demo balances without explicit per-reset user confirmation.
- Never expose Deriv tokens, Supabase service keys or other credentials in source or logs.
- Never bypass production release gate, skip tests, force merges or silently change any bot strategy.
- Research scores are not guaranteed win probabilities or evidence of a profitable edge.
- Retrying financial actions requires reconciliation/idempotency; do not blindly resubmit.
- Preserve customer data, existing URL compatibility and independently verified rollback.

## Acceptance criteria
- All 15 original strategies remain functional with verified regression coverage.
- Unified mobile/desktop workspace passes build, UI and auth checks.
- Deriv Demo-only execution and reset controls fail closed and require verified consent.
- Main production SHA is advanced only after independent gate approval and observed READY production deployment.
- Feature status is reported separately for code, CI, preview and production.
