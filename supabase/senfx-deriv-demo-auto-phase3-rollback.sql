-- Phase-3 rollback preserves existing orders, risk history and consumed grant audit.
-- Disable broker buys and redeploy first; test a production backup restore separately.
begin;
update public.senfx_demo_auto_phase3_one_shots
 set status='stopped' where status='armed';
create or replace function public.senfx_demo_reserve_order(
  p_user_id uuid, p_order_id uuid
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_order public.deriv_demo_orders%rowtype;
  v_risk public.deriv_demo_daily_risk%rowtype;
  v_day date := (now() at time zone 'UTC')::date;
  v_auto public.senfx_demo_auto_one_shots%rowtype;
  v_auto_phase boolean := false;
begin
  select * into v_order from public.deriv_demo_orders
  where id = p_order_id and user_id = p_user_id for update;
  if not found then
    return jsonb_build_object('allowed', false, 'reason', 'Demo order was not found.');
  end if;

  if v_order.status in ('reserved','buy_unknown','open') then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'This Demo order has already reserved risk or started a buy attempt. Reconcile its existing status; do not submit another buy.'
    );
  end if;

  if v_order.status <> 'quoted' then
    return jsonb_build_object('allowed', false, 'reason', 'This quote is no longer available for purchase.');
  end if;
  if v_order.quote_expires_at <= now() then
    update public.deriv_demo_orders set status = 'expired', updated_at = now() where id = p_order_id;
    return jsonb_build_object('allowed', false, 'reason', 'The quote expired. Request a fresh price.');
  end if;
  if not exists (
    select 1 from public.deriv_connections c
    where c.user_id = p_user_id and c.status = 'connected'
      and c.active_account_id = v_order.account_id
      and c.active_account_type = 'demo'
      and (c.expires_at is null or c.expires_at > now())
    for update
  ) then
    return jsonb_build_object('allowed', false, 'reason', 'Select an active Deriv Demo account before trading.');
  end if;
  if exists (
    select 1 from public.deriv_demo_orders o
    where o.user_id = p_user_id and o.account_id = v_order.account_id
      and o.status in ('reserved','open','buy_unknown') and o.risk_date < v_day
  ) then
    return jsonb_build_object('allowed', false, 'reason', 'A previous-day Demo order is unresolved. Reconcile it before opening another contract.');
  end if;

  -- The user has one pilot allocation across ALL Demo account IDs, not one
  -- allocation per account. The connection row FOR UPDATE above serializes
  -- concurrent requests for this user before this cross-account check.
  if exists (
    select 1 from public.deriv_demo_orders o
    where o.user_id = p_user_id and o.id <> p_order_id
      and o.status in ('reserved','open','buy_unknown')
  ) then
    return jsonb_build_object('allowed', false, 'reason', 'An outstanding Demo pilot order already exists for this user.');
  end if;

  -- An attempted buy is permanent evidence for this one-trade pilot, even if
  -- Deriv later reports a win, loss, rejection or uncertain outcome.
  -- An existing Demo attempt is never erased. A NEW, explicitly authorized
  -- one-shot phase may reserve at most ONE extra virtual-money purchase.
  -- The grant is consumed at reservation, even if the subsequent buy fails.
  if exists (
    select 1 from public.deriv_demo_orders o
    where o.user_id = p_user_id and o.buy_requested_at is not null
  ) then
    select * into v_auto from public.senfx_demo_auto_one_shots
     where user_id = p_user_id and account_id = v_order.account_id
     for update;
    if not found or v_auto.status <> 'armed' or v_auto.expires_at <= now()
      or (select count(*) from public.deriv_demo_orders o
          where o.user_id = p_user_id and o.buy_requested_at is not null) <> 1
      or (select count(*) from public.deriv_demo_orders o
          where o.user_id = p_user_id and o.buy_requested_at is not null
            and o.status in ('won','lost','sold')) <> 1
    then
      return jsonb_build_object('allowed', false, 'reason',
       'Previous Demo attempt recorded. No unused, authorized one-shot phase is available.');
    end if;
    v_auto_phase := true;
  end if;

  insert into public.deriv_demo_daily_risk(user_id,account_id,risk_date,currency,daily_loss_limit)
  values (p_user_id,v_order.account_id,v_day,v_order.currency,1)
  on conflict (user_id,account_id,risk_date) do nothing;

  select * into v_risk from public.deriv_demo_daily_risk
  where user_id=p_user_id and account_id=v_order.account_id and risk_date=v_day for update;

  if v_risk.currency <> v_order.currency then
    return jsonb_build_object('allowed', false, 'reason', 'The account currency changed. Refresh the account before trading.');
  end if;
  if v_order.stake_amount <> 1 or v_order.currency <> 'USD' then
    return jsonb_build_object('allowed', false, 'reason', 'Only one 1-USD virtual Demo stake is permitted for this pilot.');
  end if;
  if v_risk.daily_loss_limit <> 1 or
     v_risk.realized_loss + v_risk.reserved_loss + v_order.stake_amount > v_risk.daily_loss_limit then
    return jsonb_build_object('allowed', false, 'reason', 'Daily Demo loss budget exhausted or invalid.');
  end if;
  -- Serialize reservations for this account through its daily risk ledger.
  -- This row is already locked FOR UPDATE above, preventing two distinct
  -- quoted orders from simultaneously passing the outstanding-order check.
  if exists (
    select 1 from public.deriv_demo_orders o
    where o.user_id = p_user_id and o.account_id = v_order.account_id
      and o.id <> p_order_id and o.status in ('reserved','open','buy_unknown')
  ) then
    return jsonb_build_object('allowed', false, 'reason', 'Only one outstanding Demo order is allowed.');
  end if;
  update public.deriv_demo_daily_risk
  set reserved_loss=reserved_loss+v_order.stake_amount,updated_at=now()
  where user_id=p_user_id and account_id=v_order.account_id and risk_date=v_day
  returning * into v_risk;

  update public.deriv_demo_orders set status='reserved',risk_date=v_day,updated_at=now()
  where id=p_order_id;

  if v_auto_phase then
    update public.senfx_demo_auto_one_shots
    set status='reserved',consumed_order_id=p_order_id,consumed_at=now()
    where user_id=p_user_id and account_id=v_order.account_id
      and status='armed';
    if not found then
      raise exception 'Demo auto pilot grant was concurrently consumed';
    end if;
  end if;

  return jsonb_build_object(
    'allowed',true,'orderId',p_order_id,'dailyLoss',v_risk.realized_loss,
    'reservedLoss',v_risk.reserved_loss,'dailyLossLimit',1,
    'remainingLossBudget',greatest(0,1-v_risk.realized_loss-v_risk.reserved_loss),'unlimitedDemoPractice',false
  );
end;
$$;


revoke all on function public.senfx_demo_reserve_order(uuid,uuid) from public,anon,authenticated;
grant execute on function public.senfx_demo_reserve_order(uuid,uuid) to service_role;
commit;
