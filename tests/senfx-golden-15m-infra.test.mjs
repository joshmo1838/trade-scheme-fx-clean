import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {FIFTEEN_BOTS} from "../lib/bots/fifteen-paper-bots.ts";
import {GOLDEN_RULE_MIN_FORWARD_SAMPLES,evaluateGoldenRule} from "../lib/bots/senfx-golden-rule.mjs";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const worker=read("worker/senfx-golden-rule-15m-worker.mjs");
const docker=read("worker/Dockerfile.golden15m");
const schema=read("supabase/senfx-golden-rule-15m-paper-only.sql");
const api=read("app/api/deriv/demo/bots/golden-progress/route.ts");
const lab=read("app/bot-library/golden-rule/GoldenRuleLab.tsx");

test("SENFX Golden Rule is exactly 15 million paper studies with unchanged fifteen bots",()=>{
 assert.equal(GOLDEN_RULE_MIN_FORWARD_SAMPLES,1_000_000);
 assert.equal(FIFTEEN_BOTS.length,15);
 assert.equal(FIFTEEN_BOTS.length*GOLDEN_RULE_MIN_FORWARD_SAMPLES,15_000_000);
 assert.match(schema,/BETWEEN 0 AND 1000000/);
 assert.match(api,/targetPerBot:1_000_000,targetTotal:15_000_000/);
 assert.match(lab,/15,000,000/);
 assert.match(lab,/1,000,000/);
 assert.match(lab,/view\.bots\[x\.id\]\.observations/);
});
test("Golden Rule rejects under-sampled and negative expectancy strategies",()=>{
 const at=2_000_000_000_000;
 const base={observations:1_000_000,wins:650_000,
  quote:{askPrice:5,payout:9.1},quoteAsOfMs:at-1000,nowMs:at,
  demoBalance:1000,demoBalanceAsOfMs:at-2000,
  stake:5,termsMatch:true,brokerAligned:true,feedFresh:true};
 assert.equal(evaluateGoldenRule(base).researchCandidate,true);
 assert.equal(evaluateGoldenRule({...base,observations:999_999,wins:649_999}).researchCandidate,false);
 assert.equal(evaluateGoldenRule({...base,wins:500_000}).researchCandidate,false);
 assert.equal(evaluateGoldenRule({...base,brokerAligned:false}).researchCandidate,false);
});
test("standalone worker is disabled by default and has no account access or buy path",()=>{
 assert.match(worker,/process\.env\.SENFX_GOLDEN_RESEARCH_ENABLED!=="true"/);
 assert.match(worker,/process\.exit\(0\)/);
 assert.match(worker,/ws\/public/);
 assert.match(worker,/senfx_golden_claim_collector/);
 assert.match(worker,/senfx_golden_checkpoint/);
 assert.match(worker,/state=applyGoldenPublicTick/);
 assert.match(worker,/parsePublicDigitTick/);
 assert.match(worker,/lastScoredEpoch/);
 assert.match(worker,/Collector lease declined/);
 assert.doesNotMatch(worker,/deriv_connections|DERIV_TOKEN_ENCRYPTION_KEY|\/ws\/real|\/ws\/demo|\.request\("buy"|request\("proposal"|\/trading\/v1\/options\/accounts/);
 assert.doesNotMatch(docker,/SENFX_GOLDEN_RESEARCH_ENABLED=true/);
 assert.match(docker,/USER node/);
 for(const name of [
 "worker/senfx-golden-rule-15m-worker.mjs",
 "lib/bots/fifteen-paper-bots.ts",
 "lib/bots/digit-matrix.ts",
 "lib/bots/senfx-golden-rule-research.ts",
 "lib/bots/senfx-golden-rule.mjs"
 ])assert.ok(docker.includes(name),name);
});
test("15M database evidence is separate, role-restricted and only grows under an exclusive lease",()=>{
 assert.match(schema,/CREATE TABLE IF NOT EXISTS public\.senfx_golden_rule_progress/);
 assert.match(schema,/CREATE TABLE IF NOT EXISTS public\.senfx_golden_rule_lease/);
 assert.match(schema,/ENABLE ROW LEVEL SECURITY/g);
 assert.match(schema,/REVOKE ALL ON public\.senfx_golden_rule_progress FROM PUBLIC, anon, authenticated/);
 assert.match(schema,/REVOKE ALL ON public\.senfx_golden_rule_lease FROM PUBLIC, anon, authenticated/);
 assert.match(schema,/auth\.role\(\) IS DISTINCT FROM 'service_role'/g);
 assert.match(schema,/expires_at>now\(\) FOR UPDATE/);
 assert.match(schema,/progress\.observations<=EXCLUDED\.observations/);
 assert.match(schema,/progress\.wins<=EXCLUDED\.wins/);
 assert.match(schema,/progress\.losses<=EXCLUDED\.losses/);
 assert.match(schema,/progress\.last_scored_epoch<=EXCLUDED\.last_scored_epoch/);
 assert.match(schema,/wins\+losses=observations/);
 assert.doesNotMatch(schema,/deriv_demo_orders|senfx_demo_bot_orders|UPDATE public\.senfx_demo_bot_control|DROP TABLE.*bot_orders/i);
});
test("durable progress API checks user admin and exposes only paper summaries",()=>{
 assert.match(api,/userClient\.auth\.getUser\(\)/);
 assert.match(api,/profile\?\.role!=="admin"/);
 assert.match(api,/brokerOrdersPlaced:0/);
 assert.match(api,/realMoneySupported:false/);
 assert.match(api,/Cache-Control":"private, no-store/);
 assert.doesNotMatch(api,/session\.request\("buy"|DERIV_TOKEN_ENCRYPTION_KEY|\.rpc\("senfx_demo_bots_control"|\/ws\/demo/);
 assert.match(lab,/\/api\/deriv\/demo\/bots\/golden-progress/);
 assert.match(lab,/Only server-persisted observations count toward/);
 assert.match(lab,/requires a separate explicit deployment/);
 assert.doesNotMatch(lab,/\.request\("buy"|Start Selected Demo Bot/);
});
