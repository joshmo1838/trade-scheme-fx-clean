import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {RESEARCH_PROFILES,evaluateResearchProfile,compareResearchSignals} from "../lib/bots/strategy-lab.ts";
import {paperPreset,evaluatePaperSignal} from "../lib/bots/paper-strategy.ts";

test("all three original bot names and markets are preserved independently",()=>{
 assert.deepEqual(RESEARCH_PROFILES.map(x=>[x.name,x.symbol]),[
  ["SENFX Synthetic pro","R_100"],
  ["Synthetic Trend Scout","R_50"],
  ["Volatility Watch","R_75"],
 ]);
 assert.deepEqual(RESEARCH_PROFILES.map(x=>x.minimumTicks),[32,32,32]);
 assert.equal(paperPreset({name:"SENFX Synthetic pro",market:"Synthetic Indices"}).slow,21);
 assert.equal(paperPreset({name:"Synthetic Trend Scout",market:"Synthetic Indices"}).slow,18);
 assert.equal(paperPreset({name:"Volatility Watch",market:"Synthetic Indices"}).slow,21);
});

test("no historical data, bad quotes or flat prices can create a research signal",()=>{
 const name="SENFX Synthetic pro";
 for(const prices of [[],Array(31).fill(100),Array(32).fill(100),
   [...Array(31).fill(100),NaN], [...Array(31).fill(100),Infinity],
   [...Array(31).fill(100),0]]){
  const result=evaluateResearchProfile(name,prices);
  assert.equal(result.candidateSignal,null);
 }
});
test("sustained rising and falling markets can pass research filters",()=>{
 for(const profile of RESEARCH_PROFILES){
  const prices=Array.from({length:40},(_,i)=>100+i*.09);
  const rising=evaluateResearchProfile(profile.name,prices);
  assert.equal(rising.baseSignal,"CALL",profile.name);
  assert.equal(rising.candidateSignal,"CALL",profile.name);
  assert.equal(rising.reason,"research-signal",profile.name);
  const falling=evaluateResearchProfile(profile.name,prices.map(v=>220-v));
  assert.equal(falling.candidateSignal,"PUT",profile.name);
 }
});
test("Trend Scout skips sideways oscillation even when SMA baseline fires",()=>{
 const prices=Array.from({length:40},(_,i)=>100+i*.03+(i%2?0.3:-0.3));
 const result=evaluateResearchProfile("Synthetic Trend Scout",prices);
 assert.notEqual(result.baseSignal,null);
 assert.equal(result.candidateSignal,null);
 assert.equal(result.reason,"low-directional-efficiency");
 assert.ok(result.efficiency<0.56);
});
test("Volatility Watch rejects abrupt spike before evaluating a new paper decision",()=>{
 const prices=[...Array.from({length:31},(_,i)=>100+i*.01),110];
 const result=evaluateResearchProfile("Volatility Watch",prices);
 assert.equal(result.baseSignal,"CALL");
 assert.equal(result.candidateSignal,null);
 assert.equal(result.reason,"abrupt-last-tick-shock");
 assert.ok(result.latestShockRatio>2.5);
});
test("R100 prototype rejects conflicting near-term momentum without changing old preset",()=>{
 const prices=[...Array.from({length:27},(_,i)=>100+i),125,124,123,122,121];
 const result=evaluateResearchProfile("SENFX Synthetic pro",prices);
 assert.equal(result.baseSignal,"CALL");
 assert.equal(result.candidateSignal,null);
 assert.equal(result.reason,"momentum-disagreement");
 assert.equal(evaluatePaperSignal(prices,paperPreset({name:"SENFX Synthetic pro",market:"Synthetic Indices"})),"CALL");
});
test("candidate review measures decisions, never unverified win rate or profit",()=>{
 const prices=Array.from({length:80},(_,i)=>100+i*.1);
 const summary=compareResearchSignals("SENFX Synthetic pro",prices);
 assert.equal(summary.processedWindows,49);
 assert.equal(summary.baselineSignals,49);
 assert.equal(summary.candidateSignals,49);
 assert.equal(summary.filteredSignals,0);
 assert.deepEqual(Object.keys(summary),[
  "profile","symbol","processedWindows","baselineSignals","candidateSignals","filteredSignals","alignedSignals",
 ]);
 const file=readFileSync(new URL("../lib/bots/strategy-lab.ts",import.meta.url),"utf8");
 assert.doesNotMatch(file,/["']\/api\/deriv\/buy|SUPABASE_SERVICE_ROLE_KEY|["']proposal["']|["']buy["']/);
});
