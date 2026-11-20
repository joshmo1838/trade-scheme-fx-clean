-- Controlled QA integration test: full paper-worker stop and risk cancellation.
-- Uses an existing auth principal only as a foreign-key anchor; creates an isolated
-- synthetic bot and rolls back all writes. Never calls broker APIs.
BEGIN;
DO $$
DECLARE
  c uuid; b uuid:=gen_random_uuid(); v jsonb; rid uuid;
  ver bigint; reservation uuid; position uuid; n int; reserved numeric; st text;
BEGIN
  SELECT id INTO c FROM auth.users ORDER BY created_at LIMIT 1;
  IF c IS NULL THEN RAISE EXCEPTION 'No auth user available for FK anchor'; END IF;
  INSERT INTO public.bots(id,name,market,is_published)
    VALUES(b,'QA ROLLBACK WORKER STOP','Synthetic Indices',true);
  INSERT INTO public.customer_bots(customer_id,bot_id,trading_mode,selected,control_status)
    VALUES(c,b,'demo',true,'selected');
  INSERT INTO public.customer_bot_configurations(customer_id,bot_id,trading_mode,stake_amount,daily_loss_limit)
    VALUES(c,b,'demo',10,20);
  v:=public.senfx_queue_paper_bot_command(c,b,gen_random_uuid(),'start');
  IF v->>'accepted' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'start: %',v; END IF;
  rid:=(v->>'runId')::uuid; ver:=(v->>'version')::bigint;
  v:=public.senfx_paper_worker_sync(rid,'qa_worker_stop_01','running');
  IF v->>'owned' IS DISTINCT FROM 'true' OR v->>'observedState'<>'running'
    THEN RAISE EXCEPTION 'worker sync: %',v; END IF;
  v:=public.senfx_paper_worker_reserve(rid,'qa_worker_stop_01',ver,
    'R_100','CALL',100,extract(epoch from now())::bigint);
  IF v->>'allowed' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'reserve: %',v; END IF;
  reservation:=(v->>'reservationId')::uuid; position:=(v->>'positionId')::uuid;
  v:=public.senfx_queue_paper_bot_command(c,b,gen_random_uuid(),'stop');
  IF v->>'accepted' IS DISTINCT FROM 'true' OR v->>'desiredState'<>'stopped'
    THEN RAISE EXCEPTION 'stop: %',v; END IF;
  v:=public.senfx_paper_worker_reserve(rid,'qa_worker_stop_01',ver,
    'R_100','CALL',101,extract(epoch from now())::bigint);
  IF v->>'allowed' IS DISTINCT FROM 'false'
    THEN RAISE EXCEPTION 'old lease accepted entry after stop: %',v; END IF;
  v:=public.senfx_paper_worker_sync(rid,'qa_worker_stop_01','stopped');
  IF v->>'observedState'<>'stopped' THEN RAISE EXCEPTION 'stop sync: %',v; END IF;
  SELECT status INTO st FROM public.customer_paper_trade_reservations WHERE id=reservation;
  IF st<>'cancelled' THEN RAISE EXCEPTION 'reservation not cancelled'; END IF;
  SELECT status INTO st FROM public.bot_execution_paper_positions WHERE id=position;
  IF st<>'cancelled' THEN RAISE EXCEPTION 'position not cancelled'; END IF;
  SELECT reserved_loss INTO reserved FROM public.customer_paper_daily_risk
    WHERE customer_id=c AND bot_id=b AND risk_date=current_date;
  IF reserved<>0 THEN RAISE EXCEPTION 'risk budget not released: %',reserved; END IF;
  SELECT count(*) INTO n FROM public.bot_execution_runs
    WHERE id=rid AND desired_state='stopped' AND observed_state='stopped'
      AND worker_id IS NULL AND lease_expires_at IS NULL;
  IF n<>1 THEN RAISE EXCEPTION 'worker lease not released'; END IF;
  SELECT count(*) INTO n FROM public.bot_execution_commands
    WHERE run_id=rid AND action='stop' AND status='acknowledged';
  IF n<>1 THEN RAISE EXCEPTION 'stop command not acknowledged'; END IF;
  RAISE NOTICE 'PASS: full paper stop, cancel, risk release, lease release, acknowledgement';
END $$;
ROLLBACK;
