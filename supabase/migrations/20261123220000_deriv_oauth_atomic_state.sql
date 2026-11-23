-- Deriv OAuth state: durable, one-time callback replay barrier.
-- Apply to an isolated staging database only after backup and migration review.
create table if not exists public.deriv_oauth_transactions (
  state_sha256 text primary key
    check (state_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint deriv_oauth_expiry_window check (
    expires_at > created_at and expires_at <= created_at + interval '10 minutes'
  )
);
alter table public.deriv_oauth_transactions enable row level security;
revoke all on public.deriv_oauth_transactions from public, anon, authenticated;
grant select, insert, delete on public.deriv_oauth_transactions to service_role;

-- A single DELETE ... RETURNING statement is atomic across concurrent requests.
-- Exactly one callback can consume a given state, including across server instances.
create or replace function public.consume_deriv_oauth_state(p_state_sha256 text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_consumed text;
begin
  if p_state_sha256 is null or p_state_sha256 !~ '^[0-9a-f]{64}$' then
    return false;
  end if;
  delete from public.deriv_oauth_transactions
    where state_sha256 = p_state_sha256
      and expires_at > now()
    returning state_sha256 into v_consumed;
  return v_consumed is not null;
end;
$$;
revoke all on function public.consume_deriv_oauth_state(text)
  from public, anon, authenticated;
grant execute on function public.consume_deriv_oauth_state(text) to service_role;

comment on function public.consume_deriv_oauth_state(text) is
  'Service-role-only atomic OAuth state consumption; never call from browser.';

-- Expired rows may be purged by a separately approved maintenance job.
-- Do not enable session issuance merely because this migration exists.
