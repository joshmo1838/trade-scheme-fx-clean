-- SENFX isolated owner admin: reduce Deriv *virtual Demo* sequential
-- order-cooldown from 30s to 10s, without weakening single-order or
-- uncertain-purchase gates. No change to real money, stake or user consent.
begin;
lock table public.senfx_demo_bot_control in share row exclusive mode;
do $safety$
begin
 if exists(select 1 from public.senfx_demo_bot_control where mode='running')
    or exists(select 1 from public.senfx_demo_bot_orders
         where status in ('reserved','buy_unknown','open'))
    or exists(select 1 from public.deriv_demo_orders
         where status in ('reserved','buy_unknown','open'))
 then raise exception 'Cannot change virtual Demo cooldown during an active or unsettled session';
 end if;
end;
$safety$;
alter table public.senfx_demo_bot_control
 drop constraint if exists senfx_demo_bot_control_cooldown_seconds_check;
alter table public.senfx_demo_bot_control
 add constraint senfx_demo_bot_control_cooldown_seconds_check
 check (cooldown_seconds>=10);
alter table public.senfx_demo_bot_control
 alter column cooldown_seconds set default 10;
-- Update existing stopped ADMIN Demo pilot. No live orders are affected.
update public.senfx_demo_bot_control
 set cooldown_seconds=10,updated_at=now()
 where mode='stopped' and cooldown_seconds>10
  and exists(select 1 from public.profiles p
    where p.id=senfx_demo_bot_control.user_id and p.role='admin');

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
 -- Keep a >=10-second cooldown after a real broker purchase attempt.
 -- Admin-only, transactionally persisted; every unsettled order remains blocked.
 if exists(select 1 from public.senfx_demo_bot_orders
           where user_id=p_user_id and buy_requested_at>now()-make_interval(secs=>v_control.cooldown_seconds)) then
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

-- Preserve server-only database execution. No new public grants.
revoke all on function public.senfx_demo_bots_reserve(uuid,uuid,bigint)
 from public,anon,authenticated;
grant execute on function public.senfx_demo_bots_reserve(uuid,uuid,bigint)
 to service_role;
commit;
