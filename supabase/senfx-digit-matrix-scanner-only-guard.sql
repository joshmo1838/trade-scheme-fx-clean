-- SENFX Digit Matrix is a PUBLIC-TICK RESEARCH SCANNER, not a broker or
-- directional paper-trading strategy. Defensive DB guard: fail closed if
-- anyone attempts to route this catalog product through legacy CALL/PUT
-- paper worker runs or risk reservations (including direct service RPC).
-- Additive, no customer data modifications, no orders, idempotent.
BEGIN;
CREATE OR REPLACE FUNCTION public.senfx_block_scanner_only_execution()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $guard$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.bots b
    WHERE b.id=NEW.bot_id AND b.name='SENFX Digit Matrix'
  ) THEN
    RAISE EXCEPTION 'SENFX Digit Matrix is a scanner-only product, not a paper CALL/PUT engine.'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$guard$;
REVOKE ALL ON FUNCTION public.senfx_block_scanner_only_execution()
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.senfx_block_scanner_only_execution() TO service_role;

DROP TRIGGER IF EXISTS senfx_no_scanner_directional_worker
 ON public.bot_execution_runs;
CREATE TRIGGER senfx_no_scanner_directional_worker
 BEFORE INSERT OR UPDATE ON public.bot_execution_runs
 FOR EACH ROW EXECUTE FUNCTION public.senfx_block_scanner_only_execution();

DROP TRIGGER IF EXISTS senfx_no_scanner_paper_reservation
 ON public.customer_paper_trade_reservations;
CREATE TRIGGER senfx_no_scanner_paper_reservation
 BEFORE INSERT OR UPDATE ON public.customer_paper_trade_reservations
 FOR EACH ROW EXECUTE FUNCTION public.senfx_block_scanner_only_execution();
COMMIT;
