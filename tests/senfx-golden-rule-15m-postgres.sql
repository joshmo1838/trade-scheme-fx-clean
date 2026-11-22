\set ON_ERROR_STOP on
-- Disposable QA schema emulates Supabase role resolution; never production.
DO $roles$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon')
  THEN CREATE ROLE anon NOLOGIN; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated')
  THEN CREATE ROLE authenticated NOLOGIN; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role')
  THEN CREATE ROLE service_role NOLOGIN; END IF;
END $roles$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.role()
RETURNS text LANGUAGE sql STABLE AS
$$ SELECT current_setting('request.jwt.claim.role',true)::text $$;
GRANT USAGE ON SCHEMA public,auth TO service_role,authenticated,anon;
GRANT EXECUTE ON FUNCTION auth.role() TO service_role,authenticated,anon;

\i supabase/senfx-golden-rule-15m-paper-only.sql

SET ROLE service_role;
SET request.jwt.claim.role TO 'service_role';
DO $verify$
DECLARE claim boolean; amount integer; observed bigint;
BEGIN
 claim:=public.senfx_golden_claim_collector('senfx-test-collector-00000001');
 IF claim IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'First collector lease could not be acquired'; END IF;
 claim:=public.senfx_golden_claim_collector('senfx-second-collector-0000002');
 IF claim IS DISTINCT FROM false THEN
  RAISE EXCEPTION 'Second collector illegally acquired active lease'; END IF;
 amount:=public.senfx_golden_checkpoint('senfx-test-collector-00000001',
  '[{"bot_id":"digit-under-5","observations":1,"wins":1,"losses":0,"voids":0,"last_scored_epoch":2000000001}]'::jsonb);
 IF amount<>1 THEN RAISE EXCEPTION 'Checkpoint returned wrong count'; END IF;
 SELECT observations INTO observed FROM public.senfx_golden_rule_progress
 WHERE study_key='senfx-golden-rule-15m-v1' AND bot_id='digit-under-5';
 IF observed<>1 THEN RAISE EXCEPTION 'First prospective observation not persisted'; END IF;
 BEGIN
  PERFORM public.senfx_golden_checkpoint('senfx-test-collector-00000001',
   '[{"bot_id":"digit-under-5","observations":0,"wins":0,"losses":0,"voids":0,"last_scored_epoch":2000000000}]'::jsonb);
  RAISE EXCEPTION 'regression unexpectedly succeeded';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE 'research checkpoint regression%' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM public.senfx_golden_checkpoint('senfx-second-collector-0000002',
   '[{"bot_id":"digit-matches","observations":1,"wins":0,"losses":1,"voids":0,"last_scored_epoch":2000000002}]'::jsonb);
  RAISE EXCEPTION 'unauthorized collector unexpectedly wrote';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE 'research collector lease expired%' THEN RAISE; END IF;
 END;
END $verify$;
RESET ROLE;

SET ROLE authenticated;
SET request.jwt.claim.role TO 'authenticated';
DO $denied$
BEGIN
 BEGIN
  PERFORM * FROM public.senfx_golden_rule_progress;
  RAISE EXCEPTION 'authenticated user read protected research directly';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  PERFORM public.senfx_golden_claim_collector('senfx-illegal-collector-0001');
  RAISE EXCEPTION 'authenticated user claimed collector lease';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $denied$;
RESET ROLE;
SELECT '15M research checkpoint and RLS QA passed' AS result;
