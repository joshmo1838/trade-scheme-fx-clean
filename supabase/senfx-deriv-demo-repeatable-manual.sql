-- QA FIRST. Controlled repeatable MANUAL virtual-money Demo reservations.
-- Never use on real-money accounts; no broker orders are sent by this script.
-- Preserve all historical buys and consumed one-shot audit records.
-- Limits: $1 USD stake, one unresolved buy, $10 daily virtual-loss budget,
-- 50 attempts per UTC day and >=15 seconds between attempted purchases.
begin;
do $safety$
begin
 if exists (select 1 from public.deriv_demo_orders where status in ('reserved','open','buy_unknown')) then
  raise exception 'Cannot migrate repeatable Demo while orders are unresolved';
 end if;
end;
$safety$;

alter table public.deriv_demo_daily_risk
 drop constraint if exists deriv_demo_daily_risk_daily_loss_limit_check;
alter table public.deriv_demo_daily_risk
 add constraint deriv_demo_daily_risk_daily_loss_limit_check
 check (daily_loss_limit in (1,10));
alter table public.deriv_demo_daily_risk
 alter column daily_loss_limit set default 10;

-- Upgrade only TODAY's existing $1 virtual risk ledger; retain its realized loss,
-- reserved loss, and every historical day's original loss-limit audit.
-- This avoids a same-day mismatch with the new reservation RPC.
update public.deriv_demo_daily_risk
 set daily_loss_limit=10, updated_at=now()
 where risk_date=(now() at time zone 'UTC')::date
   and daily_loss_limit=1;

create or replace function public.senfx_demo_reserve_order(
  p_user_id uuid, p_order_id uuid
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_order public.deriv_demo_orders%rowtype;
  v_risk public.deriv_demo_daily_risk%rowtype;
  v_day date := (now() at time zone 'UTC')::date;
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

  -- Repeatable manual-only virtual Demo: old orders remain immutable audit records.
  if (select count(*) from public.deriv_demo_orders o
      where o.user_id = p_user_id and o.risk_date = v_day
        and o.buy_requested_at is not null) >= 50 then
    return jsonb_build_object('allowed', false, 'reason', 'Daily virtual Demo attempt limit reached.');
  end if;
  if exists (select 1 from public.deriv_demo_orders o
      where o.user_id=p_user_id and o.buy_requested_at > now() - interval '15 seconds') then
    return jsonb_build_object('allowed', false, 'reason', 'Wait 15 seconds between Demo buys.');
  end if;

  insert into public.deriv_demo_daily_risk(user_id,account_id,risk_date,currency,daily_loss_limit)
  values (p_user_id,v_order.account_id,v_day,v_order.currency,10)
  on conflict (user_id,account_id,risk_date) do nothing;

  select * into v_risk from public.deriv_demo_daily_risk
  where user_id=p_user_id and account_id=v_order.account_id and risk_date=v_day for update;

  if v_risk.currency <> v_order.currency then
    return jsonb_build_object('allowed', false, 'reason', 'The account currency changed. Refresh the account before trading.');
  end if;
  if v_order.stake_amount <> 1 or v_order.currency <> 'USD' then
    return jsonb_build_object('allowed', false, 'reason', 'Only 1-USD virtual Demo stakes are permitted.');
  end if;
  if v_risk.daily_loss_limit <> 10 or
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

  return jsonb_build_object(
    'allowed',true,'orderId',p_order_id,'dailyLoss',v_risk.realized_loss,
    'reservedLoss',v_risk.reserved_loss,'dailyLossLimit',10,
    'remainingLossBudget',greatest(0,10-v_risk.realized_loss-v_risk.reserved_loss),'unlimitedDemoPractice',false
  );
end;
$$;


revoke all on function public.senfx_demo_reserve_order(uuid,uuid) from public,anon,authenticated;
grant execute on function public.senfx_demo_reserve_order(uuid,uuid) to service_role;

commit;
