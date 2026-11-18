-- PUBLISH ONLY AFTER tested /digit-matrix route is READY on Vercel PRODUCTION
-- and scanner-only API/SQL guards pass. Does not authorize trades, create
-- customer selections, update keys, or start bots.
BEGIN;
DO $gate$
DECLARE
 existing int;
BEGIN
 IF to_regclass('public.bot_execution_runs') IS NULL OR
    to_regclass('public.customer_paper_trade_reservations') IS NULL OR
    to_regprocedure('public.senfx_block_scanner_only_execution()') IS NULL OR
    NOT EXISTS (
      SELECT 1 FROM pg_trigger WHERE tgname='senfx_no_scanner_directional_worker'
        AND tgenabled IN ('O','A')
    ) OR
    NOT EXISTS (
      SELECT 1 FROM pg_trigger WHERE tgname='senfx_no_scanner_paper_reservation'
        AND tgenabled IN ('O','A')
    ) THEN
   RAISE EXCEPTION 'Scanner release aborted: server-side execution block not installed.';
 END IF;
 SELECT count(*) INTO existing FROM public.bots WHERE name='SENFX Digit Matrix';
 IF existing>1 THEN
   RAISE EXCEPTION 'Scanner release aborted: duplicate catalog names.';
 END IF;
END;
$gate$;

INSERT INTO public.bots(name,market,description,risk_level,is_published)
SELECT 'SENFX Digit Matrix','Synthetic Indices',
 'Free ten-market volatility last-digit scanner using observed public Deriv ticks. Precision-correct frequency and entropy charts, feed freshness and a hypothetical paper exposure planner. Research only: no Deriv contracts, no paper-direction execution, no guaranteed profits.',
 'Scanner-only',true
WHERE NOT EXISTS (SELECT 1 FROM public.bots WHERE name='SENFX Digit Matrix');

UPDATE public.bots
SET is_published=true,
    risk_level='Scanner-only',
    description='Free ten-market volatility last-digit scanner using observed public Deriv ticks. Precision-correct frequency and entropy charts, feed freshness and a hypothetical paper exposure planner. Research only: no Deriv contracts, no paper-direction execution, no guaranteed profits.'
WHERE name='SENFX Digit Matrix' AND (
 is_published IS DISTINCT FROM true OR risk_level IS DISTINCT FROM 'Scanner-only'
);

DO $post$
BEGIN
 IF (SELECT count(*) FROM public.bots WHERE name='SENFX Digit Matrix'
       AND is_published=true)<>1 THEN
  RAISE EXCEPTION 'Scanner catalog publication was not unique and verified.';
 END IF;
END;
$post$;
COMMIT;
