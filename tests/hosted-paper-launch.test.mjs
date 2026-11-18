import assert from "node:assert/strict";
import {test} from "node:test";
import {readFileSync} from "node:fs";
const source=readFileSync(new URL("../app/components/CustomerBotCenter.tsx",import.meta.url),"utf8");

test("all selected bot Starts prefer verified persistent 24/7 paper worker",()=>{
  assert.match(source,/async function startAllSelectedPaperBots\(\)/);
  assert.match(source,/for \(const bot of selectedPaperBots\)/);
  assert.match(source,/const verified = await fetch\("\/api\/bot-control"/);
  assert.match(source,/if \(controls\.enabled === true\)/);
  assert.match(source,/action:"start"/);
  assert.match(source,/commandId:crypto\.randomUUID\(\)/);
  assert.ok(source.indexOf('const verified = await fetch("/api/bot-control"') <
    source.indexOf('const response = await fetch(PAPER_RISK_ENDPOINT + "?botId="'),
    "Must verify the persistent worker mode before any browser engine path");
  assert.match(source,/Could not verify persistent paper controls\. No bot was started/);
});

test("hosted pause targets only running account-scoped runs and never claims stop",()=>{
  assert.match(source,/async function pauseHostedPaper\(botId\?: string\)/);
  assert.match(source,/run\.desired_state==="running"/);
  assert.match(source,/action:"pause"/);
  assert.match(source,/async function pauseAllPaperBots\(\)/);
  assert.match(source,/async function pauseOnePaperBot\(bot: Bot\)/);
  assert.match(source,/persistent PAPER Pause queued/);
  assert.match(source,/href="\/bot-controls"/);
});

test("browser fallback stays paper-only when hosted controls explicitly disabled",()=>{
  assert.match(source,/if \(controls\.enabled === true\)/);
  assert.match(source,/const preset = paperPreset\(bot\)/);
  assert.match(source,/const market = preset\.market/);
  assert.doesNotMatch(source,/DERIV_LIVE_TRADING_ENABLED\s*=\s*true/);
});
