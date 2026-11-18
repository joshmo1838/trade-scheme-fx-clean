-- Read-only production rollout preflight. Never applies DDL or edits customer data.
-- Execute only against the intended production project.
with expected_tables(name) as (
  values ('bots'),('customer_bots'),('customer_bot_configurations'),
   ('customer_paper_trades'),('customer_paper_trade_reservations'),
   ('customer_paper_daily_risk')
), checks as (
  select e.name,
         to_regclass('public.'||e.name) is not null as present,
         coalesce((select c.relrowsecurity from pg_class c
             join pg_namespace n on n.oid=c.relnamespace
           where n.nspname='public' and c.relname=e.name),false) as rls_enabled
  from expected_tables e
)
select name,present,rls_enabled from checks order by name;
-- Separate sensitive-data-free counts: if nonzero open reservations exist,
-- halt migration until an authorized administrator reviews them.
select status,count(*) as reservation_count
  from public.customer_paper_trade_reservations
  group by status order by status;
-- The Phase 3/4 tables should be absent until separately approved and installed.
select to_regclass('public.bot_execution_runs') as phase3_runs,
       to_regclass('public.bot_execution_commands') as phase3_commands,
       to_regclass('public.bot_execution_paper_positions') as phase4_positions;
