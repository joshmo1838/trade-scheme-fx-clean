-- SENFX Deriv Demo unlimited-learning audit ledger smoke test.
-- Uses a dedicated temporary Demo account ID and rolls all data back.
-- Replace the one test-user UUID with a real Supabase Auth user UUID.
-- Do not run against a busy production user: the script temporarily changes that user's
-- deriv_connections row inside a transaction, then ROLLBACK restores the original values.

begin;

do $$
declare
  p_user_id uuid := 'REPLACE-WITH-TEST-USER-UUID';
  v_account_id text := 'SENFX_TEST_DEMO_' || left(gen_random_uuid()::text, 8);
  v_order_rejected uuid;
  v_order_one uuid;
  v_order_two uuid;
  v_order_three uuid;
  v_result jsonb;
  v_risk public.deriv_demo_daily_risk%rowtype;
begin
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'Replace p_user_id with a real Supabase Auth user UUID.';
  end if;

  insert into public.deriv_connections (
    user_id, encrypted_token, token_iv, token_tag, expires_at, connected_at,
    status, active_account_id, active_account_type
  ) values (
    p_user_id, 'dGVzdA==', 'AAAAAAAAAAAAAAAA', 'AAAAAAAAAAAAAAAAAAAAAA==',
    now() + interval '1 day', now(), 'connected', v_account_id, 'demo'
  )
  on conflict (user_id) do update set
    encrypted_token = excluded.encrypted_token,
    token_iv = excluded.token_iv,
    token_tag = excluded.token_tag,
    expires_at = excluded.expires_at,
    connected_at = excluded.connected_at,
    status = excluded.status,
    active_account_id = excluded.active_account_id,
    active_account_type = excluded.active_account_type;

  -- A quote reserved but never submitted must be cancellable without a loss.
  insert into public.deriv_demo_orders (
    request_id, user_id, account_id, currency, market_symbol, contract_type,
    duration, duration_unit, stake_amount, proposal_id, ask_price, payout,
    status, quote_expires_at
  ) values (
    gen_random_uuid(), p_user_id, v_account_id, 'USD', 'R_100', 'CALL',
    5, 'm', 10, replace(gen_random_uuid()::text, '-', ''), 10, 19,
    'quoted', now() + interval '1 minute'
  ) returning id into v_order_rejected;

  v_result := public.senfx_demo_reserve_order(p_user_id, v_order_rejected);
  if coalesce((v_result->>'allowed')::boolean, false) is not true then
    raise exception 'Unused Demo reservation should be allowed: %', v_result;
  end if;

  v_result := public.senfx_demo_cancel_order(p_user_id, v_order_rejected, 'Test: no buy request was sent.');
  if coalesce((v_result->>'cancelled')::boolean, false) is not true then
    raise exception 'Unused Demo reservation should cancel: %', v_result;
  end if;

  -- A submitted buy without a contract response stays reserved until statement reconciliation.
  insert into public.deriv_demo_orders (
    request_id, user_id, account_id, currency, market_symbol, contract_type,
    duration, duration_unit, stake_amount, proposal_id, ask_price, payout,
    status, quote_expires_at
  ) values (
    gen_random_uuid(), p_user_id, v_account_id, 'USD', 'R_100', 'PUT',
    5, 'm', 10, replace(gen_random_uuid()::text, '-', ''), 10, 19,
    'quoted', now() + interval '1 minute'
  ) returning id into v_order_rejected;

  v_result := public.senfx_demo_reserve_order(p_user_id, v_order_rejected);
  if coalesce((v_result->>'allowed')::boolean, false) is not true then
    raise exception 'Uncertain Demo order should be reservable: %', v_result;
  end if;
  v_result := public.senfx_demo_mark_buy_attempt(p_user_id, v_order_rejected);
  if coalesce((v_result->>'marked')::boolean, false) is not true then
    raise exception 'Uncertain Demo buy attempt should be marked: %', v_result;
  end if;
  v_result := public.senfx_demo_reject_order(p_user_id, v_order_rejected, 'Test: statement found no buy.');
  if coalesce((v_result->>'rejected')::boolean, false) is not true then
    raise exception 'Unmatched Demo buy should release reservation after statement verification: %', v_result;
  end if;

  -- Trade 1: reserve 10, confirm the test contract, settle a 10 loss.
  insert into public.deriv_demo_orders (
    request_id, user_id, account_id, currency, market_symbol, contract_type,
    duration, duration_unit, stake_amount, proposal_id, ask_price, payout,
    status, quote_expires_at
  ) values (
    gen_random_uuid(), p_user_id, v_account_id, 'USD', 'R_100', 'CALL',
    5, 'm', 10, replace(gen_random_uuid()::text, '-', ''), 10, 19,
    'quoted', now() + interval '1 minute'
  ) returning id into v_order_one;

  v_result := public.senfx_demo_reserve_order(p_user_id, v_order_one);
  if coalesce((v_result->>'allowed')::boolean, false) is not true then
    raise exception 'First 10 Demo risk reservation should be allowed: %', v_result;
  end if;

  -- A second reservation attempt on the same order must be denied.
  v_result := public.senfx_demo_reserve_order(p_user_id, v_order_one);
  if coalesce((v_result->>'allowed')::boolean, true) is not false then
    raise exception 'Duplicate Demo reservation must be denied: %', v_result;
  end if;

  v_result := public.senfx_demo_mark_buy_attempt(p_user_id, v_order_one);
  if coalesce((v_result->>'marked')::boolean, false) is not true then
    raise exception 'First buy attempt should be marked before confirmation: %', v_result;
  end if;

  -- A second buy-attempt claim must fail so two tabs cannot submit separate buys.
  v_result := public.senfx_demo_mark_buy_attempt(p_user_id, v_order_one);
  if coalesce((v_result->>'marked')::boolean, true) is not false then
    raise exception 'Duplicate Demo buy attempt must be denied: %', v_result;
  end if;

  v_result := public.senfx_demo_confirm_order(p_user_id, v_order_one, '91000000001', '92000000001', 10);
  if coalesce((v_result->>'confirmed')::boolean, false) is not true then
    raise exception 'First test contract should confirm: %', v_result;
  end if;

  v_result := public.senfx_demo_settle_order(p_user_id, v_order_one, 'lost', -10, 0, 'lost');
  if coalesce((v_result->>'settled')::boolean, false) is not true then
    raise exception 'First 10 Demo loss should settle: %', v_result;
  end if;

  -- Trade 2: a second sequential 10 Demo loss must be logged without a daily lockout.
  insert into public.deriv_demo_orders (
    request_id, user_id, account_id, currency, market_symbol, contract_type,
    duration, duration_unit, stake_amount, proposal_id, ask_price, payout,
    status, quote_expires_at
  ) values (
    gen_random_uuid(), p_user_id, v_account_id, 'USD', 'R_100', 'PUT',
    5, 'm', 10, replace(gen_random_uuid()::text, '-', ''), 10, 19,
    'quoted', now() + interval '1 minute'
  ) returning id into v_order_two;

  v_result := public.senfx_demo_reserve_order(p_user_id, v_order_two);
  if coalesce((v_result->>'allowed')::boolean, false) is not true then
    raise exception 'Second 10 Demo risk reservation should be allowed: %', v_result;
  end if;

  v_result := public.senfx_demo_mark_buy_attempt(p_user_id, v_order_two);
  if coalesce((v_result->>'marked')::boolean, false) is not true then
    raise exception 'Second buy attempt should be marked before confirmation: %', v_result;
  end if;

  v_result := public.senfx_demo_confirm_order(p_user_id, v_order_two, '91000000002', '92000000002', 10);
  if coalesce((v_result->>'confirmed')::boolean, false) is not true then
    raise exception 'Second test contract should confirm: %', v_result;
  end if;

  v_result := public.senfx_demo_settle_order(p_user_id, v_order_two, 'lost', -10, 0, 'lost');
  if coalesce((v_result->>'settled')::boolean, false) is not true then
    raise exception 'Second 10 Demo loss should settle: %', v_result;
  end if;

  -- Trade 3: allowed after 20 cumulative Demo loss; no SENFX daily-loss lockout.
  insert into public.deriv_demo_orders (
    request_id, user_id, account_id, currency, market_symbol, contract_type,
    duration, duration_unit, stake_amount, proposal_id, ask_price, payout,
    status, quote_expires_at
  ) values (
    gen_random_uuid(), p_user_id, v_account_id, 'USD', 'R_100', 'CALL',
    5, 'm', 10, replace(gen_random_uuid()::text, '-', ''), 10, 19,
    'quoted', now() + interval '1 minute'
  ) returning id into v_order_three;

  v_result := public.senfx_demo_reserve_order(p_user_id, v_order_three);
  if coalesce((v_result->>'allowed')::boolean, false) is not true then
    raise exception 'Third Demo reservation must be allowed after 20 cumulative loss: %', v_result;
  end if;
  if coalesce((v_result->>'unlimitedDemoPractice')::boolean, false) is not true
     or v_result->>'dailyLossLimit' is not null
     or v_result->>'remainingLossBudget' is not null then
    raise exception 'Unlimited Demo practice must not advertise a daily loss cap: %', v_result;
  end if;

  -- Still reject a duplicate reservation even when daily losses are unlimited.
  v_result := public.senfx_demo_reserve_order(p_user_id, v_order_three);
  if coalesce((v_result->>'allowed')::boolean, true) is not false then
    raise exception 'Unlimited mode must still reject duplicate reservations: %', v_result;
  end if;
  v_result := public.senfx_demo_mark_buy_attempt(p_user_id, v_order_three);
  if coalesce((v_result->>'marked')::boolean, false) is not true then
    raise exception 'Third Demo purchase attempt must be recorded once: %', v_result;
  end if;
  v_result := public.senfx_demo_confirm_order(p_user_id, v_order_three, '91000000003', '92000000003', 10);
  if coalesce((v_result->>'confirmed')::boolean, false) is not true then
    raise exception 'Third contract confirmation failed: %', v_result;
  end if;
  v_result := public.senfx_demo_settle_order(p_user_id, v_order_three, 'lost', -10, 0, 'lost');
  if coalesce((v_result->>'settled')::boolean, false) is not true then
    raise exception 'Third Demo contract must settle after daily loss exceeds 20: %', v_result;
  end if;

  select * into v_risk
  from public.deriv_demo_daily_risk
  where user_id = p_user_id
    and account_id = v_account_id
    and risk_date = (now() at time zone 'UTC')::date;

  if v_risk.realized_loss <> 30 or v_risk.reserved_loss <> 0 then
    raise exception 'Expected three logged Demo losses totaling 30 and zero reserved. Got % / %',
      v_risk.realized_loss, v_risk.reserved_loss;
  end if;

  raise notice 'PASS: unlimited Demo learning allowed three 10-unit losses; accounting, duplicate-buy protection and reservation cleanup remained intact.';
end;
$$;

rollback;
