-- Review and apply after backup. Server writes only; authenticated users read shared public-market snapshots.
create table if not exists public.quantum_ai_batches(symbol text not null,first_epoch bigint not null,last_epoch bigint not null,ticks jsonb not null,primary key(symbol,first_epoch,last_epoch));
create table if not exists public.quantum_ai_latest(symbol text primary key,updated_at timestamptz not null,payload jsonb not null);
alter table public.quantum_ai_batches enable row level security;
alter table public.quantum_ai_latest enable row level security;
revoke all on public.quantum_ai_batches,public.quantum_ai_latest from anon,authenticated;
grant select on public.quantum_ai_latest to authenticated;
grant select,insert,update on public.quantum_ai_batches,public.quantum_ai_latest to service_role;
create policy quantum_ai_shared_read on public.quantum_ai_latest for select to authenticated using (true);
