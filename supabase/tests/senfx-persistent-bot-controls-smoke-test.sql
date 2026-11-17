-- Run in an isolated PostgreSQL CI database after senfx-persistent-bot-controls.sql.
-- Never runs against the user's live customer/order data.
begin;

insert into auth.users(id) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
insert into public.bots(id,is_published) values
 ('11111111-1111-4111-8111-111111111111',true),
 ('22222222-2222-4222-8222-222222222222',false),
 ('33333333-3333-4333-8333-333333333333',true);
insert into public.customer_bots(customer_id,bot_id,trading_mode,selected,control_status) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','demo',true,'selected'),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222','demo',true,'selected'),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','33333333-3333-4333-8333-333333333333','demo',true,'selected');
insert into public.customer_bot_configurations(customer_id,bot_id,trading_mode,stake_amount,daily_loss_limit) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','demo',10,20),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222','demo',10,20);

set local role service_role;

do $smoke$
declare
  u uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  foreign_user uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  bot uuid := '11111111-1111-4111-8111-111111111111';
  r jsonb;
begin
  select public.senfx_queue_paper_bot_command(u,bot,'10000000-0000-4000-8000-000000000001','start') into r;
  if r->>'accepted' <> 'true' or r->>'desiredState' <> 'running' or (r->>'version')::int <> 1 then
    raise exception 'Failed start: %',r;
  end if;

  select public.senfx_queue_paper_bot_command(u,bot,'10000000-0000-4000-8000-000000000001','start') into r;
  if r->>'duplicate' <> 'true' or (r->>'version')::int <> 1 then
    raise exception 'Replayed command not idempotent: %',r;
  end if;

  select public.senfx_queue_paper_bot_command(u,bot,'10000000-0000-4000-8000-000000000006','start') into r;
  if r->>'accepted' <> 'false' then raise exception 'Duplicate start accepted'; end if;

  select public.senfx_queue_paper_bot_command(u,bot,'10000000-0000-4000-8000-000000000002','pause') into r;
  if r->>'desiredState' <> 'paused' or (r->>'version')::int <> 2 then
    raise exception 'Failed pause: %',r;
  end if;

  select public.senfx_queue_paper_bot_command(u,bot,'10000000-0000-4000-8000-000000000003','resume') into r;
  if r->>'desiredState' <> 'running' or (r->>'version')::int <> 3 then
    raise exception 'Failed resume: %',r;
  end if;

  select public.senfx_queue_paper_bot_command(u,bot,'10000000-0000-4000-8000-000000000004','stop') into r;
  if r->>'desiredState' <> 'stopped' or (r->>'version')::int <> 4 then
    raise exception 'Failed stop: %',r;
  end if;

  -- An emergency stop can supersede a previously acknowledged stop.
  select public.senfx_queue_paper_bot_command(u,bot,'10000000-0000-4000-8000-000000000005','stop') into r;
  if r->>'desiredState' <> 'stopped' or (r->>'version')::int <> 5 then
    raise exception 'Repeated stop failed: %',r;
  end if;

  select public.senfx_queue_paper_bot_command(foreign_user,bot,'10000000-0000-4000-8000-000000000007','start') into r;
  if r->>'accepted' <> 'false' then raise exception 'Other customer controlled a bot'; end if;

  select public.senfx_queue_paper_bot_command(foreign_user,bot,'10000000-0000-4000-8000-000000000001','start') into r;
  if r->>'accepted' <> 'false' then raise exception 'Cross-customer replay reused command ID'; end if;

  select public.senfx_queue_paper_bot_command(u,'22222222-2222-4222-8222-222222222222',
    '10000000-0000-4000-8000-000000000008','start') into r;
  if r->>'accepted' <> 'false' then raise exception 'Unpublished bot started'; end if;

  select public.senfx_queue_paper_bot_command(u,'33333333-3333-4333-8333-333333333333',
    '10000000-0000-4000-8000-000000000009','start') into r;
  if r->>'accepted' <> 'false' then raise exception 'Bot without valid risk settings started'; end if;

  if (select count(*) from public.bot_execution_commands where customer_id=u) <> 5 then
    raise exception 'Unexpected duplicate/invalid commands created';
  end if;
  if (select count(*) from public.bot_execution_runs where customer_id=u) <> 1 then
    raise exception 'Unexpected number of bot runs created';
  end if;
  if (select observed_state from public.bot_execution_runs where customer_id=u and bot_id=bot) <> 'stopped' then
    raise exception 'Queued commands incorrectly imply a running worker';
  end if;
end;
$smoke$;

reset role;

do $privileges$
begin
  if has_function_privilege('authenticated',
    'public.senfx_queue_paper_bot_command(uuid,uuid,uuid,text)','EXECUTE') then
    raise exception 'Authenticated role can directly enqueue privileged commands';
  end if;
  if has_table_privilege('authenticated','public.bot_execution_runs','INSERT')
     or has_table_privilege('authenticated','public.bot_execution_commands','UPDATE') then
    raise exception 'Customers can mutate worker-only execution tables';
  end if;
end;
$privileges$;

set local role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
do $rls$
begin
  if (select count(*) from public.bot_execution_runs) <> 1
     or (select count(*) from public.bot_execution_commands) <> 5 then
    raise exception 'Customer cannot read own records';
  end if;
end;
$rls$;
select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
do $rls$
begin
  if (select count(*) from public.bot_execution_runs) <> 0
     or (select count(*) from public.bot_execution_commands) <> 0 then
    raise exception 'Customer can read records belonging to another user';
  end if;
end;
$rls$;

rollback;
