-- SENFX customer-isolated paper trade history.
-- This table stores simulated outcomes only. It cannot place or settle Deriv contracts.
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
create index if not exists customer_paper_trades_owner_closed_idx
  on public.customer_paper_trades(customer_id, closed_at desc);
alter table public.customer_paper_trades enable row level security;
grant select on public.customer_paper_trades to authenticated;
revoke insert, update, delete on public.customer_paper_trades from anon, authenticated;
drop policy if exists "Customers read own paper trades" on public.customer_paper_trades;
create policy "Customers read own paper trades"
on public.customer_paper_trades for select to authenticated
using (customer_id = (select auth.uid()));
comment on table public.customer_paper_trades is
  'Illustrative customer-owned paper simulation history. Not exchange or broker executions.';
