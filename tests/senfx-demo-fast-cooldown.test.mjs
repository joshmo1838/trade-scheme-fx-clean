import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const worker=read("worker/senfx-deriv-demo-15bot-worker.mjs");
const migration=read("supabase/senfx-deriv-demo-10s-cooldown-20261121.sql");

test("broker worker uses a version-locked 5s minimum cooldown from control row",()=>{
 assert.match(worker,/const MIN_DEMO_BUY_COOLDOWN_MS=5_000/);
 assert.match(worker,/cooldown_seconds,mode,control_version/);
 assert.match(worker,/Math\.max\(MIN_DEMO_BUY_COOLDOWN_MS,Number\(controlRow\?\.cooldown_seconds\|\|10\)\*1000\)/);
 assert.match(worker,/now-lastBuyAt<cooldownMs\|\|now-lastCandidateAt<cooldownMs/);
 assert.doesNotMatch(worker,/now-lastBuyAt<30_000\|\|now-lastCandidateAt<30_000/);
});

test("database enforces server-controlled cooldown with one unsettled order and per-bot target",()=>{
 assert.match(migration,/check \(cooldown_seconds>=10\)/);
 assert.match(migration,/alter column cooldown_seconds set default 10/);
 assert.match(migration,/make_interval\(secs=>v_control\.cooldown_seconds\)/);
 assert.match(migration,/ANTI_DUPLICATE_COOLDOWN/);
 assert.match(migration,/UNRESOLVED_ORDER_ACROSS_BOTS/);
 assert.match(migration,/INDIVIDUAL_BOT_TARGET_REACHED/);
 assert.match(migration,/INDIVIDUAL_BOT_SELECTION_MISMATCH/);
 assert.match(migration,/raise exception 'Cannot change virtual Demo cooldown during an active or unsettled session'/);
 assert.match(migration,/revoke all on function public\.senfx_demo_bots_reserve/);
 assert.match(migration,/to service_role/);
 assert.doesNotMatch(migration,/drop table|truncate table|delete from public\.senfx_demo_bot_orders/i);
});

test("faster public tick evaluation never removes broker safety or changes real-money gate",()=>{
 assert.match(worker,/active_account_type!=="demo"/);
 assert.match(worker,/url\.pathname!=="\/trading\/v1\/options\/ws\/demo"/);
 assert.match(worker,/!await verifyLease\(version\)/);
 assert.match(worker,/No retry of buy under ANY failure/);
 assert.match(worker,/getUnresolvedOrderCount\(\)/);
 assert.match(worker,/const marker=await rpc\("senfx_demo_bots_mark_attempt"/);
 assert.equal((worker.match(/session\.request\("buy"/g)||[]).length,1);
 assert.match(worker,/!feedReady\|\|!feed/);
 assert.match(worker,/hist\.length<bot\.minTicks/);
 assert.match(worker,/busy\|\|finishing/);
});
