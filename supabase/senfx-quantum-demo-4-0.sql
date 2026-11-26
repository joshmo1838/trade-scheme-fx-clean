-- Additive Deriv Demo execution ledger for the current Trade Scheme FX 4.0 catalog.
-- Legacy bot and order tables remain untouched for historical records.
begin;

create table if not exists public.quantum_demo_bot_control (
  user_id uuid primary key references auth.users(id) on delete cascade,
  account_id text not null,
  currency text not null default 'USD' check (currency = 'USD'),
  mode text not null default 'stopped' check (mode in ('stopped','running')),
  control_version bigint not null default 0 check (control_version >= 0),
  bot_id text not null check (bot_id = any(array[
    'nexus-flow','volt-sprint','apex-signal','prism-range','straddle-shift',
    'pulse-rhythm','vertex-digits','quantum-edge-ai','sterling-edge',
    'meridian-pivot','regent-parity','atlas-range','windsor-continuity',
    'marlow-flow','cadence-sequence','monarch-echo'
  ])),
  stake numeric not null check (stake > 0 and scale(stake) <= 2),
  session_stop_loss numeric not null check (session_stop_loss > 0 and scale(session_stop_loss) <= 2),
  session_take_profit numeric not null check (session_take_profit > 0 and scale(session_take_profit) <= 2),
  worker_id text,
  observed_state text not null default 'stopped' check (observed_state in ('stopped','starting','running')),
  heartbeat_at timestamptz,
  lease_expires_at timestamptz,
  stopped_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.quantum_demo_bot_orders (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id text not null,
  control_version bigint not null,
  bot_id text not null check (bot_id = any(array[
    'nexus-flow','volt-sprint','apex-signal','prism-range','straddle-shift',
    'pulse-rhythm','vertex-digits','quantum-edge-ai','sterling-edge',
    'meridian-pivot','regent-parity','atlas-range','windsor-continuity',
    'marlow-flow','cadence-sequence','monarch-echo'
  ])),
  market_symbol text not null check (market_symbol = 'R_100'),
  signal_kind text not null check (signal_kind in ('RISE','FALL','EVEN','ODD','MATCH','DIFFER')),
  contract_type text not null check (contract_type in ('CALL','PUT','DIGITEVEN','DIGITODD','DIGITMATCH','DIGITDIFF')),
  barrier text check (barrier is null or barrier ~ '^[0-9]$'),
  duration integer not null check (duration = 1),
  duration_unit text not null check (duration_unit = 't'),
  tick_epoch bigint not null check (tick_epoch > 0),
  currency text not null check (currency = 'USD'),
  stake numeric not null check (stake > 0),
  ask_price numeric not null check (ask_price > 0 and ask_price <= stake),
  payout numeric not null check (payout > 0),
  proposal_id text not null check (length(proposal_id) between 20 and 128),
  quote_expires_at timestamptz not null,
  status text not null default 'quoted' check (status in ('quoted','reserved','buy_unknown','open','won','lost','sold','cancelled','expired','rejected')),
  buy_requested_at timestamptz,
  contract_id text,
  buy_transaction_id text,
  buy_price numeric,
  sell_price numeric,
  profit numeric,
  opened_at timestamptz,
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists quantum_demo_orders_account_contract
 on public.quantum_demo_bot_orders(account_id,contract_id) where contract_id is not null;
create index if not exists quantum_demo_orders_user_version
 on public.quantum_demo_bot_orders(user_id,control_version,created_at desc);

alter table public.quantum_demo_bot_control enable row level security;
alter table public.quantum_demo_bot_orders enable row level security;
revoke all on public.quantum_demo_bot_control, public.quantum_demo_bot_orders from public, anon, authenticated;
grant select,insert,update,delete on public.quantum_demo_bot_control, public.quantum_demo_bot_orders to service_role;

create or replace function public.quantum_demo_control(
 p_user_id uuid, p_account_id text, p_action text, p_expected_version bigint,
 p_bot_id text default null, p_stake numeric default null,
 p_stop_loss numeric default null, p_take_profit numeric default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.deriv_connections%rowtype; r public.quantum_demo_bot_control%rowtype;
begin
 if p_action='stop' then
   update public.quantum_demo_bot_control set mode='stopped',observed_state='stopped',
     worker_id=null,lease_expires_at=null,control_version=control_version+1,
     stopped_at=now(),updated_at=now() where user_id=p_user_id returning * into r;
   return jsonb_build_object('ok',true,'version',coalesce(r.control_version,0),'brokerOrderPlaced',false);
 end if;
 if p_action<>'start' or p_account_id is null or p_expected_version is null or p_bot_id is null or
    p_bot_id <> all(array['nexus-flow','volt-sprint','apex-signal','prism-range','straddle-shift','pulse-rhythm','vertex-digits','quantum-edge-ai','sterling-edge','meridian-pivot','regent-parity','atlas-range','windsor-continuity','marlow-flow','cadence-sequence','monarch-echo']) or
    p_stake is null or p_stake<=0 or scale(p_stake)>2 or
    p_stop_loss is null or p_stop_loss<=0 or scale(p_stop_loss)>2 or
    p_take_profit is null or p_take_profit<=0 or scale(p_take_profit)>2 then
   return jsonb_build_object('ok',false,'code','INVALID_DEMO_RUN_SETTINGS');
 end if;
 select * into c from public.deriv_connections where user_id=p_user_id for update;
 if not found or c.status<>'connected' or c.active_account_type<>'demo' or
    c.active_account_id is distinct from p_account_id or c.expires_at<=now() then
   return jsonb_build_object('ok',false,'code','VERIFIED_DEMO_ACCOUNT_REQUIRED');
 end if;
 if exists(select 1 from public.deriv_demo_orders where user_id=p_user_id and status in ('reserved','buy_unknown','open')) or
    exists(select 1 from public.senfx_demo_bot_orders where user_id=p_user_id and status in ('reserved','buy_unknown','open')) or
    exists(select 1 from public.quantum_demo_bot_orders where user_id=p_user_id and status in ('reserved','buy_unknown','open')) then
   return jsonb_build_object('ok',false,'code','UNRESOLVED_DEMO_ORDER');
 end if;
 insert into public.quantum_demo_bot_control(user_id,account_id,bot_id,stake,session_stop_loss,session_take_profit)
 values(p_user_id,p_account_id,p_bot_id,p_stake,p_stop_loss,p_take_profit)
 on conflict(user_id) do nothing;
 select * into r from public.quantum_demo_bot_control where user_id=p_user_id for update;
 if r.mode='running' then return jsonb_build_object('ok',false,'code','ALREADY_RUNNING'); end if;
 if r.control_version<>p_expected_version then
   return jsonb_build_object('ok',false,'code','VERSION_OR_ACCOUNT_MISMATCH');
 end if;
 update public.quantum_demo_bot_control set account_id=p_account_id,bot_id=p_bot_id,
   stake=p_stake,session_stop_loss=p_stop_loss,session_take_profit=p_take_profit,
   mode='running',observed_state='starting',worker_id=null,heartbeat_at=null,
   lease_expires_at=null,last_error=null,control_version=control_version+1,updated_at=now()
   where user_id=p_user_id returning * into r;
 return jsonb_build_object('ok',true,'version',r.control_version,'botId',r.bot_id,
   'brokerOrderPlaced',false,'realMoneyEnabled',false);
end $$;

create or replace function public.quantum_demo_worker_heartbeat(p_user_id uuid,p_worker_id text,p_version bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.quantum_demo_bot_control%rowtype;
begin
 if p_worker_id is null or p_worker_id !~ '^[A-Za-z0-9_-]{12,90}$' then return jsonb_build_object('owned',false); end if;
 select * into r from public.quantum_demo_bot_control where user_id=p_user_id for update;
 if not found or r.mode<>'running' or r.control_version<>p_version or
    (r.worker_id is not null and r.worker_id<>p_worker_id and r.lease_expires_at>now()) then
   return jsonb_build_object('owned',false,'code','STALE_OR_OWNED_LEASE');
 end if;
 update public.quantum_demo_bot_control set worker_id=p_worker_id,observed_state='running',
  heartbeat_at=now(),lease_expires_at=now()+interval '20 seconds',updated_at=now()
  where user_id=p_user_id returning * into r;
 return jsonb_build_object('owned',true,'version',r.control_version,'leaseExpiresAt',r.lease_expires_at);
end $$;

create or replace function public.quantum_demo_reserve(p_user_id uuid,p_order_id uuid,p_version bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.deriv_connections%rowtype; r public.quantum_demo_bot_control%rowtype; o public.quantum_demo_bot_orders%rowtype; pnl numeric;
begin
 select * into c from public.deriv_connections where user_id=p_user_id for update;
 select * into r from public.quantum_demo_bot_control where user_id=p_user_id for update;
 select * into o from public.quantum_demo_bot_orders where id=p_order_id and user_id=p_user_id for update;
 if c.user_id is null or r.user_id is null or o.id is null or c.status<>'connected' or c.active_account_type<>'demo' or c.active_account_id<>r.account_id or
   r.mode<>'running' or r.observed_state<>'running' or r.control_version<>p_version or
   r.lease_expires_at<=now() or o.account_id<>r.account_id or o.bot_id<>r.bot_id or
   o.control_version<>r.control_version or o.status<>'quoted' or o.quote_expires_at<=now() or
   o.stake<>r.stake or o.ask_price>o.stake then
   return jsonb_build_object('allowed',false,'code','RUN_OR_QUOTE_MISMATCH');
 end if;
 if exists(select 1 from public.quantum_demo_bot_orders where user_id=p_user_id and status in ('reserved','buy_unknown','open')) or
    exists(select 1 from public.deriv_demo_orders where user_id=p_user_id and status in ('reserved','buy_unknown','open')) or
    exists(select 1 from public.senfx_demo_bot_orders where user_id=p_user_id and status in ('reserved','buy_unknown','open')) then
   return jsonb_build_object('allowed',false,'code','UNRESOLVED_ORDER');
 end if;
 select coalesce(sum(profit),0) into pnl from public.quantum_demo_bot_orders where user_id=p_user_id and control_version=p_version and status in ('won','lost','sold');
 if pnl>=r.session_take_profit or pnl-o.stake<=-r.session_stop_loss then
   update public.quantum_demo_bot_control set mode='stopped',observed_state='stopped',worker_id=null,lease_expires_at=null,stopped_at=now(),last_error='Session risk limit reached',control_version=control_version+1,updated_at=now() where user_id=p_user_id;
   return jsonb_build_object('allowed',false,'code','SESSION_LIMIT_REACHED');
 end if;
 update public.quantum_demo_bot_orders set status='reserved',updated_at=now() where id=o.id;
 return jsonb_build_object('allowed',true,'orderId',o.id,'sessionProfit',pnl);
end $$;

create or replace function public.quantum_demo_mark_attempt(p_user_id uuid,p_order_id uuid,p_version bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.quantum_demo_bot_control%rowtype; o public.quantum_demo_bot_orders%rowtype;
begin
 select * into r from public.quantum_demo_bot_control where user_id=p_user_id for update;
 select * into o from public.quantum_demo_bot_orders where id=p_order_id and user_id=p_user_id for update;
 if r.user_id is null or o.id is null or r.mode<>'running' or r.control_version<>p_version or r.worker_id is null or r.lease_expires_at<=now() or o.status<>'reserved' or o.buy_requested_at is not null then
   return jsonb_build_object('allowed',false,'code','STOPPED_OR_DUPLICATE');
 end if;
 update public.quantum_demo_bot_orders set status='buy_unknown',buy_requested_at=now(),updated_at=now() where id=o.id;
 return jsonb_build_object('allowed',true,'neverRetryUnknown',true);
end $$;

create or replace function public.quantum_demo_settle(p_user_id uuid,p_order_id uuid,p_contract_id text,p_tx_id text,p_status text,p_buy numeric,p_sell numeric)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare o public.quantum_demo_bot_orders%rowtype; pnl numeric; r public.quantum_demo_bot_control%rowtype;
begin
 if p_status not in ('won','lost','sold') or p_contract_id is null or p_tx_id is null or p_buy is null or p_buy<=0 or p_sell is null or p_sell<0 then return jsonb_build_object('settled',false,'code','INVALID_SETTLEMENT'); end if;
 select * into o from public.quantum_demo_bot_orders where id=p_order_id and user_id=p_user_id for update;
 if o.id is null or o.status not in ('buy_unknown','open') or o.buy_requested_at is null or p_buy>o.stake or
    (p_status='won' and p_sell<=p_buy) or (p_status='lost' and p_sell>=p_buy) then return jsonb_build_object('settled',false,'code','ORDER_NOT_SETTLEABLE'); end if;
 select * into r from public.quantum_demo_bot_control where user_id=p_user_id for update;
 if r.user_id is null or r.account_id<>o.account_id then return jsonb_build_object('settled',false,'code','CONTROL_ACCOUNT_MISMATCH'); end if;
 update public.quantum_demo_bot_orders set status=p_status,contract_id=p_contract_id,buy_transaction_id=p_tx_id,buy_price=p_buy,sell_price=p_sell,profit=round(p_sell-p_buy,2),settled_at=now(),updated_at=now() where id=o.id;
 select coalesce(sum(profit),0) into pnl from public.quantum_demo_bot_orders where user_id=p_user_id and control_version=o.control_version and status in ('won','lost','sold');
 if pnl>=r.session_take_profit or pnl<=-r.session_stop_loss then
  update public.quantum_demo_bot_control set mode='stopped',observed_state='stopped',worker_id=null,lease_expires_at=null,stopped_at=now(),last_error='Session stop loss or take profit reached',control_version=control_version+1,updated_at=now() where user_id=p_user_id;
 end if;
 return jsonb_build_object('settled',true,'profit',round(p_sell-p_buy,2),'sessionProfit',pnl);
end $$;

revoke all on function public.quantum_demo_control(uuid,text,text,bigint,text,numeric,numeric,numeric) from public,anon,authenticated;
revoke all on function public.quantum_demo_worker_heartbeat(uuid,text,bigint) from public,anon,authenticated;
revoke all on function public.quantum_demo_reserve(uuid,uuid,bigint) from public,anon,authenticated;
revoke all on function public.quantum_demo_mark_attempt(uuid,uuid,bigint) from public,anon,authenticated;
revoke all on function public.quantum_demo_settle(uuid,uuid,text,text,text,numeric,numeric) from public,anon,authenticated;
grant execute on function public.quantum_demo_control(uuid,text,text,bigint,text,numeric,numeric,numeric) to service_role;
grant execute on function public.quantum_demo_worker_heartbeat(uuid,text,bigint) to service_role;
grant execute on function public.quantum_demo_reserve(uuid,uuid,bigint) to service_role;
grant execute on function public.quantum_demo_mark_attempt(uuid,uuid,bigint) to service_role;
grant execute on function public.quantum_demo_settle(uuid,uuid,text,text,text,numeric,numeric) to service_role;
commit;
