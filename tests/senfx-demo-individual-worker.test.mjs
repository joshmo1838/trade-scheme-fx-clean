import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const worker=readFileSync(new URL("../worker/senfx-deriv-demo-15bot-worker.mjs",import.meta.url),"utf8");
const migration=readFileSync(new URL("../supabase/senfx-deriv-demo-15bot-execution-staged.sql",import.meta.url),"utf8");
test("individual Deriv Demo worker selects only one configured bot",()=>{
 assert.match(worker,/selected_bot_id/);
 assert.match(worker,/if\(controlRow\?\.selected_bot_id&&bot\.id!==controlRow\.selected_bot_id\)continue/);
 assert.match(worker,/if\(bot\.id!==controlRow\.selected_bot_id\)return/);
 assert.match(worker,/getAttemptedCount\(version\)>=Number\(controlRow\.target_trades\)/);
});
test("individual trades end at configured count, worker stays ready for next selected run",()=>{
 assert.match(worker,/async function finishSelectedRun\(/);
 assert.match(worker,/p_command:"stop"/);
 assert.match(worker,/clearIdleSession\(reason\)/);
 assert.match(worker,/Selected bot reached its settled-trade target/);
 assert.match(worker,/Selected bot completed its requested broker trade count/);
 assert.match(worker,/clearIdleSession\("Operator stopped Demo automation\."\)/);
});
test("individual broker execution preserves single-attempt Demo and original safety guards",()=>{
 assert.match(worker,/url\.pathname!=="\/trading\/v1\/options\/ws\/demo"/);
 assert.match(worker,/active_account_type!=="demo"/);
 assert.match(worker,/const unresolved=await getUnresolvedOrderCount\(\)/);
 assert.match(worker,/await reconcilePurchased\(/);
 assert.match(worker,/No retry of buy under ANY failure/);
 assert.match(worker,/FEED_RECONNECT_LIMIT=3/);
 assert.equal((worker.match(/session\.request\("buy"/g)||[]).length,1);
});

test("an old Demo worker cannot stop a newer run; owner Emergency Stop stays unconditional",()=>{
 const scopedStops=worker.match(/p_command:"stop",p_expected_version:activeVersion,p_stake:null/g)||[];
 assert.equal(scopedStops.length,2,"normal completion and safety-stop both carry worker generation");
 assert.match(migration,/if p_expected_version is not null and/);
 assert.match(migration,/v_control.control_version<>p_expected_version or v_control.mode<>'running'/);
 assert.match(migration,/STALE_WORKER_STOP_IGNORED/);
 assert.match(migration,/if p_command='stop' then/);
});
