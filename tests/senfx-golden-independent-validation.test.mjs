import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 GOLDEN_RULE_MIN_FORWARD_SAMPLES,GOLDEN_RULE_HOLDOUT_SAMPLES
} from "../lib/bots/senfx-golden-rule.mjs";
import {evaluateIndependentGoldenRule} from "../lib/bots/senfx-golden-out-of-sample.mjs";
import {
 createGoldenPaperState,applyGoldenPublicTick,resetGoldenPaperFeed
} from "../lib/bots/senfx-golden-rule-research.ts";
import {FIFTEEN_BOTS} from "../lib/bots/fifteen-paper-bots.ts";
const at=2_000_000_000_000;
const discovery={
 observations:1000,wins:800,
 quote:{askPrice:5,payout:9.1},quoteAsOfMs:at-1_000,nowMs:at,
 demoBalance:1000,demoBalanceAsOfMs:at-1_000,stake:5,
 termsMatch:true,brokerAligned:true,feedFresh:true
};
const holdout={
 holdoutObservations:300,holdoutWins:240,holdoutLosses:60,
 holdoutFirstEntryEpoch:21000,discoveryLastScoredEpoch:20000
};
const evaluate=(d=discovery,h=holdout)=>
 evaluateIndependentGoldenRule({discovery:d,...h});
const tick=(epoch,digit=3)=>({
 symbol:"1HZ10V",epoch,price:100.03,pipSize:2,
 digit,quoteText:"100.03",tickId:String(epoch)
});
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");

