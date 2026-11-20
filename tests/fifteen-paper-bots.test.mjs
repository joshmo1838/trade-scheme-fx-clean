import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {
 FIFTEEN_BOTS,BOT_COUNT,findFifteenBot,predictFifteenBot,testPaperSignal,
 startFifteenPaperSession,observeFifteenPaperTick,stopFifteenPaperSession,
} from "../lib/bots/fifteen-paper-bots.ts";
import {paperPreset} from "../lib/bots/paper-strategy.ts";
import {
 beginPaperStudy,stopPaperStudy,recordPaperStudySnapshot,paperStudyHits,
 STUDY_BOT_ID,STUDY_TARGET,STUDY_BATCHES,
} from "../lib/bots/paper-200-study.ts";

const EPOCH=1_800_000_000;
const mk=(symbol,epoch,i,price=100+i*.037)=>({
 symbol,epoch,price,pipSize:3,digit:i%10,
 quoteText:price.toFixed(3),tickId:"id-"+symbol+"-"+epoch,
});
const history=(bot,count=60)=>Array.from({length:count},
 (_,i)=>mk(bot.market,EPOCH+i,i));
const start=(bot,override={})=>{
 const hist=history(bot);
 return startFifteenPaperSession({botId:bot.id,history:hist,stake:2,count:3,cap:6,
  nowMs:(EPOCH+59)*1000, ...override});
};

