-- Disposable local Supabase CLI database ONLY. DO NOT APPLY TO PRODUCTION.
-- Minimum dependent schema for the ACTUAL Phase 3 command/RLS migration.
begin;
create table if not exists public.bots (
  id uuid primary key,
  name text not null default 'SENFX paper QA bot',
  market text not null default 'Synthetic Indices',
  is_published boolean not null default false
);
create table if not exists public.customer_bots (
  customer_id uuid not null references auth.users(id) on delete cascade,
  bot_id uuid not null references public.bots(id) on delete cascade,
  trading_mode text not null,
  selected boolean not null default false,
  control_status text not null default 'inactive',
  primary key (customer_id,bot_id,trading_mode)
);
create table if not exists public.customer_bot_configurations (
  customer_id uuid not null references auth.users(id) on delete cascade,
  bot_id uuid not null references public.bots(id) on delete cascade,
  trading_mode text not null,
  stake_amount numeric not null,
  daily_loss_limit numeric,
  primary key(customer_id,bot_id,trading_mode)
);
-- These are fixtures, not an alternate application schema. Only the service
-- role may seed dependent rows; authenticated customers cannot mutate them.
alter table public.bots enable row level security;
alter table public.customer_bots enable row level security;
alter table public.customer_bot_configurations enable row level security;
revoke all on public.bots, public.customer_bots,
  public.customer_bot_configurations from public,anon,authenticated;
grant all on public.bots,public.customer_bots,
  public.customer_bot_configurations to service_role;
commit;
