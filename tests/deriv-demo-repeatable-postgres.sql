-- Disposable Postgres 17 fixture only. NEVER run in hosted production.
\set ON_ERROR_STOP on

-- The preceding phase-2 fixture intentionally kept a synthetic reservation.
-- Settle that SYNTHETIC order before testing the production migration guard.
update public.deriv_demo_orders
  set status='sold', buy_requested_at=now()-interval '5 minutes'
  where id='10000000-0000-4000-8000-000000000004' and status='reserved';
update public.deriv_demo_daily_risk set reserved_loss=0
  where user_id='00000000-0000-4000-8000-000000000001' and account_id='D2';

\ir ../supabase/senfx-deriv-demo-repeatable-manual.sql

insert into public.deriv_connections(user_id,active_account_id,active_account_type,expires_at)
 values ('00000000-0000-4000-8000-000000000008','D8','demo',now()+interval '1 day');

insert into public.deriv_demo_orders(id,request_id,user_id,account_id,currency,stake_amount,status,quote_expires_at)
 values
 ('10000000-0000-4000-8000-000000000011','20000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000008','D8','USD',1,'quoted',now()+interval '10 minutes'),
 ('10000000-0000-4000-8000-000000000012','20000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000008','D8','USD',1,'quoted',now()+interval '10 minutes'),
 ('10000000-0000-4000-8000-000000000013','20000000-0000-4000-8000-000000000013','00000000-0000-4000-8000-000000000008','D8','USD',1,'quoted',now()+interval '10 minutes');

do $checks$
declare r jsonb;
begin
 r:=public.senfx_demo_reserve_order('00000000-0000-4000-8000-000000000008','10000000-0000-4000-8000-000000000011');
 if r->>'allowed' is distinct from 'true' or (r->>'dailyLossLimit')::numeric <> 10 then
  raise exception 'First one-dollar virtual reservation failed: %',r;
 end if;
 r:=public.senfx_demo_reserve_order('00000000-0000-4000-8000-000000000008','10000000-0000-4000-8000-000000000012');
 if r->>'allowed' is distinct from 'false' then raise exception 'Second concurrent quote must fail'; end if;

 -- MOCK settlement of an earlier first buy: no real broker contacted.
 update public.deriv_demo_orders set status='sold',buy_requested_at=now()-interval '40 seconds'
  where id='10000000-0000-4000-8000-000000000011';
 update public.deriv_demo_daily_risk set reserved_loss=0,realized_loss=0.46
  where user_id='00000000-0000-4000-8000-000000000008';
 r:=public.senfx_demo_reserve_order('00000000-0000-4000-8000-000000000008','10000000-0000-4000-8000-000000000012');
 if r->>'allowed' is distinct from 'true' then raise exception 'Second manual virtual purchase after settlement should pass: %',r; end if;

 -- Fail closed when recorded virtual loss leaves < one USD of capacity.
 update public.deriv_demo_orders set status='sold',buy_requested_at=now()-interval '20 seconds'
  where id='10000000-0000-4000-8000-000000000012';
 update public.deriv_demo_daily_risk set reserved_loss=0,realized_loss=9.5
  where user_id='00000000-0000-4000-8000-000000000008';
 r:=public.senfx_demo_reserve_order('00000000-0000-4000-8000-000000000008','10000000-0000-4000-8000-000000000013');
 if r->>'allowed' is distinct from 'false' then raise exception 'Loss budget must deny a third mock buy: %',r; end if;

 -- Existing real account must never be admitted.
 r:=public.senfx_demo_reserve_order('00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000005');
 if r->>'allowed' is distinct from 'false' then raise exception 'Real-money account mistakenly admitted'; end if;

 if has_function_privilege('authenticated','public.senfx_demo_reserve_order(uuid,uuid)','EXECUTE')
  or not has_function_privilege('service_role','public.senfx_demo_reserve_order(uuid,uuid)','EXECUTE')
 then raise exception 'Repeatable reserve RPC role policy incorrect'; end if;
end;
$checks$;
