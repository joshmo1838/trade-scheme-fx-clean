-- Disposable GitHub CI PostgreSQL 17 only. NEVER run on live Supabase.
-- Requires one-dollar/phase2 fixtures to have created auth.users, roles,
-- deriv_connections, deriv_demo_orders, and daily loss ledger.
\set ON_ERROR_STOP on
create table if not exists public.profiles(id uuid primary key,role text not null default 'user');
\ir ../supabase/senfx-deriv-demo-15bot-execution-staged.sql

begin;
do $qa$
declare
 u uuid:='00000000-0000-4000-8000-000000000291';
 a uuid:='12000000-0000-4000-8000-000000000291';
 b uuid:='12000000-0000-4000-8000-000000000292';
 res jsonb;
 blocked boolean:=false;
begin
 insert into auth.users(id) values(u);
 insert into public.profiles(id,role) values(u,'admin');
 insert into public.deriv_connections(user_id,active_account_id,active_account_type,expires_at)
 values(u,'D_QA_291','demo',now()+interval '1 day');
 res:=public.senfx_demo_bots_control(u,'D_QA_291','start',0);
 if res->>'ok' <> 'true' or (res->>'version')::int<>1 then raise exception 'Start failed: %',res; end if;
 res:=public.senfx_demo_bots_worker_heartbeat(u,'qa_worker_demo_15_01',1);
 if res->>'owned'<>'true' then raise exception 'Lease failed: %',res; end if;
 res:=public.senfx_demo_bots_worker_heartbeat(u,'qa_worker_demo_15_02',1);
 if res->>'owned'<>'false' then raise exception 'Second worker stole lease'; end if;
 insert into public.senfx_demo_bot_orders(
   id,request_id,user_id,account_id,control_version,bot_id,market_symbol,contract_type,
   barrier,duration,duration_unit,currency,stake,ask_price,payout,proposal_id,quote_expires_at)
 values
 (a,'22000000-0000-4000-8000-000000000291',u,'D_QA_291',1,'digit-over-4','R_100','DIGITOVER',
  '4',1,'t','USD',1,1,1.8,'FAKE_QA_PROPOSAL_000000000291',now()+interval '10 minutes'),
 (b,'22000000-0000-4000-8000-000000000292',u,'D_QA_291',1,'parity-even','R_100','DIGITEVEN',
  null,1,'t','USD',1,1,1.8,'FAKE_QA_PROPOSAL_000000000292',now()+interval '10 minutes');
 res:=public.senfx_demo_bots_reserve(u,a,1);
 if res->>'allowed'<>'true' then raise exception 'First safe reserve failed: %',res; end if;
 res:=public.senfx_demo_bots_reserve(u,b,1);
 if res->>'allowed'<>'false' then raise exception 'Concurrent bot reserve allowed'; end if;
 res:=public.senfx_demo_bots_reserve(u,a,1);
 if res->>'allowed'<>'false' then raise exception 'Duplicate order reserve allowed'; end if;

 -- A legacy manual quote cannot become reserved while all-15 is armed.
 insert into public.deriv_demo_orders(id,request_id,user_id,account_id,currency,stake_amount,status,quote_expires_at)
 values('13000000-0000-4000-8000-000000000291',
        '23000000-0000-4000-8000-000000000291',u,'D_QA_291','USD',1,'quoted',now()+interval '10 minutes');
 begin
  update public.deriv_demo_orders set status='reserved'
    where id='13000000-0000-4000-8000-000000000291';
 exception when others then
  if position('Manual Demo purchase blocked' in SQLERRM)>0 then blocked:=true;
  else raise; end if;
 end;
 if not blocked then raise exception 'Legacy manual order bypassed 15-bot safety'; end if;

 res:=public.senfx_demo_bots_control(u,'D_QA_291','stop',null);
 if res->>'ok'<>'true' then raise exception 'Emergency Stop failed'; end if;
 res:=public.senfx_demo_bots_mark_attempt(u,a,1);
 if res->>'allowed'<>'false' then raise exception 'Stale stopped worker could mark buy'; end if;
 res:=public.senfx_demo_bots_release_unused(u,a);
 if res->>'released'<>'true' then raise exception 'Unused reservation not released'; end if;
 res:=public.senfx_demo_bots_control(u,'D_QA_291','start',2);
 if res->>'ok'<>'false' then raise exception 'Stop cooldown bypassed'; end if;
 update public.senfx_demo_bot_control set stopped_at=now()-interval '2 minutes' where user_id=u;
 res:=public.senfx_demo_bots_control(u,'D_QA_291','start',2);
 if res->>'ok'<>'true' then raise exception 'Re-arm rejected after safe cooldown'; end if;
 res:=public.senfx_demo_bots_worker_heartbeat(u,'qa_worker_demo_15_02',3);
 if res->>'owned'<>'true' then raise exception 'New generation worker denied'; end if;
 update public.senfx_demo_bot_orders set control_version=3 where id=b;
 res:=public.senfx_demo_bots_reserve(u,b,3);
 if res->>'allowed'<>'true' then raise exception 'Sequential bot reserve failed'; end if;
 res:=public.senfx_demo_bots_mark_attempt(u,b,3);
 if res->>'allowed'<>'true' then raise exception 'Buy attempt marker failed'; end if;
 res:=public.senfx_demo_bots_mark_attempt(u,b,3);
 if res->>'allowed'<>'false' then raise exception 'Second attempt marker accepted'; end if;
 res:=public.senfx_demo_bots_release_unused(u,b);
 if res->>'released'<>'false' then raise exception 'Uncertain broker buy incorrectly released'; end if;
 res:=public.senfx_demo_bots_record_settlement(u,b,'C_QA_291','T_QA_291','lost',1,0.54);
 if res->>'settled'<>'true' or (res->>'profit')::numeric<>-0.46 then
  raise exception 'Deriv-like settlement record failed: %',res; end if;
 if (select realized_loss from public.senfx_demo_bot_daily_risk where user_id=u)<>0.46 then
  raise exception 'Loss not recorded in shared ledger'; end if;

 -- Emergency Stop remains available when the stored OAuth expires.
 update public.deriv_connections set expires_at=now()-interval '1 hour' where user_id=u;
 res:=public.senfx_demo_bots_control(u,'D_QA_291','stop',null);
 if res->>'ok'<>'true' then raise exception 'Stop blocked by expired token'; end if;
 if has_function_privilege('authenticated','public.senfx_demo_bots_mark_attempt(uuid,uuid,bigint)','EXECUTE')
 or has_function_privilege('anon','public.senfx_demo_bots_control(uuid,text,text,bigint)','EXECUTE')
 then raise exception 'Untrusted role unexpectedly allowed to execute trade RPC'; end if;
end $qa$;
rollback;
do $clear$
begin
 if exists(select 1 from auth.users where id='00000000-0000-4000-8000-000000000291')
 or exists(select 1 from public.senfx_demo_bot_orders where user_id='00000000-0000-4000-8000-000000000291')
 then raise exception 'Synthetic QA records were not rolled back'; end if;
end $clear$;
