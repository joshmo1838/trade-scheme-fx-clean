import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {FIFTEEN_BOTS} from "../lib/bots/fifteen-paper-bots.ts";
import {
 createGoldenPaperState,applyGoldenPublicTick,resetGoldenPaperFeed,
 GOLDEN_PAPER_MAX_HISTORY
} from "../lib/bots/senfx-golden-rule-research.ts";
import {
 buildGoldenBotTickDeliveries,
 GOLDEN_TICK_MONITOR_WINDOW,GOLDEN_TICK_MONITOR_DELIVERY_MS
} from "../lib/bots/senfx-golden-tick-monitor.ts";
import {GOLDEN_RULE_MIN_FORWARD_SAMPLES} from "../lib/bots/senfx-golden-rule.mjs";

const tick=(symbol,epoch)=>({
 symbol,epoch,digit:3,price:100.03,pipSize:2,
 quoteText:"100.03",tickId:String(epoch)
});
const EPOCH=2_000_000_000;
const find=(all,id)=>all.find(row=>row.botId===id);
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("exact 300-tick market window, 30-second research delivery, unchanged 1000 study gate",()=>{
 assert.equal(GOLDEN_TICK_MONITOR_WINDOW,300);
 assert.equal(GOLDEN_PAPER_MAX_HISTORY,300);
 assert.equal(GOLDEN_TICK_MONITOR_DELIVERY_MS,30_000);
 assert.equal(GOLDEN_RULE_MIN_FORWARD_SAMPLES,1000);
 assert.equal(FIFTEEN_BOTS.length,15);
});
test("no strategy is dispatched before 300 verified contiguous real public ticks",()=>{
 let state=createGoldenPaperState();
 const start=buildGoldenBotTickDeliveries(state,EPOCH*1000,true);
 assert.equal(start.length,15);
 assert.ok(start.every(d=>d.status==="WARMING"&&d.ticks.length===0&&!d.analysis));
 for(let i=0;i<299;i++){
  const epoch=EPOCH+i;
  state=applyGoldenPublicTick(state,tick("1HZ10V",epoch),epoch*1000);
 }
 const before=buildGoldenBotTickDeliveries(state,(EPOCH+298)*1000,true);
 const under=find(before,"digit-under-5");
 assert.equal(under.count,299);
 assert.equal(under.status,"WARMING");
 assert.equal(under.ticks.length,0);
 state=applyGoldenPublicTick(state,tick("1HZ10V",EPOCH+299),(EPOCH+299)*1000);
 const ready=buildGoldenBotTickDeliveries(state,(EPOCH+299)*1000,true);
 const underReady=find(ready,"digit-under-5");
 assert.equal(underReady.status,"DELIVERED");
 assert.equal(underReady.count,300);
 assert.equal(underReady.ticks.length,300);
 assert.equal(underReady.analysis?.prediction,"UNDER");
 assert.equal(find(ready,"digit-matches").status,"DELIVERED");
 assert.equal(find(ready,"parity-even").status,"WARMING");
 assert.equal(state.bots["digit-under-5"].observations<1000,true);
 const beforeDuplicate=state;
 state=applyGoldenPublicTick(state,tick("1HZ10V",EPOCH+299),(EPOCH+299)*1000);
 assert.equal(state,beforeDuplicate,"duplicate data must not be scored again");
 state=applyGoldenPublicTick(state,tick("1HZ10V",EPOCH+300),(EPOCH+300)*1000);
 assert.equal(state.history["1HZ10V"].length,300);
 assert.equal(state.history["1HZ10V"][0].epoch,EPOCH+1);
});
test("stale and disconnected windows block all analysis delivery",()=>{
 let s=createGoldenPaperState();
 for(let i=0;i<300;i++){
  const epoch=EPOCH+i;
  s=applyGoldenPublicTick(s,tick("1HZ10V",epoch),epoch*1000);
 }
 assert.equal(find(buildGoldenBotTickDeliveries(s,(EPOCH+299)*1000+11_000,true),"digit-under-5").status,"STALE");
 assert.equal(find(buildGoldenBotTickDeliveries(s,(EPOCH+299)*1000+11_000,true),"digit-under-5").ticks.length,0);
 const offline=find(buildGoldenBotTickDeliveries(s,(EPOCH+299)*1000,false),"digit-under-5");
 assert.equal(offline.status,"DISCONNECTED");
 assert.equal(offline.analysis,null);
 s=resetGoldenPaperFeed(s);
 assert.equal(find(buildGoldenBotTickDeliveries(s,(EPOCH+299)*1000,true),"digit-under-5").status,"WARMING");
});
test("a missing tick resets the public window; 300 old ticks cannot hide a gap",()=>{
 let s=createGoldenPaperState();
 for(let i=0;i<300;i++){
  const epoch=EPOCH+i;
  s=applyGoldenPublicTick(s,tick("1HZ10V",epoch),epoch*1000);
 }
 assert.equal(find(buildGoldenBotTickDeliveries(s,(EPOCH+299)*1000,true),"digit-under-5").status,"DELIVERED");
 s=applyGoldenPublicTick(s,tick("1HZ10V",EPOCH+301),(EPOCH+301)*1000);
 assert.equal(s.history["1HZ10V"].length,1);
 assert.equal(find(buildGoldenBotTickDeliveries(s,(EPOCH+301)*1000,true),"digit-under-5").status,"WARMING");
});
test("all 15 existing bots receive only their own markets, never execution orders",()=>{
 let s=createGoldenPaperState();
 const symbols=[...new Set(FIFTEEN_BOTS.map(b=>b.market))];
 assert.equal(symbols.length,10);
 // Align final epochs across 1-Hz and two-second markets so every
 // individual symbol has a contemporaneously fresh 300-tick window.
 for(const symbol of symbols){
  const spacing=symbol.startsWith("1HZ")?1:2;
  const start=EPOCH+598-spacing*299;
  for(let i=0;i<300;i++){
   const epoch=start+i*spacing;
   s=applyGoldenPublicTick(s,tick(symbol,epoch),epoch*1000);
  }
 }
 const rows=buildGoldenBotTickDeliveries(s,(EPOCH+598)*1000,true);
 assert.equal(rows.length,15);
 assert.ok(rows.every(row=>row.status==="DELIVERED"&&row.count===300&&
  row.ticks.length===300&&row.ticks.every(t=>t.symbol===row.market)));
 assert.equal(new Set(rows.map(row=>row.botId)).size,15);
 const monitor=read("lib/bots/senfx-golden-tick-monitor.ts");
 const page=read("app/bot-library/golden-rule/GoldenRuleLab.tsx");
 for(const source of [monitor,page]){
  assert.doesNotMatch(source,/\/ws\/real|\.request\(["']buy|\/api\/deriv\/demo\/bots\/control|DERIV_TOKEN_ENCRYPTION_KEY/);
 }
 assert.match(page,/setInterval\(dispatch,GOLDEN_TICK_MONITOR_DELIVERY_MS\)/);
 assert.match(page,/buildGoldenBotTickDeliveries/);
 assert.match(page,/Snapshots never enter broker purchase workers/);
});
