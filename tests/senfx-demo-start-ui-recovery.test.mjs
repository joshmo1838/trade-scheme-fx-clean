import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=(path)=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("selected Deriv Demo broker controls appear before paper research without changing 15 strategy definitions",()=>{
 const source=read("app/bot-library/FifteenPaperBotLibrary.tsx");
 const visible=source.indexOf('id="senfx-individual-demo"');
 const paper=source.indexOf('REAL NEXT-TICK PAPER SIMULATOR');
 const all=source.indexOf('<FifteenDemoBotControlPanel/>');
 assert.ok(visible>=0&&paper>visible&&all>visible);
 assert.match(source,/value=\{selectedId\}/);
 assert.match(source,/FIFTEEN_BOTS\.map\(bot=><option key=\{bot\.id\}/);
 assert.match(source,/FifteenDemoIndividualControl botId=\{selected\.id\} botName=\{selected\.name\}/);
 assert.match(source,/actual Deriv virtual Demo account/);
 assert.doesNotMatch(source,/No bots on this page place Deriv Demo or Real contracts/);
});

test("disabled Start has an actionable status, auth links and no direct broker purchase bypass",()=>{
 const control=read("app/bot-library/FifteenDemoIndividualControl.tsx");
 assert.match(control,/const blockReason=/);
 assert.match(control,/status\.code==="ADMIN_DEMO_LOGIN_REQUIRED"/);
 assert.match(control,/Check the virtual-money Demo authorization box/);
 assert.match(control,/Start Selected Demo Bot/);
 assert.match(control,/role="status" className=\{canStart\?styles\.ok:styles\.notice\}/);
 assert.match(control,/href="\/login"/);
 assert.match(control,/disabled=\{!canStart\}/);
 assert.match(control,/confirmVirtualDemoAutomation:action==="start_one"&&approved/);
 assert.match(control,/action:"start_one"\|"stop"/);
 assert.doesNotMatch(control,/session\.request\("buy"|\/ws\/real/);
});