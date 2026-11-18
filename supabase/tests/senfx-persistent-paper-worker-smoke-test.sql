-- SENFX Phase 4: isolated PostgreSQL worker lifecycle and tenant safety.
-- Execute AFTER senfx-paper-risk-controls.sql, senfx-persistent-bot-controls.sql
-- and senfx-persistent-paper-worker.sql on a disposable CI database only.
begin;
insert into auth.users(id) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
insert into public.bots(id,name,market,is_published) values
 ('11111111-1111-4111-8111-111111111111','SENFX Synthetic Pro','Synthetic Indices',true),
 ('22222222-2222-4222-8222-222222222222','Unpublished Bot','Synthetic Indices',false);
insert into public.customer_bots(customer_id,bot_id,trading_mode,selected,control_status) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','demo',true,'selected');
insert into public.customer_bot_configurations(customer_id,bot_id,trading_mode,stake_amount,daily_loss_limit) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','demo',10,40);
set local role service_role;
do $smoke$
declare
  u uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  bot uuid := '11111111-1111-4111-8111-111111111111';
  c jsonb;
  w jsonb;
  pos jsonb;
  runid uuid;
  ep bigint := extract(epoch from now())::bigint-15;
  tick bigint;
begin
  select public.senfx_queue_paper_bot_command(u,bot,'10000000-0000-4000-8000-000000000001','start') into c;
  if c->>'accepted'<>'true' then raise exception 'Could not request start: %',c; end if;
  runid := (c->>'runId')::uuid;
  select public.senfx_paper_worker_sync(runid,'worker_test_a','starting') into w;
  if w->>'owned'<>'true' or w->>'observedState'<>'starting' then
    raise exception 'Unready worker was marked running: %',w;
  end if;
  if (select status from public.bot_execution_commands where id='10000000-0000-4000-8000-000000000001')<>'queued' then
    raise exception 'Start falsely acknowledged without public feed';
  end if;

  select public.senfx_paper_worker_sync(runid,'worker_test_a','running') into w;
  if w->>'observedState'<>'running' then raise exception 'Running not acknowledged: %',w; end if;
  if (select status from public.bot_execution_commands where id='10000000-0000-4000-8000-000000000001')<>'acknowledged' then
    raise exception 'Running command not acknowledged';
  end if;
  select public.senfx_paper_worker_sync(runid,'worker_test_b','running') into w;
  if w->>'owned'<>'false' then raise exception 'Second worker stole active lease'; end if;

  select public.senfx_paper_worker_reserve(
    runid,'worker_test_a',1,'R_100','CALL',100,ep
  ) into pos;
  if pos->>'allowed'<>'true' then raise exception 'Paper reserve failed: %',pos; end if;
  select public.senfx_paper_worker_reserve(
    runid,'worker_test_a',1,'R_100','CALL',100,ep
  ) into w;
  if w->>'allowed'<>'false' then raise exception 'Duplicate paper position was created'; end if;

  select public.senfx_paper_worker_tick(runid,'worker_test_a',1,100,ep) into w;
  if w->>'duplicateTick'<>'true' or (w->>'remainingTicks')::int<>5 then
    raise exception 'Entry tick was counted as an exit tick: %',w;
  end if;
  for tick in ep+1..ep+5 loop
    select public.senfx_paper_worker_tick(runid,'worker_test_a',1,101,tick) into w;
    if w->>'accepted'<>'true' then raise exception 'Paper tick rejected: %',w; end if;
  end loop;
  if w->>'settled'<>'true' or (select count(*) from public.customer_paper_trades)<>1 then
    raise exception 'Paper settlement failed or duplicate: %',w;
  end if;
  if (select reserved_loss from public.customer_paper_daily_risk where customer_id=u and bot_id=bot)<>0 then
    raise exception 'Risk reserve was not released at settlement';
  end if;
  select public.senfx_paper_worker_tick(runid,'worker_test_a',1,102,ep+6) into w;
  if w->>'accepted'<>'false' then raise exception 'Settled paper position settled twice'; end if;

  select public.senfx_paper_worker_reserve(
    runid,'worker_test_a',1,'R_100','PUT',101,ep+2
  ) into pos;
  if pos->>'allowed'<>'true' then raise exception 'Could not reserve second paper entry: %',pos; end if;
  select public.senfx_queue_paper_bot_command(u,bot,'10000000-0000-4000-8000-000000000002','pause') into c;
  if c->>'accepted'<>'true' then raise exception 'Could not pause: %',c; end if;
  select public.senfx_paper_worker_reserve(
    runid,'worker_test_a',1,'R_100','CALL',100,ep+3
  ) into w;
  if w->>'allowed'<>'false' then raise exception 'Stale version allowed a trade after Pause'; end if;
  select public.senfx_paper_worker_sync(runid,'worker_test_a','paused') into w;
  if w->>'observedState'<>'paused' then raise exception 'Paper Pause not acknowledged: %',w; end if;
  if (select count(*) from public.bot_execution_paper_positions where status='open')<>0 then
    raise exception 'Pause left unfinished paper risk open';
  end if;
  if (select count(*) from public.customer_paper_trade_reservations where status='open')<>0 then
    raise exception 'Pause left a paper risk reservation open';
  end if;
  select public.senfx_queue_paper_bot_command(u,bot,'10000000-0000-4000-8000-000000000003','resume') into c;
  if c->>'accepted'<>'true' then raise exception 'Resume denied: %',c; end if;
  select public.senfx_paper_worker_sync(runid,'worker_test_a','running') into w;
  if w->>'observedState'<>'running' then raise exception 'Resume not acknowledged: %',w; end if;
  select public.senfx_queue_paper_bot_command(u,bot,'10000000-0000-4000-8000-000000000004','stop') into c;
  if c->>'accepted'<>'true' then raise exception 'Stop denied: %',c; end if;
  select public.senfx_paper_worker_sync(runid,'worker_test_a','stopped') into w;
  if w->>'observedState'<>'stopped' then raise exception 'Stop not acknowledged: %',w; end if;
  select public.senfx_paper_worker_reserve(
    runid,'worker_test_a',4,'R_100','CALL',100,ep+3
  ) into w;
  if w->>'allowed'<>'false' then raise exception 'Stopped bot entered paper trade'; end if;

  select public.senfx_queue_paper_bot_command(u,bot,'10000000-0000-4000-8000-000000000005','start') into c;
  select public.senfx_paper_worker_sync(runid,'worker_test_a','running') into w;
  select public.senfx_paper_worker_reserve(runid,'worker_test_a',5,'R_100','CALL',100,ep+4) into pos;
  if pos->>'allowed'<>'true' then raise exception 'Could not prepare crash/reclaim test: %',pos; end if;
  update public.bot_execution_runs set lease_expires_at=now()-interval '1 second'
    where id=runid;
  select public.senfx_paper_worker_sync(runid,'worker_test_b','starting') into w;
  if w->>'owned'<>'true' then raise exception 'Expired lease was not reclaimed: %',w; end if;
  if (select count(*) from public.bot_execution_paper_positions where status='open')<>0 then
    raise exception 'Crash reclaim did not cancel orphaned paper risk';
  end if;
  select public.senfx_paper_worker_reserve(runid,'worker_test_a',5,'R_100','CALL',100,ep+5) into w;
  if w->>'allowed'<>'false' then raise exception 'Expired worker retained trading rights'; end if;
  if (select count(*) from public.customer_paper_trades)<>1 then
    raise exception 'Worker crash test created extra paper trade';
  end if;
end;
$smoke$;
reset role;

do $grants$
begin
  if has_function_privilege('authenticated',
    'public.senfx_paper_worker_sync(uuid,text,text)','EXECUTE') or
    has_function_privilege('authenticated',
    'public.senfx_paper_worker_reserve(uuid,text,bigint,text,text,numeric,bigint)','EXECUTE') or
    has_function_privilege('authenticated',
    'public.senfx_paper_worker_tick(uuid,text,bigint,numeric,bigint)','EXECUTE') then
    raise exception 'A public customer can run privileged worker functions';
  end if;
  if has_table_privilege('authenticated','public.bot_execution_paper_positions','INSERT') then
    raise exception 'Customer can insert worker paper positions';
  end if;
end;
$grants$;
set local role authenticated;
select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
do $isolation$
begin
  if (select count(*) from public.bot_execution_paper_positions)<>0 then
    raise exception 'Cross-customer read of paper worker reservations';
  end if;
end;
$isolation$;
rollback;
