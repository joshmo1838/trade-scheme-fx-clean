-- Disposable PostgreSQL fixture only; run after existing Demo schema fixtures.
\set ON_ERROR_STOP on
insert into auth.users(id) values
 ('00000000-0000-4000-8000-000000000101'),
 ('00000000-0000-4000-8000-000000000102')
on conflict do nothing;
insert into public.deriv_connections(user_id,status,active_account_id,active_account_type,expires_at)
values
 ('00000000-0000-4000-8000-000000000101','connected','QDEMO101','demo',now()+interval '1 day'),
 ('00000000-0000-4000-8000-000000000102','connected','QREAL102','real',now()+interval '1 day');
create table if not exists public.senfx_demo_bot_orders(user_id uuid,status text);
create table if not exists public.senfx_demo_bot_control(user_id uuid,mode text);
\ir ../supabase/senfx-quantum-demo-4-0.sql

do $tests$
declare v jsonb; ver bigint; order_id uuid:='10000000-0000-4000-8000-000000000101';
begin
 v:=public.quantum_demo_control('00000000-0000-4000-8000-000000000102','QREAL102','start',0,'nexus-flow',0.25,1,1);
 if v->>'ok' is distinct from 'false' then raise exception 'Real account was not rejected: %',v; end if;
 v:=public.quantum_demo_control('00000000-0000-4000-8000-000000000101','QDEMO101','start',0,'nexus-flow',0.25,1,1);
 if v->>'ok' is distinct from 'true' then raise exception 'Demo run start failed: %',v; end if;
 ver:=(v->>'version')::bigint;
 v:=public.quantum_demo_control('00000000-0000-4000-8000-000000000101','QDEMO101','start',ver,'nexus-flow',0.25,1,1);
 if v->>'ok' is distinct from 'false' then raise exception 'Duplicate Run was accepted: %',v; end if;
 v:=public.quantum_demo_worker_heartbeat('00000000-0000-4000-8000-000000000101','quantum_test_worker_101',ver);
 if v->>'owned' is distinct from 'true' then raise exception 'Worker lease failed: %',v; end if;
 insert into public.quantum_demo_bot_orders(request_id,user_id,account_id,control_version,bot_id,market_symbol,signal_kind,contract_type,barrier,duration,duration_unit,tick_epoch,currency,stake,ask_price,payout,proposal_id,quote_expires_at)
 values('20000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000101','QWRONG',ver,'nexus-flow','R_100','RISE','CALL',null,1,'t',1800000000,'USD',0.25,0.25,0.45,'proposal_id_at_least_20_chars',now()+interval '1 minute')
 returning id into order_id;
 v:=public.quantum_demo_reserve('00000000-0000-4000-8000-000000000101',order_id,ver);
 if v->>'allowed' is distinct from 'false' then raise exception 'Mismatched account was reserved: %',v; end if;
 delete from public.quantum_demo_bot_orders where id=order_id;
 insert into public.quantum_demo_bot_orders(request_id,user_id,account_id,control_version,bot_id,market_symbol,signal_kind,contract_type,barrier,duration,duration_unit,tick_epoch,currency,stake,ask_price,payout,proposal_id,quote_expires_at)
 values('20000000-0000-4000-8000-000000000102','00000000-0000-4000-8000-000000000101','QDEMO101',ver,'volt-sprint','R_100','RISE','CALL',null,1,'t',1800000000,'USD',0.25,0.25,0.45,'proposal_id_at_least_20_chars',now()+interval '1 minute')
 returning id into order_id;
 v:=public.quantum_demo_reserve('00000000-0000-4000-8000-000000000101',order_id,ver);
 if v->>'allowed' is distinct from 'false' then raise exception 'Mismatched bot was reserved: %',v; end if;
 update public.quantum_demo_bot_orders set bot_id='nexus-flow' where id=order_id;
 v:=public.quantum_demo_reserve('00000000-0000-4000-8000-000000000101',order_id,ver);
 if v->>'allowed' is distinct from 'true' then raise exception 'Valid current bot was not reserved: %',v; end if;
 v:=public.quantum_demo_mark_attempt('00000000-0000-4000-8000-000000000101',order_id,ver);
 if v->>'allowed' is distinct from 'true' then raise exception 'Attempt marker failed: %',v; end if;
 v:=public.quantum_demo_mark_attempt('00000000-0000-4000-8000-000000000101',order_id,ver);
 if v->>'allowed' is distinct from 'false' then raise exception 'Duplicate broker attempt was accepted: %',v; end if;
 update public.quantum_demo_bot_orders set status='open',contract_id='900100101',buy_transaction_id='800100101',buy_price=0.25 where id=order_id;
 v:=public.quantum_demo_settle('00000000-0000-4000-8000-000000000101',order_id,'900100101','800100101','lost',0.25,0);
 if v->>'settled' is distinct from 'true' or (v->>'sessionProfit')::numeric<>-0.25 then raise exception 'Verified virtual loss did not settle: %',v; end if;
 v:=public.quantum_demo_control('00000000-0000-4000-8000-000000000101','QDEMO101','stop',null,null,null,null,null);
 if v->>'ok' is distinct from 'true' then raise exception 'Stop failed: %',v; end if;
 v:=public.quantum_demo_worker_heartbeat('00000000-0000-4000-8000-000000000101','quantum_test_worker_101',ver);
 if v->>'owned' is distinct from 'false' then raise exception 'Worker retained a lease after Stop: %',v; end if;
 if (select count(*) from public.quantum_demo_bot_orders where contract_id='900100101' and status='lost')<>1 then raise exception 'Rollback/history fixture lost the settled order'; end if;
