import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");

test("owner-only SENFX 15-bot Demo UI exposes Start/Stop with explicit stake and consent",()=>{
 const ui=read("app/bot-library/FifteenDemoBotControlPanel.tsx");
 const page=read("app/bot-library/FifteenPaperBotLibrary.tsx");
 assert.match(page, /<FifteenDemoBotControlPanel\/>/);
 assert.match(ui, /Start All 15 Demo Bots/);
 assert.match(ui, /Stop All/);
 assert.match(ui, /confirmVirtualDemoAutomation/);
 assert.match(ui, /validStake/);
 assert.match(ui, /realMoneySupported/);
});
test("server rejects unauthenticated or unapproved admin and real-money accounts",()=>{
 const api=read("app/api/deriv/demo/bots/control/route.ts");
 assert.match(api,/isAuthorizedDemoPilot/);
 assert.match(api,/profile\?\.role!=="admin"/);
 assert.match(api,/context\.account\.account_type/);
 assert.match(api,/context\.account\.currency/);
 assert.match(api,/SENFX_DEMO_15BOT_BROKER_EXECUTION_ENABLED/);
 assert.match(api,/DERIV_DEMO_BROKER_BUY_ENABLED/);
 assert.match(api,/SAME_ORIGIN_REQUIRED/);
 assert.match(api,/senfx_demo_bots_control/);
});
test("legacy one-shot avoids simultaneous automated account purchase",()=>{
 const old=read("app/api/deriv/demo/orders/route.ts");
 assert.match(old,/senfx_demo_bot_control/);
 assert.match(old,/DEMO_AUTO_CONTROL_SCHEMA_MISSING/);
});
test("15-bot SQL is demo-only, service-role-only, mutually exclusive with old buys",()=>{
 const sql=read("supabase/senfx-deriv-demo-15bot-execution-staged.sql");
 assert.match(sql,/active_account_type\s*<>\s*'demo'/);
 assert.match(sql,/role='admin'/);
 assert.match(sql,/senfx_demo_bot_no_manual_overlap/);
 assert.match(sql,/grant execute on function public\.senfx_demo_bots_reserve.*?to service_role/s);
 assert.match(sql,/enable row level security/);
 assert.doesNotMatch(sql,/grant execute on function public\.senfx_demo_bots_reserve.*?to\s+authenticated/s);
});