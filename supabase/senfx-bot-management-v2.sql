-- SENFX bot-management schema reconciliation (safe to run after bot-center.sql and bot-settings.sql).
-- Bot controls in this release are saved preferences only; they do not start trading.

-- Keep independent Demo and Real selections for each customer.
alter table public.customer_bots
  add column if not exists trading_mode text not null default 'demo';

alter table public.customer_bots
  drop constraint if exists customer_bots_customer_id_bot_id_key;

alter table public.customer_bots
  drop constraint if exists customer_bots_trading_mode_check;

alter table public.customer_bots
  add constraint customer_bots_trading_mode_check
  check (trading_mode in ('demo','real'));

create unique index if not exists customer_bots_customer_bot_mode_uidx
  on public.customer_bots(customer_id, bot_id, trading_mode);

create index if not exists customer_bots_customer_mode_idx
  on public.customer_bots(customer_id, trading_mode);

-- Existing bot-settings migration used customer_id as the only primary key.
-- Re-key it by customer and mode so Demo and Real preferences do not overwrite each other.
alter table public.customer_bot_settings
  add column if not exists trading_mode text not null default 'demo';

alter table public.customer_bot_settings
  drop constraint if exists customer_bot_settings_trading_mode_check;

alter table public.customer_bot_settings
  add constraint customer_bot_settings_trading_mode_check
  check (trading_mode in ('demo','real'));

do $$
declare pk_name text;
begin
  select c.conname into pk_name
  from pg_constraint c
  where c.conrelid = 'public.customer_bot_settings'::regclass
    and c.contype = 'p';
  if pk_name is not null then
    execute format('alter table public.customer_bot_settings drop constraint %I', pk_name);
  end if;
end $$;

alter table public.customer_bot_settings
  add constraint customer_bot_settings_pkey primary key (customer_id, trading_mode);

-- Per-bot settings are isolated by customer, bot and account mode.
create table if not exists public.customer_bot_configurations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete cascade,
  bot_id uuid not null references public.bots(id) on delete cascade,
  trading_mode text not null check (trading_mode in ('demo','real')),
  stake_amount numeric(12,2) not null default 10 check (stake_amount >= 10),
  daily_loss_limit numeric(12,2) null check (daily_loss_limit is null or daily_loss_limit > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_bot_configurations_demo_stake_check
    check (trading_mode <> 'demo' or stake_amount <= 100),
  constraint customer_bot_configurations_customer_bot_mode_key
    unique (customer_id, bot_id, trading_mode)
);

alter table public.customer_bot_configurations enable row level security;
grant select, insert, update, delete on public.customer_bot_configurations to authenticated;

drop policy if exists "Customers manage their own bot configurations" on public.customer_bot_configurations;
create policy "Customers manage their own bot configurations"
on public.customer_bot_configurations for all to authenticated
using (customer_id = (select auth.uid()))
with check (
  customer_id = (select auth.uid())
  and exists (
    select 1 from public.bots b
    where b.id = bot_id and b.is_published = true
  )
);

-- Ensure customer bot records remain private to their owner.
drop policy if exists "Customers view their bot selections" on public.customer_bots;
create policy "Customers view their bot selections"
on public.customer_bots for select to authenticated
using (customer_id = (select auth.uid()) or public.is_admin());

drop policy if exists "Customers create their bot selections" on public.customer_bots;
create policy "Customers create their bot selections"
on public.customer_bots for insert to authenticated
with check (
  customer_id = (select auth.uid())
  and exists (select 1 from public.bots b where b.id = bot_id and b.is_published = true)
);

drop policy if exists "Customers update their bot selections" on public.customer_bots;
create policy "Customers update their bot selections"
on public.customer_bots for update to authenticated
using (customer_id = (select auth.uid()))
with check (
  customer_id = (select auth.uid())
  and exists (select 1 from public.bots b where b.id = bot_id and b.is_published = true)
);

drop policy if exists "Customers manage their own bot settings" on public.customer_bot_settings;
create policy "Customers manage their own bot settings"
on public.customer_bot_settings for all to authenticated
using (customer_id = (select auth.uid()))
with check (customer_id = (select auth.uid()));

comment on table public.customer_bot_configurations is
  'Customer-owned per-bot Demo/Real preferences. Preferences do not execute or enforce trades.';
