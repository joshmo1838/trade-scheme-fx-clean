-- SENFX persistent R_100 forward paper-test state and outcomes.
-- Apply this script in Supabase SQL Editor before starting the Railway worker.
-- These records are research-only; they are not Deriv contract executions.

create table if not exists public.senfx_forward_runs (
  run_id text primary key,
  market_symbol text not null default 'R_100',
  target_trades integer not null default 200 check (target_trades > 0),
  status text not null default 'starting' check (status in ('starting','running','completed','stopped','error')),
  state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.senfx_forward_trades (
  id uuid primary key default gen_random_uuid(),
  run_id text not null references public.senfx_forward_runs(run_id) on delete cascade,
  market_symbol text not null default 'R_100',
  direction text not null check (direction in ('CALL','PUT')),
  entry_price numeric(24,10) not null,
  exit_price numeric(24,10) not null,
  pnl_r numeric(12,4) not null check (pnl_r in (-1,1)),
  outcome text not null check (outcome in ('WIN','LOSS')),
  signal_epoch bigint not null,
  opened_at timestamptz not null,
  closed_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint senfx_forward_trade_time_order check (closed_at >= opened_at),
  constraint senfx_forward_trade_signal_unique unique (run_id, signal_epoch)
);

create index if not exists senfx_forward_trades_run_created_idx
  on public.senfx_forward_trades(run_id, created_at);

alter table public.senfx_forward_runs enable row level security;
alter table public.senfx_forward_trades enable row level security;

-- The Railway worker uses the Supabase service-role key, stored only as a Railway secret.
-- Do not expose that key in browser code or commit it to GitHub.
grant all on public.senfx_forward_runs to service_role;
grant all on public.senfx_forward_trades to service_role;

comment on table public.senfx_forward_runs is
  'Persistent state for the SENFX R_100 strict forward paper-test worker.';
comment on table public.senfx_forward_trades is
  'Completed five-one-minute-bar directional paper outcomes; not Deriv contract payouts.';