end;
$tests$;

-- Stop during execution invalidates the quote version and blocks reservation.
do $stop_race$
declare v jsonb; ver bigint; order_id uuid;
begin
 select control_version into ver from public.quantum_demo_bot_control where user_id='00000000-0000-4000-8000-000000000101';
 v:=public.quantum_demo_control('00000000-0000-4000-8000-000000000101','QDEMO101','start',ver,'apex-signal',0.25,1,1);
 if v->>'ok' is distinct from 'true' then raise exception 'Restart after Stop failed: %',v; end if;
 ver:=(v->>'version')::bigint;
 v:=public.quantum_demo_worker_heartbeat('00000000-0000-4000-8000-000000000101','quantum_test_worker_102',ver);
 if v->>'owned' is distinct from 'true' then raise exception 'Restart lease failed: %',v; end if;
 insert into public.quantum_demo_bot_orders(request_id,user_id,account_id,control_version,bot_id,market_symbol,signal_kind,contract_type,duration,duration_unit,tick_epoch,currency,stake,ask_price,payout,proposal_id,quote_expires_at)
 values('20000000-0000-4000-8000-000000000103','00000000-0000-4000-8000-000000000101','QDEMO101',ver,'apex-signal','R_100','RISE','CALL',1,'t',1800000001,'USD',0.25,0.25,0.45,'proposal_id_at_least_20_chars',now()+interval '1 minute') returning id into order_id;
 perform public.quantum_demo_control('00000000-0000-4000-8000-000000000101','QDEMO101','stop',null,null,null,null,null);
 v:=public.quantum_demo_reserve('00000000-0000-4000-8000-000000000101',order_id,ver);
 if v->>'allowed' is distinct from 'false' then raise exception 'Stop during execution did not block reservation: %',v; end if;
end;
$stop_race$;

do $session_loss$
declare v jsonb; ver bigint; order_id uuid;
begin
 select control_version into ver from public.quantum_demo_bot_control where user_id='00000000-0000-4000-8000-000000000101';
 v:=public.quantum_demo_control('00000000-0000-4000-8000-000000000101','QDEMO101','start',ver,'prism-range',0.25,0.5,0.5);
 if v->>'ok' is distinct from 'true' then raise exception 'Session-limit run start failed: %',v; end if;
 ver:=(v->>'version')::bigint;
 v:=public.quantum_demo_worker_heartbeat('00000000-0000-4000-8000-000000000101','quantum_test_worker_103',ver);
 insert into public.quantum_demo_bot_orders(request_id,user_id,account_id,control_version,bot_id,market_symbol,signal_kind,contract_type,duration,duration_unit,tick_epoch,currency,stake,ask_price,payout,proposal_id,quote_expires_at)
 values('20000000-0000-4000-8000-000000000104','00000000-0000-4000-8000-000000000101','QDEMO101',ver,'prism-range','R_100','RISE','CALL',1,'t',1800000002,'USD',0.25,0.25,0.45,'proposal_id_at_least_20_chars',now()+interval '1 minute') returning id into order_id;
 v:=public.quantum_demo_reserve('00000000-0000-4000-8000-000000000101',order_id,ver);
 if v->>'allowed' is distinct from 'true' then raise exception 'First session trade was not reserved: %',v; end if;
 perform public.quantum_demo_mark_attempt('00000000-0000-4000-8000-000000000101',order_id,ver);
 update public.quantum_demo_bot_orders set status='open',contract_id='900100102',buy_transaction_id='800100102',buy_price=0.25 where id=order_id;
 v:=public.quantum_demo_settle('00000000-0000-4000-8000-000000000101',order_id,'900100102','800100102','lost',0.25,0);
 if v->>'settled' is distinct from 'true' then raise exception 'Session loss settlement failed: %',v; end if;
 insert into public.quantum_demo_bot_orders(request_id,user_id,account_id,control_version,bot_id,market_symbol,signal_kind,contract_type,duration,duration_unit,tick_epoch,currency,stake,ask_price,payout,proposal_id,quote_expires_at)
 values('20000000-0000-4000-8000-000000000105','00000000-0000-4000-8000-000000000101','QDEMO101',ver,'prism-range','R_100','RISE','CALL',1,'t',1800000003,'USD',0.25,0.25,0.45,'proposal_id_at_least_20_chars',now()+interval '1 minute') returning id into order_id;
 v:=public.quantum_demo_reserve('00000000-0000-4000-8000-000000000101',order_id,ver);
 if v->>'allowed' is distinct from 'false' or v->>'code' is distinct from 'SESSION_LIMIT_REACHED' then raise exception 'Stop loss did not stop the next reservation: %',v; end if;
end;
$session_loss$;

-- The rollback procedure halts future purchases while preserving settled history.
update public.quantum_demo_bot_control set mode='running',observed_state='running',worker_id='quantum_rollback_test',lease_expires_at=now()+interval '20 seconds';
\ir ../supabase/senfx-quantum-demo-4-0-rollback.sql
do $rollback$
begin
 if exists(select 1 from public.quantum_demo_bot_control where mode='running') then
   raise exception 'Rollback left a 4.0 Demo run active';
 end if;
 if not exists(select 1 from public.quantum_demo_bot_orders where contract_id='900100101' and status='lost') then
   raise exception 'Rollback removed settled Demo history';
 end if;
 if to_regclass('public.quantum_demo_bot_orders') is null or to_regclass('public.quantum_demo_bot_control') is null then
   raise exception 'Rollback removed the recovery ledger';
 end if;
end;
$rollback$;
