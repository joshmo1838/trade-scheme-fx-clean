import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const client=readFileSync(new URL("../app/components/DemoAutoPilot.tsx",import.meta.url),"utf8");
const server=readFileSync(new URL("../app/api/deriv/demo/orders/route.ts",import.meta.url),"utf8");
const panel=readFileSync(new URL("../app/components/DemoTradingConsole.tsx",import.meta.url),"utf8");

test("Demo auto bot starts only after user interaction and never retries a purchase",()=>{
 assert.match(client,/onClick=\{begin\}/);
 assert.match(client,/Start \$1 Demo auto bot/);
 assert.match(client,/buyStarted\.current=true/);
 assert.match(client,/if\(stopped\.current\|\|buyStarted\.current\|\|generation!==socketGeneration\.current\)return/);
 assert.match(client,/if\(evaluation\.eligible\)/);
 assert.match(client,/void executeSingleCandidate\(evaluation\)/);
 assert.match(client,/if\(!ready\|\|virtualBalance<1/);
});
test("client research has browser-local public ticks and no secrets or direct broker API",()=>{
 assert.match(client,/ws\/public/);
 assert.match(client,/assessDemoAiCandidate\(/);
 assert.doesNotMatch(client,/SUPABASE_SERVICE_ROLE_KEY|DERIV_TOKEN|ws\/demo|\/trading\/v1\/options\/accounts\/|fetch\([^)]*derivws/);
});
test("Demo order route still enforces broker buy gate and server-side account checks",()=>{
 assert.match(server,/DERIV_DEMO_BROKER_BUY_ENABLED/);
 assert.match(server,/getDerivDemoContext\(\)/);
 assert.match(server,/senfx_demo_reserve_order/);
 assert.match(server,/buy_requested_at/);
 assert.match(server,/autoPilotReady/);
});
test("SENFX Demo console shows automation as part of same authenticated workspace",()=>{
 assert.match(panel,/import DemoAutoPilot/);
 assert.match(panel,/<DemoAutoPilot ready=\{ready && autoPilotReady/);
});

test("new Demo auto phase is a separate one-shot after two settled buys",()=>{
 assert.match(server,/senfx_demo_auto_phase3_one_shots/);
 assert.match(server,/priorAttemptCount === 2 && validPhase3Grant/);
 assert.match(server,/autoGrant\?\.status === "reserved"/);
 assert.match(server,/NEW_ONE_SHOT_DEMO_AUTHORIZATION_REQUIRED/);
 assert.match(client,/style=\{\{opacity:canStart\?1:0\.48/);
 assert.match(client,/disabled=\{!canStart\}/);
});
