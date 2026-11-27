-- Additive bridge from the native Blockly workspace to the Demo worker.
-- Apply only after reviewing the staged worker and API release.
begin;

alter table public.quantum_demo_bot_control
  add column if not exists market_category text not null default 'synthetic_index'
    check (market_category in ('synthetic_index','cryptocurrency')),
  add column if not exists market_symbol text not null default 'R_100'
    check (market_symbol ~ '^[A-Za-z0-9_]{2,30}$'),
  add column if not exists contract_family text not null default 'OPTIONS'
    check (contract_family in ('OPTIONS','MULTIPLIER')),
  add column if not exists multiplier integer not null default 1 check (multiplier between 1 and 1000),
  add column if not exists per_trade_stop_loss numeric not null default 1 check (per_trade_stop_loss > 0 and scale(per_trade_stop_loss) <= 2),
  add column if not exists per_trade_take_profit numeric not null default 1 check (per_trade_take_profit > 0 and scale(per_trade_take_profit) <= 2);

alter table public.quantum_demo_bot_orders drop constraint if exists quantum_demo_bot_orders_market_symbol_check;
alter table public.quantum_demo_bot_orders drop constraint if exists quantum_demo_bot_orders_contract_type_check;
alter table public.quantum_demo_bot_orders drop constraint if exists quantum_demo_bot_orders_duration_check;
alter table public.quantum_demo_bot_orders drop constraint if exists quantum_demo_bot_orders_duration_unit_check;
alter table public.quantum_demo_bot_orders
  add column if not exists contract_family text not null default 'OPTIONS'
    check (contract_family in ('OPTIONS','MULTIPLIER')),
  add column if not exists multiplier integer check (multiplier is null or multiplier between 1 and 1000);
alter table public.quantum_demo_bot_orders
  drop constraint if exists quantum_demo_orders_market_symbol_check,
  drop constraint if exists quantum_demo_orders_contract_type_check,
  drop constraint if exists quantum_demo_orders_duration_check,
  drop constraint if exists quantum_demo_orders_duration_unit_check,
  drop constraint if exists quantum_demo_orders_multiplier_check;
alter table public.quantum_demo_bot_orders
  add constraint quantum_demo_orders_market_symbol_check check (market_symbol ~ '^[A-Za-z0-9_]{2,30}$'),
  add constraint quantum_demo_orders_contract_type_check check (contract_type in ('CALL','PUT','DIGITEVEN','DIGITODD','DIGITMATCH','DIGITDIFF','MULTUP','MULTDOWN')),
  add constraint quantum_demo_orders_duration_check check ((contract_family='OPTIONS' and duration=1) or (contract_family='MULTIPLIER' and duration is null)),
  add constraint quantum_demo_orders_duration_unit_check check ((contract_family='OPTIONS' and duration_unit='t') or (contract_family='MULTIPLIER' and duration_unit is null)),
  add constraint quantum_demo_orders_multiplier_check check ((contract_family='MULTIPLIER' and multiplier is not null and contract_type in ('MULTUP','MULTDOWN')) or (contract_family='OPTIONS' and multiplier is null));

