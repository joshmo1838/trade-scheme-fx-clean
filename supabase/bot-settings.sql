-- Trade Scheme FX customer bot preferences.
-- Run once in Supabase SQL Editor after bot-center.sql.

create table if not exists public.customer_bot_settings (
  customer_id uuid primary key references auth.users(id) on delete cascade,
  trading_mode text not null default 'demo' check (trading_mode in ('demo','real')),
  stake_amount numeric(12,2) not null default 10 check (stake_amount >= 10),
  daily_loss_limit numeric(12,2) null check (daily_loss_limit is null or daily_loss_limit > 0),
  updated_at timestamptz not null default now(),
  constraint demo_stake_range check (trading_mode <> 'demo' or stake_amount <= 100)
);

alter table public.customer_bot_settings enable row level security;
grant select, insert, update on public.customer_bot_settings to authenticated;

drop policy if exists "Customers manage their own bot settings" on public.customer_bot_settings;
create policy "Customers manage their own bot settings"
on public.customer_bot_settings for all to authenticated
using (customer_id = (select auth.uid()) or public.is_admin())
with check (customer_id = (select auth.uid()) or public.is_admin());
