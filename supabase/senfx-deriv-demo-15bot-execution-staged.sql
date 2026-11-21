-- SENFX 15-bot authenticated Deriv virtual Demo engine: STAGED ONLY.
-- Do not apply to production before backup, offline QA, and independent release gate.
-- No real-money execution; does not alter existing deriv_demo_orders/history.
-- New tables are server-only with RLS and NO browser/client grants.
begin;

create table if not exists public.senfx_demo_bot_control (
  user_id uuid primary key references auth.users(id) on delete cascade,
  account_id text not null,
  currency text not null default 'USD' check (currency='USD'),
  mode text not null default 'stopped' check (mode in ('stopped','running')),
  control_version bigint not null default 0 check (control_version>=0),
  max_stake numeric(10,2) not null default 1 check (max_stake=1),
  daily_loss_limit numeric(10,2) not null default 10 check (daily_loss_limit=10),
  max_daily_attempts int not null default 30 check (max_daily_attempts between 1 and 30),
  cooldown_seconds int not null default 30 check (cooldown_seconds>=30),
  stopped_at timestamptz,
  worker_id text,
  observed_state text not null default 'stopped' check (observed_state in ('stopped','starting','running')),
  heartbeat_at timestamptz,
  lease_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.senfx_demo_bot_daily_risk (
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id text not null,
  risk_date date not null,
  currency text not null check (currency='USD'),
  daily_limit numeric(10,2) not null default 10 check (daily_limit=10),
  realized_loss numeric(10,2) not null default 0 check (realized_loss>=0),
  reserved_loss numeric(10,2) not null default 0 check (reserved_loss>=0),
  updated_at timestamptz not null default now(),
  primary key(user_id,account_id,risk_date),
  constraint senfx_demo_bot_total_risk_check check (realized_loss+reserved_loss<=daily_limit)
);

create table if not exists public.senfx_demo_bot_orders (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id text not null,
  control_version bigint not null,
  bot_id text not null check (bot_id = any(array[
    'digit-over-4','digit-under-5','parity-even','parity-odd',
    'digit-matches','digit-differs','trend-rise-fall',
    'breakout-higher-lower','recovery-audit','stepwise-audit',
    'adaptive-over','entropy-parity','pattern-differs',
    'momentum-rise-fall','volatility-scalper'
  ])),
  market_symbol text not null check (market_symbol = any(array[
    'R_10','R_25','R_50','R_75','R_100',
    '1HZ10V','1HZ25V','1HZ50V','1HZ75V','1HZ100V'
  ])),
  contract_type text not null check (contract_type = any(array[
    'CALL','PUT','DIGITOVER','DIGITUNDER','DIGITEVEN',
    'DIGITODD','DIGITMATCH','DIGITDIFF'
  ])),
  barrier text check (barrier is null or barrier ~ '^[0-9]$'),
  duration integer not null check (duration in (1,5)),
  duration_unit text not null check (duration_unit in ('t','m')),
  currency text not null check (currency='USD'),
  stake numeric(10,2) not null check (stake=1),
  ask_price numeric(10,2) not null check (ask_price>0 and ask_price<=1),
  payout numeric(12,2) not null check (payout>0),
  proposal_id text not null check (length(proposal_id) between 20 and 128),
  quote_expires_at timestamptz not null,
  risk_date date,
  status text not null default 'quoted' check (status in (
    'quoted','reserved','buy_unknown','open','won','lost','sold','cancelled','expired','rejected'
  )),
  buy_requested_at timestamptz,
  contract_id text,
  buy_transaction_id text,
  buy_price numeric(10,2),
  sell_price numeric(12,2),
  profit numeric(12,2),
  opened_at timestamptz,
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,request_id),
  constraint senfx_demo_bot_contract_duration_check check (
    (contract_type in ('CALL','PUT') and duration=5 and duration_unit='m' and barrier is null)
    or (contract_type like 'DIGIT%' and duration=1 and duration_unit='t'
       and ((contract_type in ('DIGITEVEN','DIGITODD') and barrier is null)
         or (contract_type not in ('DIGITEVEN','DIGITODD') and barrier is not null)))
  )
);

