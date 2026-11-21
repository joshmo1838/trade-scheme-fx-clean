import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=(p)=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const api=read("app/api/deriv/demo/bots/payout-preview/route.ts");
const ui=read("app/bot-library/FifteenDemoPayoutComparison.tsx");
const library=read("app/bot-library/FifteenPaperBotLibrary.tsx");
const templates=read("lib/deriv/demo-bot-contracts.mjs");
const botRules=read("lib/bots/fifteen-paper-bots.ts");

test("new payout endpoint is strictly authenticated admin-only virtual USD Demo and read-only",()=>{
 assert.match(api,/getDerivDemoContext\(\)/);
 assert.match(api,/profile\?\.role!=="admin"/);
 assert.match(api,/context\.account\.account_type!=="demo"/);
 assert.match(api,/context\.account\.currency!=="USD"/);
 assert.match(api,/context\.account\.status!=="active"/);
 assert.match(api,/SAME_ORIGIN_REQUIRED/);
 assert.match(api,/Array\.isArray\(b\.candidates\)/);
 assert.match(api,/b\.candidates\.length>15/);
 assert.match(api,/deriveDemoProposal\(c\.botId,c\.prediction,c\.barrier,stake\)/);
 assert.match(api,/openDerivDemoSession\(context\)/);
 assert.match(api,/session!\.request\("proposal",proposal,9000\)/);
 assert.match(api,/Math\.abs\(ask-stake\)>0\.011/);
 assert.match(api,/finally\{[\s\S]*session\?\.close\(\)/);
 assert.match(api,/brokerOrdersPlaced:0/);
 assert.match(api,/realMoneySupported:false/);
 assert.doesNotMatch(api,/\.request\("buy"|\/ws\/real|\.from\("senfx_demo_bot_orders"\)\s*\.insert|\/api\/deriv\/demo\/orders/);
});
test("broker payout economics are calculated from Deriv ask_price and payout",()=>{
 assert.match(api,/netWinProfit:Number\(\(payout-ask\)\.toFixed\(2\)\)/);
 assert.match(api,/returnOnStakePercent:Number\(\(\(payout-ask\)\/ask\*100\)\.toFixed\(2\)\)/);
 assert.match(api,/breakEvenWinRatePercent:Number\(\(ask\/payout\*100\)\.toFixed\(2\)\)/);
 assert.match(api,/quotes\.sort\(\(a,b\)=>b\.returnOnStakePercent-a\.returnOnStakePercent\)/);
 assert.match(ui,/Higher payouts usually require lower win probabilities/);
 assert.match(ui,/do not automatically switch contracts/);
 assert.match(ui,/Break-even win rate = contract purchase price/);
});
test("all 15 original bot rules, markets, barrier types and broker execution remain unchanged",()=>{
 assert.equal((templates.match(/\{id:"/g)||[]).length,15);
 assert.equal((botRules.match(/\{id:"/g)||[]).length,15);
 assert.match(library,/FIFTEEN_BOTS\.flatMap\(bot=>/);
 assert.match(library,/predictFifteenBot\(bot,current\.quotes\)/);
 assert.match(library,/FifteenDemoPayoutComparison candidates=\{payoutCandidates\}/);
 assert.match(library,/<FifteenDemoIndividualControl botId=\{selected\.id\} botName=\{selected\.name\}/);
 assert.match(ui,/Compare current payouts/);
 assert.match(ui,/No broker purchase will be made/);
 assert.match(ui,/brokerOrdersPlaced/); // read-only response type
 assert.doesNotMatch(ui,/confirmVirtualDemoAutomation|\.request\("buy"|Start Selected Demo Bot/);
});
