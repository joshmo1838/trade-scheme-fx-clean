-- SENFX upgrade for existing installations: unlimited daily Demo learning.
-- Must run AFTER supabase/senfx-deriv-demo-execution.sql, on the same Supabase project.
-- All trades remain customer-authorized, Demo-only, fixed stake 10, one open order.
-- This migration removes the SENFX daily gross-loss ENFORCEMENT, while retaining
-- reservation and realized loss accounting for audit and duplicate-buy protection.
-- It does not modify OAuth tokens, balances, or any Real trading permissions.
begin;

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

  insert into public.deriv_demo_daily_risk(user_id,account_id,risk_date,currency,daily_loss_limit)
  values (p_user_id,v_order.account_id,v_day,v_order.currency,20)
  on conflict (user_id,account_id,risk_date) do nothing;

  select * into v_risk from public.deriv_demo_daily_risk
  where user_id=p_user_id and account_id=v_order.account_id and risk_date=v_day for update;

  if v_risk.currency <> v_order.currency then
    return jsonb_build_object('allowed', false, 'reason', 'The account currency changed. Refresh the account before trading.');
  end if;
  update public.deriv_demo_daily_risk
  set reserved_loss=reserved_loss+v_order.stake_amount,updated_at=now()
  where user_id=p_user_id and account_id=v_order.account_id and risk_date=v_day
  returning * into v_risk;

  update public.deriv_demo_orders set status='reserved',risk_date=v_day,updated_at=now()
  where id=p_order_id;

  return jsonb_build_object(
    'allowed',true,'orderId',p_order_id,'dailyLoss',v_risk.realized_loss,
    'reservedLoss',v_risk.reserved_loss,'dailyLossLimit',null,
    'remainingLossBudget',null,'unlimitedDemoPractice',true
  );
end;
$$;

create or replace function public.senfx_demo_settle_order(
  p_user_id uuid,p_order_id uuid,p_final_status text,p_profit numeric,
  p_sell_price numeric default null,p_contract_status text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_order public.deriv_demo_orders%rowtype;
  v_risk public.deriv_demo_daily_risk%rowtype;
begin
  select * into v_order from public.deriv_demo_orders
  where id=p_order_id and user_id=p_user_id for update;
  if not found then
    return jsonb_build_object('settled',false,'reason','Demo order was not found.');
  end if;
  if v_order.status in ('won','lost','sold') then
    select * into v_risk from public.deriv_demo_daily_risk
    where user_id=p_user_id and account_id=v_order.account_id and risk_date=v_order.risk_date;
    return jsonb_build_object(
      'settled',true,'idempotent',true,'profit',v_order.profit,
      'dailyLoss',coalesce(v_risk.realized_loss,0),'reservedLoss',coalesce(v_risk.reserved_loss,0),
      'dailyLossLimit',null,'remainingLossBudget',null,'unlimitedDemoPractice',true
    );
  end if;
  if v_order.status<>'open' then
    return jsonb_build_object('settled',false,'reason','Only a verified open Demo contract can be settled.');
  end if;
  if p_final_status not in ('won','lost','sold') or p_profit is null then
    return jsonb_build_object('settled',false,'reason','Final Deriv contract information is incomplete.');
  end if;
  select * into v_risk from public.deriv_demo_daily_risk
  where user_id=p_user_id and account_id=v_order.account_id and risk_date=v_order.risk_date for update;
  if not found then
    return jsonb_build_object('settled',false,'reason','The Demo risk ledger was not found.');
  end if;
  update public.deriv_demo_daily_risk
  set reserved_loss=greatest(0,reserved_loss-v_order.stake_amount),
      realized_loss=realized_loss+greatest(0,-p_profit),updated_at=now()
  where user_id=p_user_id and account_id=v_order.account_id and risk_date=v_order.risk_date
  returning * into v_risk;
  update public.deriv_demo_orders
  set status=p_final_status,profit=p_profit,sell_price=p_sell_price,
      contract_status=left(coalesce(p_contract_status,p_final_status),160),
      settled_at=now(),updated_at=now()
  where id=p_order_id;
  return jsonb_build_object(
    'settled',true,'orderId',p_order_id,'status',p_final_status,'profit',p_profit,
    'dailyLoss',v_risk.realized_loss,'reservedLoss',v_risk.reserved_loss,
    'dailyLossLimit',null,'remainingLossBudget',null,
    'unlimitedDemoPractice',true,'limitReached',false
  );
end;
$$;

revoke all on function public.senfx_demo_reserve_order(uuid,uuid) from public,anon,authenticated;
revoke all on function public.senfx_demo_settle_order(uuid,uuid,text,numeric,numeric,text) from public,anon,authenticated;
grant execute on function public.senfx_demo_reserve_order(uuid,uuid) to service_role;
grant execute on function public.senfx_demo_settle_order(uuid,uuid,text,numeric,numeric,text) to service_role;
comment on table public.deriv_demo_daily_risk is
  'Per-customer, per-Deriv-Demo-account, UTC-date audit ledger for SENFX-originated Demo orders. The legacy daily_loss_limit column is not enforced.';
commit;
