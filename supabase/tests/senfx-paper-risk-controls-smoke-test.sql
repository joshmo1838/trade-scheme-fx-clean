-- SENFX daily paper-risk smoke test (transaction rolls back all test rows).
-- Use a dedicated test customer with a published synthetic bot, selected in Demo mode,
-- and saved stake_amount = 10 / daily_loss_limit = 20.
-- Replace both UUID placeholders before running in Supabase SQL Editor.
-- Run only when that customer/bot has no daily risk record for today's UTC date.

begin;

do $$
declare
  p_customer_id uuid := 'REPLACE-WITH-TEST-CUSTOMER-UUID';
  p_bot_id uuid := 'REPLACE-WITH-PUBLISHED-SYNTHETIC-BOT-UUID';
  v_first jsonb;
  v_second jsonb;
  v_third jsonb;
  v_settle_first jsonb;
  v_settle_second jsonb;
  v_risk public.customer_paper_daily_risk%rowtype;
  v_stake numeric(12,2);
  v_limit numeric(12,2);
begin
  select stake_amount, daily_loss_limit into v_stake, v_limit
  from public.customer_bot_configurations
  where customer_id = p_customer_id
    and bot_id = p_bot_id
    and trading_mode = 'demo';

  if not found or v_stake <> 10 or v_limit <> 20 then
    raise exception 'Test bot must have saved Demo stake $10 and daily paper loss limit $20.';
  end if;

  if exists (
    select 1 from public.customer_paper_daily_risk
    where customer_id = p_customer_id
      and bot_id = p_bot_id
      and risk_date = (now() at time zone 'UTC')::date
  ) then
    raise exception 'Use a fresh test customer/bot with no risk record for today UTC.';
  end if;

  v_first := public.senfx_paper_reserve_trade(p_customer_id, p_bot_id, 'R_100', 'CALL', 100);
  if coalesce((v_first->>'allowed')::boolean, false) is not true then
    raise exception 'First $10 risk reservation should be allowed: %', v_first;
  end if;

  v_second := public.senfx_paper_reserve_trade(p_customer_id, p_bot_id, 'R_100', 'CALL', 100);
  if coalesce((v_second->>'allowed')::boolean, false) is not true then
    raise exception 'Second $10 risk reservation should be allowed: %', v_second;
  end if;

  v_third := public.senfx_paper_reserve_trade(p_customer_id, p_bot_id, 'R_100', 'CALL', 100);
  if coalesce((v_third->>'allowed')::boolean, true) is not false then
    raise exception 'Third $10 reservation must be denied while $20 is already reserved: %', v_third;
  end if;

  v_settle_first := public.senfx_paper_settle_trade(
    p_customer_id, (v_first->>'reservationId')::uuid, 99
  );
  if coalesce((v_settle_first->>'settled')::boolean, false) is not true
     or v_settle_first->>'outcome' <> 'LOSS'
     or round((v_settle_first->>'pnl')::numeric, 2) <> -10 then
    raise exception 'First deterministic loss did not settle as expected: %', v_settle_first;
  end if;

  v_settle_second := public.senfx_paper_settle_trade(
    p_customer_id, (v_second->>'reservationId')::uuid, 99
  );
  if coalesce((v_settle_second->>'settled')::boolean, false) is not true
     or v_settle_second->>'outcome' <> 'LOSS'
     or round((v_settle_second->>'pnl')::numeric, 2) <> -10 then
    raise exception 'Second deterministic loss did not settle as expected: %', v_settle_second;
  end if;

  select * into v_risk
  from public.customer_paper_daily_risk
  where customer_id = p_customer_id
    and bot_id = p_bot_id
    and risk_date = (now() at time zone 'UTC')::date;

  if v_risk.realized_loss <> 20 or v_risk.reserved_loss <> 0 then
    raise exception 'Expected realized_loss = 20 and reserved_loss = 0; got % / %',
      v_risk.realized_loss, v_risk.reserved_loss;
  end if;

  v_third := public.senfx_paper_reserve_trade(p_customer_id, p_bot_id, 'R_100', 'CALL', 100);
  if coalesce((v_third->>'allowed')::boolean, true) is not false then
    raise exception 'A new trade must be denied after the $20 daily loss cap is reached: %', v_third;
  end if;

  raise notice 'PASS: two $10 reservations fit the $20 cap, a third is blocked, two losses total $20, and the next trade is blocked.';
end;
$$;

rollback;
