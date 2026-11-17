-- SENFX paper-learning catalogue activation.
-- Apply ONLY after the paper-workspace code is deployed and its public-tick
-- feed and account-scoped paper-risk controls have been verified.
-- This does NOT enable Deriv Demo purchases, real trading, copy trading, or
-- unattended/background bot jobs.
begin;

update public.bots
set
  is_published = true,
  market = case
    when name = 'Synthetic Trend Scout' then 'Volatility 50 Index'
    when name = 'Volatility Watch' then 'Volatility 75 Index'
    else market
  end,
  description = case
    when name = 'Synthetic Trend Scout'
      then 'Paper learning preset: trend observation on public Volatility 50 ticks using a 5/18 moving-average comparison. No broker orders or profit promise.'
    when name = 'Volatility Watch'
      then 'Paper learning preset: volatility observation on public Volatility 75 ticks using a 10/21 moving-average comparison. No broker orders or profit promise.'
    else description
  end
where name in ('Synthetic Trend Scout', 'Volatility Watch')
  and is_published = false;

commit;
