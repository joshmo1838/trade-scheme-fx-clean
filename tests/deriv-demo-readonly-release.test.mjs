import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {SENFX_DEMO_BOT_TEMPLATES, deriveDemoProposal} from "../lib/deriv/demo-bot-contracts.mjs";

const read=(path)=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
test("read-only production ships all 15 broker contract mappings",()=>{
  assert.equal(SENFX_DEMO_BOT_TEMPLATES.length,15);
  assert.equal(new Set(SENFX_DEMO_BOT_TEMPLATES.map(x=>x.id)).size,15);
  assert.equal(new Set(SENFX_DEMO_BOT_TEMPLATES.map(x=>x.symbol)).size,10);
  assert.equal(deriveDemoProposal("breakout-higher-lower","RISE",undefined,2)?.contract_type,"CALL");
  assert.equal(deriveDemoProposal("breakout-higher-lower","FALL",undefined,2)?.contract_type,"PUT");
  assert.equal(deriveDemoProposal("digit-over-4","OVER",undefined,2)?.barrier,"4");
});
test("read-only UI has no broker start buttons or trading control import",()=>{
  const library=read("app/bot-library/FifteenPaperBotLibrary.tsx");
  const readiness=read("app/bot-library/FifteenDemoBrokerReadiness.tsx");
  assert.match(library, /<FifteenDemoBrokerReadiness\/>/);
  assert.doesNotMatch(library,/FifteenDemoBotControlPanel|Start All 15 Demo Bots/);
  assert.match(readiness, /Verify All 15 Against Deriv Demo/);
  assert.match(readiness, /NOT ENABLED/);
});
test("production-readiness endpoints never make broker buys",()=>{
  for(const path of [
    "app/api/deriv/demo/bots/capabilities/route.ts",
    "app/api/deriv/demo/bots/capabilities/all/route.ts",
    "app/api/deriv/demo/bots/proposal/route.ts",
  ]){
    const source=read(path);
    assert.match(source,/getDerivDemoContext/);
    assert.match(source,/account\.account_type/);
    assert.doesNotMatch(source, /request(?:<any>)?\("buy"|buy:\s*quote\.id|\/ws\/real/);
    assert.doesNotMatch(source, /\.insert\(|\.upsert\(|\.update\(|\.delete\(/);
  }
});
test("read-only release does not import missing 15-bot production SQL schema",()=>{
 const library=read("app/bot-library/FifteenPaperBotLibrary.tsx");
 assert.doesNotMatch(library, /\/api\/deriv\/demo\/bots\/control/);
 const page=read("app/bot-library/page.tsx");
 assert.match(page,/read-only broker checks place no orders/);
});
