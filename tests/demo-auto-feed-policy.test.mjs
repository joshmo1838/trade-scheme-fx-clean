import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {decideDemoFeedRecovery,DEMO_FEED_RECOVERY} from "../lib/deriv/demo-auto-feed-policy.mjs";

const input={elapsedMs:30_000,reconnectsUsed:0,buyAttemptStarted:false,emergencyStopped:false};
test("temporary public-feed outages recover with bounded exponential backoff",()=>{
 const delays=[1000,2000,4000,8000];
 for(let i=0;i<delays.length;i++){
  const result=decideDemoFeedRecovery({...input,reconnectsUsed:i});
  assert.equal(result.action,"reconnect");
  assert.equal(result.delayMs,delays[i]);
  assert.equal(result.reason,"RESET_HISTORY_AND_RESTART_PUBLIC_FEED_ONLY");
 }
 assert.equal(DEMO_FEED_RECOVERY.maxRecoveries,4);
 assert.equal(DEMO_FEED_RECOVERY.maxSearchMs,900000);
});
test("stop/future-buy/invalid state and exhausted feed-recovery budget always fail closed",()=>{
 for(const state of [
  {...input,buyAttemptStarted:true},
  {...input,emergencyStopped:true},
  {...input,reconnectsUsed:4},
  {...input,elapsedMs:900000},
  {...input,elapsedMs:-1},
  {...input,reconnectsUsed:0.5},
  {...input,buyAttemptStarted:undefined},
 ]){
  assert.equal(decideDemoFeedRecovery(state).action,"stop");
 }
});
test("autonomous entry scanner resets history on reconnect and only buys once",()=>{
 const client=readFileSync(new URL("../app/components/DemoAutoPilot.tsx",import.meta.url),"utf8");
 assert.match(client,/history\.current=\[\];lastReceived\.current=0/);
 assert.match(client,/recoverPublicFeed\("A delayed public tick arrived"\)/);
 assert.match(client,/recoverPublicFeed\("No fresh ticks for 15 seconds"\)/);
 assert.match(client,/const generation=socketGeneration\.current/);
 assert.match(client,/if\(stopped\.current\|\|buyStarted\.current\|\|generation!==socketGeneration\.current\)return/);
 assert.match(client,/if\(stopped\.current\|\|buyStarted\.current\|\|recoveryPending\.current\)return/);
 assert.match(client,/if\(evaluation\.eligible\)/);
 assert.match(client,/void executeSingleCandidate\(evaluation\)/);
 assert.match(client,/buyStarted\.current=true/);
 assert.doesNotMatch(client,/\bautoRetryBuy\b|\bbuyAgain\b/);
});
