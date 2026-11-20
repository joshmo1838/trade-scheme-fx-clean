import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DEMO_AI_RULES,assessDemoAiCandidate,screenDemoAiPilotSafety} from "../lib/deriv/demo-ai-signal.mjs";

const now=1_800_000_100_000;
const history=(move=0.04)=>Array.from({length:40},(_,i)=>({
 id:"tick-"+i,symbol:"R_100",quote:100+i*move,epochMs:now-(39-i)*1000,
}));
const candidate=assessDemoAiCandidate(history(),now);
const gate={
 productionBrokerFeatureEnabled:true,customerArmedOneShot:true,
 accountType:"demo",brokerVerifiedDemo:true,currency:"USD",stakeUsd:1,
 emergencyStopped:false,riskStateVerified:true,reservationVerified:true,
 openOrders:0,priorBuyAttempts:0,realizedDailyLoss:0,reservedExposure:0,nowMs:now,
};
test("40 strict fresh chronological public ticks form a deterministic trend candidate",()=>{
 assert.equal(candidate.eligible,true);
 assert.equal(candidate.direction,"CALL");
 assert.equal(candidate.symbol,"R_100");
 assert.equal(candidate.stakeUsd,1);
 assert.equal(candidate.isBrokerOrder,false);
 assert.ok(candidate.researchScore>=75);
 assert.deepEqual(assessDemoAiCandidate(history(-0.04),now).direction,"PUT");
});
test("invalid, replayed, future, stale or insufficient ticks fail closed",()=>{
 for(const sample of [
  history().slice(0,39),
  history().map((x,i)=>i===12?{...x,id:"tick-11"}:x),
  history().map((x,i)=>i===12?{...x,epochMs:now+100}:x),
  history().map((x,i)=>i===12?{...x,symbol:"R_75"}:x),
  history().map((x,i)=>i===12?{...x,quote:NaN}:x),
  history().map((x,i)=>i===13?{...x,epochMs:now-(39-12)*1000}:x),
  history().map((x,i)=>({...x,epochMs:x.epochMs-90_000})),
  history().map((x,i)=>({...x,epochMs:x.epochMs-121_000})),
 ]){
  assert.equal(assessDemoAiCandidate(sample,now).eligible,false);
 }
 assert.equal(assessDemoAiCandidate(history(),now,true).eligible,false);
 assert.equal(assessDemoAiCandidate(history(),now+7000).reason,"STALE_PUBLIC_TICK");
 assert.equal(assessDemoAiCandidate([],now).eligible,false);
});
test("mixed price movements produce no eligible artificial AI entry",()=>{
 const data=history().map((t,i)=>({...t,quote:100+Math.sin(i)*0.1}));
 assert.equal(assessDemoAiCandidate(data,now).eligible,false);
});
test("advisory gate defaults disabled and cannot bypass first $1 pilot usage",()=>{
 assert.equal(screenDemoAiPilotSafety(candidate,{}).allowed,false);
 assert.equal(screenDemoAiPilotSafety(candidate,{...gate,productionBrokerFeatureEnabled:false}).code,"BROKER_BUY_SAFETY_HOLD");
 assert.equal(screenDemoAiPilotSafety(candidate,{...gate,priorBuyAttempts:1}).code,"ONE_ATTEMPT_ALREADY_USED");
 assert.equal(screenDemoAiPilotSafety(candidate,{...gate,accountType:"real"}).code,"VERIFIED_VIRTUAL_ACCOUNT_REQUIRED");
 assert.equal(screenDemoAiPilotSafety(candidate,{...gate,customerArmedOneShot:false}).code,"EXPLICIT_ONE_SHOT_CONSENT_REQUIRED");
 assert.equal(screenDemoAiPilotSafety(candidate,{...gate,emergencyStopped:true}).code,"EMERGENCY_STOP_ACTIVE");
 assert.equal(screenDemoAiPilotSafety(candidate,{...gate,openOrders:1}).code,"OPEN_ORDER_LIMIT");
 assert.equal(screenDemoAiPilotSafety(candidate,{...gate,reservedExposure:1}).code,"ONE_DOLLAR_DAILY_LOSS_BUDGET");
 assert.equal(screenDemoAiPilotSafety(candidate,{...gate,reservationVerified:false}).code,"RISK_LEDGER_UNVERIFIED");
 assert.equal(screenDemoAiPilotSafety(candidate,{...gate,nowMs:now+6000}).code,"SIGNAL_EXPIRED");
 assert.equal(screenDemoAiPilotSafety(candidate,gate).code,"ADVISORY_ONLY_NOT_BROKER_AUTHORIZATION");
});
test("candidate module is isolated from real/demo broker purchase and secrets",()=>{
 const file=readFileSync(new URL("../lib/deriv/demo-ai-signal.mjs",import.meta.url),"utf8");
 assert.doesNotMatch(file,/fetch\s*\(|WebSocket|https?:\/\/|\.buy\s*\(|session\.request\s*\(|SUPABASE_SERVICE_ROLE_KEY|DERIV_TOKEN/i);
 assert.equal(DEMO_AI_RULES.stakeUsd,1);
});
