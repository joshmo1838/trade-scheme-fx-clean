-- SENFX persistent daily paper-risk controls.
-- Run after senfx-bot-management-v2.sql. All writes are server-mediated through
-- SECURITY DEFINER RPCs called only with the Supabase service role.
-- Daily loss is gross realized losses (wins do not replenish the loss budget).
-- The daily risk date rolls over at 00:00 UTC.

create table if not exists public.customer_paper_trades (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete cascade,
  bot_id uuid not null references public.bots(id) on delete cascade,
  market_symbol text not null,
  direction text not null check (direction in ('CALL','PUT')),
  entry_price numeric(24,10) not null,
  exit_price numeric(24,10) not null,
  stake_amount numeric(12,2) not null check (stake_amount >= 10 and stake_amount <= 100),
  pnl numeric(12,2) not null,
  outcome text not null check (outcome in ('WIN','LOSS')),
  opened_at timestamptz not null,
  closed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint paper_trade_time_order check (closed_at >= opened_at)
);

alter table public.customer_paper_trades
  add column if not exists reservation_id uuid,
  add column if not exists risk_date date;

create unique index if not exists customer_paper_trades_reservation_uidx
  on public.customer_paper_trades(reservation_id)
  where reservation_id is not null;
create index if not exists customer_paper_trades_owner_closed_idx
  on public.customer_paper_trades(customer_id, closed_at desc);

create table if not exists public.customer_paper_daily_risk (
  customer_id uuid not null references auth.users(id) on delete cascade,
  bot_id uuid not null references public.bots(id) on delete cascade,
  risk_date date not null,
  daily_loss_limit numeric(12,2) not null check (daily_loss_limit > 0),
  realized_loss numeric(12,2) not null default 0 check (realized_loss >= 0),
  reserved_loss numeric(12,2) not null default 0 check (reserved_loss >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (customer_id, bot_id, risk_date)
);

create table if not exists public.customer_paper_trade_reservations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete cascade,
  bot_id uuid not null references public.bots(id) on delete cascade,
  risk_date date not null,
  market_symbol text not null,
  direction text not null check (direction in ('CALL','PUT')),
  entry_price numeric(24,10) not null check (entry_price > 0),
  stake_amount numeric(12,2) not null check (stake_amount >= 10 and stake_amount <= 100),
  status text not null default 'open' check (status in ('open','settled','cancelled')),
  created_at timestamptz not null default now(),
  settled_at timestamptz
);

create index if not exists customer_paper_reservations_owner_status_idx
  on public.customer_paper_trade_reservations(customer_id, bot_id, status);

alter table public.customer_paper_trades enable row level security;
alter table public.customer_paper_daily_risk enable row level security;
alter table public.customer_paper_trade_reservations enable row level security;

revoke all on public.customer_paper_daily_risk from anon, authenticated;
revoke all on public.customer_paper_trade_reservations from anon, authenticated;
revoke insert, update, delete on public.customer_paper_trades from anon, authenticated;
grant select on public.customer_paper_trades to authenticated;
grant select on public.customer_paper_daily_risk to authenticated;
grant select on public.customer_paper_trade_reservations to authenticated;
grant all on public.customer_paper_trades to service_role;
grant all on public.customer_paper_daily_risk to service_role;
grant all on public.customer_paper_trade_reservations to service_role;

drop policy if exists "Customers read own paper trades" on public.customer_paper_trades;
create policy "Customers read own paper trades"
  on public.customer_paper_trades for select to authenticated
  using (customer_id = (select auth.uid()));

drop policy if exists "Customers read own daily paper risk" on public.customer_paper_daily_risk;
create policy "Customers read own daily paper risk"
  on public.customer_paper_daily_risk for select to authenticated
  using (customer_id = (select auth.uid()));

drop policy if exists "Customers read own paper reservations" on public.customer_paper_trade_reservations;
create policy "Customers read own paper reservations"
  on public.customer_paper_trade_reservations for select to authenticated
  using (customer_id = (select auth.uid()));

