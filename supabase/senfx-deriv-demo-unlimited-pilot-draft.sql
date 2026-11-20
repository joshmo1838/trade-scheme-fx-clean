-- REVIEW-ONLY migration draft. DO NOT APPLY TO PRODUCTION.
-- Requires a verified restorable backup, schema dependency review, isolated
-- database concurrency tests, and explicit approval before any application.
-- Does not enable Deriv broker purchases.
begin;
alter table public.deriv_demo_orders
  drop constraint if exists deriv_demo_orders_stake_amount_check;
alter table public.deriv_demo_orders
  add constraint deriv_demo_orders_stake_amount_check
  check (stake_amount > 0);
-- PostgreSQL numeric column precision, available Demo balance and Deriv
-- contract limits remain authoritative; no SENFX numeric stake ceiling.
alter table public.deriv_demo_orders
  drop constraint if exists deriv_demo_orders_ask_price_check;
alter table public.deriv_demo_orders
  add constraint deriv_demo_orders_ask_price_check
  check (ask_price > 0);
-- Keep daily_loss_limit column NOT NULL for legacy compatibility while
-- removing its equality-to-20 check; reservation logic must NOT use this
-- legacy column as a cap after a separately reviewed coordinated rollout.
alter table public.deriv_demo_daily_risk
  drop constraint if exists deriv_demo_daily_risk_daily_loss_limit_check;
-- Verify duplicate protection and one-active-order unique indexes separately;
-- do not drop either unique index during this migration.
commit;
