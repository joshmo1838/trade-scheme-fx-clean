-- SENFX account-backed strategy storage. Run in Supabase SQL Editor.
create table if not exists public.customer_strategies (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 name text not null check (char_length(name) between 2 and 80),
 configuration jsonb not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists customer_strategies_user_updated_idx on public.customer_strategies(user_id,updated_at desc);
alter table public.customer_strategies enable row level security;
drop policy if exists "Customers read their own strategies" on public.customer_strategies;
create policy "Customers read their own strategies" on public.customer_strategies for select to authenticated using(auth.uid()=user_id);
drop policy if exists "Customers create their own strategies" on public.customer_strategies;
create policy "Customers create their own strategies" on public.customer_strategies for insert to authenticated with check(auth.uid()=user_id);
drop policy if exists "Customers update their own strategies" on public.customer_strategies;
create policy "Customers update their own strategies" on public.customer_strategies for update to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
drop policy if exists "Customers delete their own strategies" on public.customer_strategies;
create policy "Customers delete their own strategies" on public.customer_strategies for delete to authenticated using(auth.uid()=user_id);
grant select,insert,update,delete on public.customer_strategies to authenticated;
revoke all on public.customer_strategies from anon;
comment on table public.customer_strategies is 'Customer-owned SENFX strategy drafts. No live order execution is enabled.';
