import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {SENFX_DEMO_BOT_TEMPLATES, deriveDemoProposal} from "../lib/deriv/demo-bot-contracts.mjs";

const read=(path)=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const withoutComments=(source)=>source.replace(/\/\*[\s\S]*?\*\/|(^|[^:])\/\/.*$/gm,"$1");

test("the original fifteen strategy definitions and broker mappings remain distinct",()=>{
  assert.equal(SENFX_DEMO_BOT_TEMPLATES.length,15);
  assert.equal(new Set(SENFX_DEMO_BOT_TEMPLATES.map(x=>x.id)).size,15);
  assert.equal(new Set(SENFX_DEMO_BOT_TEMPLATES.map(x=>x.symbol)).size,10);
  assert.equal(deriveDemoProposal("breakout-higher-lower","RISE",undefined,2)?.contract_type,"CALL");
  assert.equal(deriveDemoProposal("breakout-higher-lower","FALL",undefined,2)?.contract_type,"PUT");
  assert.equal(deriveDemoProposal("digit-over-4","OVER",undefined,2)?.barrier,"4");
});

test("the bot-library route mounts all fifteen original strategies and keeps Demo controls gated",()=>{
  const page=read("app/bot-library/page.tsx");
  const library=read("app/bot-library/FifteenPaperBotLibrary.tsx");
  const control=read("app/bot-library/FifteenDemoBotControlPanel.tsx");
  assert.match(page,/FifteenPaperBotLibrary/);
  assert.match(library,/FIFTEEN_BOTS/);
  assert.match(library,/FifteenDemoBotControlPanel/);
  assert.match(control,/status\?\.ok&&status\.controlsEnabled&&!armed&&consent&&validStake/);
  assert.match(control,/confirmVirtualDemoAutomation/);
  assert.match(control,/Real-money trading stays disabled/);
});

test("readiness and proposal APIs are read-only Deriv Demo diagnostics",()=>{
  for(const path of [
    "app/api/deriv/demo/bots/capabilities/route.ts",
    "app/api/deriv/demo/bots/capabilities/all/route.ts",
    "app/api/deriv/demo/bots/proposal/route.ts",
  ]){
    const source=withoutComments(read(path));
    assert.match(source,/SENFX_DEMO_READONLY_DIAGNOSTICS_ENABLED/);
    assert.match(source,/getDerivDemoContext/);
    assert.match(source,/account\.account_type\s*!==\s*"demo"/);
    assert.match(source,/purchaseEnabled:\s*false|brokerPurchasesEnabledByCheck:\s*false/);
    assert.doesNotMatch(source,/request(?:<any>)?\("buy"|buy:\s*quote\.id|\/ws\/real/);
    assert.doesNotMatch(source,/\.insert\(|\.upsert\(|\.update\(|\.delete\(/);
  }
});

test("Demo execution endpoints fail closed on schema, account, consent, and feature gates",()=>{
  const control=read("app/api/deriv/demo/bots/control/route.ts");
  const orders=read("app/api/deriv/demo/orders/route.ts");
  const proxy=read("proxy.ts");
  assert.match(control,/STAGED_15BOT_SCHEMA_NOT_RELEASED/);
  assert.match(control,/DERIV_DEMO_TRADING_ENABLED!=="true"/);
  assert.match(control,/DERIV_DEMO_BROKER_BUY_ENABLED!=="true"/);
  assert.match(control,/SENFX_DEMO_15BOT_BROKER_EXECUTION_ENABLED!=="true"/);
  assert.match(control,/confirmVirtualDemoAutomation!==true/);
  assert.match(control,/account\.account_type!=="demo"/);
  assert.match(control,/realMoneySupported:false/);
  assert.match(orders,/DERIV_DEMO_TRADING_ENABLED !== "true"/);
  assert.match(orders,/DERIV_DEMO_BROKER_BUY_ENABLED === "true"/);
  assert.match(orders,/confirmVirtualPurchase !== true/);
  assert.ok(proxy.includes("demo\\/(?:account-balance"));
  assert.ok(proxy.includes("orders|readiness"));
  assert.doesNotMatch(proxy,/demo\\\/\(\?:\.\*\)/);
});
