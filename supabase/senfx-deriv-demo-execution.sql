-- SENFX Demo-only execution. This migration never enables the Real WebSocket.
-- Run after the existing Supabase foundation and deriv_connections migrations.

create table if not exists public.deriv_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  encrypted_token text not null,
  token_iv text not null,
  token_tag text not null,
  expires_at timestamptz not null,
  connected_at timestamptz not null default now(),
  status text not null default 'connected'
    check (status in ('connected','disconnected','expired')),
  active_account_id text,
  active_account_type text
    check (active_account_type is null or active_account_type in ('demo','real'))
);

alter table public.deriv_connections
  add column if not exists active_account_id text;
alter table public.deriv_connections
  add column if not exists active_account_type text;

-- OAuth tokens are only decrypted by server-side routes using the service role.
alter table public.deriv_connections enable row level security;
revoke all on public.deriv_connections from anon, authenticated;
grant all on public.deriv_connections to service_role;

create table if not exists public.deriv_demo_daily_risk (
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id text not null,
  risk_date date not null,
  currency text not null,
  daily_loss_limit numeric(12,2) not null default 20
    check (daily_loss_limit = 20),
  realized_loss numeric(12,2) not null default 0
    check (realized_loss >= 0),
  reserved_loss numeric(12,2) not null default 0
    check (reserved_loss >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, account_id, risk_date)
);

create table if not exists public.deriv_demo_orders (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id text not null,
  currency text not null,
  market_symbol text not null
    check (market_symbol in ('R_10','R_25','R_50','R_75','R_100','frxEURUSD')),
  contract_type text not null check (contract_type in ('CALL','PUT')),
  duration integer not null default 5 check (duration = 5),
  duration_unit text not null default 'm' check (duration_unit = 'm'),
  stake_amount numeric(12,2) not null default 10 check (stake_amount = 10),
  proposal_id text not null,
  ask_price numeric(12,2) not null check (ask_price > 0 and ask_price <= 10),
  payout numeric(12,2),
  longcode text,
  status text not null default 'quoted'
    check (status in ('quoted','reserved','open','buy_unknown','cancelled','expired','rejected','won','lost','sold')),
  risk_date date,
  contract_id text,
  buy_price numeric(12,2),
  sell_price numeric(12,2),
  profit numeric(12,2),
  contract_status text,
  quote_expires_at timestamptz not null,
  opened_at timestamptz,
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint deriv_demo_orders_user_request_unique unique (user_id, request_id)
);

create unique index if not exists deriv_demo_orders_account_contract_unique
  on public.deriv_demo_orders(account_id, contract_id)
  where contract_id is not null;

create unique index if not exists deriv_demo_orders_one_active_per_user
  on public.deriv_demo_orders(user_id)
  where status in ('reserved','open','buy_unknown');

create index if not exists deriv_demo_orders_user_created_idx
  on public.deriv_demo_orders(user_id, created_at desc);

create index if not exists deriv_demo_risk_user_date_idx
  on public.deriv_demo_daily_risk(user_id, risk_date desc);

alter table public.deriv_demo_daily_risk enable row level security;
alter table public.deriv_demo_orders enable row level security;

drop policy if exists "Customers read own Deriv demo risk" on public.deriv_demo_daily_risk;
create policy "Customers read own Deriv demo risk"
  on public.deriv_demo_daily_risk for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Customers read own Deriv demo orders" on public.deriv_demo_orders;
create policy "Customers read own Deriv demo orders"
  on public.deriv_demo_orders for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.deriv_demo_daily_risk from anon, authenticated;
revoke all on public.deriv_demo_orders from anon, authenticated;
grant select on public.deriv_demo_daily_risk to authenticated;
grant select on public.deriv_demo_orders to authenticated;
grant all on public.deriv_demo_daily_risk to service_role;
grant all on public.deriv_demo_orders to service_role;

