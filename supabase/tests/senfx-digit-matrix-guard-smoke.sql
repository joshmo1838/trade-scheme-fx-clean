-- Disposable PostgreSQL only; rollback-only verification for scanner guards.
BEGIN;
INSERT INTO auth.users(id) VALUES('a1234567-0000-4000-8000-000000000001');
INSERT INTO public.bots(id,name,market,is_published) VALUES
 ('a1234567-0000-4000-8000-000000000002','SENFX Digit Matrix','Synthetic Indices',true),
 ('a1234567-0000-4000-8000-000000000003','SENFX Synthetic pro','Synthetic Indices',true);
SET LOCAL ROLE service_role;
DO $guardtest$
DECLARE
  owner_id uuid:='a1234567-0000-4000-8000-000000000001';
  scanner_id uuid:='a1234567-0000-4000-8000-000000000002';
  normal_id uuid:='a1234567-0000-4000-8000-000000000003';
  rejected boolean:=false;
BEGIN
  BEGIN
    INSERT INTO public.bot_execution_runs(customer_id,bot_id,mode,desired_state)
     VALUES(owner_id,scanner_id,'paper','running');
  EXCEPTION WHEN check_violation THEN
    rejected:=true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'Scanner improperly accepted by directional worker run.';
  END IF;

  rejected:=false;
  BEGIN
    INSERT INTO public.customer_paper_trade_reservations(
      customer_id,bot_id,risk_date,market_symbol,direction,entry_price,stake_amount
    ) VALUES(owner_id,scanner_id,current_date,'R_100','CALL',100,10);
  EXCEPTION WHEN check_violation THEN rejected:=true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'Scanner improperly accepted by paper risk reservation.';
  END IF;

  INSERT INTO public.bot_execution_runs(customer_id,bot_id,mode,desired_state)
    VALUES(owner_id,normal_id,'paper','stopped');
  IF (SELECT count(*) FROM public.bot_execution_runs WHERE bot_id=normal_id)<>1 THEN
    RAISE EXCEPTION 'Standard paper bots were incorrectly blocked.';
  END IF;
  IF (SELECT count(*) FROM public.bot_execution_runs WHERE bot_id=scanner_id)<>0 OR
     (SELECT count(*) FROM public.customer_paper_trade_reservations WHERE bot_id=scanner_id)<>0 THEN
    RAISE EXCEPTION 'Scanner left execution or risk records.';
  END IF;
END;
$guardtest$;
RESET ROLE;
ROLLBACK;