create or replace function public.quantum_demo_start_blockly(
 p_user_id uuid,p_account_id text,p_expected_version bigint,p_plan jsonb
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.deriv_connections%rowtype; r public.quantum_demo_bot_control%rowtype;
  v_bot text; v_market text; v_category text; v_stake numeric; v_sl numeric; v_tp numeric; v_mult integer;
begin
 if p_user_id is null or p_account_id is null or p_expected_version is null or jsonb_typeof(p_plan)<>'object' then
   return jsonb_build_object('ok',false,'code','INVALID_BLOCKLY_DEMO_PLAN');
 end if;
 v_bot:=p_plan->>'strategyId'; v_market:=p_plan->>'marketSymbol'; v_category:=p_plan->>'marketCategory';
 v_stake:=(p_plan->>'stake')::numeric; v_sl:=(p_plan->>'sessionStopLoss')::numeric;
 v_tp:=(p_plan->>'sessionTakeProfit')::numeric; v_mult:=(p_plan->>'multiplier')::integer;
 if v_bot is null or v_market is null or v_category is null or v_mult is null or v_stake is null or v_sl is null or v_tp is null or
    (p_plan->>'perTradeStopLoss') is null or (p_plan->>'perTradeTakeProfit') is null or
    v_bot not in ('nexus-flow','volt-sprint','apex-signal','prism-range','straddle-shift','pulse-rhythm','quantum-edge-ai','sterling-edge','meridian-pivot','atlas-range','windsor-continuity','marlow-flow','monarch-echo') or
    v_category not in ('synthetic_index','cryptocurrency') or v_market !~ '^[A-Za-z0-9_]{2,30}$' or
    p_plan->>'contractFamily'<>'MULTIPLIER' or v_mult not between 1 and 1000 or
    v_stake<=0 or v_stake>1000 or scale(v_stake)>2 or v_sl<v_stake or v_sl>1000 or scale(v_sl)>2 or v_tp<=0 or v_tp>1000 or scale(v_tp)>2 or
    (p_plan->>'perTradeStopLoss')::numeric<=0 or (p_plan->>'perTradeStopLoss')::numeric>1000 or scale((p_plan->>'perTradeStopLoss')::numeric)>2 or
    (p_plan->>'perTradeTakeProfit')::numeric<=0 or (p_plan->>'perTradeTakeProfit')::numeric>1000 or scale((p_plan->>'perTradeTakeProfit')::numeric)>2 then
   return jsonb_build_object('ok',false,'code','INVALID_BLOCKLY_DEMO_PLAN');
 end if;
 select * into c from public.deriv_connections where user_id=p_user_id for update;
 if not found or c.status<>'connected' or c.active_account_type<>'demo' or c.active_account_id is distinct from p_account_id or c.expires_at<=now() then
   return jsonb_build_object('ok',false,'code','VERIFIED_DEMO_ACCOUNT_REQUIRED');
 end if;
 if exists(select 1 from public.deriv_demo_orders where user_id=p_user_id and status in ('reserved','buy_unknown','open')) or
    exists(select 1 from public.senfx_demo_bot_orders where user_id=p_user_id and status in ('reserved','buy_unknown','open')) or
    exists(select 1 from public.quantum_demo_bot_orders where user_id=p_user_id and status in ('reserved','buy_unknown','open')) then
   return jsonb_build_object('ok',false,'code','UNRESOLVED_DEMO_ORDER');
 end if;
 insert into public.quantum_demo_bot_control(user_id,account_id,bot_id,stake,session_stop_loss,session_take_profit)
 values(p_user_id,p_account_id,v_bot,v_stake,v_sl,v_tp) on conflict(user_id) do nothing;
 select * into r from public.quantum_demo_bot_control where user_id=p_user_id for update;
 if r.mode='running' then return jsonb_build_object('ok',false,'code','ALREADY_RUNNING'); end if;
 if r.control_version<>p_expected_version then return jsonb_build_object('ok',false,'code','VERSION_OR_ACCOUNT_MISMATCH'); end if;
 update public.quantum_demo_bot_control set account_id=p_account_id,bot_id=v_bot,stake=v_stake,
   session_stop_loss=v_sl,session_take_profit=v_tp,market_category=v_category,market_symbol=v_market,
   contract_family='MULTIPLIER',multiplier=v_mult,
   per_trade_stop_loss=(p_plan->>'perTradeStopLoss')::numeric,
   per_trade_take_profit=(p_plan->>'perTradeTakeProfit')::numeric,
   mode='running',observed_state='starting',worker_id=null,heartbeat_at=null,lease_expires_at=null,
   last_error=null,control_version=control_version+1,updated_at=now()
 where user_id=p_user_id returning * into r;
 return jsonb_build_object('ok',true,'version',r.control_version,'botId',r.bot_id,'brokerOrderPlaced',false,'realMoneyEnabled',false);
exception when others then
 return jsonb_build_object('ok',false,'code','INVALID_BLOCKLY_DEMO_PLAN');
end $$;

revoke all on function public.quantum_demo_start_blockly(uuid,text,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.quantum_demo_start_blockly(uuid,text,bigint,jsonb) to service_role;
commit;
