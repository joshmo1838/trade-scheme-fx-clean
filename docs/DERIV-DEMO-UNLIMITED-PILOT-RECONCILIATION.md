# Deriv Demo unlimited-practice reconciliation — REVIEW ONLY

Status: design-stage, not a production migration. Broker purchases remain hard-disabled. This plan is for the one explicitly authorized pilot user, not every customer.

## Verified existing constraints
- public.deriv_demo_orders.stake_amount_check requires stake_amount = 10.
- public.deriv_demo_orders.ask_price_check requires ask_price > 0 and <= 10.
- public.deriv_demo_daily_risk.daily_loss_limit_check requires daily_loss_limit = 20.
- The live senfx_demo_reserve_order routine is the legacy unlimited-loss version, but has no reliable one-active-order, finite stake, or broker-side consent checks.
- A UNIQUE (user_id, request_id) constraint protects idempotency; unique active-order index on (user_id) WHERE status IN ('reserved','open','buy_unknown') provides one active order per user.
- All seven senfx_demo_* RPCs are callable by service_role, not anon or authenticated.
- The current pure offline JS execution gate permits positive finite stakes and cumulative Demo losses without SENFX-defined numeric ceilings, while requiring explicit consent, verified Demo account status, risk-state verification, Emergency Stop clearance, a UUID request key, and at most one outstanding order. This is advisory only and does not establish database atomicity.\n- Production still contains the incompatible fixed-limit CHECK constraints and legacy reservation routine. The coordinated API/SQL migration has not been applied or independently verified. Broker execution remains prohibited pending separate authorization.

## Intended pilot behavior
- No SENFX-defined numerical maximum stake or cumulative daily loss; broker virtual balance, quote, contract limits and finite positive numeric validation still apply.
- Never accept a real-money account; independently verify broker account type on every order.
- Restrict access to the configured pilot user, require explicit consent for each buy, respect persistent emergency stop, one active order and idempotency.
- Treat unresolved/unknown buys as active until broker reconciliation. Fail closed on missing or inconsistent risk state.
- Limit request rate and reject unreasonably large/invalid numeric input before calling broker; this is not a trading stake ceiling.
- Preserve customer functions and unrelated tables. No automatic enrollment, trading, or production activation.

## Ordered release gates
1. Verify a restorable production backup and recovery procedure, with explicit operator signoff; user declined paid Supabase QA branch.
2. Review all order lifecycle functions and API/UI callers; audit privilege boundaries, RLS, emergency stop, quote validation and real-vs-demo verification.
3. Prepare a single transactional migration removing only the three fixed-limit CHECK constraints, preserving positive finite numeric validation and unique indexes. Keep daily_loss_limit compatible with existing NOT NULL schema or revise schema/function outputs together; never partially change.
4. Replace reservation, settlement and cancellation logic as a coordinated unit, using row locks / unique index to enforce one active order; test duplicate and concurrent requests, failed/unknown buy reconciliation, settlement idempotency, daily rollover, and rollback.
5. Update offline JS gate, tests, API response, and UI for unlimited pilot Demo while preserving default fail-closed behavior for non-pilot users. Do not change production limits by simply disabling validation.
6. Run migration tests on an isolated, non-production database with a restore exercise, GitHub CI, security advisor, and reviewer approval.
7. Only after successful verification request separate authorization for the exact production migration and later broker activation. Do not turn on DERIV_DEMO_TRADING_ENABLED or remove DEMO_BUY_SAFETY_HOLD as part of schema reconciliation.

## Stop conditions
Missing backup/restore proof; unverified emergency stop or pilot identity; inconsistent settlement accounting; failure to test concurrent reservations; unresolved schema dependencies; unexpected production SHA. Stop without production changes.