-- Reserve the configured stake before opening each paper position. The locked
-- daily row serializes requests from concurrent tabs/devices so total potential
-- open loss plus realized gross loss cannot exceed the configured daily limit.
create or replace function public.senfx_paper_reserve_trade(
  p_customer_id uuid,
  p_bot_id uuid,
  p_market_symbol text,
  p_direction text,
  p_entry_price numeric
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_day date := (now() at time zone 'UTC')::date;
  v_stake numeric(12,2);
  v_limit numeric(12,2);
  v_risk public.customer_paper_daily_risk%rowtype;
  v_reservation_id uuid;
  v_opened_at timestamptz;
begin
  if p_customer_id is null or p_bot_id is null then
    return jsonb_build_object('allowed', false, 'reason', 'Customer or bot is missing.');
  end if;
  if p_market_symbol not in ('R_10','R_25','R_50','R_75','R_100','frxEURUSD') then
    return jsonb_build_object('allowed', false, 'reason', 'This market is not enabled for paper simulation yet.');
  end if;
  if p_direction not in ('CALL','PUT') or p_entry_price is null or p_entry_price <= 0 then
    return jsonb_build_object('allowed', false, 'reason', 'Invalid paper trade parameters.');
  end if;
  if not exists (
    select 1 from public.bots b
    where b.id = p_bot_id and b.is_published = true
  ) then
    return jsonb_build_object('allowed', false, 'reason', 'This bot is not currently published.');
  end if;
  if not exists (
    select 1 from public.customer_bots cb
    where cb.customer_id = p_customer_id
      and cb.bot_id = p_bot_id
      and cb.trading_mode = 'demo'
      and cb.selected = true
      and cb.control_status = 'selected'
  ) then
    return jsonb_build_object('allowed', false, 'reason', 'Select this bot in Demo mode before starting paper simulation.');
  end if;

  select c.stake_amount, c.daily_loss_limit
    into v_stake, v_limit
  from public.customer_bot_configurations c
  where c.customer_id = p_customer_id
    and c.bot_id = p_bot_id
    and c.trading_mode = 'demo';

  if not found or v_limit is null or v_limit <= 0 then
    return jsonb_build_object('allowed', false, 'reason', 'Save a positive daily paper loss limit before starting.');
  end if;
  if v_stake < 10 or v_stake > 100 then
    return jsonb_build_object('allowed', false, 'reason', 'Saved paper stake is outside the allowed $10–$100 range.');
  end if;
  if v_stake > v_limit then
    return jsonb_build_object('allowed', false, 'reason', 'Paper stake cannot be greater than the daily loss limit.');
  end if;

  insert into public.customer_paper_daily_risk as current_risk (
    customer_id, bot_id, risk_date, daily_loss_limit
  ) values (p_customer_id, p_bot_id, v_day, v_limit)
  on conflict (customer_id, bot_id, risk_date) do update
    set daily_loss_limit = least(current_risk.daily_loss_limit, excluded.daily_loss_limit),
        updated_at = now();

  select * into v_risk
  from public.customer_paper_daily_risk
  where customer_id = p_customer_id and bot_id = p_bot_id and risk_date = v_day
  for update;

  if v_risk.realized_loss + v_risk.reserved_loss + v_stake > v_risk.daily_loss_limit then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'Daily paper loss limit reached. New paper trades are blocked until 00:00 UTC.',
      'dailyLoss', v_risk.realized_loss,
      'reservedLoss', v_risk.reserved_loss,
      'dailyLossLimit', v_risk.daily_loss_limit,
      'riskDate', v_day
    );
  end if;

  insert into public.customer_paper_trade_reservations (
    customer_id, bot_id, risk_date, market_symbol, direction, entry_price, stake_amount
  ) values (
    p_customer_id, p_bot_id, v_day, p_market_symbol, p_direction, p_entry_price, v_stake
  ) returning id, created_at into v_reservation_id, v_opened_at;

  update public.customer_paper_daily_risk
  set reserved_loss = reserved_loss + v_stake, updated_at = now()
  where customer_id = p_customer_id and bot_id = p_bot_id and risk_date = v_day
  returning * into v_risk;

  return jsonb_build_object(
    'allowed', true,
    'reservationId', v_reservation_id,
    'marketSymbol', p_market_symbol,
    'entryPrice', p_entry_price,
    'openedAt', v_opened_at,
    'stakeAmount', v_stake,
    'dailyLoss', v_risk.realized_loss,
    'reservedLoss', v_risk.reserved_loss,
    'dailyLossLimit', v_risk.daily_loss_limit,
    'remainingLossBudget', greatest(0, v_risk.daily_loss_limit - v_risk.realized_loss - v_risk.reserved_loss),
    'riskDate', v_day
  );
end;
$$;

