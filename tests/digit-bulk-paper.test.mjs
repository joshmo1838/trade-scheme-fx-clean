import assert from "node:assert/strict";
import test from "node:test";
import {
 armDigitPaperBatch,observeDigitPaperTick,stopDigitPaperBatch,paperBatchSummary
} from "../lib/bots/digit-bulk-paper.ts";
import {parsePublicDigitTick} from "../lib/bots/digit-matrix.ts";

const now=1_800_000_000_000;
const epoch=Math.floor(now/1000);
const inputs={symbol:"R_100",side:"EVEN",stake:10,count:3,dailyCap:30,
 lastObservedEpoch:epoch,lastObservedAtMs:now,nowMs:now};
function arm(overrides={}){return armDigitPaperBatch({...inputs,...overrides});}
function tick(epochOffset,digit,symbol="R_100"){
 const quote=100+digit/100;
 const raw={msg_type:"tick",tick:{
  symbol,quote,pip_size:2,epoch:epoch+epochOffset,
  id:"observed-"+symbol+"-"+epochOffset
 }};
 const result=parsePublicDigitTick(raw,now+epochOffset*1000);
 assert.ok(result,"Public tick fixture must parse via quote precision");
 return result;
}
test("fails closed unless market, stake, batch, budget and fresh quote are valid",()=>{
 for(const options of [
  {symbol:"UNKNOWN"}, {side:"OVER"},{stake:1000},{count:11},
  {dailyCap:29},{lastObservedEpoch:0},
  {lastObservedAtMs:now-16_000},{lastObservedAtMs:now+1},
  {lastObservedEpoch:epoch+20},
 ])assert.equal(arm(options).ok,false,JSON.stringify(options));
 const result=arm();
 assert.equal(result.ok,true);
 if(result.ok){
  assert.equal(result.batch.entries.length,0);
  assert.equal(result.batch.state,"running");
 }
});

test("one real future tick settles at most one hypothetical parity experiment",()=>{
 const result=arm();
 assert.equal(result.ok,true);
 if(!result.ok)return;
 let batch=result.batch;
 const initial=batch;
 batch=observeDigitPaperTick(batch,tick(0,2),now);
 assert.equal(batch,initial,"Starting quote must not be backfilled");
 const first=tick(1,4);
 batch=observeDigitPaperTick(batch,first,now+1000);
 assert.equal(batch.entries.length,1);
 assert.equal(batch.entries[0].observedDigit,4);
 assert.equal(batch.entries[0].matchingParity,true);
 assert.equal(batch.entries[0].stakeAtRisk,10);
 const duplicate=observeDigitPaperTick(batch,first,now+1000);
 assert.equal(duplicate,batch,"Duplicate subscription event cannot settle twice");
 const outOfOrder=observeDigitPaperTick(batch,tick(0,1),now+1000);
 assert.equal(outOfOrder,batch);
 batch=observeDigitPaperTick(batch,tick(2,7,"R_50"),now+2000);
 assert.equal(batch.entries.length,1,"Different index cannot settle this batch");
 batch=observeDigitPaperTick(batch,tick(2,7),now+2000);
 assert.equal(batch.entries.length,2);
 assert.equal(batch.entries[1].matchingParity,false);
 batch=observeDigitPaperTick(batch,tick(3,0),now+3000);
 assert.equal(batch.state,"completed");
 assert.equal(batch.entries.length,3);
 assert.deepEqual(paperBatchSummary(batch),{
  completed:3,remaining:0,hits:2,misses:1,observedStake:30,maximumBudgetedStake:30,
 });
 assert.equal(observeDigitPaperTick(batch,tick(4,6),now+4000),batch);
});
test("feed outage, Stop or stale tick cannot create ghost paper trades",()=>{
 const init=arm({count:2,dailyCap:20});
 assert.equal(init.ok,true);
 if(!init.ok)return;
 const stale=observeDigitPaperTick(init.batch,tick(1,4),now+16_000);
 assert.equal(stale,init.batch);
 const stopped=stopDigitPaperBatch(init.batch,"Feed disconnected.");
 assert.equal(stopped.state,"stopped");
 assert.equal(stopped.stopReason,"Feed disconnected.");
 assert.equal(observeDigitPaperTick(stopped,tick(1,4),now+1000),stopped);
 assert.equal(stopDigitPaperBatch(stopped),stopped);
});
test("EVEN and ODD evaluation does not invent payout or profit",()=>{
 const result=arm({side:"ODD",count:1,dailyCap:10});
 assert.equal(result.ok,true);
 if(!result.ok)return;
 const next=observeDigitPaperTick(result.batch,tick(1,5),now+1000);
 assert.equal(next.entries[0].matchingParity,true);
 assert.equal("pnl" in next.entries[0],false);
 assert.equal("payout" in next.entries[0],false);
});
test("bulk implementation has no broker transactions or private credentials",()=>{
 const {readFileSync}=await import("node:fs");
 const file=readFileSync(new URL("../lib/bots/digit-bulk-paper.ts",import.meta.url),"utf8");
 assert.doesNotMatch(file,/\bbuy\s*:|["']\/api\/deriv\/buy|SUPABASE_SERVICE_ROLE_KEY|OAuth|price\s*guarantee/i);
});
