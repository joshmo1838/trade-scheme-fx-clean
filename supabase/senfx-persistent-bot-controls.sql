-- SENFX Phase 3: durable, customer-owned PAPER bot control-plane only.
-- This migration NEVER starts a worker, connects to Deriv, or places a contract.
-- Apply only after reviewing the existing bot-management schema and running tests.
begin;

create table if not exists public.bot_execution_runs (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete cascade,
  bot_id uuid not null references public.bots(id) on delete cascade,
  mode text not null default 'paper' check (mode = 'paper'),
  desired_state text not null default 'stopped'
    check (desired_state in ('running', 'paused', 'stopped')),
  observed_state text not null default 'stopped'
    check (observed_state in ('stopped','starting','running','pausing','paused','stopping','error')),
  control_version bigint not null default 0 check (control_version >= 0),
  worker_id text,
  heartbeat_at timestamptz,
  lease_expires_at timestamptz,
  last_error text,
  last_command_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (customer_id, bot_id, mode)
);

create table if not exists public.bot_execution_commands (
  id uuid primary key,
  run_id uuid not null references public.bot_execution_runs(id) on delete cascade,
  customer_id uuid not null references auth.users(id) on delete cascade,
  bot_id uuid not null references public.bots(id) on delete cascade,
  action text not null check (action in ('start','pause','resume','stop')),
  requested_state text not null check (requested_state in ('running','paused','stopped')),
  version bigint not null check (version > 0),
  status text not null default 'queued'
    check (status in ('queued','acknowledged','rejected')),
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  unique (run_id, version)
);

create index if not exists bot_execution_runs_owner_idx
  on public.bot_execution_runs(customer_id, updated_at desc);
create index if not exists bot_execution_commands_owner_idx
  on public.bot_execution_commands(customer_id, created_at desc);
create index if not exists bot_execution_commands_worker_idx
  on public.bot_execution_commands(status, created_at)
  where status = 'queued';

alter table public.bot_execution_runs enable row level security;
alter table public.bot_execution_commands enable row level security;

revoke all on public.bot_execution_runs from public, anon, authenticated;
revoke all on public.bot_execution_commands from public, anon, authenticated;
grant select on public.bot_execution_runs to authenticated;
grant select on public.bot_execution_commands to authenticated;
grant all on public.bot_execution_runs to service_role;
grant all on public.bot_execution_commands to service_role;

drop policy if exists "Customers read only their bot runs" on public.bot_execution_runs;
create policy "Customers read only their bot runs"
  on public.bot_execution_runs for select to authenticated
  using (customer_id = (select auth.uid()));

drop policy if exists "Customers read only their bot commands" on public.bot_execution_commands;
create policy "Customers read only their bot commands"
  on public.bot_execution_commands for select to authenticated
  using (customer_id = (select auth.uid()));

