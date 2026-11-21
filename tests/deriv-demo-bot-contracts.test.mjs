import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 SENFX_DEMO_BOT_TEMPLATES,getDemoBotTemplate,deriveDemoProposal,brokerSupportsTemplate,
} from "../lib/deriv/demo-bot-contracts.mjs";
const route=readFileSync(new URL("../app/api/deriv/demo/bots/capabilities/route.ts",import.meta.url),"utf8");
const research=readFileSync(new URL("../lib/bots/fifteen-paper-bots.ts",import.meta.url),"utf8");

test("all fifteen original SENFX strategy IDs have explicit broker Demo adapters",()=>{
 const ids=[...research.matchAll(/\{id:"([^"]+)",name:"SENFX /g)].map(x=>x[1]);
 assert.equal(ids.length,15);
 assert.equal(SENFX_DEMO_BOT_TEMPLATES.length,15);
 assert.equal(new Set(ids).size,15);
 assert.deepEqual(new Set(SENFX_DEMO_BOT_TEMPLATES.map(x=>x.id)),new Set(ids));
 assert.ok(SENFX_DEMO_BOT_TEMPLATES.every(x=>x.symbol&&x.types.length));
 assert.equal(new Set(SENFX_DEMO_BOT_TEMPLATES.map(x=>x.symbol)).size,10);
});
test("contract adapters correctly map digits and 5-minute direction without real-money paths",()=>{
 const cases=[
 ["digit-over-4","OVER",undefined,"DIGITOVER","4","t"],
 ["digit-under-5","UNDER",undefined,"DIGITUNDER","5","t"],
 ["parity-even","EVEN",undefined,"DIGITEVEN",undefined,"t"],
 ["parity-odd","ODD",undefined,"DIGITODD",undefined,"t"],
 ["digit-matches","MATCHES",undefined,"DIGITMATCH","3","t"],
 ["digit-differs","DIFFERS",undefined,"DIGITDIFF","7","t"],
 ["trend-rise-fall","RISE",undefined,"CALL",undefined,"m"],
 ["breakout-higher-lower","FALL",undefined,"PUT",undefined,"m"],
 ["recovery-audit","EVEN",undefined,"DIGITEVEN",undefined,"t"],
 ["stepwise-audit","OVER",undefined,"DIGITOVER","4","t"],
 ["adaptive-over","OVER",undefined,"DIGITOVER","4","t"],
 ["entropy-parity","ODD",undefined,"DIGITODD",undefined,"t"],
 ["pattern-differs","DIFFERS",8,"DIGITDIFF","8","t"],
 ["momentum-rise-fall","RISE",undefined,"CALL",undefined,"m"],
 ["volatility-scalper","FALL",undefined,"PUT",undefined,"m"],
 ];
 for(const [id,prediction,barrier,type,expectedBarrier,unit] of cases){
  const proposal=deriveDemoProposal(id,prediction,barrier,1);
  assert.ok(proposal,id);
  assert.equal(proposal.contract_type,type,id);
  assert.equal(proposal.barrier,expectedBarrier,id);
  assert.equal(proposal.duration_unit,unit,id);
  assert.equal(proposal.amount,1,id);
  assert.equal(proposal.currency,"USD",id);
  assert.equal(proposal.underlying_symbol,getDemoBotTemplate(id).symbol,id);
 }
});
test("invalid stake, mismatched prediction, missing dynamic barrier and wrong barriers fail closed",()=>{
 for(const stake of [0,0.5,2,10,100,NaN,Infinity,-1]){
  assert.equal(deriveDemoProposal("digit-differs","DIFFERS",7,stake),null);
 }
 for(const [id,prediction,barrier] of [
  ["unknown","OVER",4],["parity-even","FALL"],["digit-over-4","OVER",5],
  ["digit-under-5","UNDER",6],["digit-matches","MATCHES",8],
  ["pattern-differs","DIFFERS"],["pattern-differs","DIFFERS",12],
  ["entropy-parity","UNDER",4],["trend-rise-fall","RISE",3],
 ]){
  assert.equal(deriveDemoProposal(id,prediction,barrier),null,id);
 }
});
test("Deriv real Demo contracts_for verification determines supported symbols and contract types",()=>{
 const b=getDemoBotTemplate("trend-rise-fall");
 assert.equal(brokerSupportsTemplate(b,[{contract_type:"CALL"},{contract_type:"PUT"}]),true);
 assert.equal(brokerSupportsTemplate(b,[{contract_type:"CALL"}]),false);
 assert.equal(brokerSupportsTemplate(b,[]),false);
});
test("read-only broker capabilities route requires verified session and never buys",()=>{
 assert.match(route,/getDerivDemoContext\(\)/);
 assert.match(route,/context\.account\.account_type!=="demo"/);
 assert.match(route,/DERIV_DEMO_TRADING_ENABLED/);
 assert.match(route,/openDerivDemoSession\(context\)/);
 assert.match(route,/session\.request<any>\("contracts_for"/);
 assert.match(route,/purchaseEnabled:false/);
 assert.doesNotMatch(route,/session\.request\("buy"|auto_start|\/ws\/real|DERIV_DEMO_BROKER_BUY_ENABLED\s*=\s*"true"/);
 assert.match(route,/session\.close\(\)/);
});