create or replace function public.senfx_demo_reserve_order(
  p_user_id uuid,
  p_order_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.deriv_demo_orders%rowtype;
  v_risk public.deriv_demo_daily_risk%rowtype;
  v_day date := (now() at time zone 'UTC')::date;
begin
  select * into v_order
  from public.deriv_demo_orders
  where id = p_order_id and user_id = p_user_id
  for update;

  if not found then
    return jsonb_build_object('allowed', false, 'reason', 'Demo order was not found.');
  end if;

  if v_order.status = 'reserved' then
    select * into v_risk from public.deriv_demo_daily_risk
    where user_id = p_user_id and account_id = v_order.account_id and risk_date = v_order.risk_date;
    return jsonb_build_object(
      'allowed', true, 'orderId', v_order.id, 'idempotent', true,
      'dailyLoss', coalesce(v_risk.realized_loss,0),
      'reservedLoss', coalesce(v_risk.reserved_loss,0),
      'dailyLossLimit', coalesce(v_risk.daily_loss_limit,20),
      'remainingLossBudget', greatest(0, coalesce(v_risk.daily_loss_limit,20) - coalesce(v_risk.realized_loss,0) - coalesce(v_risk.reserved_loss,0))
    );
  end if;

  if v_order.status <> 'quoted' then
    return jsonb_build_object('allowed', false, 'reason', 'This quote is no longer available for purchase.');
  end if;

  if v_order.quote_expires_at <= now() then
    update public.deriv_demo_orders set status = 'expired', updated_at = now()
    where id = p_order_id;
    return jsonb_build_object('allowed', false, 'reason', 'The quote expired. Request a fresh price.');
  end if;

  if not exists (
    select 1 from public.deriv_connections c
    where c.user_id = p_user_id
      and c.status = 'connected'
      and c.active_account_id = v_order.account_id
      and c.active_account_type = 'demo'
      and (c.expires_at is null or c.expires_at > now())
  ) then
    return jsonb_build_object('allowed', false, 'reason', 'Select an active Deriv Demo account before trading.');
  end if;

  if exists (
    select 1 from public.deriv_demo_orders o
    where o.user_id = p_user_id and o.account_id = v_order.account_id
      and o.status in ('reserved','open','buy_unknown')
      and o.risk_date < v_day
  ) then
    return jsonb_build_object('allowed', false, 'reason', 'A previous-day demo position is still unresolved. Check its status before opening another contract.');
  end if;

  insert into public.deriv_demo_daily_risk (
    user_id, account_id, risk_date, currency, daily_loss_limit
  ) values (
    p_user_id, v_order.account_id, v_day, v_order.currency, 20
  ) on conflict (user_id, account_id, risk_date) do nothing;

  select * into v_risk
  from public.deriv_demo_daily_risk
  where user_id = p_user_id and account_id = v_order.account_id and risk_date = v_day
  for update;

  if v_risk.currency <> v_order.currency then
    return jsonb_build_object('allowed', false, 'reason', 'The account currency changed. Refresh the account before trading.');
  end if;

  if v_risk.realized_loss + v_risk.reserved_loss + v_order.stake_amount > v_risk.daily_loss_limit then
    return jsonb_build_object(
      'allowed', false, 'reason', 'The $20 daily Demo loss limit has been reached or fully reserved.',
      'dailyLoss', v_risk.realized_loss, 'reservedLoss', v_risk.reserved_loss,
      'dailyLossLimit', v_risk.daily_loss_limit,
      'remainingLossBudget', greatest(0, v_risk.daily_loss_limit - v_risk.realized_loss - v_risk.reserved_loss)
    );
  end if;

  update public.deriv_demo_daily_risk
  set reserved_loss = reserved_loss + v_order.stake_amount, updated_at = now()
  where user_id = p_user_id and account_id = v_order.account_id and risk_date = v_day
  returning * into v_risk;

  update public.deriv_demo_orders
  set status = 'reserved', risk_date = v_day, updated_at = now()
  where id = p_order_id;

  return jsonb_build_object(
    'allowed', true, 'orderId', p_order_id,
    'dailyLoss', v_risk.realized_loss, 'reservedLoss', v_risk.reserved_loss,
    'dailyLossLimit', v_risk.daily_loss_limit,
    'remainingLossBudget', greatest(0, v_risk.daily_loss_limit - v_risk.realized_loss - v_risk.reserved_loss)
  );
end;
$$;

create or replace function public.senfx_demo_confirm_order(
  p_user_id uuid,
  p_order_id uuid,
  p_contract_id text,
  p_buy_price numeric
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.deriv_demo_orders%rowtype;
begin
  select * into v_order from public.deriv_demo_orders
  where id = p_order_id and user_id = p_user_id for update;

  if not found then
    return jsonb_build_object('confirmed', false, 'reason', 'Demo order was not found.');
  end if;

  if v_order.status = 'open' and v_order.contract_id = p_contract_id then
    return jsonb_build_object('confirmed', true, 'idempotent', true, 'contractId', p_contract_id);
  end if;

  if v_order.status not in ('reserved','buy_unknown') then
    return jsonb_build_object('confirmed', false, 'reason', 'The demo order has no active risk reservation.');
  end if;

  if v_order.contract_id is not null and v_order.contract_id <> p_contract_id then
    return jsonb_build_object('confirmed', false, 'reason', 'The unresolved order already references a different contract.');
  end if;

  if p_contract_id !~ '^[0-9]{1,30}    return jsonb_build_object('confirmed', false, 'reason', 'Deriv returned invalid contract details.');
  end if;

  update public.deriv_demo_orders
  set status = 'open', contract_id = p_contract_id, buy_price = p_buy_price,
      opened_at = now(), updated_at = now()
  where id = p_order_id;

  return jsonb_build_object('confirmed', true, 'contractId', p_contract_id);
end;
$$;

create or replace function public.senfx_demo_cancel_order(
  p_user_id uuid,
  p_order_id uuid,
  p_reason text default 'Deriv rejected the purchase.'
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.deriv_demo_orders%rowtype;
  v_risk public.deriv_demo_daily_risk%rowtype;
begin
  select * into v_order from public.deriv_demo_orders
  where id = p_order_id and user_id = p_user_id for update;

  if not found then
    return jsonb_build_object('cancelled', false, 'reason', 'Demo order was not found.');
  end if;

  if v_order.status = 'cancelled' then
    return jsonb_build_object('cancelled', true, 'idempotent', true);
  end if;

  -- Only an unused quote can be cancelled. Once risk is reserved, never release it
  -- solely because the browser reports an error; the buy outcome may be ambiguous.
  if v_order.status <> 'quoted' or v_order.contract_id is not null then
    return jsonb_build_object('cancelled', false, 'reason', 'A reserved or uncertain order cannot release risk automatically.');
  end if;

  update public.deriv_demo_orders
  set status = 'cancelled', contract_status = left(coalesce(p_reason,'Deriv rejected the purchase.'),160),
      updated_at = now()
  where id = p_order_id;

  return jsonb_build_object('cancelled', true);
end;
$$;

create or replace function public.senfx_demo_mark_buy_unknown(
  p_user_id uuid,
  p_order_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.deriv_demo_orders%rowtype;
begin
  select * into v_order from public.deriv_demo_orders
  where id = p_order_id and user_id = p_user_id for update;

  if not found or v_order.status not in ('reserved','buy_unknown') then
    return jsonb_build_object('updated', false, 'reason', 'No unresolved reserved purchase was found.');
  end if;

  update public.deriv_demo_orders
  set status = 'buy_unknown', updated_at = now()
  where id = p_order_id;

  return jsonb_build_object('updated', true, 'riskRemainsReserved', true);
end;
$$;

create or replace function public.senfx_demo_settle_order(
  p_user_id uuid,
  p_order_id uuid,
  p_final_status text,
  p_profit numeric,
  p_sell_price numeric default null,
  p_contract_status text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.deriv_demo_orders%rowtype;
  v_risk public.deriv_demo_daily_risk%rowtype;
begin
  select * into v_order from public.deriv_demo_orders
  where id = p_order_id and user_id = p_user_id for update;

  if not found then
    return jsonb_build_object('settled', false, 'reason', 'Demo order was not found.');
  end if;

  if v_order.status in ('won','lost','sold') then
    select * into v_risk from public.deriv_demo_daily_risk
    where user_id = p_user_id and account_id = v_order.account_id and risk_date = v_order.risk_date;
    return jsonb_build_object('settled', true, 'idempotent', true, 'profit', v_order.profit,
      'dailyLoss', coalesce(v_risk.realized_loss,0), 'reservedLoss', coalesce(v_risk.reserved_loss,0),
      'dailyLossLimit', coalesce(v_risk.daily_loss_limit,20),
      'remainingLossBudget', greatest(0, coalesce(v_risk.daily_loss_limit,20)-coalesce(v_risk.realized_loss,0)-coalesce(v_risk.reserved_loss,0)));
  end if;

  if v_order.status <> 'open' then
    return jsonb_build_object('settled', false, 'reason', 'Only a verified open demo contract can be settled.');
  end if;

  if p_final_status not in ('won','lost','sold') or p_profit is null then
    return jsonb_build_object('settled', false, 'reason', 'Final Deriv contract information is incomplete.');
  end if;

  select * into v_risk from public.deriv_demo_daily_risk
  where user_id = p_user_id and account_id = v_order.account_id and risk_date = v_order.risk_date
  for update;

  if not found then
    return jsonb_build_object('settled', false, 'reason', 'The demo risk ledger was not found.');
  end if;

  update public.deriv_demo_daily_risk
  set reserved_loss = greatest(0, reserved_loss - v_order.stake_amount),
      realized_loss = realized_loss + greatest(0, -p_profit),
      updated_at = now()
  where user_id = p_user_id and account_id = v_order.account_id and risk_date = v_order.risk_date
  returning * into v_risk;

  update public.deriv_demo_orders
  set status = p_final_status, profit = p_profit, sell_price = p_sell_price,
      contract_status = left(coalesce(p_contract_status,p_final_status),160),
      settled_at = now(), updated_at = now()
  where id = p_order_id;

  return jsonb_build_object(
    'settled', true, 'orderId', p_order_id, 'status', p_final_status,
    'profit', p_profit, 'dailyLoss', v_risk.realized_loss,
    'reservedLoss', v_risk.reserved_loss, 'dailyLossLimit', v_risk.daily_loss_limit,
    'remainingLossBudget', greatest(0, v_risk.daily_loss_limit-v_risk.realized_loss-v_risk.reserved_loss),
    'limitReached', v_risk.realized_loss + v_risk.reserved_loss >= v_risk.daily_loss_limit
  );
end;
$$;

revoke all on function public.senfx_demo_reserve_order(uuid,uuid) from public, anon, authenticated;
revoke all on function public.senfx_demo_confirm_order(uuid,uuid,text,numeric) from public, anon, authenticated;
revoke all on function public.senfx_demo_cancel_order(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.senfx_demo_mark_buy_unknown(uuid,uuid) from public, anon, authenticated;
revoke all on function public.senfx_demo_settle_order(uuid,uuid,text,numeric,numeric,text) from public, anon, authenticated;
grant execute on function public.senfx_demo_reserve_order(uuid,uuid) to service_role;
grant execute on function public.senfx_demo_confirm_order(uuid,uuid,text,numeric) to service_role;
grant execute on function public.senfx_demo_cancel_order(uuid,uuid,text) to service_role;
grant execute on function public.senfx_demo_mark_buy_unknown(uuid,uuid) to service_role;
grant execute on function public.senfx_demo_settle_order(uuid,uuid,text,numeric,numeric,text) to service_role;

comment on table public.deriv_demo_orders is
  'SENFX audit records for customer-authorized Deriv Demo contracts only. No Real account execution is supported.';
comment on table public.deriv_demo_daily_risk is
  'Per-customer, per-Deriv-Demo-account, UTC-date loss ledger for SENFX-originated demo contracts only.';
 or p_buy_price is null or p_buy_price <= 0 or p_buy_price > v_order.stake_amount then
    return jsonb_build_object('confirmed', false, 'reason', 'Deriv returned invalid contract details.');
  end if;

  update public.deriv_demo_orders
  set status = 'open', contract_id = p_contract_id, buy_price = p_buy_price,
      opened_at = now(), updated_at = now()
  where id = p_order_id;

  return jsonb_build_object('confirmed', true, 'contractId', p_contract_id);
end;
$$;

create or replace function public.senfx_demo_cancel_order(
  p_user_id uuid,
  p_order_id uuid,
  p_reason text default 'Deriv rejected the purchase.'
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.deriv_demo_orders%rowtype;
  v_risk public.deriv_demo_daily_risk%rowtype;
begin
  select * into v_order from public.deriv_demo_orders
  where id = p_order_id and user_id = p_user_id for update;

  if not found then
    return jsonb_build_object('cancelled', false, 'reason', 'Demo order was not found.');
  end if;

  if v_order.status = 'cancelled' then
    return jsonb_build_object('cancelled', true, 'idempotent', true);
  end if;

  if v_order.status not in ('quoted','reserved') or v_order.contract_id is not null then
    return jsonb_build_object('cancelled', false, 'reason', 'An order with an active or uncertain contract cannot release its risk reservation.');
  end if;

  if v_order.status = 'reserved' then
    select * into v_risk from public.deriv_demo_daily_risk
    where user_id = p_user_id and account_id = v_order.account_id and risk_date = v_order.risk_date
    for update;

    if found then
      update public.deriv_demo_daily_risk
      set reserved_loss = greatest(0, reserved_loss - v_order.stake_amount), updated_at = now()
      where user_id = p_user_id and account_id = v_order.account_id and risk_date = v_order.risk_date;
    end if;
  end if;

  update public.deriv_demo_orders
  set status = 'cancelled', contract_status = left(coalesce(p_reason,'Deriv rejected the purchase.'),160),
      updated_at = now()
  where id = p_order_id;

  return jsonb_build_object('cancelled', true);
end;
$$;

create or replace function public.senfx_demo_mark_buy_unknown(
  p_user_id uuid,
  p_order_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.deriv_demo_orders%rowtype;
begin
  select * into v_order from public.deriv_demo_orders
  where id = p_order_id and user_id = p_user_id for update;

  if not found or v_order.status not in ('reserved','buy_unknown') then
    return jsonb_build_object('updated', false, 'reason', 'No unresolved reserved purchase was found.');
  end if;

  update public.deriv_demo_orders
  set status = 'buy_unknown', updated_at = now()
  where id = p_order_id;

  return jsonb_build_object('updated', true, 'riskRemainsReserved', true);
end;
$$;

create or replace function public.senfx_demo_settle_order(
  p_user_id uuid,
  p_order_id uuid,
  p_final_status text,
  p_profit numeric,
  p_sell_price numeric default null,
  p_contract_status text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.deriv_demo_orders%rowtype;
  v_risk public.deriv_demo_daily_risk%rowtype;
begin
  select * into v_order from public.deriv_demo_orders
  where id = p_order_id and user_id = p_user_id for update;

  if not found then
    return jsonb_build_object('settled', false, 'reason', 'Demo order was not found.');
  end if;

  if v_order.status in ('won','lost','sold') then
    select * into v_risk from public.deriv_demo_daily_risk
    where user_id = p_user_id and account_id = v_order.account_id and risk_date = v_order.risk_date;
    return jsonb_build_object('settled', true, 'idempotent', true, 'profit', v_order.profit,
      'dailyLoss', coalesce(v_risk.realized_loss,0), 'reservedLoss', coalesce(v_risk.reserved_loss,0),
      'dailyLossLimit', coalesce(v_risk.daily_loss_limit,20),
      'remainingLossBudget', greatest(0, coalesce(v_risk.daily_loss_limit,20)-coalesce(v_risk.realized_loss,0)-coalesce(v_risk.reserved_loss,0)));
  end if;

  if v_order.status <> 'open' then
    return jsonb_build_object('settled', false, 'reason', 'Only a verified open demo contract can be settled.');
  end if;

  if p_final_status not in ('won','lost','sold') or p_profit is null then
    return jsonb_build_object('settled', false, 'reason', 'Final Deriv contract information is incomplete.');
  end if;

  select * into v_risk from public.deriv_demo_daily_risk
  where user_id = p_user_id and account_id = v_order.account_id and risk_date = v_order.risk_date
  for update;

  if not found then
    return jsonb_build_object('settled', false, 'reason', 'The demo risk ledger was not found.');
  end if;

  update public.deriv_demo_daily_risk
  set reserved_loss = greatest(0, reserved_loss - v_order.stake_amount),
      realized_loss = realized_loss + greatest(0, -p_profit),
      updated_at = now()
  where user_id = p_user_id and account_id = v_order.account_id and risk_date = v_order.risk_date
  returning * into v_risk;

  update public.deriv_demo_orders
  set status = p_final_status, profit = p_profit, sell_price = p_sell_price,
      contract_status = left(coalesce(p_contract_status,p_final_status),160),
      settled_at = now(), updated_at = now()
  where id = p_order_id;

  return jsonb_build_object(
    'settled', true, 'orderId', p_order_id, 'status', p_final_status,
    'profit', p_profit, 'dailyLoss', v_risk.realized_loss,
    'reservedLoss', v_risk.reserved_loss, 'dailyLossLimit', v_risk.daily_loss_limit,
    'remainingLossBudget', greatest(0, v_risk.daily_loss_limit-v_risk.realized_loss-v_risk.reserved_loss),
    'limitReached', v_risk.realized_loss + v_risk.reserved_loss >= v_risk.daily_loss_limit
  );
end;
$$;

revoke all on function public.senfx_demo_reserve_order(uuid,uuid) from public, anon, authenticated;
revoke all on function public.senfx_demo_confirm_order(uuid,uuid,text,numeric) from public, anon, authenticated;
revoke all on function public.senfx_demo_cancel_order(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.senfx_demo_mark_buy_unknown(uuid,uuid) from public, anon, authenticated;
revoke all on function public.senfx_demo_settle_order(uuid,uuid,text,numeric,numeric,text) from public, anon, authenticated;
grant execute on function public.senfx_demo_reserve_order(uuid,uuid) to service_role;
grant execute on function public.senfx_demo_confirm_order(uuid,uuid,text,numeric) to service_role;
grant execute on function public.senfx_demo_cancel_order(uuid,uuid,text) to service_role;
grant execute on function public.senfx_demo_mark_buy_unknown(uuid,uuid) to service_role;
grant execute on function public.senfx_demo_settle_order(uuid,uuid,text,numeric,numeric,text) to service_role;

comment on table public.deriv_demo_orders is
  'SENFX audit records for customer-authorized Deriv Demo contracts only. No Real account execution is supported.';
comment on table public.deriv_demo_daily_risk is
  'Per-customer, per-Deriv-Demo-account, UTC-date loss ledger for SENFX-originated demo contracts only.';
