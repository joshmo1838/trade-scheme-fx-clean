import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=(p)=>readFileSync(new URL("../"+p,import.meta.url),"utf8");

test("existing selected strategy card exposes real Deriv virtual Demo controls, paper simulator preserved",()=>{
 const page=read("app/bot-library/FifteenPaperBotLibrary.tsx");
 const panel=read("app/bot-library/FifteenDemoIndividualControl.tsx");
 assert.match(page,/FifteenDemoIndividualControl botId=\{selected\.id\} botName=\{selected\.name\}/);
 assert.match(page,/REAL NEXT-TICK PAPER SIMULATOR/);
 assert.match(panel,/Start Selected Demo Bot/);
 assert.match(panel,/Stop Selected Demo Bot/);
 assert.match(panel,/targetTrades:total/);
 assert.match(panel,/confirmVirtualDemoAutomation:action==="start_one"&&approved/);
 assert.match(panel,/broker results/);
 assert.match(panel,/Real-money trading is disabled/);
});
test("owner-only Demo API validates explicit selected broker bot and finite trade target",()=>{
 const api=read("app/api/deriv/demo/bots/control/route.ts");
 assert.match(api,/isAuthorizedDemoPilot/);
 assert.match(api,/profile\?\.role!=="admin"/);
 assert.match(api,/getDerivDemoContext/);
 assert.match(api,/context\.account\.account_type!=="demo"/);
 assert.match(api,/context\.account\.currency!=="USD"/);
 assert.match(api,/SENFX_DEMO_BOT_TEMPLATES\.some\(/);
 assert.match(api,/body\.targetTrades>200/);
 assert.match(api,/body\.confirmVirtualDemoAutomation!==true/);
 assert.match(api,/db\.rpc\("senfx_demo_bots_start_one"/);
 assert.match(api,/SAME_ORIGIN_REQUIRED/);
});
test("individual selected bot DB migration is additive, atomic, and preserves server-only ownership",()=>{
 const sql=read("supabase/senfx-deriv-demo-individual-controls-20261121.sql");
 assert.match(sql,/add column if not exists selected_bot_id text/);
 assert.match(sql,/add column if not exists target_trades integer/);
 assert.match(sql,/v_start:=public\.senfx_demo_bots_control/);
 assert.match(sql,/INDIVIDUAL_BOT_SELECTION_MISMATCH/);
 assert.match(sql,/INDIVIDUAL_BOT_TARGET_REACHED/);
 assert.match(sql,/grant execute on function public\.senfx_demo_bots_start_one[\s\S]*?to service_role/);
 assert.doesNotMatch(sql,/drop table|truncate table|delete from public\.deriv_demo_orders/i);
 assert.doesNotMatch(sql,/grant execute on function public\.senfx_demo_bots_start_one[\s\S]*?to authenticated/i);
});