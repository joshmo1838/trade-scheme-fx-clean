-- Trade Scheme FX fleet integration: all three preset bots run independently.
-- Disposable CI PostgreSQL ONLY. Requires paper risk, bot controls and worker SQL.
-- The entire fixture is rolled back. Does not contact Deriv or create broker orders.
BEGIN;
INSERT INTO auth.users(id) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
INSERT INTO public.bots(id,name,market,is_published) VALUES
  ('11111111-1111-4111-8111-111111111111','SENFX Synthetic pro','Synthetic Indices',true),
  ('22222222-2222-4222-8222-222222222222','Synthetic Trend Scout','Synthetic Indices',true),
  ('33333333-3333-4333-8333-333333333333','Volatility Watch','Synthetic Indices',true);
INSERT INTO public.customer_bots(customer_id,bot_id,trading_mode,selected,control_status)
SELECT 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',id,'demo',true,'selected'
FROM public.bots;
INSERT INTO public.customer_bot_configurations(
  customer_id,bot_id,trading_mode,stake_amount,daily_loss_limit
)
SELECT 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',id,'demo',10,40 FROM public.bots;
SET LOCAL ROLE service_role;
DO $fleet$
DECLARE
  owner_id uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  ids uuid[] := ARRAY[
    '11111111-1111-4111-8111-111111111111'::uuid,
    '22222222-2222-4222-8222-222222222222'::uuid,
    '33333333-3333-4333-8333-333333333333'::uuid
  ];
  runs uuid[] := ARRAY[]::uuid[];
  labels text[] := ARRAY['R_100','R_50','R_75'];
  index_num integer;
  result jsonb;
  worker_name text;
  base_epoch bigint := extract(epoch from now())::bigint-15;
