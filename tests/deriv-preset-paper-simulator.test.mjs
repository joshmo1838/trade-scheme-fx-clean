import test from "node:test";
import assert from "node:assert/strict";
import {createPresetPaperSession} from "../lib/deriv/preset-paper-simulator.mjs";
import {DERIV_PRESET_REFERENCE} from "../lib/deriv/official-preset-reference.mjs";
test("every available reference template can start paper-only",()=>{
 for(const item of DERIV_PRESET_REFERENCE){
  const s=createPresetPaperSession({templateId:item.id});
  assert.equal(s.snapshot().execution,"paper_only");
  assert.equal(s.snapshot().stake,1);
  assert.equal(s.recordPaperSettlement("loss",-1).rounds,1);
 }
});
test("martingale doubles after loss but stops before exceeding stake cap",()=>{
 const s=createPresetPaperSession({templateId:"options-martingale",maxStake:3});
 assert.equal(s.recordPaperSettlement("loss",-1).stake,2);
 assert.equal(s.recordPaperSettlement("loss",-2).stopped,true);
 assert.equal(s.snapshot().stake,0);
});
test("reverse martingale increases after win and resets on loss",()=>{
 const s=createPresetPaperSession({templateId:"options-reverse-martingale"});
 assert.equal(s.recordPaperSettlement("win",0.8).stake,2);
 assert.equal(s.recordPaperSettlement("loss",-2).stake,1);
});
test("loss cap fails closed and inputs cannot forge settlements",()=>{
 const s=createPresetPaperSession({templateId:"options-dalembert",maxCumulativeLoss:2});
 assert.throws(()=>s.recordPaperSettlement("win",-1));
 assert.equal(s.recordPaperSettlement("loss",-2).stopped,true);
 assert.equal(s.snapshot().rounds,1);
 assert.throws(()=>createPresetPaperSession({templateId:"missing"}));
 assert.throws(()=>createPresetPaperSession({templateId:"options-martingale",baseStake:20,maxStake:10}));
});
