-- Read-only Deriv Demo release readiness report.
-- Run on production before any migration; does not alter tables or orders.
select
  (select count(*) from pg_indexes where schemaname='public' and tablename='deriv_demo_orders'
    and indexname in ('deriv_demo_orders_one_active_per_user','deriv_demo_orders_user_request_unique','deriv_demo_orders_account_contract_unique')) = 3
      as duplicate_protection_indexes_present,
  (select count(*) from pg_indexes where schemaname='public' and tablename='deriv_demo_daily_risk'
    and indexname='deriv_demo_daily_risk_pkey') = 1
      as risk_ledger_unique_key_present,
  (select count(*) from public.deriv_demo_orders where status in ('reserved','open','buy_unknown'))
      as unresolved_demo_orders,
  (select count(*) from public.deriv_demo_orders) as total_demo_orders,
  (select pg_get_functiondef(p.oid) like '%unlimitedDemoPractice%true%'
    from pg_proc p where p.pronamespace='public'::regnamespace
      and p.proname='senfx_demo_reserve_order' limit 1)
      as reservation_still_has_unlimited_practice_flag;
-- IMPORTANT: A passing structural report is NOT a backup restore test,
-- concurrency test, or authorization to enable broker purchases.
