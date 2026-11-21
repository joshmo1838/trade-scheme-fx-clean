import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=(p)=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const library=read("app/bot-library/FifteenPaperBotLibrary.tsx");
const component=read("app/bot-library/FifteenDemoIndividualControl.tsx");
const route=read("app/api/deriv/demo/bots/control/route.ts");
const css=read("app/bot-library/fifteen.module.css");

test("Bulk Bots presents genuine Deriv virtual Demo control and live results ABOVE full-width 15 strategy cards",()=>{
 assert.match(library,/id="senfx-individual-demo"/);
 assert.match(library,/className=\{styles\.demoWorkspace\}/);
 assert.match(library,/className=\{styles\.libraryWide\}/);
 assert.ok(library.indexOf('id="senfx-demo-broker-controls"')<library.indexOf('className={styles.libraryWide}'));
 assert.match(library,/FifteenDemoIndividualControl botId=\{selected\.id\} botName=\{selected\.name\}/);
 assert.equal((library.match(/<FifteenDemoIndividualControl/g)||[]).length,1);
 assert.match(library,/FIFTEEN_BOTS\.map\(\(bot,index\)/);
 assert.doesNotMatch(library,/Start paper bot|REAL NEXT-TICK PAPER SIMULATOR/);
 assert.doesNotMatch(library,/className=\{styles\.sidebar\}/);
 assert.match(css,/\.demoWorkspace\{display:grid/);
 assert.match(css,/\.libraryWide \.botGrid\{grid-template-columns:repeat\(4/);
});

test("broker status shows actual server-authorized stake and settled results, not hypothetical wins",()=>{
 assert.match(component,/data\.run\?\.desiredState==="running"/);
 assert.match(component,/setStake\(String\(data\.run\.stakeAmount\)\)/);
 assert.match(component,/setTrades\(String\(data\.run\.targetTrades\)\)/);
 assert.match(component,/BROKER WORKER/);
 assert.match(component,/SETTLED CONTRACTS/);
 assert.match(component,/OPEN \/ RECONCILING/);
 assert.match(component,/ACTUAL DEMO STAKE/);
 assert.match(component,/DERIV VIRTUAL NET P\/L/);
 assert.match(component,/broker results/);
 assert.match(route,/restartCooldownSeconds/);
 assert.match(route,/pending:\(history\.data\|\|\[\]\)\.filter/);
 assert.match(route,/brokerBuyingEnabled:buyOn&&workerEnabled/);
 assert.match(route,/realMoneySupported:false/);
});

test("recent emergency stop shows a wait countdown instead of raw error and blocks stale restart",()=>{
 assert.match(route,/new Date\(data\.stopped_at\)\.getTime\(\)\+60_000-now/);
 assert.match(component,/restartWait===0/);
 assert.match(component,/EMERGENCY_STOP_COOLDOWN/);
 assert.match(component,/Emergency Stop safety cooldown:/);
 assert.match(component,/const canStop=!!status\?\.ok&&running&&!pending/);
 assert.match(component,/confirmVirtualDemoAutomation:action==="start_one"&&approved/);
 assert.match(component,/stakeAmount:stake/);
 assert.match(component,/Stop Active Demo Bot/);
 assert.match(component,/Start Selected Demo Bot/);
 assert.doesNotMatch(component,/\/ws\/real|session\.request\("buy"/);
});