test("fixed 1000 discovery and disjoint 300 holdout for 15 original bots",()=>{
 assert.equal(GOLDEN_RULE_MIN_FORWARD_SAMPLES,1000);
 assert.equal(GOLDEN_RULE_HOLDOUT_SAMPLES,300);
 assert.equal(FIFTEEN_BOTS.length,15);
 const state=createGoldenPaperState();
 for(const bot of FIFTEEN_BOTS){
  const r=state.bots[bot.id];
  assert.equal(r.observations,0);
  assert.equal(r.holdoutObservations,0);
  assert.equal(r.holdoutFirstEntryEpoch,0);
 }
});
test("holdout is necessary even if discovery looks excellent",()=>{
 const good=evaluate();
 assert.equal(good.researchCandidate,true);
 assert.equal(good.holdoutPayoutQuality,true);
 assert.ok(good.holdoutConservativeLower>good.quotedBreakEven+0.02);
 for(const change of [
  {holdoutObservations:299,holdoutWins:239,holdoutLosses:60},
  {holdoutObservations:300,holdoutWins:200,holdoutLosses:100},
  {holdoutObservations:301,holdoutWins:280,holdoutLosses:21},
  {holdoutObservations:300,holdoutWins:240,holdoutLosses:59},
  {holdoutFirstEntryEpoch:20000},
  {discoveryLastScoredEpoch:22000},
  {holdoutFirstEntryEpoch:0}
 ]){
  const result=evaluate(discovery,{...holdout,...change});
  assert.equal(result.researchCandidate,false,JSON.stringify(change));
 }
});
test("real payout economics, exact original broker terms and freshness must all pass",()=>{
 assert.equal(evaluate({...discovery,quote:{askPrice:5,payout:5.1}}).researchCandidate,false);
 assert.equal(evaluate({...discovery,quote:{askPrice:5,payout:4}}).researchCandidate,false);
 assert.equal(evaluate({...discovery,quote:{askPrice:5,payout:5}}).researchCandidate,false);
 assert.equal(evaluate({...discovery,quoteAsOfMs:at-16_000}).researchCandidate,false);
 assert.equal(evaluate({...discovery,termsMatch:false}).researchCandidate,false);
 assert.equal(evaluate({...discovery,stake:6,quote:{askPrice:6,payout:10.92}}).researchCandidate,false);
 assert.equal(evaluate({...discovery,brokerAligned:false}).researchCandidate,false);
 assert.equal(evaluate({...discovery,feedFresh:false}).researchCandidate,false);
 assert.equal(evaluate({...discovery,wins:530}).researchCandidate,false);
 assert.equal(evaluate().quotedNetWin,4.1);
 assert.equal(evaluate().quotedFullStakeLoss,5);
});
test("actual forward paper collector freezes discovery then scores exactly 300 later holdout outcomes",()=>{
 let state=createGoldenPaperState();
 const e=2_000_000_000;
 let discovered=null;
 let done=false;
 for(let i=0;i<14_500;i++){
  const epoch=e+i;
  state=applyGoldenPublicTick(state,tick(epoch),(epoch)*1000);
  const b=state.bots["digit-under-5"];
  if(b.observations===1000&&discovered===null)
   discovered={wins:b.wins,losses:b.losses,epoch:b.lastScoredEpoch};
  if(discovered){
   assert.equal(b.observations,1000);
   assert.equal(b.wins,discovered.wins);
   assert.equal(b.losses,discovered.losses);
  }
  if(b.holdoutObservations===300){done=true;break;}
 }
 assert.ok(done,"must eventually reach a future-only held-out cohort");
 const bot=state.bots["digit-under-5"];
 assert.deepEqual([bot.observations,bot.wins,bot.losses],[1000,1000,0]);
 assert.deepEqual([bot.holdoutObservations,bot.holdoutWins,bot.holdoutLosses],[300,300,0]);
 assert.ok(bot.holdoutFirstEntryEpoch>discovered.epoch);
 assert.equal(bot.pending,null);
 const prev=bot;
 for(let j=1;j<=20;j++){
  const epoch=state.lastEpoch["1HZ10V"]+1;
  state=applyGoldenPublicTick(state,tick(epoch),epoch*1000);
 }
 assert.deepEqual(state.bots["digit-under-5"],prev);
});
test("reconnect clears unconfirmed holdout hypotheses and does not invent outcomes",()=>{
 let s=createGoldenPaperState();
 const b=s.bots["digit-under-5"];
 s={...s,bots:{...s.bots,"digit-under-5":{
  ...b,observations:1000,wins:650,losses:350,lastScoredEpoch:10000,
  holdoutFirstEntryEpoch:10020,holdoutObservations:45,
  holdoutWins:20,holdoutLosses:25,pending:{
   signal:{kind:"digit",prediction:"UNDER",barrier:5,entryPrice:1},
   startEpoch:11000,expiryEpoch:11001
  }
 }}};
 const reset=resetGoldenPaperFeed(s);
 assert.equal(reset.bots["digit-under-5"].pending,null);
 assert.equal(reset.bots["digit-under-5"].holdoutObservations,45);
 assert.equal(reset.bots["digit-under-5"].voids,1);
 assert.equal(reset.history["1HZ10V"],undefined);
});
test("screen is research only; broker does not receive new purchase permissions",()=>{
 const ui=read("app/bot-library/golden-rule/GoldenRuleLab.tsx");
 const pure=read("lib/bots/senfx-golden-out-of-sample.mjs");
 const tracker=read("lib/bots/senfx-golden-rule-research.ts");
 const route=read("app/api/deriv/demo/bots/payout-preview/route.ts");
 assert.match(ui,/evaluateIndependentGoldenRule/);
 assert.match(ui,/holdoutObservations/);
 assert.match(ui,/brokerAligned:false/);
 assert.match(ui,/q\.duration===expected\.duration/);
 assert.match(ui,/q\.durationUnit===expected\.duration_unit/);
 assert.match(route,/duration:proposal\.duration,durationUnit:proposal\.duration_unit/);
 assert.match(tracker,/holdoutFirstEntryEpoch/);
 assert.doesNotMatch(pure,/WebSocket|fetch\(|process\.env|request\(|buy:|\.insert\(/);
 for(const text of [ui,tracker,pure,route]){
  assert.doesNotMatch(text,/\/ws\/real|session\.request\(["']buy|DERIV_TOKEN_ENCRYPTION_KEY|\/api\/deriv\/demo\/bots\/control/);
 }
});
