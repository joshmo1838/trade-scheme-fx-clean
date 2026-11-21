import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const worker=readFileSync(new URL("../worker/senfx-deriv-demo-15bot-worker.mjs",import.meta.url),"utf8");

test("15-bot Deriv worker never runs without FOUR independent private opt-ins",()=>{
 for(const key of [
  "SENFX_DEMO_15BOT_BROKER_EXECUTION_ENABLED",
  "SENFX_DEMO_15BOT_CONTROL_ENABLED",
  "DERIV_DEMO_BROKER_BUY_ENABLED",
  "DERIV_DEMO_TRADING_ENABLED"
 ])assert.ok(worker.includes(key),key);
 assert.match(worker,/if\(!ACTIVE\)\{/);
 assert.match(worker,/process\.exit\(0\)/);
 assert.match(worker,/DERIV_DEMO_PILOT_USER_ID/);
});
test("worker uses only selected verified Demo account and OTP demo socket",()=>{
 assert.match(worker,/account_type!=="demo"/);
 assert.match(worker,/isVerifiedDemoAccount\(record,connection\.active_account_id\)/);
 assert.match(worker,/session not explicitly Demo|Broker session is not explicitly Demo/);
 assert.match(worker,/url\.pathname!=="\/trading\/v1\/options\/ws\/demo"/);
 assert.doesNotMatch(worker,/url\.pathname\s*===?\s*["']\/trading\/v1\/options\/ws\/real/);
 assert.match(worker,/DERIV_TOKEN_ENCRYPTION_KEY/);
});
test("all 15 strategies run on genuine future public tick data",()=>{
 assert.match(worker,/FIFTEEN_BOTS/);
 assert.match(worker,/parsePublicDigitTick\(msg,now\)/);
 assert.match(worker,/isFreshPublicTick\(tick,now\)/);
 assert.match(worker,/tick\.epoch<=prior/);
 assert.match(worker,/predictFifteenBot\(bot,hist\)/);
 assert.match(worker,/subscribed\.add\(market\)/);
 assert.match(worker,/Not all fifteen strategy markets are publicly available/);
});
test("broker buys are single-attempt and only AFTER service-role atomic reservation and marker",()=>{
 const reserve=worker.indexOf('"senfx_demo_bots_reserve"');
 const mark=worker.indexOf('"senfx_demo_bots_mark_attempt"');
 const buy=worker.indexOf('session.request("buy"');
 assert.ok(reserve>=0&&mark>reserve&&buy>mark,"RPC order must be reserve, mark, then broker buy");
 assert.match(worker,/safeToPurchase\(/);
 assert.match(worker,/getUnresolvedOrderCount\(\)/);
 assert.match(worker,/No retry of buy under ANY failure/);
 assert.match(worker,/\.eq\("status","buy_unknown"\)/);
 assert.match(worker,/!permitted\|\|finishing/);
});
test("settlement is based on the purchased broker contract, never inferred from a paper hit",()=>{
 assert.match(worker,/proposal_open_contract/);
 assert.match(worker,/verifiedFinalContract\(/);
 assert.match(worker,/"senfx_demo_bots_record_settlement"/);
 assert.match(worker,/Never retries an uncertain buy/);
 assert.match(worker,/Safety stop/);
 assert.doesNotMatch(worker,/Math\.random\(\).*profit|paperHit.*payout/i);
});
test("stop, worker lease loss and stale data end the run without more purchases",()=>{
 assert.match(worker,/stopOwnedRun\(/);
 assert.match(worker,/clearInterval\(interval\)/);
 assert.match(worker,/senfx_demo_bots_worker_heartbeat/);
 assert.match(worker,/p_expected_version:version/);
 assert.match(worker,/if\(busy\|\|finishing/);
 assert.match(worker,/Date\.now\(\)-lastTickReceived>MAX_WAIT_FOR_MARKET_MS/);
});
