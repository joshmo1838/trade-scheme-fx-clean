import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
const sql=readFileSync(new URL("../supabase/senfx-deriv-demo-15bot-execution-staged.sql",import.meta.url),"utf8");
const control=readFileSync(new URL("../app/api/deriv/demo/bots/control/route.ts",import.meta.url),"utf8");
const ui=readFileSync(new URL("../app/bot-library/FifteenDemoBotControlPanel.tsx",import.meta.url),"utf8");
const manual=readFileSync(new URL("../app/api/deriv/demo/orders/route.ts",import.meta.url),"utf8");

test("new 15-bot tables are separate, service-only, and do not rewrite previous live Demo history",()=>{
 for(const table of ["senfx_demo_bot_control","senfx_demo_bot_daily_risk","senfx_demo_bot_orders"]){
  assert.ok(sql.includes("create table if not exists public."+table));
  assert.ok(sql.includes("alter table public."+table+" enable row level security"));
 }
 assert.match(sql,/revoke all on public\.senfx_demo_bot_control,public\.senfx_demo_bot_daily_risk/);
 assert.match(sql,/from public,anon,authenticated;/);
 assert.match(sql,/to service_role;/);
 assert.doesNotMatch(sql,/drop table public\.deriv_demo_orders|truncate.*deriv_demo_orders|delete from public\.deriv_demo_orders/i);
});
test("reservation is Demo-only, owner-stake-controlled, and has no SENFX daily financial cap",()=>{
 assert.match(sql,/active_account_type<>'demo'/);
 assert.match(sql,/currency='USD'/);
 assert.match(sql,/stake_amount numeric check \(stake_amount>0\)/);
 assert.match(sql,/v_order\.stake<>v_control\.stake_amount/);
 assert.match(sql,/ask_price>0 and ask_price<=stake/);
 assert.match(sql,/scale\(p_stake\)>2/);
 assert.match(sql,/cooldown_seconds>=30/);
 assert.match(sql,/status in \('reserved','buy_unknown','open'\)/);
 assert.match(sql,/senfx_demo_bot_one_unresolved_per_user/);
 assert.match(sql,/ANTI_DUPLICATE_COOLDOWN/);
 assert.match(sql,/'appDailyLossCap',null/);
 assert.match(sql,/'appDailyTradeCountCap',null/);
 assert.doesNotMatch(sql,/RATE_LIMIT_OR_DAILY_TRADE_CAP|SHARED_VIRTUAL_LOSS_CAP_REACHED/);
 assert.match(sql,/where user_id=p_user_id for update/);
});
test("purchase attempt must be persisted once, and a lost response never permits retry",()=>{
 assert.match(sql,/create or replace function public\.senfx_demo_bots_mark_attempt/);
 assert.match(sql,/v_order\.buy_requested_at is not null/);
 assert.match(sql,/set status='buy_unknown',buy_requested_at=now\(\)/);
 assert.match(sql,/'neverRetryUnknown',true/);
 assert.match(sql,/BUY_ALREADY_ATTEMPTED_OR_NOT_RESERVED/);
 assert.match(sql,/where id=p_order_id and user_id=p_user_id for update/);
});
test("Emergency Stop invalidates old generations, expiring worker and broker flags cannot bypass",()=>{
 assert.match(sql,/if p_command='stop' then/);
 assert.match(sql,/set mode='stopped',observed_state='stopped',worker_id=null,lease_expires_at=null/);
 assert.match(sql,/control_version=control_version\+1/);
 assert.match(sql,/EMERGENCY_STOP_COOLDOWN/);
 assert.match(sql,/ANOTHER_WORKER_OWNS_LEASE/);
 assert.match(sql,/lease_expires_at<=now\(\)/);
 assert.match(sql,/STOPPED_OR_STALE_RUN/);
 assert.match(control,/action==="stop"/);
 assert.match(control,/SENFX_DEMO_15BOT_BROKER_EXECUTION_ENABLED!=="true"/);
 assert.match(control,/DERIV_DEMO_BROKER_BUY_ENABLED!=="true"/);
 assert.match(control,/confirmVirtualDemoAutomation!==true/);
 assert.match(control,/p_stake:chosenStake/);
 assert.match(control,/p_stake:null/);
});
test("mutual exclusion blocks old manual pilot while 15 Demo bot control is armed",()=>{
 assert.match(sql,/senfx_demo_bot_no_manual_overlap/);
 assert.match(sql,/Manual Demo purchase blocked while 15-bot auto control is armed/);
 assert.match(manual,/AUTO_DEMO_RUN_ACTIVE/);
 assert.match(manual,/senfx_demo_bot_control/);
});
test("user controls report only worker-backed state and require explicit risk acknowledgement",()=>{
 assert.match(control,/workerConnected:attached/);
 assert.match(control,/heartbeat>now-15000/);
 assert.match(control,/lease>now/);
 assert.match(control,/realMoneySupported:false/);
 assert.match(ui,/Start All 15 Demo Bots/);
 assert.match(ui,/Emergency Stop All Demo Bots/);
 assert.match(ui,/stakeAmount:stakeText/);
 assert.match(ui,/APP DAILY LOSS \/ TRADE CAPS/);
 assert.match(control,/EXPLICIT_DEMO_STAKE_AND_CONSENT_REQUIRED/);
 assert.match(ui,/workerConnected/);
 assert.match(ui,/Stop All blocks new attempts but does not reverse contracts/);
 assert.doesNotMatch(control,/session\.request\("buy"|\/ws\/real/);
 assert.doesNotMatch(ui,/session\.request\("buy"|\/ws\/real/);
});
test("staged final settlements preserve contract ID, loss risk and reject replay",()=>{
 assert.match(sql,/create or replace function public\.senfx_demo_bots_record_settlement/);
 assert.match(sql,/v_order\.status not in \('buy_unknown','open'\)/);
 assert.match(sql,/v_order\.buy_requested_at is null/);
 assert.match(sql,/realized_loss=realized_loss\+greatest\(0,-v_profit\)/);
 assert.match(sql,/senfx_demo_bot_contract_unique/);
});
