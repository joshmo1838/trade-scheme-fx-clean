-- SENFX Phase 4: PAPER-only worker lease and risk-guarded position lifecycle.
-- Prerequisites: senfx-bot-management-v2.sql, senfx-paper-risk-controls.sql,
-- and senfx-persistent-bot-controls.sql, all reviewed and applied in order.
-- NO Deriv authentication, Demo contract purchase or Real trading supported.
begin;

create table if not exists public.bot_execution_paper_positions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.bot_execution_runs(id) on delete cascade,
  customer_id uuid not null references auth.users(id) on delete cascade,
  bot_id uuid not null references public.bots(id) on delete cascade,
  reservation_id uuid not null unique references public.customer_paper_trade_reservations(id),
  status text not null default 'open' check (status in ('open','settled','cancelled')),
  remaining_ticks integer not null default 5 check (remaining_ticks between 0 and 5),
  last_tick_epoch bigint not null check (last_tick_epoch > 0),
  entered_at timestamptz not null default now(),
  closed_at timestamptz,
  unique (run_id, reservation_id)
);

create unique index if not exists bot_execution_positions_one_open_per_run
  on public.bot_execution_paper_positions(run_id) where status = 'open';
create index if not exists bot_execution_positions_owner_idx
  on public.bot_execution_paper_positions(customer_id, entered_at desc);

alter table public.bot_execution_paper_positions enable row level security;
revoke all on public.bot_execution_paper_positions from public, anon, authenticated;
grant select on public.bot_execution_paper_positions to authenticated;
grant all on public.bot_execution_paper_positions to service_role;
drop policy if exists "Customers view their paper worker positions" on public.bot_execution_paper_positions;
create policy "Customers view their paper worker positions"
  on public.bot_execution_paper_positions for select to authenticated
  using (customer_id = (select auth.uid()));

