-- SENFX paper-only fail-closed regression checks.
-- Run in a controlled QA database with the reviewed paper-worker migrations installed.
-- No customer IDs are read or reused; all synthetic IDs are random.
-- Every assertion runs inside a transaction that is rolled back.
BEGIN;
DO $$
DECLARE
  v jsonb;
  cid uuid := gen_random_uuid();
  bid uuid := gen_random_uuid();
  rid uuid := gen_random_uuid();
  now_epoch bigint := extract(epoch from clock_timestamp())::bigint;
BEGIN
  v := public.senfx_paper_reserve_trade(NULL,NULL,'R_100','CALL',100);
  IF v->>'allowed' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'Missing identity must be rejected'; END IF;
  v := public.senfx_paper_reserve_trade(cid,bid,'INVALID','CALL',100);
  IF v->>'allowed' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'Invalid market must be rejected'; END IF;
  v := public.senfx_paper_reserve_trade(cid,bid,'R_100','INVALID',100);
  IF v->>'allowed' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'Invalid direction must be rejected'; END IF;
  v := public.senfx_paper_reserve_trade(cid,bid,'R_100','CALL',100);
  IF v->>'allowed' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'Unselected bot must be rejected'; END IF;
  v := public.senfx_queue_paper_bot_command(cid,bid,gen_random_uuid(),'start');
  IF v->>'accepted' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'Unowned start must be rejected'; END IF;
  v := public.senfx_queue_paper_bot_command(cid,bid,gen_random_uuid(),'stop');
  IF v->>'accepted' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'Unknown stop must be rejected'; END IF;
  v := public.senfx_queue_paper_bot_command(cid,bid,gen_random_uuid(),'emergency');
  IF v->>'accepted' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'Unsupported command must be rejected'; END IF;
  v := public.senfx_paper_worker_reserve(NULL,NULL,NULL,'R_100','CALL',100,now_epoch);
  IF v->>'allowed' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'Missing lease must be rejected'; END IF;
  v := public.senfx_paper_worker_reserve(rid,'qa-test-worker',1,'R_100','CALL',100,now_epoch-120);
  IF v->>'allowed' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'Stale quote must be rejected'; END IF;
  v := public.senfx_paper_worker_tick(rid,'qa-test-worker',1,100,now_epoch-120);
  IF v->>'accepted' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'Stale tick must be rejected'; END IF;
  v := public.senfx_paper_worker_reserve(rid,'qa-test-worker',1,'R_100','CALL',100,now_epoch);
  IF v->>'allowed' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'Unknown run must not reserve'; END IF;
  v := public.senfx_paper_worker_tick(rid,'qa-test-worker',1,100,now_epoch);
  IF v->>'accepted' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'Unknown run must not tick'; END IF;
  v := public.senfx_paper_worker_sync(rid,'qa-test-worker','running');
  IF v->>'owned' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'Unknown run must not claim lease'; END IF;
  RAISE NOTICE 'PASS: 13 fail-closed paper-only regression assertions';
END $$;
ROLLBACK;
