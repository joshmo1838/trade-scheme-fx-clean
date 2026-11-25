-- Apply only after backup and review. No changes to existing tables.
begin;
create table public.quantum_research_batches (
 user_id uuid not null default auth.uid() references auth.users(id),
 symbol text not null check (symbol in ('R_10','R_25','R_50','R_75','R_100')),
 first_epoch bigint not null, last_epoch bigint not null check(last_epoch >= first_epoch),
 created_at timestamptz not null default now(),
 payload jsonb not null check (jsonb_typeof(payload)='object' and octet_length(payload::text)<=1500000 and jsonb_typeof(payload->'ticks')='array' and jsonb_array_length(payload->'ticks')=300),
 primary key(user_id,symbol,first_epoch,last_epoch)
);
alter table public.quantum_research_batches enable row level security;
revoke all on public.quantum_research_batches from public, anon, authenticated;
grant select,insert on public.quantum_research_batches to authenticated;
create policy own_read on public.quantum_research_batches for select to authenticated using ((select auth.uid())=user_id);
create policy own_insert on public.quantum_research_batches for insert to authenticated with check ((select auth.uid())=user_id);
commit;
