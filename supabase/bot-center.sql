-- Trade Scheme FX Bot Management Center
-- Run in Supabase SQL Editor after the previous profile/admin and messaging migrations.

create table if not exists public.bots (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  market text not null default 'Synthetic Indices',
  description text not null default '',
  risk_level text not null default 'High'
    check (risk_level in ('Low','Medium','High')),
  is_published boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.customer_bots (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete cascade,
  bot_id uuid not null references public.bots(id) on delete cascade,
  selected boolean not null default false,
  control_status text not null default 'stopped'
    check (control_status in ('stopped','paused','selected')),
  created_at timestamptz not null default now(),
  unique (customer_id, bot_id)
);

alter table public.bots enable row level security;
alter table public.customer_bots enable row level security;

grant select on public.bots to authenticated;
grant insert, update, delete on public.bots to authenticated;
grant select, insert, update, delete on public.customer_bots to authenticated;

drop policy if exists "Anyone signed in can view published bots" on public.bots;
create policy "Anyone signed in can view published bots"
on public.bots for select to authenticated
using (is_published or public.is_admin());

drop policy if exists "Admins manage bots" on public.bots;
create policy "Admins manage bots"
on public.bots for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Customers view their bot selections" on public.customer_bots;
create policy "Customers view their bot selections"
on public.customer_bots for select to authenticated
using (customer_id = (select auth.uid()) or public.is_admin());

drop policy if exists "Customers create their bot selections" on public.customer_bots;
create policy "Customers create their bot selections"
on public.customer_bots for insert to authenticated
with check (customer_id = (select auth.uid()) and exists (
  select 1 from public.bots b where b.id = bot_id and b.is_published
));

drop policy if exists "Customers update their bot selections" on public.customer_bots;
create policy "Customers update their bot selections"
on public.customer_bots for update to authenticated
using (customer_id = (select auth.uid()) or public.is_admin())
with check (customer_id = (select auth.uid()) or public.is_admin());

drop policy if exists "Admins delete customer bot selections" on public.customer_bots;
create policy "Admins delete customer bot selections"
on public.customer_bots for delete to authenticated
using (public.is_admin());

-- Sample bot records are unpublished until an administrator reviews and publishes them.
insert into public.bots (name, market, description, risk_level, is_published)
select 'Synthetic Trend Scout', 'Synthetic Indices',
       'A sample bot profile for synthetic-market strategy configuration. Not connected to live execution.',
       'High', false
where not exists (select 1 from public.bots where name = 'Synthetic Trend Scout');

insert into public.bots (name, market, description, risk_level, is_published)
select 'Volatility Watch', 'Synthetic Indices',
       'A sample bot profile for volatility-market strategy configuration. Not connected to live execution.',
       'High', false
where not exists (select 1 from public.bots where name = 'Volatility Watch');
