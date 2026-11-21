import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=(path)=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("individual Deriv Demo broker controls replace all paper-trade buttons in Bulk Bots",()=>{
 const source=read("app/bot-library/FifteenPaperBotLibrary.tsx");
 const visible=source.indexOf('id="senfx-individual-demo"');
 const broker=source.indexOf('id="senfx-demo-broker-controls"');
 const all=source.indexOf('<FifteenDemoBotControlPanel/>');
 assert.ok(visible>=0&&broker>visible&&all>visible);
 assert.doesNotMatch(source,/REAL NEXT-TICK PAPER SIMULATOR|Start paper bot|PAPER SESSION|PAPER READY/);
 assert.match(source,/value=\{selectedId\}/);
 assert.match(source,/FIFTEEN_BOTS\.map\(bot=><option key=\{bot\.id\}/);
 assert.match(source,/FifteenDemoIndividualControl botId=\{selected\.id\} botName=\{selected\.name\}/);
 assert.match(source,/Actual Deriv broker execution with virtual Demo funds/);
 assert.doesNotMatch(source,/No bots on this page place Deriv Demo or Real contracts/);
});

test("disabled Start has an actionable status, auth links and no direct broker purchase bypass",()=>{
 const control=read("app/bot-library/FifteenDemoIndividualControl.tsx");
 assert.match(control,/const blockReason=/);
 assert.match(control,/status\.code==="ADMIN_DEMO_LOGIN_REQUIRED"/);
 assert.match(control,/Check the virtual-money Demo authorization box/);
 assert.match(control,/Start Selected Demo Bot/);
 assert.match(control,/role="status" className=\{selectedActive&&status\?\.run\?\.workerConnected\?styles\.ok:canStart\?styles\.ok:styles\.notice\}/);
 assert.match(control,/href="\/login"/);
 assert.match(control,/disabled=\{!canStart\}/);
 assert.match(control,/confirmVirtualDemoAutomation:action==="start_one"&&approved/);
 assert.match(control,/action:"start_one"\|"stop"/);
 assert.doesNotMatch(control,/session\.request\("buy"|\/ws\/real/);
});