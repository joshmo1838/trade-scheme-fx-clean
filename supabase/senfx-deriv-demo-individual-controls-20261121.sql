-- Additive individual Deriv USD virtual-Demo controls. No Real-money routes.
begin;
alter table public.senfx_demo_bot_control
 add column if not exists selected_bot_id text,
 add column if not exists target_trades integer;
alter table public.senfx_demo_bot_control
 drop constraint if exists senfx_demo_bot_selection_check;
alter table public.senfx_demo_bot_control
 add constraint senfx_demo_bot_selection_check check (
  (selected_bot_id is null and target_trades is null) or
  (selected_bot_id = any(array[
     'digit-over-4','digit-under-5','parity-even','parity-odd',
     'digit-matches','digit-differs','trend-rise-fall',
     'breakout-higher-lower','recovery-audit','stepwise-audit',
     'adaptive-over','entropy-parity','pattern-differs',
     'momentum-rise-fall','volatility-scalper'
   ]) and target_trades between 1 and 200)
 );
-- Start All clears any old single-bot selection atomically.
create or replace function public.senfx_demo_bots_control(
 p_user_id uuid,p_account_id text,p_command text,p_expected_version bigint,p_stake numeric
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
 if p_stake is null or p_stake<=0 or scale(p_stake)>2 then
  return jsonb_build_object('ok',false,'code','INVALID_USER_SELECTED_DEMO_STAKE');
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
   set mode='running',stake_amount=p_stake,selected_bot_id=null,target_trades=null,observed_state='starting',worker_id=null,lease_expires_at=null,heartbeat_at=null,control_version=control_version+1,updated_at=now()
  where user_id=p_user_id returning * into v_control;
 return jsonb_build_object('ok',true,'mode','running',
  'version',v_control.control_version,'brokerOrderPlaced',false);
end;
$$;

-- Server-only command: original owner/account check and lock performed
-- within the SAME database transaction before selecting an individual bot.
create or replace function public.senfx_demo_bots_start_one(
 p_user_id uuid,p_account_id text,p_expected_version bigint,
 p_stake numeric,p_bot_id text,p_target_trades integer
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_start jsonb;
        v_row public.senfx_demo_bot_control%rowtype;
begin
 if p_bot_id is null or p_bot_id <> all(array[
     'digit-over-4','digit-under-5','parity-even','parity-odd',
     'digit-matches','digit-differs','trend-rise-fall',
     'breakout-higher-lower','recovery-audit','stepwise-audit',
     'adaptive-over','entropy-parity','pattern-differs',
     'momentum-rise-fall','volatility-scalper'
   ]) or p_target_trades not between 1 and 200 then
  return jsonb_build_object('ok',false,'code','INVALID_INDIVIDUAL_BOT_SETTINGS');
 end if;
 v_start:=public.senfx_demo_bots_control(
  p_user_id,p_account_id,'start',p_expected_version,p_stake);
 if v_start->>'ok' is distinct from 'true' then
  return v_start;
 end if;
 update public.senfx_demo_bot_control
 set selected_bot_id=p_bot_id,target_trades=p_target_trades,updated_at=now()
 where user_id=p_user_id and account_id=p_account_id
   and mode='running' and control_version=(v_start->>'version')::bigint
 returning * into v_row;
 if not found then
  raise exception 'Selected Demo configuration failed atomic update';
 end if;
 return v_start || jsonb_build_object('selectedBotId',p_bot_id,
  'targetTrades',p_target_trades);
end;
$$;

-- Shared reservation enforces one unsettled broker contract across ALL bots.
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
   v_control.observed_state<>'running' or v_control.worker_id is null or
   v_control.lease_expires_at<=now() or
   v_control.control_version<>p_expected_version or
   v_control.account_id<>v_connection.active_account_id or
   v_control.currency<>'USD' or v_control.stake_amount is null or
   v_control.stake_amount<=0 then
  return jsonb_build_object('allowed',false,'code','DEMO_BOT_STOPPED_OR_CHANGED');
 end if;
 select * into v_order from public.senfx_demo_bot_orders
  where id=p_order_id and user_id=p_user_id for update;
 if not found or v_order.account_id<>v_control.account_id
   or v_order.control_version<>v_control.control_version
   or v_order.status<>'quoted' or v_order.quote_expires_at<=now()
   or v_order.stake<>v_control.stake_amount or v_order.currency<>'USD' or
   v_order.ask_price>v_order.stake or v_order.ask_price<=0 then
  return jsonb_build_object('allowed',false,'code','INVALID_FRESH_DEMO_QUOTE');
 end if;
 if exists(select 1 from public.deriv_demo_orders o where o.user_id=p_user_id
             and o.status in ('reserved','buy_unknown','open'))
   or exists(select 1 from public.senfx_demo_bot_orders o where o.user_id=p_user_id
             and o.id<>p_order_id and o.status in ('reserved','buy_unknown','open')) then
  return jsonb_build_object('allowed',false,'code','UNRESOLVED_ORDER_ACROSS_BOTS');
 end if;
 -- A selected strategy cannot reserve another bot's trade or exceed the
 -- operator-selected count. This is enforced transactionally, not just in UI.
 if v_control.selected_bot_id is not null then
   if v_order.bot_id<>v_control.selected_bot_id or
      v_control.target_trades is null then
     return jsonb_build_object('allowed',false,'code','INDIVIDUAL_BOT_SELECTION_MISMATCH');
   end if;
   if (select count(*) from public.senfx_demo_bot_orders o
       where o.user_id=p_user_id
         and o.control_version=v_control.control_version
         and o.buy_requested_at is not null) >= v_control.target_trades then
     return jsonb_build_object('allowed',false,'code','INDIVIDUAL_BOT_TARGET_REACHED');
   end if;
 end if;
 -- No SENFX daily trade-count or virtual-loss ceiling.
 -- Retain a brief 30-second anti-duplicate cooldown after each attempted buy.
 if exists(select 1 from public.senfx_demo_bot_orders
           where user_id=p_user_id and buy_requested_at>now()-interval '30 seconds') then
  return jsonb_build_object('allowed',false,'code','ANTI_DUPLICATE_COOLDOWN');
 end if;
 insert into public.senfx_demo_bot_daily_risk(user_id,account_id,risk_date,currency)
 values(p_user_id,v_order.account_id,v_day,'USD')
 on conflict(user_id,account_id,risk_date) do nothing;
 select * into v_risk from public.senfx_demo_bot_daily_risk
 where user_id=p_user_id and account_id=v_order.account_id and risk_date=v_day for update;
 if v_risk.currency<>'USD' then
  return jsonb_build_object('allowed',false,'code','DEMO_CURRENCY_MISMATCH');
 end if;
 -- Retain the loss ledger for reporting; never gate further virtual buys
 -- by a SENFX-imposed daily-loss budget.
 update public.senfx_demo_bot_daily_risk
  set reserved_loss=reserved_loss+v_order.stake,updated_at=now()
  where user_id=p_user_id and account_id=v_order.account_id and risk_date=v_day;
 update public.senfx_demo_bot_orders
  set status='reserved',risk_date=v_day,updated_at=now()
  where id=v_order.id;
 return jsonb_build_object('allowed',true,'orderId',v_order.id,
  'stake',v_order.stake,'appDailyLossCap',null,
  'appDailyTradeCountCap',null,'brokerOrderPlaced',false);
end;
$$;

revoke all on function public.senfx_demo_bots_control(uuid,text,text,bigint,numeric)
 from public,anon,authenticated;
revoke all on function public.senfx_demo_bots_start_one(uuid,text,bigint,numeric,text,integer)
 from public,anon,authenticated;
revoke all on function public.senfx_demo_bots_reserve(uuid,uuid,bigint)
 from public,anon,authenticated;
grant execute on function public.senfx_demo_bots_start_one(uuid,text,bigint,numeric,text,integer)
 to service_role;
commit;