test("exactly 15 branded, independently configured strategy profiles",()=>{
 assert.equal(BOT_COUNT,15);
 assert.equal(FIFTEEN_BOTS.length,15);
 assert.equal(new Set(FIFTEEN_BOTS.map(x=>x.id)).size,15);
 assert.equal(new Set(FIFTEEN_BOTS.map(x=>x.family)).size,15);
 assert.ok(FIFTEEN_BOTS.every(x=>x.name.startsWith("SENFX ")));
 assert.ok(FIFTEEN_BOTS.every(x=>findFifteenBot(x.id)?.id===x.id));
});
test("all fifteen candidates form a pre-tick hypothesis with real observed history",()=>{
 for(const bot of FIFTEEN_BOTS){
  assert.equal(predictFifteenBot(bot,history(bot,12)),null,bot.id);
  const decision=predictFifteenBot(bot,history(bot));
  assert.ok(decision,bot.id+" did not produce a hypothesis");
  assert.ok(["digit","direction"].includes(decision.kind));
  const result=start(bot);
  assert.equal(result.ok,true,bot.id+(result.ok?"":": "+result.reason));
  if(!result.ok)continue;
  assert.equal(result.session.observations.length,0);
  assert.equal(result.session.lastEpoch,EPOCH+59);
  assert.ok(result.session.pending);
 }
});
test("invalid caps, stale feeds and unknown bots fail closed",()=>{
 const bot=FIFTEEN_BOTS[0];
 for(const override of [
  {botId:"unknown"},{stake:-1},{stake:100},{count:0},
  {count:11},{cap:5.99},{cap:0},{nowMs:(EPOCH+59)*1000+20000}
 ]){
  const result=start(bot,override);
  assert.equal(result.ok,false,JSON.stringify(override));
 }
 const invalidHistory=history(bot);
 invalidHistory[invalidHistory.length-1].price=NaN;
 assert.equal(start(bot,{history:invalidHistory}).ok,false);
});
test("one future public quote settles exactly one observation, with no replay or lookahead",()=>{
 for(const bot of FIFTEEN_BOTS){
  const hist=history(bot);
  const armed=start(bot);
  assert.equal(armed.ok,true,bot.id);
  if(!armed.ok)continue;
  const current=armed.session;
  const same=mk(bot.market,EPOCH+59,59);
  assert.equal(observeFifteenPaperTick(current,same,hist,(EPOCH+59)*1000),current,bot.id);
  const wrongSymbol=bot.market==="R_10"?"R_100":"R_10";
  const wrong=mk(wrongSymbol,EPOCH+60,60);
  assert.equal(observeFifteenPaperTick(current,wrong,hist,(EPOCH+60)*1000),current,bot.id);
  const future=mk(bot.market,EPOCH+60,60);
  const recorded=observeFifteenPaperTick(current,future,hist,(EPOCH+60)*1000);
  assert.equal(recorded.observations.length,1,bot.id);
  assert.equal(recorded.observations[0].epoch,EPOCH+60);
  assert.equal(recorded.observations[0].paperStake,2);
  assert.equal(recorded.observations[0].signal.prediction,current.pending.prediction);
  assert.equal(recorded.observations[0].hit,testPaperSignal(current.pending,future));
  assert.equal(observeFifteenPaperTick(recorded,future,[...hist,future],(EPOCH+60)*1000),recorded);
  const late=mk(bot.market,EPOCH+61,61);
  const stale=observeFifteenPaperTick(recorded,late,[...hist,future],(EPOCH+74)*1000);
  assert.equal(stale.state,"running","one delayed tick must be discarded without a false outcome");
  assert.equal(stale.observations.length,1,"stale quote cannot produce paper outcome");
  assert.equal(stale.pending,null,"late tick must void prior hypothesis");
  assert.equal(stale.skippedStaleTicks,1);
 }
});
test("fixed stake, three outcomes, risk cap and emergency Stop",()=>{
 const bot=FIFTEEN_BOTS[2];const hist=history(bot);
 const result=start(bot);
 assert.equal(result.ok,true);
 if(!result.ok)return;
 let session=result.session;
 const first=mk(bot.market,EPOCH+60,60);
 session=observeFifteenPaperTick(session,first,hist,(EPOCH+60)*1000);
 assert.equal(session.observations.length,1);
 const second=mk(bot.market,EPOCH+61,61);
 session=observeFifteenPaperTick(session,second,[...hist,first],(EPOCH+61)*1000);
 assert.equal(session.observations.length,2);
 const third=mk(bot.market,EPOCH+62,62);
 session=observeFifteenPaperTick(session,third,[...hist,first,second],(EPOCH+62)*1000);
 assert.equal(session.state,"completed");
 assert.equal(session.observations.length,3);
 assert.deepEqual(session.observations.map(x=>x.paperStake),[2,2,2]);
 assert.equal(session.observations.reduce((s,x)=>s+x.paperStake,0),6);
 assert.equal("payout" in session.observations[0],false);
 assert.equal("profit" in session.observations[0],false);
 assert.equal(observeFifteenPaperTick(session,mk(bot.market,EPOCH+63,63),
  [...hist,first,second,third],(EPOCH+63)*1000),session);
 const stopped=stopFifteenPaperSession(result.session);
 assert.equal(stopped.state,"stopped");
 assert.equal(stopped.pending,null);
 assert.equal(observeFifteenPaperTick(stopped,first,hist,(EPOCH+60)*1000),stopped);
});
test("paper family condition semantics correctly handle equality and flat-price direction",()=>{
 const tick=mk("R_100",EPOCH+60,4,100);
 const base={kind:"digit",prediction:"OVER",barrier:4,entryPrice:99};
 assert.equal(testPaperSignal(base,tick),false);
 assert.equal(testPaperSignal({...base,prediction:"UNDER",barrier:5},tick),true);
 assert.equal(testPaperSignal({...base,prediction:"MATCHES"},tick),true);
 assert.equal(testPaperSignal({...base,prediction:"DIFFERS"},tick),false);
 assert.equal(testPaperSignal({...base,prediction:"EVEN"},tick),true);
 assert.equal(testPaperSignal({...base,prediction:"ODD"},tick),false);
 assert.equal(testPaperSignal({...base,prediction:"RISE",kind:"direction",entryPrice:100},tick),false);
 assert.equal(testPaperSignal({...base,prediction:"FALL",kind:"direction",entryPrice:100},tick),false);
});
test("existing published worker presets and 200-trade experimental workflow unchanged",()=>{
 assert.deepEqual(
  ["SENFX Synthetic pro","Synthetic Trend Scout","Volatility Watch"]
   .map(name=>paperPreset({name,market:"Synthetic Indices"}).market),
  ["R_100","R_50","R_75"]);
 const code=readFileSync(new URL("../lib/bots/fifteen-paper-bots.ts",import.meta.url),"utf8");
 assert.doesNotMatch(code,/SUPABASE_SERVICE_ROLE_KEY|DERIV_TOKEN|\/api\/deriv\/buy|db\.from\(|\.buy\(/i);
 assert.doesNotMatch(code,/martingale\s*:\s*true|d.alembert.*increase.*stake/i);
});

test("history divergence fails closed without fabricating a paper outcome",()=>{
 const bot=FIFTEEN_BOTS[0],hist=history(bot),armed=start(bot);
 assert.equal(armed.ok,true);
 if(!armed.ok)return;
 const tick=mk(bot.market,EPOCH+61,61);
 const divergent=observeFifteenPaperTick(armed.session,tick,hist.slice(0,-1),(EPOCH+61)*1000);
 assert.equal(divergent.state,"stopped");
 assert.equal(divergent.pending,null);
 assert.equal(divergent.observations.length,0);
 assert.match(divergent.message,/history changed/i);
});


test("ten outcomes require genuine future ticks after delayed-tick rearming",()=>{
 const bot=FIFTEEN_BOTS.find(x=>x.id==="digit-differs");
 assert.ok(bot);
 const hist=history(bot);
 const result=start(bot,{stake:1,count:10,cap:10});
 assert.equal(result.ok,true);
 if(!result.ok)return;
 let session=result.session;
 let before=[...hist];
 for(let n=60;n<=62;n++){
  const tick=mk(bot.market,EPOCH+n,n);
  session=observeFifteenPaperTick(session,tick,before,(EPOCH+n)*1000);
  before.push(tick);
 }
 assert.equal(session.observations.length,3);
 const delayed=mk(bot.market,EPOCH+63,63);
 session=observeFifteenPaperTick(session,delayed,before,(EPOCH+76)*1000);
 before.push(delayed);
 assert.equal(session.state,"running");
 assert.equal(session.observations.length,3);
 assert.equal(session.skippedStaleTicks,1);
 assert.equal(session.pending,null);
 const rearm=mk(bot.market,EPOCH+80,80);
 session=observeFifteenPaperTick(session,rearm,before,(EPOCH+80)*1000);
 before.push(rearm);
 assert.equal(session.observations.length,3,"fresh re-arming tick must not score voided prediction");
 assert.ok(session.pending);
 for(let n=81;n<=87;n++){
  const tick=mk(bot.market,EPOCH+n,n);
  session=observeFifteenPaperTick(session,tick,before,(EPOCH+n)*1000);
  before.push(tick);
 }
 assert.equal(session.state,"completed");
 assert.equal(session.observations.length,10);
 assert.equal(session.skippedStaleTicks,1);
 assert.ok(session.observations.every(o=>o.epoch!==EPOCH+63&&o.epoch!==EPOCH+80),"delayed/rearm ticks must never be scored");
 assert.deepEqual(session.observations.map(o=>o.sequence),[1,2,3,4,5,6,7,8,9,10]);
 assert.equal(session.observations.reduce((sum,o)=>sum+o.paperStake,0),10);
});
test("repeated delayed packets and future-dated ticks still fail closed",()=>{
 const bot=FIFTEEN_BOTS[5];
 const hist=history(bot);
 const a=start(bot);
 assert.equal(a.ok,true);
 if(!a.ok)return;
 const future=mk(bot.market,EPOCH+60,60);
 const badClock=observeFifteenPaperTick(a.session,future,hist,(EPOCH+59)*1000);
 assert.equal(badClock.state,"stopped");
 assert.match(badClock.message,/device clock/i);
 let session=a.session;
 let before=[...hist];
 for(let n=60;n<=65;n++){
  const tick=mk(bot.market,EPOCH+n,n);
  session=observeFifteenPaperTick(session,tick,before,(EPOCH+n+13)*1000);
  before.push(tick);
 }
 assert.equal(session.state,"stopped");
 assert.equal(session.observations.length,0);
 assert.equal(session.pending,null);
 assert.match(session.message,/Repeated delayed/i);
});
test("stale recovery retains paper-only broker isolation",()=>{
 const file=readFileSync(new URL("../lib/bots/fifteen-paper-bots.ts",import.meta.url),"utf8");
 assert.doesNotMatch(file,/fetch\(|WebSocket|DERIV_DEMO_BROKER_BUY_ENABLED|SUPABASE_SERVICE_ROLE_KEY|buy: [1-9]/i);
});

test("200-study uses twenty separate 10-observation forward-only paper batches",()=>{
 const bot=findFifteenBot(STUDY_BOT_ID);
 assert.ok(bot);
 let hist=history(bot),study=beginPaperStudy();
 let epoch=EPOCH+60;
 for(let batchIndex=0;batchIndex<STUDY_BATCHES;batchIndex++){
  const started=startFifteenPaperSession({botId:bot.id,history:hist,
   stake:1,count:10,cap:10,nowMs:hist.at(-1).epoch*1000});
  assert.equal(started.ok,true,"batch "+(batchIndex+1));
  if(!started.ok)return;
  let session=started.session;
  for(let i=0;i<10;i++){
   const tick=mk(bot.market,epoch++,i+batchIndex*11);
   session=observeFifteenPaperTick(session,tick,hist,tick.epoch*1000);
   hist.push(tick);
   study=recordPaperStudySnapshot(study,session);
   assert.equal(study.observations.length,batchIndex*10+i+1);
   assert.ok(study.observations.length<=STUDY_TARGET);
  }
  assert.equal(session.state,"completed");
  assert.equal(study.completedBatches,batchIndex+1);
  const duplicate=recordPaperStudySnapshot(study,session);
  assert.deepEqual(duplicate,study,"replayed completed snapshot must not double count");
  if(batchIndex<STUDY_BATCHES-1){
   // One fresh boundary tick is used only to form the next prediction.
   hist.push(mk(bot.market,epoch++,99));
  }
  hist=hist.slice(-160);
 }
 assert.equal(study.status,"completed");
 assert.equal(study.observations.length,200);
 assert.equal(paperStudyHits(study)+study.observations.length-paperStudyHits(study),200);
 assert.equal(study.observations.reduce((sum,o)=>sum+o.paperStake,0),200);
 assert.equal(new Set(study.observations.map(o=>o.epoch)).size,200);
});
test("200-study fails closed on invalid parameters and preserves partial progress",()=>{
 const bot=findFifteenBot(STUDY_BOT_ID),hist=history(bot);
 assert.ok(bot);
 const started=startFifteenPaperSession({botId:bot.id,history:hist,
  stake:1,count:10,cap:10,nowMs:(EPOCH+59)*1000});
 assert.equal(started.ok,true);
 if(!started.ok)return;
 let study=beginPaperStudy();
 const tick=mk(bot.market,EPOCH+60,60);
 const next=observeFifteenPaperTick(started.session,tick,hist,tick.epoch*1000);
 study=recordPaperStudySnapshot(study,next);
 assert.equal(study.observations.length,1);
 assert.equal(recordPaperStudySnapshot(study,next).observations.length,1);
 const wrong=recordPaperStudySnapshot(study,{...next,stake:25});
 assert.equal(wrong.status,"stopped");
 assert.equal(wrong.observations.length,1);
 const stopped=stopPaperStudy(study,"Manual emergency stop");
 assert.equal(stopped.status,"stopped");
 assert.equal(stopped.observations.length,1);
 assert.equal(recordPaperStudySnapshot(stopped,next),stopped);
 const delayed=observeFifteenPaperTick(next,mk(bot.market,EPOCH+61,61),
  [...hist,tick],(EPOCH+75)*1000);
 const tracked=recordPaperStudySnapshot(study,delayed);
 assert.equal(tracked.skippedStaleTicks,1);
 assert.equal(tracked.observations.length,1);
 const failed=stopFifteenPaperSession(delayed,"Feed disconnected");
 assert.equal(recordPaperStudySnapshot(tracked,failed).status,"stopped");
});
test("200-study module has no broker-order or persistence calls",()=>{
 const code=readFileSync(new URL("../lib/bots/paper-200-study.ts",import.meta.url),"utf8");
 assert.doesNotMatch(code,/fetch\\(|WebSocket|DERIV_TOKEN|SUPABASE|buy\\(|\/api\/deriv\//i);
});
