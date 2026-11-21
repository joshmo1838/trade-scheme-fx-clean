import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
const runner=readFileSync(new URL("../app/bot-library/FifteenParallelPaperRunner.tsx",import.meta.url),"utf8");
const library=readFileSync(new URL("../app/bot-library/FifteenPaperBotLibrary.tsx",import.meta.url),"utf8");
const engine=readFileSync(new URL("../lib/bots/fifteen-paper-bots.ts",import.meta.url),"utf8");

test("bulk runner explicitly evaluates all fifteen original bots on genuine later ticks",()=>{
 assert.match(runner,/FIFTEEN_BOTS\.map\(/);
 assert.match(runner,/for\(const bot of FIFTEEN_BOTS\)/);
 assert.match(runner,/parsePublicDigitTick\(msg,now\)/);
 assert.match(runner,/observeFifteenPaperTick\(prior,tick,prev,now\)/);
 assert.match(runner,/startFifteenPaperSession\(/);
 assert.match(runner,/historyRef\.current\.set\(tick\.symbol,nextHistory\)/);
 assert.match(runner,/tick\.epoch<=prev\[prev\.length-1\]\.epoch/);
 assert.match(runner,/PAPER_MAX_TICK_AGE_MS/);
});
test("Start All 15, Emergency Stop, bounded 15-minute browser window",()=>{
 assert.match(runner,/Start All 15 Paper Bots/);
 assert.match(runner,/Emergency Stop All/);
 assert.match(runner,/MAX_MS=15\*60\*1000/);
 assert.match(runner,/MAX_STALE_MS=20_000/);
 assert.match(runner,/FIFTEEN_BOTS\.length&&/);
 assert.match(runner,/activeRef\.current=false;readyRef\.current=false;cleanConnection\(\)/);
 assert.match(runner,/One click starts 15 independent/);
 assert.match(library,/import FifteenParallelPaperRunner/);
 assert.match(library,/<FifteenParallelPaperRunner\/>/);
});
test("paper runner has NO broker buys, secret keys or made-up PnL",()=>{
 assert.doesNotMatch(runner,/session\.request\("buy"|\bproposal\s*:\s*1|\/api\/deriv\/demo\/orders|DERIV_TOKEN|SUPABASE_SERVICE_ROLE_KEY|autoReconnectPurchase/i);
 assert.doesNotMatch(runner,/\bprofit\s*:|\bpayout\s*:|\bsettled\s*:/i);
 assert.match(runner,/No virtual broker orders, real trades, returns or payouts are claimed/);
 assert.match(runner,/stake>=1&&stake<=25/);
 assert.match(runner,/totalCap>=planned/);
 assert.match(engine,/No broker proposals, purchases, token/);
});
