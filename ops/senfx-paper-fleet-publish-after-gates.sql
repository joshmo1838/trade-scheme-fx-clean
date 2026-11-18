-- RELEASE-GATED, CUSTOMER-VISIBLE PUBLICATION ONLY.
-- Do not run until production backup has been independently restored,
-- the entire integrated CI fleet passed, and the worker tables/RLS were
-- reviewed and installed. This does NOT start runs or broker orders.
BEGIN;
DO $guard$
DECLARE
  total_count integer;
  distinct_count integer;
BEGIN
  SELECT count(*),count(DISTINCT name)
    INTO total_count,distinct_count FROM public.bots
  WHERE name IN ('SENFX Synthetic pro','Synthetic Trend Scout','Volatility Watch');

  IF total_count<>3 OR distinct_count<>3 THEN
    RAISE EXCEPTION 'Release aborted: expected exactly three uniquely named existing bot presets.';
  END IF;
  IF to_regclass('public.bot_execution_runs') IS NULL OR
     to_regclass('public.bot_execution_commands') IS NULL OR
     to_regclass('public.bot_execution_paper_positions') IS NULL OR
     to_regprocedure('public.senfx_paper_worker_reserve(uuid,text,bigint,text,text,numeric,bigint)') IS NULL THEN
    RAISE EXCEPTION 'Release aborted: reviewed paper worker database or RPC unavailable.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname IN
      ('bot_execution_runs','bot_execution_commands','bot_execution_paper_positions')
      AND c.relrowsecurity IS FALSE
  ) THEN
    RAISE EXCEPTION 'Release aborted: paper worker RLS is not enabled.';
  END IF;
END;
$guard$;

UPDATE public.bots SET is_published=true
WHERE name IN ('SENFX Synthetic pro','Synthetic Trend Scout','Volatility Watch')
  AND is_published IS DISTINCT FROM true;

DO $verify$
BEGIN
  IF (SELECT count(*) FROM public.bots
       WHERE name IN ('SENFX Synthetic pro','Synthetic Trend Scout','Volatility Watch')
         AND is_published=true)<>3 THEN
    RAISE EXCEPTION 'Release aborted: all three preset bots were not published.';
  END IF;
END;
$verify$;
COMMIT;
-- Each customer must still choose the bot and configure their paper-risk
-- settings. Neither these updates nor deployment automatically place trades.
