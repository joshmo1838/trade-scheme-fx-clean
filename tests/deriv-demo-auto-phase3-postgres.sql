-- Disposable PostgreSQL only. Execute AFTER the base fixture + phase-2 test.
-- The phase-2 test intentionally rolled its RPC back; reinstall phase-2 first.
\set ON_ERROR_STOP on
\ir ../supabase/senfx-deriv-demo-auto-phase2.sql

-- Simulate settlement of the authorized second $1 Demo trade without
-- overwriting its already consumed phase-2 grant or the initial trade.
update public.deriv_demo_orders set status='sold',buy_requested_at=now(),updated_at=now()
 where id='10000000-0000-4000-8000-000000000004' and status='reserved';
update public.deriv_demo_daily_risk set reserved_loss=0,realized_loss=0,updated_at=now()
 where user_id='00000000-0000-4000-8000-000000000001' and account_id='D2';
insert into public.deriv_demo_orders
 (id,request_id,user_id,account_id,currency,stake_amount,status,quote_expires_at)
values
 ('10000000-0000-4000-8000-000000000011','20000000-0000-4000-8000-000000000011',
  '00000000-0000-4000-8000-000000000001','D2','USD',1,'quoted',now()+interval '15 minutes');

\ir ../supabase/senfx-deriv-demo-auto-phase3.sql

do $prior$
declare v jsonb;
begin
 if (select count(*) from public.deriv_demo_orders
     where user_id='00000000-0000-4000-8000-000000000001' and buy_requested_at is not null) <> 2
 then raise exception 'Phase 3 fixture needs exactly two settled prior buy attempts'; end if;

 v:=public.senfx_demo_reserve_order(
  '00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000011');
 if v->>'allowed' is distinct from 'false' then
  raise exception 'Third attempt without phase-3 grant must be rejected: %',v;
 end if;
 if (select status from public.senfx_demo_auto_one_shots
    where user_id='00000000-0000-4000-8000-000000000001') <> 'reserved'
 then raise exception 'Second phase grant audit was changed'; end if;
end;
$prior$;

insert into public.senfx_demo_auto_phase3_one_shots
 (user_id,account_id,status,expires_at)
values
 ('00000000-0000-4000-8000-000000000001','D2','armed',now()+interval '2 hours');

do $third$
declare v jsonb;
begin
 v:=public.senfx_demo_reserve_order(
  '00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000011');
 if v->>'allowed' is distinct from 'true' or (v->>'reservedLoss')::numeric <> 1
  or (v->>'dailyLossLimit')::numeric <> 1
  or v->>'unlimitedDemoPractice' <> 'false'
 then raise exception 'A single $1 third authorization must reserve: %',v; end if;
 if (select status from public.senfx_demo_auto_phase3_one_shots
    where user_id='00000000-0000-4000-8000-000000000001') <> 'reserved'
 then raise exception 'Third grant not irreversibly consumed'; end if;
 if (select count(*) from public.deriv_demo_orders
     where user_id='00000000-0000-4000-8000-000000000001' and buy_requested_at is not null) <> 2
 then raise exception 'Historical Demo buy audit mutated'; end if;
 if has_table_privilege('authenticated','public.senfx_demo_auto_phase3_one_shots','SELECT')
    or has_table_privilege('anon','public.senfx_demo_auto_phase3_one_shots','SELECT')
 then raise exception 'Phase-3 grants leaked to client roles'; end if;

 v:=public.senfx_demo_reserve_order(
  '00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000011');
 if v->>'allowed' is distinct from 'false'
 then raise exception 'Duplicate third reservation must fail: %',v; end if;
end;
$third$;

-- A confirmed third attempt must NOT authorize a fourth, even if the previous
-- contract finished and the day's Demo loss budget remains unspent.
update public.deriv_demo_orders set status='sold',buy_requested_at=now(),updated_at=now()
 where id='10000000-0000-4000-8000-000000000011' and status='reserved';
update public.deriv_demo_daily_risk set reserved_loss=0,updated_at=now()
 where user_id='00000000-0000-4000-8000-000000000001' and account_id='D2';
insert into public.deriv_demo_orders
 (id,request_id,user_id,account_id,currency,stake_amount,status,quote_expires_at)
values
 ('10000000-0000-4000-8000-000000000012','20000000-0000-4000-8000-000000000012',
  '00000000-0000-4000-8000-000000000001','D2','USD',1,'quoted',now()+interval '15 minutes');

do $fourth$
declare v jsonb;
begin
 v:=public.senfx_demo_reserve_order(
  '00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000012');
 if v->>'allowed' is distinct from 'false'
 then raise exception 'Fourth Demo attempt must always fail: %',v; end if;
end;
$fourth$;

\ir ../supabase/senfx-deriv-demo-auto-phase3-rollback.sql

do $rollback$
declare v jsonb;
begin
 if (select status from public.senfx_demo_auto_phase3_one_shots
     where user_id='00000000-0000-4000-8000-000000000001') <> 'reserved'
  or (select count(*) from public.deriv_demo_orders
     where user_id='00000000-0000-4000-8000-000000000001'
       and buy_requested_at is not null) <> 3
 then raise exception 'Rollback destroyed phase-3 grant/trade audit'; end if;
 if (select pg_get_functiondef('public.senfx_demo_reserve_order(uuid,uuid)'::regprocedure)
      like '%v_auto_phase3%')
 then raise exception 'Phase-3 rollback did not restore phase-2 reservation RPC'; end if;
 v:=public.senfx_demo_reserve_order(
  '00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000012');
 if v->>'allowed' is distinct from 'false'
 then raise exception 'Rollback must forbid further virtual buys: %',v; end if;
end;
$rollback$;
