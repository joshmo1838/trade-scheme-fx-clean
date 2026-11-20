import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {
 FIFTEEN_BOTS,BOT_COUNT,findFifteenBot,predictFifteenBot,testPaperSignal,
 startFifteenPaperSession,observeFifteenPaperTick,stopFifteenPaperSession,
} from "../lib/bots/fifteen-paper-bots.ts";
import {paperPreset} from "../lib/bots/paper-strategy.ts";

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
  const stale=observeFifteenPaperTick(recorded,late,[...hist,future],(EPOCH+90)*1000);
  assert.equal(stale.state,"stopped","stale quote must fail closed");
  assert.equal(stale.observations.length,1,"stale quote cannot produce paper outcome");
  assert.equal(stale.pending,null);
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
