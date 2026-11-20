-- Disposable Postgres 17 only; NO production data, broker API, or credentials.
\set ON_ERROR_STOP on
\ir deriv-demo-one-dollar-postgres.sql

-- The existing base fixture reproduces one old settled virtual-money attempt.
create schema auth;
create table auth.users (id uuid primary key);
insert into auth.users(id) values ('00000000-0000-4000-8000-000000000001');
\ir ../supabase/senfx-deriv-demo-auto-phase2.sql

do $tests$
declare
 v jsonb;
begin
 -- Old order #4 on account D2 is quoted and must still be denied without a grant.
 v:=public.senfx_demo_reserve_order(
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000004'
 );
 if v->>'allowed' is distinct from 'false' then raise exception 'No grant must deny old attempted pilot: %',v; end if;

 insert into public.senfx_demo_auto_one_shots
  (user_id,account_id,status,expires_at)
 values ('00000000-0000-4000-8000-000000000001','D2','armed',now()+interval '1 hour');

 v:=public.senfx_demo_reserve_order(
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000004'
 );
 if v->>'allowed' is distinct from 'true' or (v->>'reservedLoss')::numeric <> 1 then
  raise exception 'Second virtual-money $1 authorization did not reserve: %',v;
 end if;
 if (select status from public.senfx_demo_auto_one_shots
    where user_id='00000000-0000-4000-8000-000000000001') <> 'reserved'
   or (select count(*) from public.deriv_demo_orders where buy_requested_at is not null) <> 1 then
  raise exception 'One-shot grant was not consumed safely or old trade history mutated';
 end if;
 v:=public.senfx_demo_reserve_order(
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000004'
 );
 if v->>'allowed' is distinct from 'false' then raise exception 'Repeated reservation must fail: %',v; end if;
 if has_table_privilege('authenticated','public.senfx_demo_auto_one_shots','SELECT')
    or has_table_privilege('anon','public.senfx_demo_auto_one_shots','SELECT') then
  raise exception 'Auto pilot grants must not be readable by public roles';
 end if;
end;
$tests$;
