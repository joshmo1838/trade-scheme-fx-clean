-- Separate, append-forward-only SENFX Golden Rule research counters.
-- 15 original bots * 1,000,000 genuine prospective PAPER observations each.
-- No customer orders, no virtual broker orders, no change to execution gates.
BEGIN;
CREATE TABLE IF NOT EXISTS public.senfx_golden_rule_progress (
 study_key text NOT NULL DEFAULT 'senfx-golden-rule-15m-v1'
   CHECK(study_key='senfx-golden-rule-15m-v1'),
 bot_id text NOT NULL,
 observations bigint NOT NULL DEFAULT 0 CHECK(observations BETWEEN 0 AND 1000000),
 wins bigint NOT NULL DEFAULT 0 CHECK(wins>=0),
 losses bigint NOT NULL DEFAULT 0 CHECK(losses>=0),
 voids bigint NOT NULL DEFAULT 0 CHECK(voids>=0),
 last_scored_epoch bigint NOT NULL DEFAULT 0 CHECK(last_scored_epoch>=0),
 collector_id text NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT senfx_golden_rule_progress_pk PRIMARY KEY (study_key,bot_id),
 CONSTRAINT senfx_golden_rule_result_counts CHECK(wins+losses=observations),
 CONSTRAINT senfx_golden_rule_known_bot CHECK(bot_id IN (
  'digit-over-4','digit-under-5','parity-even','parity-odd',
  'digit-matches','digit-differs','trend-rise-fall',
  'breakout-higher-lower','recovery-audit','stepwise-audit',
  'adaptive-over','entropy-parity','pattern-differs',
  'momentum-rise-fall','volatility-scalper'
 ))
);
CREATE TABLE IF NOT EXISTS public.senfx_golden_rule_lease (
 study_key text PRIMARY KEY CHECK(study_key='senfx-golden-rule-15m-v1'),
 collector_id text NOT NULL CHECK(length(collector_id) BETWEEN 20 AND 120),
 expires_at timestamptz NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.senfx_golden_rule_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.senfx_golden_rule_lease ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.senfx_golden_rule_progress FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.senfx_golden_rule_lease FROM PUBLIC, anon, authenticated;
GRANT SELECT,INSERT,UPDATE ON public.senfx_golden_rule_progress TO service_role;
GRANT SELECT,INSERT,UPDATE ON public.senfx_golden_rule_lease TO service_role;

CREATE OR REPLACE FUNCTION public.senfx_golden_claim_collector(
 p_collector_id text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public AS $$
DECLARE result_id text;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR
    p_collector_id IS NULL OR length(p_collector_id) NOT BETWEEN 20 AND 120
 THEN RAISE EXCEPTION 'research collector service authorization required'; END IF;
 INSERT INTO public.senfx_golden_rule_lease AS lease
   (study_key,collector_id,expires_at,updated_at)
 VALUES ('senfx-golden-rule-15m-v1',p_collector_id,now()+interval '40 seconds',now())
 ON CONFLICT (study_key) DO UPDATE SET
  collector_id=EXCLUDED.collector_id,
  expires_at=EXCLUDED.expires_at,
  updated_at=now()
 WHERE lease.expires_at<now() OR lease.collector_id=EXCLUDED.collector_id
 RETURNING collector_id INTO result_id;
 RETURN result_id=p_collector_id;
END $$;
REVOKE ALL ON FUNCTION public.senfx_golden_claim_collector(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.senfx_golden_claim_collector(text) TO service_role;

CREATE OR REPLACE FUNCTION public.senfx_golden_checkpoint(
 p_collector_id text,p_rows jsonb
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public AS $$
DECLARE rec record; inserted_count integer := 0; applied integer;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR
    p_collector_id IS NULL OR
    jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR
    jsonb_array_length(p_rows)>15
 THEN RAISE EXCEPTION 'research checkpoint authorization or shape invalid'; END IF;
 PERFORM 1 FROM public.senfx_golden_rule_lease
 WHERE study_key='senfx-golden-rule-15m-v1'
   AND collector_id=p_collector_id AND expires_at>now() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'research collector lease expired or changed'; END IF;
 FOR rec IN SELECT * FROM jsonb_to_recordset(p_rows)
  AS x(bot_id text,observations bigint,wins bigint,losses bigint,voids bigint,last_scored_epoch bigint)
 LOOP
  IF rec.bot_id IS NULL OR rec.observations IS NULL OR rec.wins IS NULL OR
   rec.losses IS NULL OR rec.voids IS NULL OR rec.last_scored_epoch IS NULL OR
   rec.observations<0 OR rec.observations>1000000 OR
   rec.wins<0 OR rec.losses<0 OR rec.voids<0 OR
   rec.wins+rec.losses<>rec.observations OR rec.last_scored_epoch<0
  THEN RAISE EXCEPTION 'research observations invalid'; END IF;
  INSERT INTO public.senfx_golden_rule_progress AS progress
   (study_key,bot_id,observations,wins,losses,voids,last_scored_epoch,collector_id,updated_at)
  VALUES ('senfx-golden-rule-15m-v1',rec.bot_id,rec.observations,
   rec.wins,rec.losses,rec.voids,rec.last_scored_epoch,p_collector_id,now())
  ON CONFLICT (study_key,bot_id) DO UPDATE SET
   observations=EXCLUDED.observations,wins=EXCLUDED.wins,
   losses=EXCLUDED.losses,voids=EXCLUDED.voids,
   last_scored_epoch=EXCLUDED.last_scored_epoch,
   collector_id=EXCLUDED.collector_id,updated_at=now()
  WHERE progress.observations<=EXCLUDED.observations
    AND progress.wins<=EXCLUDED.wins
    AND progress.losses<=EXCLUDED.losses
    AND progress.voids<=EXCLUDED.voids
    AND progress.last_scored_epoch<=EXCLUDED.last_scored_epoch;
  GET DIAGNOSTICS applied=ROW_COUNT;
  IF applied<>1 THEN RAISE EXCEPTION 'research checkpoint regression or duplicate detected'; END IF;
  inserted_count:=inserted_count+1;
 END LOOP;
 RETURN inserted_count;
END $$;
REVOKE ALL ON FUNCTION public.senfx_golden_checkpoint(text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.senfx_golden_checkpoint(text,jsonb) TO service_role;
COMMIT;