-- Every observed-state change is serialized with the customer command queue.
-- A new owner cancels any orphaned paper reservation before it can resume.
-- The worker only reports running with a recent authenticated-by-process PUBLIC tick.
create or replace function public.senfx_paper_worker_sync(
  p_run_id uuid, p_worker_id text, p_report text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_run public.bot_execution_runs%rowtype;
  v_position public.bot_execution_paper_positions%rowtype;
  v_result jsonb;
  v_observed text;
  v_bot record;
  v_eligible boolean := false;
begin
  if p_run_id is null or p_worker_id is null or length(p_worker_id) not between 8 and 128
     or p_worker_id !~ '^[A-Za-z0-9_-]+$'
     or coalesce(p_report,'') not in ('starting','running','paused','stopped','error') then
    return jsonb_build_object('owned',false,'reason','Invalid worker sync request.');
  end if;
  select * into v_run from public.bot_execution_runs
    where id=p_run_id and mode='paper' for update;
  if not found then return jsonb_build_object('owned',false,'reason','Unknown paper run.'); end if;
  if v_run.worker_id is not null and v_run.worker_id <> p_worker_id
     and v_run.lease_expires_at > now() then
    return jsonb_build_object('owned',false,'reason','Another worker holds the lease.');
  end if;

  select exists (
    select 1 from public.customer_bots cb
    join public.bots b on b.id = cb.bot_id
    join public.customer_bot_configurations cfg
      on cfg.customer_id = cb.customer_id and cfg.bot_id = cb.bot_id
      and cfg.trading_mode = 'demo'
    where cb.customer_id = v_run.customer_id
      and cb.bot_id = v_run.bot_id and cb.trading_mode = 'demo'
      and cb.selected = true and cb.control_status = 'selected'
      and b.is_published = true
      and cfg.stake_amount between 10 and 100
      and cfg.daily_loss_limit is not null
      and cfg.daily_loss_limit >= cfg.stake_amount
  ) into v_eligible;

  -- A crashed previous worker must not hand its prior paper risk to a new worker.
  if v_run.worker_id is distinct from p_worker_id
     or v_run.lease_expires_at is null or v_run.lease_expires_at<=now()
     or v_run.desired_state <> 'running'
     or not v_eligible then
    select * into v_position from public.bot_execution_paper_positions
      where run_id=v_run.id and status='open' for update;
    if found then
      select public.senfx_paper_cancel_reservation(v_run.customer_id,v_position.reservation_id)
        into v_result;
      if coalesce((v_result->>'cancelled')::boolean,false) is not true then
        return jsonb_build_object('owned',false,'reason','Cannot safely cancel existing paper risk.');
      end if;
      update public.bot_execution_paper_positions
        set status='cancelled', closed_at=now() where id=v_position.id;
    end if;
  end if;

  if v_run.desired_state = 'running' then
    v_observed := case
      when not v_eligible then 'error'
      when p_report='running' then 'running'
      when p_report='error' then 'error' else 'starting' end;
  else
    v_observed := v_run.desired_state;
  end if;

  update public.bot_execution_runs
    set worker_id=case when v_run.desired_state='stopped' or not v_eligible
                         then null else p_worker_id end,
        heartbeat_at=now(),
        lease_expires_at=case when v_run.desired_state='stopped' or not v_eligible
                              then null else now()+interval '20 seconds' end,
        observed_state=v_observed,
        last_error=case when not v_eligible and v_run.desired_state='running'
                        then 'Paper bot was unpublished, deselected, or lost risk settings.'
                        when v_observed='error' then 'Worker cannot consume fresh public market data.'
                        else null end,
        updated_at=now()
    where id=v_run.id;
  update public.bot_execution_commands
    set status='rejected', acknowledged_at=now()
    where run_id=v_run.id and status='queued' and version<v_run.control_version;
  if v_observed=v_run.desired_state then
    update public.bot_execution_commands
      set status='acknowledged', acknowledged_at=now()
      where run_id=v_run.id and status='queued' and version=v_run.control_version;
  end if;

  select name,market,is_published into v_bot from public.bots where id=v_run.bot_id;
  return jsonb_build_object(
    'owned',(v_eligible or v_run.desired_state <> 'running'),
    'runId',v_run.id,'customerId',v_run.customer_id,
    'botId',v_run.bot_id,'botName',v_bot.name,'botMarket',v_bot.market,
    'isPublished',v_bot.is_published,'desiredState',v_run.desired_state,
    'observedState',v_observed,'version',v_run.control_version,
    'leaseSeconds',case when v_run.desired_state='stopped' then 0 else 20 end
  );
end;
$$;

-- Lock the run before reserving risk; concurrent Stop/Pause cannot race past it.
create or replace function public.senfx_paper_worker_reserve(
  p_run_id uuid,p_worker_id text,p_version bigint,p_symbol text,
  p_direction text,p_entry numeric,p_tick_epoch bigint
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp
as $$
declare
  v_run public.bot_execution_runs%rowtype;
  v_result jsonb;
  v_position_id uuid;
  v_expected_symbol text;
begin
  -- A NULL version must fail closed. In PL/pgSQL, IF (x <> NULL)
  -- evaluates to NULL, which is not a true rejection condition.
  if p_run_id is null or p_worker_id is null or p_version is null
     or p_version <= 0 then
    return jsonb_build_object('allowed',false,
      'reason','Missing paper run, lease owner or command revision.');
  end if;
  if p_entry is null or p_entry<=0 or p_tick_epoch is null or p_tick_epoch<=0
     or p_tick_epoch>extract(epoch from now())+5
     or p_tick_epoch<extract(epoch from now())-30 then
    return jsonb_build_object('allowed',false,'reason','Invalid or stale paper entry quote.');
  end if;
  select * into v_run from public.bot_execution_runs
    where id=p_run_id and mode='paper' for update;
  if not found or v_run.worker_id is distinct from p_worker_id
    or v_run.lease_expires_at is null or v_run.lease_expires_at<=now()
    or v_run.desired_state<>'running' or v_run.observed_state<>'running'
    or v_run.control_version<>p_version then
    return jsonb_build_object('allowed',false,'reason','Run not authorized or lease/control version stale.');
  end if;
  -- Fail closed if the worker's market differs from this bot's vetted
  -- preset. Keep precedence identical to paperPreset() in TypeScript.
  -- A worker bug must never execute another bot's simulated market.
  select case
    when lower(name) like '%trend scout%' then 'R_50'
    when lower(name) like '%volatility watch%' then 'R_75'
    when lower(market) like '%forex%' then 'frxEURUSD'
    else 'R_100'
  end into v_expected_symbol
  from public.bots where id=v_run.bot_id and is_published=true;
  if v_expected_symbol is null or p_symbol is distinct from v_expected_symbol then
    return jsonb_build_object('allowed',false,
      'reason','Paper market does not match the selected bot preset.');
  end if;
  if exists(select 1 from public.bot_execution_paper_positions
    where run_id=p_run_id and status='open') then
    return jsonb_build_object('allowed',false,'reason','Existing open paper position.');
  end if;
  select public.senfx_paper_reserve_trade(
    v_run.customer_id,v_run.bot_id,p_symbol,p_direction,p_entry
  ) into v_result;
  if coalesce((v_result->>'allowed')::boolean,false) is not true then
    return coalesce(v_result,jsonb_build_object('allowed',false,'reason','Paper risk unavailable.'));
  end if;
  insert into public.bot_execution_paper_positions(
    run_id,customer_id,bot_id,reservation_id,last_tick_epoch
  ) values (
    v_run.id,v_run.customer_id,v_run.bot_id,(v_result->>'reservationId')::uuid,p_tick_epoch
  ) returning id into v_position_id;
  return v_result || jsonb_build_object('positionId',v_position_id,'remainingTicks',5);
end;
$$;

-- One distinct subsequent second = one illustrative paper tick. No brokers.
-- Settlement uses the existing authoritative, server-held paper risk reservation.
create or replace function public.senfx_paper_worker_tick(
  p_run_id uuid,p_worker_id text,p_version bigint,
  p_quote numeric,p_tick_epoch bigint
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp
as $$
declare
  v_run public.bot_execution_runs%rowtype;
  v_position public.bot_execution_paper_positions%rowtype;
  v_remaining integer;
  v_result jsonb;
begin
  if p_run_id is null or p_worker_id is null or p_version is null
     or p_version <= 0 then
    return jsonb_build_object('accepted',false,
      'reason','Missing paper run, lease owner or command revision.');
  end if;
  if p_quote is null or p_quote<=0 or p_tick_epoch is null or p_tick_epoch<=0
     or p_tick_epoch>extract(epoch from now())+5
     or p_tick_epoch<extract(epoch from now())-30 then
    return jsonb_build_object('accepted',false,'reason','Invalid or stale paper tick.');
  end if;
  select * into v_run from public.bot_execution_runs where id=p_run_id
    and mode='paper' for update;
  if not found or v_run.worker_id is distinct from p_worker_id
     or v_run.lease_expires_at is null or v_run.lease_expires_at<=now() or v_run.desired_state<>'running'
     or v_run.observed_state<>'running' or v_run.control_version<>p_version then
    return jsonb_build_object('accepted',false,'reason','Lease or control version changed.');
  end if;
  select * into v_position from public.bot_execution_paper_positions
    where run_id=p_run_id and status='open' for update;
  if not found then return jsonb_build_object('accepted',false,'reason','No open paper position.'); end if;
  if p_tick_epoch<=v_position.last_tick_epoch then
    return jsonb_build_object('accepted',true,'duplicateTick',true,
      'remainingTicks',v_position.remaining_ticks);
  end if;
  v_remaining := v_position.remaining_ticks-1;
  if v_remaining>0 then
    update public.bot_execution_paper_positions set remaining_ticks=v_remaining,
      last_tick_epoch=p_tick_epoch where id=v_position.id;
    return jsonb_build_object('accepted',true,'settled',false,'remainingTicks',v_remaining);
  end if;
  select public.senfx_paper_settle_trade(
    v_run.customer_id,v_position.reservation_id,p_quote
  ) into v_result;
  if coalesce((v_result->>'settled')::boolean,false) is not true then
    return jsonb_build_object('accepted',false,'reason','Paper settlement failed; risk remains held.');
  end if;
  update public.bot_execution_paper_positions set status='settled',
    remaining_ticks=0,last_tick_epoch=p_tick_epoch,closed_at=now()
    where id=v_position.id;
  return v_result || jsonb_build_object('accepted',true,'remainingTicks',0);
end;
$$;

revoke all on function public.senfx_paper_worker_sync(uuid,text,text)
  from public,anon,authenticated;
revoke all on function public.senfx_paper_worker_reserve(uuid,text,bigint,text,text,numeric,bigint)
  from public,anon,authenticated;
revoke all on function public.senfx_paper_worker_tick(uuid,text,bigint,numeric,bigint)
  from public,anon,authenticated;
grant execute on function public.senfx_paper_worker_sync(uuid,text,text)
  to service_role;
grant execute on function public.senfx_paper_worker_reserve(uuid,text,bigint,text,text,numeric,bigint)
  to service_role;
grant execute on function public.senfx_paper_worker_tick(uuid,text,bigint,numeric,bigint)
  to service_role;
comment on table public.bot_execution_paper_positions is
 'Paper worker lifecycle and reservations. No Deriv broker contracts.';
commit;