BEGIN
  -- Each published, selected and risk-configured bot can start as a unique run.
  FOR index_num IN 1..3 LOOP
    SELECT public.senfx_queue_paper_bot_command(
      owner_id,ids[index_num],gen_random_uuid(),'start'
    ) INTO result;
    IF result->>'accepted'<>'true' THEN
      RAISE EXCEPTION 'Fleet bot % start failed: %',index_num,result;
    END IF;
    runs := array_append(runs,(result->>'runId')::uuid);
    worker_name := 'fleet_worker_'||index_num::text;
    SELECT public.senfx_paper_worker_sync(runs[index_num],worker_name,'starting') INTO result;
    IF result->>'observedState'<>'starting' THEN
      RAISE EXCEPTION 'No tick yet, but fleet bot % was not starting',index_num;
    END IF;
    SELECT public.senfx_paper_worker_sync(runs[index_num],worker_name,'running') INTO result;
    IF result->>'observedState'<>'running' THEN
      RAISE EXCEPTION 'Fleet bot % failed running observation: %',index_num,result;
    END IF;
    -- A bot cannot reserve an entirely different market even with its own lease.
    SELECT public.senfx_paper_worker_reserve(
      runs[index_num],worker_name,1,'R_10','CALL',100+index_num,base_epoch
    ) INTO result;
    IF result->>'allowed'<>'false' THEN
      RAISE EXCEPTION 'Fleet bot % accepted a mismatched market',index_num;
    END IF;
    SELECT public.senfx_paper_worker_reserve(
      runs[index_num],worker_name,1,labels[index_num],'CALL',100+index_num,base_epoch
    ) INTO result;
    IF result->>'allowed'<>'true' THEN
      RAISE EXCEPTION 'Fleet bot % independent paper reservation failed: %',index_num,result;
    END IF;
  END LOOP;

  IF (SELECT count(*) FROM public.bot_execution_runs WHERE desired_state='running')<>3 OR
     (SELECT count(*) FROM public.bot_execution_paper_positions WHERE status='open')<>3 OR
     (SELECT count(*) FROM public.customer_paper_trade_reservations WHERE status='open')<>3 THEN
    RAISE EXCEPTION 'All three independently risk-reserved bots did not remain running';
  END IF;

  -- Stop exactly one bot. It must release its own risk, NOT the other two.
  SELECT public.senfx_queue_paper_bot_command(
    owner_id,ids[1],gen_random_uuid(),'stop'
  ) INTO result;
  IF result->>'accepted'<>'true' THEN RAISE EXCEPTION 'Fleet stop failed'; END IF;
  SELECT public.senfx_paper_worker_sync(runs[1],'fleet_worker_1','stopped') INTO result;
  IF result->>'observedState'<>'stopped' THEN RAISE EXCEPTION 'Fleet stop was not acknowledged'; END IF;
  IF (SELECT count(*) FROM public.bot_execution_paper_positions WHERE status='open')<>2 OR
     (SELECT count(*) FROM public.bot_execution_runs WHERE desired_state='running')<>2 THEN
    RAISE EXCEPTION 'Stopping one bot disrupted others or failed to cancel its exposure';
  END IF;

  -- Pause bot 2 without affecting bot 3. Only its exposure is cancelled.
  SELECT public.senfx_queue_paper_bot_command(
    owner_id,ids[2],gen_random_uuid(),'pause'
  ) INTO result;
  IF result->>'accepted'<>'true' THEN RAISE EXCEPTION 'Fleet pause failed'; END IF;
  SELECT public.senfx_paper_worker_sync(runs[2],'fleet_worker_2','paused') INTO result;
  IF result->>'observedState'<>'paused' THEN RAISE EXCEPTION 'Fleet pause not acknowledged'; END IF;
  IF (SELECT count(*) FROM public.bot_execution_paper_positions WHERE status='open')<>1 OR
     (SELECT count(*) FROM public.bot_execution_runs WHERE desired_state='running')<>1 THEN
    RAISE EXCEPTION 'Paused bot changed another independent run';
  END IF;

  -- Recovery remains per-bot; even an authorized stale version cannot reserve.
  SELECT public.senfx_paper_worker_reserve(
    runs[2],'fleet_worker_2',1,'R_50','CALL',110,base_epoch+1
  ) INTO result;
  IF result->>'allowed'<>'false' THEN
    RAISE EXCEPTION 'Paused fleet bot still reserved a trade';
  END IF;
  SELECT public.senfx_queue_paper_bot_command(
    owner_id,ids[2],gen_random_uuid(),'resume'
  ) INTO result;
  IF result->>'accepted'<>'true' THEN RAISE EXCEPTION 'Fleet resume failed'; END IF;
  SELECT public.senfx_paper_worker_sync(runs[2],'fleet_worker_2','running') INTO result;
  IF result->>'observedState'<>'running' THEN RAISE EXCEPTION 'Fleet resume not observed'; END IF;

  -- Stop the last two and require complete paper reservation release.
  FOR index_num IN 2..3 LOOP
    SELECT public.senfx_queue_paper_bot_command(
      owner_id,ids[index_num],gen_random_uuid(),'stop'
    ) INTO result;
    IF result->>'accepted'<>'true' THEN RAISE EXCEPTION 'Fleet final stop failed'; END IF;
    SELECT public.senfx_paper_worker_sync(
      runs[index_num],'fleet_worker_'||index_num::text,'stopped'
    ) INTO result;
    IF result->>'observedState'<>'stopped' THEN
      RAISE EXCEPTION 'Fleet final stop not acknowledged';
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM public.bot_execution_paper_positions WHERE status='open')<>0 OR
     (SELECT count(*) FROM public.customer_paper_trade_reservations WHERE status='open')<>0 OR
     (SELECT coalesce(sum(reserved_loss),0) FROM public.customer_paper_daily_risk)<>0 THEN
    RAISE EXCEPTION 'Fleet stop left paper risk held';
  END IF;
END;
$fleet$;
RESET ROLE;
-- Read isolation: a different signed-in customer must not see the owner runs.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
DO $isolation$
BEGIN
  IF (SELECT count(*) FROM public.bot_execution_runs)<>0 OR
     (SELECT count(*) FROM public.bot_execution_paper_positions)<>0 THEN
    RAISE EXCEPTION 'Fleet isolation failure: foreign customer accessed run/position';
  END IF;
END;
$isolation$;
ROLLBACK;
