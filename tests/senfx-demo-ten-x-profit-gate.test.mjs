import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 newRecoveryState,settleRecovery,recordFreshRecoveryTick,recoveryReady,tenXChecks,
 RECOVERY_MIN_PAUSE_MS,RECOVERY_FRESH_TICKS,RECOVERY_CONFIRMATIONS,
 MAX_CONSECUTIVE_LOSSES,SESSION_MAX_LOSSES
} from "../lib/deriv/demo-ten-x-profit-gate.mjs";

const at=2_000_000_000_000;
const signal={kind:"digit",prediction:"OVER",barrier:4,entryPrice:100.01};
const mkTick=(time,n)=>({epoch:Math.floor(time/1000),price:100+n*0.001,digit:5});

function recoveryWithTicks(base,amount=RECOVERY_FRESH_TICKS){
 let state=base;
 for(let i=0;i<amount;i++){
  const now=base.since+((60+i)*1000);
  state=recordFreshRecoveryTick(state,mkTick(now,i),signal,now);
 }
 return state;
}
function sample(now,amount=40){
 return Array.from({length:amount},(_,i)=>({
  epoch:Math.floor(now/1000)-amount+i+1,price:100+i/100,digit:5
 }));
}
function ready(now=at){
 return {
  now,account:{account_type:"demo",currency:"USD",status:"active",balance:500},
  flags:{authorized:true,realMoneyDisabled:true},
  control:{mode:"running",control_version:3},leaseOwned:true,
  stake:25,bot:{market:"R_100",minTicks:32},
  signal,proposal:{underlying_symbol:"R_100",barrier:"4",contract_type:"DIGITOVER"},
  quote:{id:"a".repeat(40),ask_price:25,payout:45},
  marketHistory:sample(now),recovery:newRecoveryState(),
  unresolvedCount:0,previousBuyAt:now-20_000
 };
}
test("exactly 10 mandatory pre-buy validations pass only for clean verified Demo state",()=>{
 const result=tenXChecks(ready());
 assert.equal(result.passed,true);
 assert.equal(result.checks.length,10);
 assert.equal(result.failed.length,0);
 for(const alteration of [
  {account:{account_type:"real",currency:"USD",status:"active",balance:500}},
  {flags:{authorized:false,realMoneyDisabled:true}},
  {leaseOwned:false},
  {stake:1000},
  {marketHistory:sample(at-30_000)},
  {marketHistory:[...sample(at,40),sample(at,40)[39]]},
  {proposal:{underlying_symbol:"R_25",barrier:"4"}},
  {unresolvedCount:1},
  {recovery:{...newRecoveryState(),armed:true,since:at}},
  {quote:{ask_price:25,payout:26.54}}
 ]){
  const q=tenXChecks({...ready(),...alteration});
  assert.equal(q.passed,false,JSON.stringify(alteration));
  assert.ok(q.failed.length>=1);
 }
});
test("one loss requires two minutes, 64 freshly observed ticks and three confirmations",()=>{
 let state=settleRecovery(newRecoveryState(),{
  finalStatus:"lost",profit:-25,settledAt:at
 });
 assert.equal(state.armed,true);
 assert.equal(state.consecutiveLosses,1);
 assert.equal(recoveryReady(state,at+RECOVERY_MIN_PAUSE_MS-1),false);
 const almost=recoveryWithTicks(state,RECOVERY_FRESH_TICKS-1);
 assert.equal(recoveryReady(almost,at+RECOVERY_MIN_PAUSE_MS+1),false);
 state=recoveryWithTicks(state);
 assert.equal(state.postLossTicks,RECOVERY_FRESH_TICKS);
 assert.ok(state.confirmations>=RECOVERY_CONFIRMATIONS);
 assert.equal(recoveryReady(state,at+RECOVERY_MIN_PAUSE_MS-1),false);
 assert.equal(recoveryReady(state,at+RECOVERY_MIN_PAUSE_MS+1),true);
});
test("stale, repeated or future ticks cannot accelerate recovery",()=>{
 const state=settleRecovery(newRecoveryState(),{
  finalStatus:"lost",profit:-25,settledAt:at
 });
 const good=recordFreshRecoveryTick(state,mkTick(at+61_000,1),signal,at+61_000);
 const repeat=recordFreshRecoveryTick(good,mkTick(at+61_000,1),signal,at+61_000);
 const old=recordFreshRecoveryTick(good,mkTick(at+50_000,1),signal,at+61_000);
 const future=recordFreshRecoveryTick(good,mkTick(at+63_000,1),signal,at+61_000);
 assert.equal(good.postLossTicks,1);
 for(const x of [repeat,old,future])assert.equal(x.postLossTicks,1);
});
test("inconsistent signals erase confirmation streak; a win resets consecutive-loss counter",()=>{
 let s=settleRecovery(newRecoveryState(),{finalStatus:"lost",profit:-25,settledAt:at});
 s=recordFreshRecoveryTick(s,mkTick(at+61_000,1),signal,at+61_000);
 s=recordFreshRecoveryTick(s,mkTick(at+62_000,2),{...signal,prediction:"UNDER",barrier:5},at+62_000);
 assert.equal(s.confirmations,1);
 s=settleRecovery(s,{finalStatus:"won",profit:15,settledAt:at+90_000});
 assert.equal(s.armed,false);
 assert.equal(s.consecutiveLosses,0);
 assert.equal(s.netProfit,-10);
});
test("two sequential losses or three losses in a run hard stop, no Martingale",()=>{
 let s=newRecoveryState();
 for(let i=0;i<MAX_CONSECUTIVE_LOSSES;i++)
  s=settleRecovery(s,{finalStatus:"lost",profit:-25,settledAt:at+i*1000});
 assert.equal(s.hardStop,true);
 assert.equal(recoveryReady(s,at+300_000),false);
 s=newRecoveryState();
 for(let i=0;i<SESSION_MAX_LOSSES;i++){
  s=settleRecovery(s,{finalStatus:"lost",profit:-25,settledAt:at+i*3000});
  if(i<SESSION_MAX_LOSSES-1)
   s=settleRecovery(s,{finalStatus:"won",profit:1.54,settledAt:at+i*3000+1000});
 }
 assert.equal(s.hardStop,true);
 assert.equal(s.totalLosses,SESSION_MAX_LOSSES);
});
test("worker runs the 10X gate before the broker reservation and irreversible once-only buy marker",()=>{
 const worker=readFileSync(new URL("../worker/senfx-deriv-demo-15bot-worker.mjs",import.meta.url),"utf8");
 assert.match(worker,/tenXChecks\(/);
 assert.match(worker,/if\(!checks\.passed\)/);
 const buyGate=worker.indexOf("const checks=tenXChecks(");
 const reserve=worker.indexOf('rpc("senfx_demo_bots_reserve"');
 const mark=worker.indexOf('rpc("senfx_demo_bots_mark_attempt"');
 const buy=worker.indexOf('session.request("buy"');
 assert.ok(buyGate>0&&reserve>buyGate&&mark>reserve&&buy>mark);
 assert.match(worker,/await finishSelectedRun\("10X protective stop:/);
 assert.match(worker,/recoveryState=settleRecovery\(/);
 assert.match(worker,/recordFreshRecoveryTick\(/);
 assert.match(worker,/stopFeed\(\)/);
 assert.match(worker,/postLossTicks:0,confirmations:0/);
 assert.match(worker,/active_account_type!=="demo"/);
 assert.match(worker,/url\.pathname!=="\/trading\/v1\/options\/ws\/demo"/);
 assert.match(worker,/No retry of buy under ANY failure/);
 assert.equal((worker.match(/session\.request\("buy"/g)||[]).length,1);
});


test("isolated Railway Docker image must include every new worker dependency and default to no trading",()=>{
 const docker=readFileSync(new URL("../worker/Dockerfile.demo15",import.meta.url),"utf8");
 assert.match(docker,/COPY lib\/deriv\/demo-ten-x-profit-gate\.mjs \.\/lib\/deriv\/demo-ten-x-profit-gate\.mjs/);
 assert.match(docker,/COPY lib\/deriv\/demo-15bot-worker-safety\.mjs \.\/lib\/deriv\/demo-15bot-worker-safety\.mjs/);
 assert.match(docker,/COPY worker\/senfx-deriv-demo-15bot-worker\.mjs \.\/worker\/senfx-deriv-demo-15bot-worker\.mjs/);
 assert.match(docker,/USER node/);
 assert.match(docker,/CMD \["node", "--experimental-strip-types", "senfx-deriv-demo-15bot-worker\.mjs"\]/);
 assert.doesNotMatch(docker,/ENV SENFX_DEMO_15BOT_BROKER_EXECUTION_ENABLED=true|ENV DERIV_DEMO_BROKER_BUY_ENABLED=true/);
});
