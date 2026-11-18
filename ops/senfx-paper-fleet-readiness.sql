-- READ ONLY: run in Supabase SQL Editor when auditing the 3-bot PAPER rollout.
-- No passwords, customer identifiers, brokerage tokens, or customer PII returned.
WITH bot_readiness AS (
  SELECT b.id,b.name,b.market,b.is_published,
    count(DISTINCT cb.customer_id) FILTER (
      WHERE cb.trading_mode='demo' AND cb.selected=true
        AND cb.control_status='selected'
    ) AS selected_customers,
    count(DISTINCT cb.customer_id) FILTER (
      WHERE cb.trading_mode='demo' AND cb.selected=true
        AND cb.control_status='selected' AND cfg.trading_mode='demo'
        AND cfg.stake_amount BETWEEN 10 AND 100
        AND cfg.daily_loss_limit IS NOT NULL
        AND cfg.daily_loss_limit >= cfg.stake_amount
    ) AS eligible_paper_customers
  FROM public.bots b
  LEFT JOIN public.customer_bots cb ON cb.bot_id=b.id
  LEFT JOIN public.customer_bot_configurations cfg
    ON cfg.customer_id=cb.customer_id AND cfg.bot_id=cb.bot_id
       AND cfg.trading_mode='demo'
  WHERE b.name IN ('SENFX Synthetic pro','Synthetic Trend Scout','Volatility Watch')
  GROUP BY b.id,b.name,b.market,b.is_published
)
SELECT name,market,is_published,selected_customers,eligible_paper_customers,
  to_regclass('public.bot_execution_runs') IS NOT NULL AS control_schema_installed,
  to_regclass('public.bot_execution_paper_positions') IS NOT NULL AS worker_schema_installed,
  CASE
    WHEN NOT is_published THEN 'UNPUBLISHED — not customer-visible'
    WHEN eligible_paper_customers=0 THEN 'NO ELIGIBLE CUSTOMER — selection/risk settings needed'
    WHEN to_regclass('public.bot_execution_runs') IS NULL OR
         to_regclass('public.bot_execution_paper_positions') IS NULL
      THEN 'BLOCKED — reviewed worker migrations not installed'
    ELSE 'CONFIGURED — verify worker lease and observed state separately'
  END AS readiness
FROM bot_readiness
ORDER BY name;
