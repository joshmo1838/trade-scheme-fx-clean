-- SENFX third $1 VIRTUAL-money Demo pilot; one admin, one new grant, one buy attempt.
-- Release-gated: requires a verified restorable production backup and green isolated CI.
-- Never reset previous grants, never delete orders, never enable real broker trading.
begin;
-- Phase-3 grant is separate: historical phase-2 consumed row is NEVER reset.
create table if not exists public.senfx_demo_auto_phase3_one_shots(
 user_id uuid primary key references auth.users(id) on delete cascade,
 account_id text not null,
 status text not null default 'armed' check (status in ('armed','reserved','stopped')),
 authorized_at timestamptz not null default now(),
 expires_at timestamptz not null,
 consumed_order_id uuid unique references public.deriv_demo_orders(id),
 consumed_at timestamptz,
 constraint senfx_phase3_grant_expiry check (expires_at > authorized_at),
 constraint senfx_phase3_consumption_consistency check (
   (status='reserved' and consumed_order_id is not null and consumed_at is not null)
   or (status<>'reserved' and consumed_order_id is null and consumed_at is null)
 )
);
alter table public.senfx_demo_auto_phase3_one_shots enable row level security;
revoke all on table public.senfx_demo_auto_phase3_one_shots from public,anon,authenticated;
grant select,insert,update on table public.senfx_demo_auto_phase3_one_shots to service_role;

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
  v_auto3 public.senfx_demo_auto_phase3_one_shots%rowtype;
  v_auto_phase3 boolean := false;
  v_prior_attempts integer := 0;
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


  -- One extra virtual purchase is authorized only by its distinct, unconsumed
  -- versioned grant. Keep the old phase-2 grant and all trade history intact.
  select count(*) into v_prior_attempts from public.deriv_demo_orders o
   where o.user_id=p_user_id and o.buy_requested_at is not null;
  if v_prior_attempts = 1 then
    select * into v_auto from public.senfx_demo_auto_one_shots
     where user_id=p_user_id and account_id=v_order.account_id for update;
    if not found or v_auto.status <> 'armed' or v_auto.expires_at <= now()
      or (select count(*) from public.deriv_demo_orders o
          where o.user_id=p_user_id and o.buy_requested_at is not null
            and o.status in ('won','lost','sold')) <> 1
    then
      return jsonb_build_object('allowed', false, 'reason',
       'Previous Demo attempt recorded. No unused, authorized phase-2 one-shot is available.');
    end if;
    v_auto_phase := true;
  elsif v_prior_attempts = 2 then
    -- A phase-3 grant NEVER substitutes for a missing/unused phase-2 record.
    if not exists (
       select 1 from public.senfx_demo_auto_one_shots previous
       where previous.user_id=p_user_id and previous.account_id=v_order.account_id
         and previous.status='reserved' and previous.consumed_order_id is not null
    ) or (select count(*) from public.deriv_demo_orders o
       where o.user_id=p_user_id and o.buy_requested_at is not null
         and o.status in ('won','lost','sold')) <> 2 then
      return jsonb_build_object('allowed', false, 'reason',
       'Prior Demo purchases or phase-2 authorization are not fully reconciled.');
    end if;
    select * into v_auto3 from public.senfx_demo_auto_phase3_one_shots
      where user_id=p_user_id and account_id=v_order.account_id for update;
    if not found or v_auto3.status <> 'armed' or v_auto3.expires_at <= now()
       or v_auto3.consumed_order_id is not null then
      return jsonb_build_object('allowed', false, 'reason',
       'New one-shot Demo authorization required. No third purchase authorized.');
    end if;
    v_auto_phase3 := true;
  elsif v_prior_attempts > 2 then
    return jsonb_build_object('allowed', false, 'reason',
       'Three Demo purchase attempts have been recorded. No fourth purchase authorized.');
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

  if v_auto_phase3 then
    update public.senfx_demo_auto_phase3_one_shots
    set status='reserved',consumed_order_id=p_order_id,consumed_at=now()
    where user_id=p_user_id and account_id=v_order.account_id
      and status='armed' and consumed_order_id is null;
    if not found then
      raise exception 'Demo phase-3 grant concurrently consumed';
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
