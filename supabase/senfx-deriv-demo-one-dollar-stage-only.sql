-- ISOLATED QA / STAGING ONLY — DO NOT APPLY TO PRODUCTION.
-- This is a proposal for the explicitly authorized ONE $1 USD virtual-money
-- Deriv Demo buy. No real accounts, automatic execution, or live migrations.
-- Prerequisites: operator-verified restorable backup; isolated QA restore;
-- tested reservation RPC; reviewed account ownership/RLS/concurrency gates.
-- Fail closed unless Demo order and risk-ledger tables are empty in the
-- target QA database. Preserve unique/idempotency/active-order indexes.
begin;
do $guard$
begin
  if exists (select 1 from public.deriv_demo_orders limit 1)
     or exists (select 1 from public.deriv_demo_daily_risk limit 1) then
    raise exception 'One-dollar pilot schema change requires empty, isolated QA Demo tables';
  end if;
end;
$guard$;

alter table public.deriv_demo_orders
  drop constraint if exists deriv_demo_orders_stake_amount_check;
alter table public.deriv_demo_orders
  add constraint deriv_demo_orders_stake_amount_check
  check (stake_amount = 1);

alter table public.deriv_demo_orders
  drop constraint if exists deriv_demo_orders_ask_price_check;
alter table public.deriv_demo_orders
  add constraint deriv_demo_orders_ask_price_check
  check (ask_price > 0 and ask_price <= 1);

alter table public.deriv_demo_daily_risk
  drop constraint if exists deriv_demo_daily_risk_daily_loss_limit_check;
alter table public.deriv_demo_daily_risk
  add constraint deriv_demo_daily_risk_daily_loss_limit_check
  check (daily_loss_limit = 1);
commit;

-- A matching, separately tested replacement senfx_demo_reserve_order RPC
-- must also enforce one-attempt-per-user, 1 USD currency and maximum
-- 1 USD aggregate virtual loss before any Demo execution feature flag.
-- Never apply the unlimited-pilot-draft.sql variant for this release.
