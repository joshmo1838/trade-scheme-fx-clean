import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=(path)=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const worker=read("worker/senfx-deriv-demo-15bot-worker.mjs");
const migration=read("supabase/senfx-deriv-demo-5s-cooldown-20261122.sql");

test("5s owner-only Demo setting cannot be modified while any Demo purchase is unresolved",()=>{
 assert.match(migration,/lock table public\.senfx_demo_bot_control in share row exclusive mode/);
 assert.match(migration,/mode='running'/);
 assert.equal((migration.match(/status in \('reserved','buy_unknown','open'\)/g)||[]).length,2);
 assert.match(migration,/raise exception 'Virtual Demo cooldown can only be changed/);
 assert.match(migration,/check \(cooldown_seconds>=5\)/);
 assert.match(migration,/alter column cooldown_seconds set default 5/);
 assert.match(migration,/where c\.mode='stopped'/);
 assert.match(migration,/p\.role='admin'/);
 assert.doesNotMatch(migration,/DELETE FROM|TRUNCATE|DROP TABLE|UPDATE public\.senfx_demo_bot_orders/i);
});

test("only reduce interval after settled trades; never allow concurrent buys, real-money or unknown buy retries",()=>{
 assert.match(worker,/MIN_DEMO_BUY_COOLDOWN_MS=5_000/);
 assert.match(worker,/now-lastBuyAt<cooldownMs\|\|now-lastCandidateAt<cooldownMs/);
 assert.match(worker,/if\(busy\|\|finishing\|\|!Number\.isSafeInteger\(activeVersion\)/);
 assert.match(worker,/active_account_type!=="demo"/);
 assert.match(worker,/url\.pathname!=="\/trading\/v1\/options\/ws\/demo"/);
 assert.match(worker,/getUnresolvedOrderCount\(\)/);
 assert.match(worker,/senfx_demo_bots_reserve/);
 assert.match(worker,/senfx_demo_bots_mark_attempt/);
 assert.match(worker,/No retry of buy under ANY failure/);
 assert.match(worker,/await reconcilePurchased\(/);
 assert.match(worker,/if\(controlRow\?\.selected_bot_id&&bot\.id!==controlRow\.selected_bot_id\)continue/);
 assert.equal((worker.match(/session\.request\("buy"/g)||[]).length,1);
});
