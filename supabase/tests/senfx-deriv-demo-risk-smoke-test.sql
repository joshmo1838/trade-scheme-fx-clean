-- SENFX Deriv Demo risk ledger smoke test.
-- Uses a dedicated temporary Demo account ID and rolls all data back.
-- Replace the one test-user UUID with a real Supabase Auth user UUID.
-- Do not run against a busy production user: the script temporarily changes that user's
-- deriv_connections row inside a transaction, then ROLLBACK restores the original values.

begin;

do $$
declare
  p_user_id uuid := 'REPLACE-WITH-TEST-USER-UUID';
  v_account_id text := 'SENFX_TEST_DEMO_' || left(gen_random_uuid()::text, 8);
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

  v_result := public.senfx_demo_confirm_order(p_user_id, v_order_one, '91000000001', 10);
  if coalesce((v_result->>'confirmed')::boolean, false) is not true then
    raise exception 'First test contract should confirm: %', v_result;
  end if;

  v_result := public.senfx_demo_settle_order(p_user_id, v_order_one, 'lost', -10, 0, 'lost');
  if coalesce((v_result->>'settled')::boolean, false) is not true then
    raise exception 'First 10 Demo loss should settle: %', v_result;
  end if;

  -- Trade 2: a second sequential 10 loss exhausts the 20 daily cap.
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

  v_result := public.senfx_demo_confirm_order(p_user_id, v_order_two, '91000000002', 10);
  if coalesce((v_result->>'confirmed')::boolean, false) is not true then
    raise exception 'Second test contract should confirm: %', v_result;
  end if;

  v_result := public.senfx_demo_settle_order(p_user_id, v_order_two, 'lost', -10, 0, 'lost');
  if coalesce((v_result->>'settled')::boolean, false) is not true then
    raise exception 'Second 10 Demo loss should settle: %', v_result;
  end if;

  -- Trade 3: must be denied after the daily loss reaches 20.
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
  if coalesce((v_result->>'allowed')::boolean, true) is not false then
    raise exception 'Third 10 Demo risk reservation must be denied: %', v_result;
  end if;

  select * into v_risk
  from public.deriv_demo_daily_risk
  where user_id = p_user_id
    and account_id = v_account_id
    and risk_date = (now() at time zone 'UTC')::date;

  if v_risk.realized_loss <> 20 or v_risk.reserved_loss <> 0 then
    raise exception 'Expected realized loss 20 and reserved loss 0. Got % / %',
      v_risk.realized_loss, v_risk.reserved_loss;
  end if;

  raise notice 'PASS: two sequential 10 Demo losses were recorded, the 20 daily cap was reached, and a third reservation was denied.';
end;
$$;

rollback;
