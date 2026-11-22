import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 GOLDEN_RULE_MIN_FORWARD_SAMPLES,GOLDEN_RULE_FAMILYWISE_Z,
 wilsonConservativeLower,evaluateGoldenRule
} from "../lib/bots/senfx-golden-rule.mjs";
import {
 createGoldenPaperState,applyGoldenPublicTick,resetGoldenPaperFeed,
 goldenExpectedTickSeconds
} from "../lib/bots/senfx-golden-rule-research.ts";
import {FIFTEEN_BOTS} from "../lib/bots/fifteen-paper-bots.ts";

const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const now=2_000_000_000_000;
const base={
 observations:1000,wins:650,
 quote:{askPrice:5,payout:9.1},
 quoteAsOfMs:now-2_000,nowMs:now,
 demoBalance:1000,demoBalanceAsOfMs:now-5_000,
 stake:5,termsMatch:true,brokerAligned:true,feedFresh:true
};
const tick=(symbol,epoch,digit=4,price=100)=>({
 symbol,epoch,digit,price,pipSize:2,quoteText:price.toFixed(2),tickId:String(epoch)
});

test("Golden Rule defaults fail-closed and never equates a high win count with profit",()=>{
 assert.equal(GOLDEN_RULE_MIN_FORWARD_SAMPLES,1000);
 assert.ok(GOLDEN_RULE_FAMILYWISE_Z>2.5);
 const none=evaluateGoldenRule();
 assert.equal(none.researchCandidate,false);
 assert.ok(none.blocked.length>=5);
 const matches=evaluateGoldenRule({
  ...base,wins:100,quote:{askPrice:5,payout:33.334}
 });
 assert.equal(matches.researchCandidate,false);
 assert.ok(matches.conservativeLower<matches.brokerBreakEven);
 const falsePositive=evaluateGoldenRule({
  ...base,wins:995,quote:{askPrice:5,payout:5.02}
 });
 assert.equal(falsePositive.researchCandidate,false);
 assert.ok(falsePositive.conservativeLower<falsePositive.brokerBreakEven);
});
test("adjusted lower confidence bound is smaller than naive win rate",()=>{
 assert.equal(wilsonConservativeLower(0,1000),0);
 assert.ok(wilsonConservativeLower(500,1000)>0.45);
 assert.ok(wilsonConservativeLower(500,1000)<0.50);
 assert.ok(wilsonConservativeLower(500,1000,2.713)<wilsonConservativeLower(500,1000,1.645));
 for(const bad of [[-1,100],[5,-2],[10,9],[1.1,100]])assert.equal(wilsonConservativeLower(...bad),null);
});
test("only 1000 valid unseen observations + fresh real quote + 0.5% sizing can produce a PAPER candidate",()=>{
 assert.equal(evaluateGoldenRule(base).researchCandidate,true);
 const blocked=[
  {observations:999,wins:650},
  {wins:600},
  {quoteAsOfMs:now-16_000},
  {demoBalanceAsOfMs:now-61_000},
  {demoBalance:999},
  {stake:6,quote:{askPrice:6,payout:10.92}},
  {termsMatch:false},
  {brokerAligned:false},
  {feedFresh:false},
  {quote:{askPrice:5,payout:5}},
  {quote:{askPrice:4,payout:9.1}},
 ];
 for(const change of blocked)
  assert.equal(evaluateGoldenRule({...base,...change}).researchCandidate,false,JSON.stringify(change));
});
test("15 original bot strategies remain unchanged and have distinct prospective study rows",()=>{
 assert.equal(FIFTEEN_BOTS.length,15);
 const s=createGoldenPaperState();
 assert.equal(Object.keys(s.bots).length,15);
 assert.equal(new Set(FIFTEEN_BOTS.map(b=>b.id)).size,15);
 for(const b of FIFTEEN_BOTS)
  assert.deepEqual([s.bots[b.id].observations,s.bots[b.id].wins], [0,0]);
});
test("exactly next contiguous one-second tick scores a digit hypothesis, never past data",()=>{
 let s=createGoldenPaperState();
 const e=2_000_000_000;
 // 1HZ10V digit-under-5 bot needs 32 prior ticks. All predictions are 0..4 hits.
 for(let k=0;k<32;k++)
  s=applyGoldenPublicTick(s,tick("1HZ10V",e+k,3,100), (e+k)*1000);
 const before=s.bots["digit-under-5"];
 assert.equal(before.observations,0);
 assert.ok(before.pending);
 assert.equal(before.pending.startEpoch,e+31);
 s=applyGoldenPublicTick(s,tick("1HZ10V",e+31,9,100), (e+31)*1000);
 assert.equal(s.bots["digit-under-5"].observations,0); // duplicate rejected
 s=applyGoldenPublicTick(s,tick("1HZ10V",e+32,3,100), (e+32)*1000);
 assert.equal(s.bots["digit-under-5"].observations,1);
 assert.equal(s.bots["digit-under-5"].wins,1);
 assert.equal(s.bots["digit-under-5"].losses,0);
});
test("missing or stale tick never becomes a fake next-tick win",()=>{
 let s=createGoldenPaperState();
 const e=2_000_000_000;
 for(let i=0;i<32;i++)
  s=applyGoldenPublicTick(s,tick("1HZ10V",e+i,3), (e+i)*1000);
 assert.ok(s.bots["digit-under-5"].pending);
 s=applyGoldenPublicTick(s,tick("1HZ10V",e+34,3), (e+34)*1000);
 assert.equal(s.bots["digit-under-5"].observations,0);
 assert.equal(s.bots["digit-under-5"].voids,1);
 const unchanged=s;
 s=applyGoldenPublicTick(s,tick("1HZ10V",e+35,3), (e+35)*1000+11_000);
 assert.strictEqual(s,unchanged);
});
test("public-feed reconnect discards unfinished hypotheses without erasing completed evidence",()=>{
 let s=createGoldenPaperState();
 const e=2_000_000_000;
 for(let i=0;i<33;i++)
  s=applyGoldenPublicTick(s,tick("1HZ10V",e+i,3), (e+i)*1000);
 assert.equal(s.bots["digit-under-5"].observations,1);
 assert.equal(s.bots["digit-under-5"].pending===null,true); // 10 second signal spacing
 const before=s.bots["digit-under-5"].observations;
 s=resetGoldenPaperFeed(s);
 assert.equal(s.bots["digit-under-5"].observations,before);
 assert.deepEqual(s.history,{});
 assert.deepEqual(s.lastEpoch,{});
 assert.equal(s.disconnects,1);
});
test("five-minute direction research cannot be mistaken for next-tick broker settlement",()=>{
 assert.equal(goldenExpectedTickSeconds("R_50"),2);
 assert.equal(goldenExpectedTickSeconds("1HZ50V"),1);
 let s=createGoldenPaperState();
 const e=2_000_000_000;
 for(let i=0;i<32;i++)
  s=applyGoldenPublicTick(s,tick("R_50",e+i*2,i%10,100+i/100), (e+i*2)*1000);
 const before=s.bots["trend-rise-fall"];
 assert.ok(before.pending);
 assert.equal(before.pending.expiryEpoch-before.pending.startEpoch,300);
 for(let i=32;i<181;i++)
  s=applyGoldenPublicTick(s,tick("R_50",e+i*2,i%10,100+i/100), (e+i*2)*1000);
 assert.equal(s.bots["trend-rise-fall"].observations,0);
 s=applyGoldenPublicTick(s,tick("R_50",e+181*2,1,102), (e+181*2)*1000);
 assert.equal(s.bots["trend-rise-fall"].observations,1);
 assert.equal(s.bots["trend-rise-fall"].wins,1);
 assert.equal(evaluateGoldenRule({...base,brokerAligned:false}).researchCandidate,false);
});
test("paper-only screen does not call broker buy, mutate execution, or claim proof of profit",()=>{
 const page=read("app/bot-library/golden-rule/GoldenRuleLab.tsx");
 const pure=read("lib/bots/senfx-golden-rule.mjs");
 const tracker=read("lib/bots/senfx-golden-rule-research.ts");
 const route=read("app/bot-library/golden-rule/page.tsx");
 const link=read("app/bot-library/FifteenPaperBotLibrary.tsx");
 for(const source of [page,pure,tracker,route]){
  assert.doesNotMatch(source,/session\.request\(["']buy|\/ws\/real|\/api\/deriv\/demo\/bots\/control|Start Selected Demo Bot|buy:\s*quote\.id|\.insert\(/);
 }
 assert.match(page,/\/api\/deriv\/demo\/bots\/payout-preview/);
 assert.match(page,/\/api\/deriv\/demo\/account-balance/);
 assert.match(page,/GOLDEN_RULE_MIN_FORWARD_SAMPLES/);
 assert.match(page,/researchCandidate/);
 assert.match(page,/brokerAligned:bot\.category!=="Direction"/);
 assert.match(page,/parsePublicDigitTick/);
 assert.match(page,/No new signals, payout overrides/);
 assert.match(link,/href="\/bot-library\/golden-rule"/);
 assert.doesNotMatch(link,/FifteenDemoIndividualControl[\s\S]*GoldenRuleLab/);
});