-- One transaction serializes every command for a customer's paper bot.
-- Only the authenticated Next.js server may call this with the service role.
-- No queued command represents proof of an actual running worker.
create or replace function public.senfx_queue_paper_bot_command(
  p_customer_id uuid,
  p_bot_id uuid,
  p_command_id uuid,
  p_action text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing public.bot_execution_commands%rowtype;
  v_run public.bot_execution_runs%rowtype;
  v_next text;
begin
  if p_customer_id is null or p_bot_id is null or p_command_id is null
     or p_action is null or p_action not in ('start','pause','resume','stop') then
    return jsonb_build_object('accepted', false, 'reason', 'Invalid paper bot command.');
  end if;

  -- A reused request key is idempotent only for the SAME customer, bot and action.
  select * into v_existing
    from public.bot_execution_commands where id = p_command_id;
  if found then
    if v_existing.customer_id <> p_customer_id or v_existing.bot_id <> p_bot_id
       or v_existing.action <> p_action then
      return jsonb_build_object('accepted', false, 'reason', 'Command ID was used for a different request.');
    end if;
    return jsonb_build_object('accepted', true, 'duplicate', true, 'queued', true,
      'runId', v_existing.run_id, 'commandId', v_existing.id,
      'desiredState', v_existing.requested_state, 'version', v_existing.version);
  end if;

  -- New execution requires a published customer-owned bot. However safety-
  -- reducing PAUSE/STOP commands must still work when the bot was unpublished
  -- or deselected after the run started. Never create a foreign stop run.
  if p_action in ('start','resume') and not exists (
    select 1 from public.customer_bots cb
    join public.bots b on b.id = cb.bot_id
    where cb.customer_id = p_customer_id
      and cb.bot_id = p_bot_id
      and cb.trading_mode = 'demo'
      and b.is_published = true
  ) then
    return jsonb_build_object('accepted', false, 'reason', 'Customer has not added this published paper bot.');
  end if;
  if p_action in ('pause','stop') and not exists (
    select 1 from public.bot_execution_runs
    where customer_id = p_customer_id and bot_id = p_bot_id and mode = 'paper'
  ) then
    return jsonb_build_object('accepted', false, 'reason', 'Customer has no paper run to stop.');
  end if;

  if p_action in ('start','resume') and not exists (
    select 1 from public.customer_bots cb
    join public.customer_bot_configurations cfg
      on cfg.customer_id = cb.customer_id and cfg.bot_id = cb.bot_id
      and cfg.trading_mode = 'demo'
    where cb.customer_id = p_customer_id and cb.bot_id = p_bot_id
      and cb.trading_mode = 'demo' and cb.selected = true
      and cb.control_status = 'selected'
      and cfg.stake_amount between 10 and 100
      and cfg.daily_loss_limit is not null and cfg.daily_loss_limit >= cfg.stake_amount
  ) then
    return jsonb_build_object('accepted', false,
      'reason', 'Select this bot and save valid daily paper-risk limits first.');
  end if;

  insert into public.bot_execution_runs(customer_id, bot_id, mode)
    values(p_customer_id, p_bot_id, 'paper')
    on conflict(customer_id, bot_id, mode) do nothing;

  select * into v_run from public.bot_execution_runs
    where customer_id = p_customer_id and bot_id = p_bot_id and mode = 'paper'
    for update;

  if p_action = 'start' then
    if v_run.desired_state <> 'stopped' then
      return jsonb_build_object('accepted', false, 'reason', 'Stop the existing paper run before starting a new one.');
    end if;
    v_next := 'running';
  elsif p_action = 'pause' then
    if v_run.desired_state <> 'running' then
      return jsonb_build_object('accepted', false, 'reason', 'This paper run is not requested to run.');
    end if;
    v_next := 'paused';
  elsif p_action = 'resume' then
    if v_run.desired_state <> 'paused' then
      return jsonb_build_object('accepted', false, 'reason', 'This paper run is not paused.');
    end if;
    v_next := 'running';
  else
    v_next := 'stopped'; -- Stop supersedes unacknowledged starts and pauses.
  end if;

  update public.bot_execution_runs
    set desired_state = v_next,
        control_version = v_run.control_version + 1,
        last_command_at = now(),
        updated_at = now()
    where id = v_run.id;

  insert into public.bot_execution_commands(
    id, run_id, customer_id, bot_id, action, requested_state, version
  ) values (
    p_command_id, v_run.id, p_customer_id, p_bot_id, p_action,
    v_next, v_run.control_version + 1
  );

  return jsonb_build_object('accepted', true, 'duplicate', false, 'queued', true,
    'runId', v_run.id, 'commandId', p_command_id,
    'desiredState', v_next, 'version', v_run.control_version + 1);
end;
$$;

revoke all on function public.senfx_queue_paper_bot_command(uuid,uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function public.senfx_queue_paper_bot_command(uuid,uuid,uuid,text)
  to service_role;

comment on table public.bot_execution_runs is
  'Desired vs observed PAPER worker status. Queued commands are not broker orders.';
comment on table public.bot_execution_commands is
  'Durable, idempotent customer PAPER bot control requests. No execution is implied.';

commit;
