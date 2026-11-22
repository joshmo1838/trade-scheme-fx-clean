import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,existsSync} from "node:fs";
import {FIFTEEN_BOTS} from "../lib/bots/fifteen-paper-bots.ts";
import {
 GOLDEN_RULE_MIN_FORWARD_SAMPLES,evaluateGoldenRule
} from "../lib/bots/senfx-golden-rule.mjs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");

test("1000 original forward paper observations per bot, never 15M",()=>{
 assert.equal(FIFTEEN_BOTS.length,15);
 assert.equal(GOLDEN_RULE_MIN_FORWARD_SAMPLES,1000);
 assert.equal(FIFTEEN_BOTS.length*GOLDEN_RULE_MIN_FORWARD_SAMPLES,15000);
 const at=2_000_000_000_000;
 const base={observations:1000,wins:650,
  quote:{askPrice:5,payout:9.1},quoteAsOfMs:at-1000,nowMs:at,
  demoBalance:1000,demoBalanceAsOfMs:at-1000,stake:5,
  termsMatch:true,brokerAligned:true,feedFresh:true};
 assert.equal(evaluateGoldenRule(base).researchCandidate,true);
 assert.equal(evaluateGoldenRule({...base,observations:999,wins:649}).researchCandidate,false);
 assert.equal(evaluateGoldenRule({...base,feedFresh:false}).researchCandidate,false);
 assert.equal(evaluateGoldenRule({...base,stake:6,quote:{askPrice:6,payout:10.92}}).researchCandidate,false);
});
test("the unused 15M durable collector, schema, endpoint and docs are absent",()=>{
 const removed=[
  "app/api/deriv/demo/bots/golden-progress/route.ts",
  "worker/senfx-golden-rule-15m-worker.mjs",
  "worker/Dockerfile.golden15m",
  "worker/golden-rule/package.json",
  "supabase/senfx-golden-rule-15m-paper-only.sql",
  "tests/senfx-golden-15m-infra.test.mjs",
  "tests/senfx-golden-rule-15m-postgres.sql",
  "docs/senfx-golden-rule-15m-research.md"
 ];
 for(const path of removed){
  assert.equal(existsSync(new URL("../"+path,import.meta.url)),false,path);
 }
});
test("Golden Rule research is browser-only with no broker buy or 15M API",()=>{
 const ui=read("app/bot-library/golden-rule/GoldenRuleLab.tsx");
 const tracker=read("lib/bots/senfx-golden-rule-research.ts");
 const rules=read("lib/bots/senfx-golden-rule.mjs");
 const workflow=read(".github/workflows/deriv-demo-gate.yml");
 assert.match(ui,/require 1,000 prospective samples/);
 assert.match(ui,/15,000/);
 assert.match(ui,/results freeze at 1,000 to avoid optional peeking/);
 assert.match(ui,/const record=view\.bots\[bot\.id\]/);
 assert.match(tracker,/if\(next\.observations>=GOLDEN_RULE_MIN_FORWARD_SAMPLES\)/);
 assert.match(rules,/GOLDEN_RULE_MIN_FORWARD_SAMPLES=1000/);
 for(const source of [ui,tracker,rules,workflow]){
  assert.doesNotMatch(source,/15-million-observation|15,000,000|15M study|golden-progress|Dockerfile\.golden15m|senfx-golden-rule-15m-postgres/i);
 }
 for(const source of [ui,tracker,rules]){
  assert.doesNotMatch(source,/\/ws\/real|\.request\(["']buy|\/api\/deriv\/demo\/bots\/control|DERIV_TOKEN_ENCRYPTION_KEY/i);
 }
});
