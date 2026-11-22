import test from "node:test";
import assert from "node:assert/strict";
import { evaluateScannerGate, evaluateBotScannerBatch } from "../lib/market/bot-scanner-gate.ts";
const now=1_800_000_000_000;
const tick={id:"t1",epochMs:now-100,quote:123.45};
const base={botId:"bot-1",originalSignal:"CALL",tick,previousTick:null,nowMs:now,researchScore:80};
test("valid research preserves original direction without broker order",()=>{
 const result=evaluateScannerGate(base);
 assert.equal(result.action,"observe");
 assert.equal(result.originalSignal,"CALL");
});
test("missing score fails closed",()=>assert.equal(evaluateScannerGate({...base,researchScore:null}).action,"wait"));
test("score below threshold fails closed",()=>assert.equal(evaluateScannerGate({...base,researchScore:74}).action,"wait"));
test("original no-signal cannot be created by scanner",()=>assert.equal(evaluateScannerGate({...base,originalSignal:null}).action,"wait"));
test("emergency stop blocks",()=>assert.equal(evaluateScannerGate({...base,emergencyStop:true}).action,"wait"));
test("duplicate tick blocks",()=>assert.equal(evaluateScannerGate({...base,previousTick:tick}).action,"wait"));
test("stale tick blocks",()=>assert.equal(evaluateScannerGate({...base,tick:{...tick,epochMs:now-6000}}).action,"wait"));
test("all 15 independent bot decisions remain associated with their original bot",()=>{
 const inputs=Array.from({length:15},(_,i)=>({...base,botId:"bot-"+i,originalSignal:i%2?"PUT":"CALL"}));
 const result=evaluateBotScannerBatch(inputs);
 assert.equal(result.length,15);
 result.forEach((r,i)=>{assert.equal(r.botId,inputs[i].botId);assert.equal(r.originalSignal,inputs[i].originalSignal);});
});
test("duplicate bot ID cannot be evaluated twice",()=>{
 const result=evaluateBotScannerBatch([base,base]);
 assert.equal(result[1].reason,"duplicate-bot-id");
});
