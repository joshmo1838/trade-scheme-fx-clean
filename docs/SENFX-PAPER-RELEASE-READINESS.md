# SENFX paper-only backend release gate (not a production activation)

Status: **Phase 3/4 SQL migrations have not been applied to production.**
The website source contains the API and paper-worker UI but the feature
gate must stay off until the data migrations and a real hosted worker test
are approved separately. Phase 2 Deriv contract-purchase PRs remain out of scope.

## Verified prerequisites (structural review, 2026-11-18)

Production already contains `bots`, `customer_bots`,
`customer_bot_configurations`, `customer_paper_trades`,
`customer_paper_trade_reservations`, and `customer_paper_daily_risk`,
with the expected dependent columns. Production has no
`bot_execution_runs`, `bot_execution_commands`, or
`bot_execution_paper_positions` yet. No production DDL has been run.

Run `supabase/preflight/senfx-paper-release-readiness.sql` read-only
and inspect the results before release. Check extension permissions,
column/index conflicts, risk reservation counts, and existing grants.
Recheck all assumptions immediately before migration.

## Isolated migration test

GitHub CI uses a disposable Supabase CLI stack, local Auth JWTs,
PostgREST and PostgreSQL. It applies the Phase 3 AND Phase 4 migration
scripts after the paper-risk prerequisite, and exercises the actual
customer ownership RLS policies, privileged worker lease, reserve,
customer-isolated risk rows, Stop cancellation and stale-worker rejection.

These local tests do not replace a production backup or hosted integration
test, and they do not execute Deriv broker contracts.

## Production release checklist (manual, separate explicit approval)

1. Identify the latest CI-verified commit and confirm production site
   `SENFX_BOT_CONTROL_ENABLED` and worker
   `SENFX_PAPER_WORKER_ENABLED` are unset/false. Do not enable Demo
   or Real contract purchasing.
2. **Obtain and verify a restorable production database backup.** Use
   Supabase's supported backup/export procedure with privately held
   credentials. Do not echo secrets into CI logs, chat or source code.
   Free-plan backup/PITR capabilities vary; **do not assume PITR exists**.
   Document the backup timestamp, scope, retention and a tested recovery.
3. Review existing paper reservations, current database schema,
   RLS policies and function grants. Run the read-only preflight.
   Stop if a preexisting active risk reservation needs investigation.
4. After an authorized maintenance window and explicit migration approval,
   apply `supabase/senfx-persistent-bot-controls.sql` and then
   `supabase/senfx-persistent-paper-worker.sql` using versioned,
   reviewed migrations. The existing paper-risk ledger is already
   present in production; do not reset or repopulate it.
5. Confirm new tables default to zero rows and have RLS enabled,
   authenticated **SELECT** policies restrict customer IDs, customers
   cannot mutate worker tables, and the privileged RPCs execute only as
   `service_role`. Check database linter and REST schema reload.
6. First test a dedicated customer paper-only worker in isolated hosting
   with minimal credentials, one replica, live public ticks, and a
   disposable account. Validate heartbeats, multiple-device Stop,
   Pause/Resume, position cancellation, reconnect, stale lease,
   fail-closed errors and full customer separation. Keep production
   feature flags disabled until independently verified and approved.

## Rollback / incident response

- **Immediate stop:** disable `SENFX_PAPER_WORKER_ENABLED`, stop all
  test workers and set `SENFX_BOT_CONTROL_ENABLED=false`; verify no
  active leases, accepted paper entries or new commands.
- Do **not** delete historical paper trades, cancel arbitrary customer
  reservations directly, or DROP new tables as an unreviewed rollback.
  Destructive rollback can erase audit records or release reserved risk
  incorrectly. Prefer keeping the tables inert while investigating.
- If a schema-level rollback is necessary, coordinate a reviewed
  forward-fix or restoration from the **verified** backup, with a
  maintenance window and post-restore RLS/row-count verification.
- Revert a Vercel release only through an explicitly identified,
  previously READY deployment; a code rollback does not reverse SQL.
- Preserve a change log: SQL migration versions, Git SHA,
  production deployment ID, approvals, and verification results.

**Hard gate:** SQL install/feature activation is NOT automatic just because
GitHub tests pass. No profitability, uptime or trading return is promised.