-- Settle only an existing reservation. The server calculates the illustrative
-- 1:1 paper P/L from stored entry/direction/stake and the supplied exit quote.
create or replace function public.senfx_paper_settle_trade(
  p_customer_id uuid,
  p_reservation_id uuid,
  p_exit_price numeric
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_res public.customer_paper_trade_reservations%rowtype;
  v_risk public.customer_paper_daily_risk%rowtype;
  v_won boolean;
  v_pnl numeric(12,2);
  v_outcome text;
  v_trade_id uuid;
  v_closed_at timestamptz := now();
begin
  if p_customer_id is null or p_reservation_id is null or p_exit_price is null or p_exit_price <= 0 then
    return jsonb_build_object('settled', false, 'reason', 'Invalid settlement request.');
  end if;

  select * into v_res
  from public.customer_paper_trade_reservations
  where id = p_reservation_id and customer_id = p_customer_id
  for update;

  if not found then
    return jsonb_build_object('settled', false, 'reason', 'Paper reservation was not found.');
  end if;
  if v_res.status <> 'open' then
    return jsonb_build_object('settled', false, 'reason', 'Paper reservation is no longer open.');
  end if;

  select * into v_risk
  from public.customer_paper_daily_risk
  where customer_id = v_res.customer_id
    and bot_id = v_res.bot_id
    and risk_date = v_res.risk_date
  for update;

  if not found then
    return jsonb_build_object('settled', false, 'reason', 'Daily risk record is missing.');
  end if;

  v_won := (v_res.direction = 'CALL' and p_exit_price > v_res.entry_price)
        or (v_res.direction = 'PUT' and p_exit_price < v_res.entry_price);
  v_pnl := case when v_won then v_res.stake_amount else -v_res.stake_amount end;
  v_outcome := case when v_won then 'WIN' else 'LOSS' end;

  insert into public.customer_paper_trades (
    customer_id, bot_id, market_symbol, direction, entry_price, exit_price,
    stake_amount, pnl, outcome, opened_at, closed_at, reservation_id, risk_date
  ) values (
    v_res.customer_id, v_res.bot_id, v_res.market_symbol, v_res.direction,
    v_res.entry_price, p_exit_price, v_res.stake_amount, v_pnl, v_outcome,
    v_res.created_at, v_closed_at, v_res.id, v_res.risk_date
  ) returning id into v_trade_id;

  update public.customer_paper_trade_reservations
  set status = 'settled', settled_at = v_closed_at
  where id = v_res.id;

  update public.customer_paper_daily_risk
  set reserved_loss = greatest(0, reserved_loss - v_res.stake_amount),
      realized_loss = realized_loss + greatest(0, -v_pnl),
      updated_at = now()
  where customer_id = v_res.customer_id
    and bot_id = v_res.bot_id
    and risk_date = v_res.risk_date
  returning * into v_risk;

  return jsonb_build_object(
    'settled', true,
    'tradeId', v_trade_id,
    'outcome', v_outcome,
    'pnl', v_pnl,
    'marketSymbol', v_res.market_symbol,
    'entryPrice', v_res.entry_price,
    'exitPrice', p_exit_price,
    'openedAt', v_res.created_at,
    'closedAt', v_closed_at,
    'dailyLoss', v_risk.realized_loss,
    'reservedLoss', v_risk.reserved_loss,
    'dailyLossLimit', v_risk.daily_loss_limit,
    'remainingLossBudget', greatest(0, v_risk.daily_loss_limit - v_risk.realized_loss - v_risk.reserved_loss),
    'limitReached', v_risk.realized_loss + v_risk.reserved_loss >= v_risk.daily_loss_limit,
    'riskDate', v_res.risk_date
  );
end;
$$;

-- Releasing an unfinished browser-only paper position does not count as a loss.
create or replace function public.senfx_paper_cancel_reservation(
  p_customer_id uuid,
  p_reservation_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_res public.customer_paper_trade_reservations%rowtype;
  v_risk public.customer_paper_daily_risk%rowtype;
begin
  select * into v_res
  from public.customer_paper_trade_reservations
  where id = p_reservation_id and customer_id = p_customer_id
  for update;

  if not found or v_res.status <> 'open' then
    return jsonb_build_object('cancelled', false, 'reason', 'No open reservation was found.');
  end if;

  update public.customer_paper_trade_reservations
  set status = 'cancelled', settled_at = now()
  where id = v_res.id;

  update public.customer_paper_daily_risk
  set reserved_loss = greatest(0, reserved_loss - v_res.stake_amount),
      updated_at = now()
  where customer_id = v_res.customer_id
    and bot_id = v_res.bot_id
    and risk_date = v_res.risk_date
  returning * into v_risk;

  return jsonb_build_object(
    'cancelled', true,
    'dailyLoss', v_risk.realized_loss,
    'reservedLoss', v_risk.reserved_loss,
    'dailyLossLimit', v_risk.daily_loss_limit,
    'riskDate', v_res.risk_date
  );
end;
$$;

revoke all on function public.senfx_paper_reserve_trade(uuid,uuid,text,text,numeric) from public, anon, authenticated;
revoke all on function public.senfx_paper_settle_trade(uuid,uuid,numeric) from public, anon, authenticated;
revoke all on function public.senfx_paper_cancel_reservation(uuid,uuid) from public, anon, authenticated;
grant execute on function public.senfx_paper_reserve_trade(uuid,uuid,text,text,numeric) to service_role;
grant execute on function public.senfx_paper_settle_trade(uuid,uuid,numeric) to service_role;
grant execute on function public.senfx_paper_cancel_reservation(uuid,uuid) to service_role;

comment on table public.customer_paper_daily_risk is
  'Server-maintained UTC daily gross-loss budget with reserved exposure for open paper positions.';
comment on table public.customer_paper_trade_reservations is
  'Server-created paper trade reservations; reserve stake as maximum loss before simulation entry.';
comment on function public.senfx_paper_reserve_trade(uuid,uuid,text,text,numeric) is
  'Atomically reserves paper trade risk and rejects entries that would exceed daily configured loss cap.';
