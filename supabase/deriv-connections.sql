-- Stores encrypted Deriv OAuth tokens. Never expose this table to browser clients.
create table if not exists public.deriv_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  encrypted_token text not null,
  token_iv text not null,
  token_tag text not null,
  expires_at timestamptz not null,
  connected_at timestamptz not null default now(),
  status text not null default 'connected' check (status in ('connected','disconnected','expired'))
);

alter table public.deriv_connections enable row level security;
revoke all on public.deriv_connections from anon, authenticated;
-- Access is server-side only through the Supabase service-role key.
