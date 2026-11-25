-- REVIEW ONLY. Apply after backup and schema review, not automatically.
create table if not exists public.quantum_research_events (
 id bigint generated always as identity primary key,
 user_id uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 symbol text not null, bot text not null, model_version text not null,
 evidence jsonb not null, decision text not null check(decision in ('SKIP','RESEARCH_CANDIDATE'))
);
alter table public.quantum_research_events enable row level security;
revoke all on public.quantum_research_events from anon, authenticated;
grant select on public.quantum_research_events to authenticated;
create policy quantum_read_own on public.quantum_research_events for select to authenticated using (auth.uid() = user_id);