create unique index if not exists senfx_demo_bot_one_unresolved_per_user
 on public.senfx_demo_bot_orders(user_id)
 where status in ('reserved','buy_unknown','open');
create unique index if not exists senfx_demo_bot_contract_unique
 on public.senfx_demo_bot_orders(account_id,contract_id)
 where contract_id is not null;
create index if not exists senfx_demo_bot_orders_user_date
 on public.senfx_demo_bot_orders(user_id,created_at desc);

alter table public.senfx_demo_bot_control enable row level security;
alter table public.senfx_demo_bot_daily_risk enable row level security;
alter table public.senfx_demo_bot_orders enable row level security;
revoke all on public.senfx_demo_bot_control,public.senfx_demo_bot_daily_risk,
 public.senfx_demo_bot_orders from public,anon,authenticated;
grant select,insert,update,delete on public.senfx_demo_bot_control,
 public.senfx_demo_bot_daily_risk,public.senfx_demo_bot_orders to service_role;

-- Only the authenticated user selected by an authorized server may control
-- one specific USD DEMO account. The server must additionally enforce its
-- secret allowlist; client roles cannot invoke this RPC.
create or replace function public.senfx_demo_bots_control(
 p_user_id uuid,p_account_id text,p_command text,p_expected_version bigint default null
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_connection public.deriv_connections%rowtype;
        v_control public.senfx_demo_bot_control%rowtype;
begin
 if p_command not in ('start','stop') or p_account_id is null or length(p_account_id)<3 then
  return jsonb_build_object('ok',false,'code','INVALID_CONTROL_COMMAND');
 end if;
 -- Emergency Stop must work even after OAuth expiry or account switching.
 -- The authenticated, allowlisted application server supplies the user ID.
 if p_command='stop' then
  select * into v_control from public.senfx_demo_bot_control
   where user_id=p_user_id for update;
  if not found then
   return jsonb_build_object('ok',true,'mode','stopped','version',0,
                            'brokerOrderPlaced',false);
  end if;
  update public.senfx_demo_bot_control
   set mode='stopped',observed_state='stopped',worker_id=null,lease_expires_at=null,control_version=control_version+1,stopped_at=now(),updated_at=now()
   where user_id=p_user_id returning * into v_control;
  return jsonb_build_object('ok',true,'mode','stopped',
   'version',v_control.control_version,'brokerOrderPlaced',false);
 end if;
 select * into v_connection from public.deriv_connections
  where user_id=p_user_id for update;
 if not found or v_connection.active_account_type <> 'demo'
  or v_connection.active_account_id is distinct from p_account_id
  or v_connection.status <> 'connected' or v_connection.expires_at<=now()
  or not exists(select 1 from public.profiles where id=p_user_id and role='admin') then
  return jsonb_build_object('ok',false,'code','VERIFIED_ADMIN_DEMO_REQUIRED');
 end if;
 insert into public.senfx_demo_bot_control(user_id,account_id)
 values(p_user_id,p_account_id) on conflict(user_id) do nothing;
 select * into v_control from public.senfx_demo_bot_control
  where user_id=p_user_id for update;
 if v_control.mode='running' then
  return jsonb_build_object('ok',false,'code','ALREADY_RUNNING','version',v_control.control_version);
 end if;
 if v_control.account_id <> p_account_id or p_expected_version is null
   or v_control.control_version<>p_expected_version then
  return jsonb_build_object('ok',false,'code','STALE_OR_CHANGED_ACCOUNT_CONTROL');
 end if;
 if v_control.stopped_at is not null
   and now()-v_control.stopped_at<interval '60 seconds' then
  return jsonb_build_object('ok',false,'code','EMERGENCY_STOP_COOLDOWN');
 end if;
 if exists (select 1 from public.deriv_demo_orders o
             where o.user_id=p_user_id and o.status in ('reserved','buy_unknown','open'))
   or exists (select 1 from public.senfx_demo_bot_orders o
             where o.user_id=p_user_id and o.status in ('reserved','buy_unknown','open')) then
  return jsonb_build_object('ok',false,'code','UNRESOLVED_DEMO_ORDER');
 end if;
 update public.senfx_demo_bot_control
   set mode='running',observed_state='starting',worker_id=null,lease_expires_at=null,heartbeat_at=null,control_version=control_version+1,updated_at=now()
  where user_id=p_user_id returning * into v_control;
 return jsonb_build_object('ok',true,'mode','running',
  'version',v_control.control_version,'brokerOrderPlaced',false);
end;
$$;

-- One time-bound worker lease. A dead, competing, or stale worker cannot trade.
create or replace function public.senfx_demo_bots_worker_heartbeat(
 p_user_id uuid,p_worker_id text,p_expected_version bigint
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp
as $
declare v_control public.senfx_demo_bot_control%rowtype;
begin
 if p_worker_id is null or p_worker_id !~ '^[a-zA-Z0-9_-]{12,90}
-- account row, control row and shared daily risk row. It refuses any
-- unresolved old manual Demo order, stale control, or prior unconfirmed buy.
-- No client can bypass this function and it NEVER makes broker purchases.
create or replace function public.senfx_demo_bots_reserve(
 p_user_id uuid,p_order_id uuid,p_expected_version bigint
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_connection public.deriv_connections%rowtype;
        v_control public.senfx_demo_bot_control%rowtype;
        v_order public.senfx_demo_bot_orders%rowtype;
        v_risk public.senfx_demo_bot_daily_risk%rowtype;
        v_day date:=(now() at time zone 'UTC')::date;
        v_prior_manual numeric:=0;
        v_total_attempts int;
begin
 select * into v_connection from public.deriv_connections
  where user_id=p_user_id for update;
 if not found or v_connection.status<>'connected'
  or v_connection.active_account_type<>'demo'
  or v_connection.expires_at<=now()
  or v_connection.active_account_id is null then
  return jsonb_build_object('allowed',false,'code','DEMO_CONNECTION_NOT_VALID');
 end if;
 select * into v_control from public.senfx_demo_bot_control
  where user_id=p_user_id for update;
 if not found or v_control.mode<>'running' or
   v_control.control_version<>p_expected_version or
   v_control.account_id<>v_connection.active_account_id or
   v_control.currency<>'USD' or v_control.max_stake<>1 or
   v_control.daily_loss_limit<>10 then
  return jsonb_build_object('allowed',false,'code','DEMO_BOT_STOPPED_OR_CHANGED');
 end if;
 select * into v_order from public.senfx_demo_bot_orders
  where id=p_order_id and user_id=p_user_id for update;
 if not found or v_order.account_id<>v_control.account_id
   or v_order.control_version<>v_control.control_version
   or v_order.status<>'quoted' or v_order.quote_expires_at<=now()
   or v_order.stake<>1 or v_order.currency<>'USD' or
   v_order.ask_price>1 or v_order.ask_price<=0 then
  return jsonb_build_object('allowed',false,'code','INVALID_FRESH_DEMO_QUOTE');
 end if;
 if exists(select 1 from public.deriv_demo_orders o where o.user_id=p_user_id
             and o.status in ('reserved','buy_unknown','open'))
   or exists(select 1 from public.senfx_demo_bot_orders o where o.user_id=p_user_id
             and o.id<>p_order_id and o.status in ('reserved','buy_unknown','open')) then
  return jsonb_build_object('allowed',false,'code','UNRESOLVED_ORDER_ACROSS_BOTS');
 end if;
 select count(*) into v_total_attempts from (
   select buy_requested_at from public.senfx_demo_bot_orders
    where user_id=p_user_id and risk_date=v_day and buy_requested_at is not null
   union all
   select buy_requested_at from public.deriv_demo_orders
    where user_id=p_user_id and risk_date=v_day and buy_requested_at is not null
 ) attempts;
 if v_total_attempts>=v_control.max_daily_attempts or
    exists(select 1 from public.senfx_demo_bot_orders
       where user_id=p_user_id and buy_requested_at>now()-interval '30 seconds') then
   return jsonb_build_object('allowed',false,'code','RATE_LIMIT_OR_DAILY_TRADE_CAP');
 end if;
 insert into public.senfx_demo_bot_daily_risk(user_id,account_id,risk_date,currency)
 values(p_user_id,v_order.account_id,v_day,'USD')
 on conflict(user_id,account_id,risk_date) do nothing;
 select * into v_risk from public.senfx_demo_bot_daily_risk
 where user_id=p_user_id and account_id=v_order.account_id and risk_date=v_day for update;
 select coalesce(sum(realized_loss+reserved_loss),0) into v_prior_manual
 from public.deriv_demo_daily_risk
 where user_id=p_user_id and risk_date=v_day;
 if v_risk.currency<>'USD' or v_risk.daily_limit<>10 or
    v_risk.realized_loss+v_risk.reserved_loss+v_prior_manual+v_order.stake>10 then
  return jsonb_build_object('allowed',false,'code','SHARED_VIRTUAL_LOSS_CAP_REACHED');
 end if;
 update public.senfx_demo_bot_daily_risk
  set reserved_loss=reserved_loss+v_order.stake,updated_at=now()
  where user_id=p_user_id and account_id=v_order.account_id and risk_date=v_day;
 update public.senfx_demo_bot_orders
  set status='reserved',risk_date=v_day,updated_at=now()
  where id=v_order.id;
 return jsonb_build_object('allowed',true,'orderId',v_order.id,
  'stake',1,'sharedDailyVirtualLossCap',10,
  'manualExposure',v_prior_manual,'brokerOrderPlaced',false);
end;
$$;

-- Before a broker buy: persist the irrevocable attempt marker FIRST.
-- If there is a network failure, keep status=buy_unknown until independently
-- reconciled; never assume a purchase failed and never auto-retry.
create or replace function public.senfx_demo_bots_mark_attempt(
 p_user_id uuid,p_order_id uuid,p_expected_version bigint
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_control public.senfx_demo_bot_control%rowtype;
        v_order public.senfx_demo_bot_orders%rowtype;
begin
 select * into v_control from public.senfx_demo_bot_control
  where user_id=p_user_id for update;
 if not found or v_control.mode<>'running' or
  v_control.control_version<>p_expected_version then
  return jsonb_build_object('allowed',false,'code','STOPPED_OR_STALE_RUN');
 end if;
 select * into v_order from public.senfx_demo_bot_orders
  where id=p_order_id and user_id=p_user_id for update;
 if not found or v_order.status<>'reserved'
  or v_order.control_version<>p_expected_version
  or v_order.buy_requested_at is not null then
  return jsonb_build_object('allowed',false,'code','BUY_ALREADY_ATTEMPTED_OR_NOT_RESERVED');
 end if;
 update public.senfx_demo_bot_orders
  set status='buy_unknown',buy_requested_at=now(),updated_at=now()
  where id=v_order.id;
 return jsonb_build_object('allowed',true,'attemptRecorded',true,
   'neverRetryUnknown',true);
end;
$$;

create or replace function public.senfx_demo_bots_release_unused(
 p_user_id uuid,p_order_id uuid
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_connection public.deriv_connections%rowtype;
        v_order public.senfx_demo_bot_orders%rowtype;
begin
 select * into v_connection from public.deriv_connections
  where user_id=p_user_id for update;
 if not found then return jsonb_build_object('released',false); end if;
 select * into v_order from public.senfx_demo_bot_orders
  where id=p_order_id and user_id=p_user_id for update;
 if not found or v_order.status not in ('quoted','reserved')
   or v_order.buy_requested_at is not null then
  return jsonb_build_object('released',false,'code','BUY_UNCERTAIN_OR_NOT_RELEASEABLE');
 end if;
 if v_order.status='reserved' then
  update public.senfx_demo_bot_daily_risk
   set reserved_loss=reserved_loss-v_order.stake,updated_at=now()
   where user_id=p_user_id and account_id=v_order.account_id
   and risk_date=v_order.risk_date and reserved_loss>=v_order.stake;
  if not found then raise exception 'Risk ledger missing for unattempted reservation'; end if;
 end if;
 update public.senfx_demo_bot_orders
  set status='cancelled',updated_at=now() where id=p_order_id;
 return jsonb_build_object('released',true,'brokerOrderPlaced',false);
end;
$$;

-- A verified broker settlement may be recorded only AFTER a buy attempt.
-- Caller must validate broker transaction ID, original contract and final
-- contract status against the authenticated Deriv Demo statement.
create or replace function public.senfx_demo_bots_record_settlement(
 p_user_id uuid,p_order_id uuid,p_contract_id text,p_transaction_id text,
 p_final_status text,p_buy_price numeric,p_sell_price numeric
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_connection public.deriv_connections%rowtype;
        v_order public.senfx_demo_bot_orders%rowtype;
        v_profit numeric;
begin
 if p_final_status not in ('won','lost','sold') or
    p_contract_id is null or length(p_contract_id)<3 or
    p_transaction_id is null or length(p_transaction_id)<3 or
    p_buy_price is null or p_buy_price<=0 or p_buy_price>1 or
    p_sell_price is null or p_sell_price<0 or p_sell_price>100 then
  return jsonb_build_object('settled',false,'code','INVALID_BROKER_SETTLEMENT');
 end if;
 select * into v_connection from public.deriv_connections
  where user_id=p_user_id for update;
 if not found or v_connection.active_account_type<>'demo' then
  return jsonb_build_object('settled',false,'code','DEMO_ACCOUNT_REQUIRED');
 end if;
 select * into v_order from public.senfx_demo_bot_orders
  where id=p_order_id and user_id=p_user_id for update;
 if not found or v_order.account_id<>v_connection.active_account_id or
    v_order.buy_requested_at is null or
    v_order.status not in ('buy_unknown','open') then
  return jsonb_build_object('settled',false,'code','ORDER_NOT_ELIGIBLE_FOR_SETTLEMENT');
 end if;
 v_profit:=round(p_sell_price-p_buy_price,2);
 if (p_final_status='won' and v_profit<0)
    or (p_final_status='lost' and v_profit>0) then
  return jsonb_build_object('settled',false,'code','BROKER_RESULT_INCONSISTENT');
 end if;
 update public.senfx_demo_bot_daily_risk
  set reserved_loss=reserved_loss-v_order.stake,
      realized_loss=realized_loss+greatest(0,-v_profit),
      updated_at=now()
  where user_id=p_user_id and account_id=v_order.account_id
    and risk_date=v_order.risk_date and reserved_loss>=v_order.stake;
 if not found then raise exception 'Missing reserved virtual risk; no settlement recorded'; end if;
 update public.senfx_demo_bot_orders
  set status=p_final_status,contract_id=p_contract_id,buy_transaction_id=p_transaction_id,
      buy_price=p_buy_price,sell_price=p_sell_price,profit=v_profit,
      settled_at=now(),updated_at=now()
  where id=v_order.id;
 return jsonb_build_object('settled',true,'profit',v_profit);
end;
$$;

revoke all on function public.senfx_demo_bots_control(uuid,text,text,bigint)
 from public,anon,authenticated;
revoke all on function public.senfx_demo_bots_reserve(uuid,uuid,bigint)
 from public,anon,authenticated;
revoke all on function public.senfx_demo_bots_mark_attempt(uuid,uuid,bigint)
 from public,anon,authenticated;
revoke all on function public.senfx_demo_bots_release_unused(uuid,uuid)
 from public,anon,authenticated;
revoke all on function public.senfx_demo_bots_record_settlement(uuid,uuid,text,text,text,numeric,numeric)
 from public,anon,authenticated;

grant execute on function public.senfx_demo_bots_control(uuid,text,text,bigint) to service_role;
grant execute on function public.senfx_demo_bots_reserve(uuid,uuid,bigint) to service_role;
grant execute on function public.senfx_demo_bots_mark_attempt(uuid,uuid,bigint) to service_role;
grant execute on function public.senfx_demo_bots_release_unused(uuid,uuid) to service_role;
grant execute on function public.senfx_demo_bots_record_settlement(uuid,uuid,text,text,text,numeric,numeric)
 to service_role;
commit;
 then
  return jsonb_build_object('owned',false,'code','INVALID_WORKER_ID');
 end if;
 select * into v_control from public.senfx_demo_bot_control
  where user_id=p_user_id for update;
 if not found or v_control.mode<>'running'
   or v_control.control_version<>p_expected_version then
  return jsonb_build_object('owned',false,'code','STOPPED_OR_STALE_RUN');
 end if;
 if v_control.worker_id is not null and v_control.worker_id<>p_worker_id
   and v_control.lease_expires_at>now() then
  return jsonb_build_object('owned',false,'code','ANOTHER_WORKER_OWNS_LEASE');
 end if;
 update public.senfx_demo_bot_control
   set worker_id=p_worker_id,observed_state='running',
       heartbeat_at=now(),lease_expires_at=now()+interval '20 seconds',
       updated_at=now()
   where user_id=p_user_id returning * into v_control;
 return jsonb_build_object('owned',true,'mode',v_control.mode,
    'version',v_control.control_version,'leaseExpiresAt',v_control.lease_expires_at);
end;
$;

-- The core reservation serializes across 15 bots using the connected Demo
-- account row, control row and shared daily risk row. It refuses any
-- unresolved old manual Demo order, stale control, or prior unconfirmed buy.
-- No client can bypass this function and it NEVER makes broker purchases.
create or replace function public.senfx_demo_bots_reserve(
 p_user_id uuid,p_order_id uuid,p_expected_version bigint
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_connection public.deriv_connections%rowtype;
        v_control public.senfx_demo_bot_control%rowtype;
        v_order public.senfx_demo_bot_orders%rowtype;
        v_risk public.senfx_demo_bot_daily_risk%rowtype;
        v_day date:=(now() at time zone 'UTC')::date;
        v_prior_manual numeric:=0;
        v_total_attempts int;
begin
 select * into v_connection from public.deriv_connections
  where user_id=p_user_id for update;
 if not found or v_connection.status<>'connected'
  or v_connection.active_account_type<>'demo'
  or v_connection.expires_at<=now()
  or v_connection.active_account_id is null then
  return jsonb_build_object('allowed',false,'code','DEMO_CONNECTION_NOT_VALID');
 end if;
 select * into v_control from public.senfx_demo_bot_control
  where user_id=p_user_id for update;
 if not found or v_control.mode<>'running' or
   v_control.control_version<>p_expected_version or
   v_control.account_id<>v_connection.active_account_id or
   v_control.currency<>'USD' or v_control.max_stake<>1 or
   v_control.daily_loss_limit<>10 then
  return jsonb_build_object('allowed',false,'code','DEMO_BOT_STOPPED_OR_CHANGED');
 end if;
 select * into v_order from public.senfx_demo_bot_orders
  where id=p_order_id and user_id=p_user_id for update;
 if not found or v_order.account_id<>v_control.account_id
   or v_order.control_version<>v_control.control_version
   or v_order.status<>'quoted' or v_order.quote_expires_at<=now()
   or v_order.stake<>1 or v_order.currency<>'USD' or
   v_order.ask_price>1 or v_order.ask_price<=0 then
  return jsonb_build_object('allowed',false,'code','INVALID_FRESH_DEMO_QUOTE');
 end if;
 if exists(select 1 from public.deriv_demo_orders o where o.user_id=p_user_id
             and o.status in ('reserved','buy_unknown','open'))
   or exists(select 1 from public.senfx_demo_bot_orders o where o.user_id=p_user_id
             and o.id<>p_order_id and o.status in ('reserved','buy_unknown','open')) then
  return jsonb_build_object('allowed',false,'code','UNRESOLVED_ORDER_ACROSS_BOTS');
 end if;
 select count(*) into v_total_attempts from (
   select buy_requested_at from public.senfx_demo_bot_orders
    where user_id=p_user_id and risk_date=v_day and buy_requested_at is not null
   union all
   select buy_requested_at from public.deriv_demo_orders
    where user_id=p_user_id and risk_date=v_day and buy_requested_at is not null
 ) attempts;
 if v_total_attempts>=v_control.max_daily_attempts or
    exists(select 1 from public.senfx_demo_bot_orders
       where user_id=p_user_id and buy_requested_at>now()-interval '30 seconds') then
   return jsonb_build_object('allowed',false,'code','RATE_LIMIT_OR_DAILY_TRADE_CAP');
 end if;
 insert into public.senfx_demo_bot_daily_risk(user_id,account_id,risk_date,currency)
 values(p_user_id,v_order.account_id,v_day,'USD')
 on conflict(user_id,account_id,risk_date) do nothing;
 select * into v_risk from public.senfx_demo_bot_daily_risk
 where user_id=p_user_id and account_id=v_order.account_id and risk_date=v_day for update;
 select coalesce(sum(realized_loss+reserved_loss),0) into v_prior_manual
 from public.deriv_demo_daily_risk
 where user_id=p_user_id and risk_date=v_day;
 if v_risk.currency<>'USD' or v_risk.daily_limit<>10 or
    v_risk.realized_loss+v_risk.reserved_loss+v_prior_manual+v_order.stake>10 then
  return jsonb_build_object('allowed',false,'code','SHARED_VIRTUAL_LOSS_CAP_REACHED');
 end if;
 update public.senfx_demo_bot_daily_risk
  set reserved_loss=reserved_loss+v_order.stake,updated_at=now()
  where user_id=p_user_id and account_id=v_order.account_id and risk_date=v_day;
 update public.senfx_demo_bot_orders
  set status='reserved',risk_date=v_day,updated_at=now()
  where id=v_order.id;
 return jsonb_build_object('allowed',true,'orderId',v_order.id,
  'stake',1,'sharedDailyVirtualLossCap',10,
  'manualExposure',v_prior_manual,'brokerOrderPlaced',false);
end;
$$;

-- Before a broker buy: persist the irrevocable attempt marker FIRST.
-- If there is a network failure, keep status=buy_unknown until independently
-- reconciled; never assume a purchase failed and never auto-retry.
create or replace function public.senfx_demo_bots_mark_attempt(
 p_user_id uuid,p_order_id uuid,p_expected_version bigint
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_control public.senfx_demo_bot_control%rowtype;
        v_order public.senfx_demo_bot_orders%rowtype;
begin
 select * into v_control from public.senfx_demo_bot_control
  where user_id=p_user_id for update;
 if not found or v_control.mode<>'running' or
  v_control.control_version<>p_expected_version then
  return jsonb_build_object('allowed',false,'code','STOPPED_OR_STALE_RUN');
 end if;
 select * into v_order from public.senfx_demo_bot_orders
  where id=p_order_id and user_id=p_user_id for update;
 if not found or v_order.status<>'reserved'
  or v_order.control_version<>p_expected_version
  or v_order.buy_requested_at is not null then
  return jsonb_build_object('allowed',false,'code','BUY_ALREADY_ATTEMPTED_OR_NOT_RESERVED');
 end if;
 update public.senfx_demo_bot_orders
  set status='buy_unknown',buy_requested_at=now(),updated_at=now()
  where id=v_order.id;
 return jsonb_build_object('allowed',true,'attemptRecorded',true,
   'neverRetryUnknown',true);
end;
$$;

create or replace function public.senfx_demo_bots_release_unused(
 p_user_id uuid,p_order_id uuid
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_connection public.deriv_connections%rowtype;
        v_order public.senfx_demo_bot_orders%rowtype;
begin
 select * into v_connection from public.deriv_connections
  where user_id=p_user_id for update;
 if not found then return jsonb_build_object('released',false); end if;
 select * into v_order from public.senfx_demo_bot_orders
  where id=p_order_id and user_id=p_user_id for update;
 if not found or v_order.status not in ('quoted','reserved')
   or v_order.buy_requested_at is not null then
  return jsonb_build_object('released',false,'code','BUY_UNCERTAIN_OR_NOT_RELEASEABLE');
 end if;
 if v_order.status='reserved' then
  update public.senfx_demo_bot_daily_risk
   set reserved_loss=reserved_loss-v_order.stake,updated_at=now()
   where user_id=p_user_id and account_id=v_order.account_id
   and risk_date=v_order.risk_date and reserved_loss>=v_order.stake;
  if not found then raise exception 'Risk ledger missing for unattempted reservation'; end if;
 end if;
 update public.senfx_demo_bot_orders
  set status='cancelled',updated_at=now() where id=p_order_id;
 return jsonb_build_object('released',true,'brokerOrderPlaced',false);
end;
$$;

-- A verified broker settlement may be recorded only AFTER a buy attempt.
-- Caller must validate broker transaction ID, original contract and final
-- contract status against the authenticated Deriv Demo statement.
create or replace function public.senfx_demo_bots_record_settlement(
 p_user_id uuid,p_order_id uuid,p_contract_id text,p_transaction_id text,
 p_final_status text,p_buy_price numeric,p_sell_price numeric
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_connection public.deriv_connections%rowtype;
        v_order public.senfx_demo_bot_orders%rowtype;
        v_profit numeric;
begin
 if p_final_status not in ('won','lost','sold') or
    p_contract_id is null or length(p_contract_id)<3 or
    p_transaction_id is null or length(p_transaction_id)<3 or
    p_buy_price is null or p_buy_price<=0 or p_buy_price>1 or
    p_sell_price is null or p_sell_price<0 or p_sell_price>100 then
  return jsonb_build_object('settled',false,'code','INVALID_BROKER_SETTLEMENT');
 end if;
 select * into v_connection from public.deriv_connections
  where user_id=p_user_id for update;
 if not found or v_connection.active_account_type<>'demo' then
  return jsonb_build_object('settled',false,'code','DEMO_ACCOUNT_REQUIRED');
 end if;
 select * into v_order from public.senfx_demo_bot_orders
  where id=p_order_id and user_id=p_user_id for update;
 if not found or v_order.account_id<>v_connection.active_account_id or
    v_order.buy_requested_at is null or
    v_order.status not in ('buy_unknown','open') then
  return jsonb_build_object('settled',false,'code','ORDER_NOT_ELIGIBLE_FOR_SETTLEMENT');
 end if;
 v_profit:=round(p_sell_price-p_buy_price,2);
 if (p_final_status='won' and v_profit<0)
    or (p_final_status='lost' and v_profit>0) then
  return jsonb_build_object('settled',false,'code','BROKER_RESULT_INCONSISTENT');
 end if;
 update public.senfx_demo_bot_daily_risk
  set reserved_loss=reserved_loss-v_order.stake,
      realized_loss=realized_loss+greatest(0,-v_profit),
      updated_at=now()
  where user_id=p_user_id and account_id=v_order.account_id
    and risk_date=v_order.risk_date and reserved_loss>=v_order.stake;
 if not found then raise exception 'Missing reserved virtual risk; no settlement recorded'; end if;
 update public.senfx_demo_bot_orders
  set status=p_final_status,contract_id=p_contract_id,buy_transaction_id=p_transaction_id,
      buy_price=p_buy_price,sell_price=p_sell_price,profit=v_profit,
      settled_at=now(),updated_at=now()
  where id=v_order.id;
 return jsonb_build_object('settled',true,'profit',v_profit);
end;
$$;

revoke all on function public.senfx_demo_bots_control(uuid,text,text,bigint)
 from public,anon,authenticated;
revoke all on function public.senfx_demo_bots_reserve(uuid,uuid,bigint)
 from public,anon,authenticated;
revoke all on function public.senfx_demo_bots_mark_attempt(uuid,uuid,bigint)
 from public,anon,authenticated;
revoke all on function public.senfx_demo_bots_release_unused(uuid,uuid)
 from public,anon,authenticated;
revoke all on function public.senfx_demo_bots_record_settlement(uuid,uuid,text,text,text,numeric,numeric)
 from public,anon,authenticated;

grant execute on function public.senfx_demo_bots_control(uuid,text,text,bigint) to service_role;
grant execute on function public.senfx_demo_bots_reserve(uuid,uuid,bigint) to service_role;
grant execute on function public.senfx_demo_bots_mark_attempt(uuid,uuid,bigint) to service_role;
grant execute on function public.senfx_demo_bots_release_unused(uuid,uuid) to service_role;
grant execute on function public.senfx_demo_bots_record_settlement(uuid,uuid,text,text,text,numeric,numeric)
 to service_role;
commit;
