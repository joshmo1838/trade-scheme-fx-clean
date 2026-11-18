import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
 DIGIT_MARKETS,DIGIT_WINDOW,DIGIT_MATRIX_NAME,
 lastDigitFromQuote,parsePublicDigitTick,summarizeDigits,plannedExposure,
} from "../lib/bots/digit-matrix.ts";

test("last digit respects Deriv pip_size even when JS drops trailing zeros",()=>{
 assert.equal(lastDigitFromQuote(1.085,5),0);
 assert.equal(lastDigitFromQuote(100.23,3),0);
 assert.equal(lastDigitFromQuote(100.234,3),4);
 assert.equal(lastDigitFromQuote(100.234,1),2);
 assert.equal(lastDigitFromQuote(105,0),5);
 assert.equal(lastDigitFromQuote(1.123,undefined),null);
 assert.equal(lastDigitFromQuote(1.123,-1),null);
 assert.equal(lastDigitFromQuote(1.123,9),null);
 assert.equal(lastDigitFromQuote(Infinity,5),null);
});
test("parser never fabricates a digit from malformed, unknown, or stale quotes",()=>{
 const now=1_800_000_000_000;
 const valid=parsePublicDigitTick({
  msg_type:"tick",
  tick:{symbol:"R_100",quote:125.4,pip_size:3,epoch:now/1000,id:"tick_001"}
 },now);
 assert.ok(valid);
 assert.equal(valid.digit,0);
 assert.equal(valid.quoteText,"125.400");
 assert.equal(valid.symbol,"R_100");
 assert.equal(valid.tickId,"tick_001");
 const cases=[
  {msg_type:"tick",tick:{symbol:"UNKNOWN",quote:1.1,pip_size:2,epoch:now/1000}},
  {msg_type:"tick",tick:{symbol:"R_100",quote:1.1,epoch:now/1000}},
  {msg_type:"tick",tick:{symbol:"R_100",quote:1.1,pip_size:2,epoch:now/1000-70}},
  {msg_type:"tick",tick:{symbol:"R_100",quote:1.1,pip_size:2,epoch:now/1000+40}},
  {msg_type:"tick",tick:{symbol:"R_100",quote:-1,pip_size:2,epoch:now/1000}},
  {msg_type:"error",error:{code:"bad"},tick:{symbol:"R_100",quote:1.1,pip_size:2,epoch:now/1000}},
 ];
 for(const input of cases)assert.equal(parsePublicDigitTick(input,now),null);
});
test("counts, rolling cap, parity and sample readiness are descriptive only",()=>{
 assert.equal(DIGIT_MARKETS.length,10);
 assert.equal(new Set(DIGIT_MARKETS.map(m=>m.symbol)).size,10);
 assert.equal(DIGIT_MATRIX_NAME,"SENFX Digit Matrix");
 assert.equal(summarizeDigits([]),null);
 assert.equal(summarizeDigits([1,11]),null);
 const simple=summarizeDigits([0,0,2,3,7,7]);
 assert.ok(simple);
 assert.deepEqual(simple.counts,[2,0,1,1,0,0,0,2,0,0]);
 assert.equal(simple.samples,6);
 assert.equal(simple.evenPercent,50);
 assert.equal(simple.oddPercent,50);
 assert.equal(simple.streak,2);
 assert.equal(simple.ready,false);
 const uniform=Array.from({length:200},(_,i)=>i%10);
 const summary=summarizeDigits(uniform);
 assert.ok(summary);
 assert.equal(summary.samples,DIGIT_WINDOW);
 assert.ok(summary.ready);
 assert.deepEqual(summary.counts,Array(10).fill(16));
 assert.ok(Math.abs(summary.entropyBits-Math.log2(10))<1e-9);
});
test("hypothetical batch planner rejects stake and trade-count abuse",()=>{
 assert.deepEqual(plannedExposure(10,1,20),{
  valid:true,total:10,withinCap:true,
  reason:"Within the illustrative paper-risk budget. No order was placed.",
 });
 assert.equal(plannedExposure(100,10,50).withinCap,false);
 assert.equal(plannedExposure(2000,10,50000).valid,false);
 assert.equal(plannedExposure(10,11,200).valid,false);
 assert.equal(plannedExposure(10.5,3,31.5).total,31.5);
});
test("Bot Center and server APIs block this scanner from directional trading",()=>{
 const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
 const center=read("app/components/CustomerBotCenter.tsx");
 const controls=read("app/api/bot-control/route.ts");
 const paper=read("app/api/paper-trading/route.ts");
 const scanner=read("app/components/DigitMatrixScanner.tsx");
 const sql=read("supabase/senfx-digit-matrix-scanner-only-guard.sql");
 assert.match(center,/!isDigitMatrixBot\(bot\)/);
 assert.match(center,/href="\/digit-matrix"/);
 assert.match(controls,/bot\.name === DIGIT_MATRIX_NAME/);
 assert.match(paper,/botInfo\.name === DIGIT_MATRIX_NAME/);
 assert.match(sql,/BEFORE INSERT OR UPDATE ON public\.bot_execution_runs/);
 assert.match(sql,/BEFORE INSERT OR UPDATE ON public\.customer_paper_trade_reservations/);
 assert.match(scanner,/active_symbols:"brief"/);
 assert.match(scanner,/parsePublicDigitTick\(message,Date\.now\(\)\)/);
 assert.match(scanner,/No broker purchases/);
 assert.doesNotMatch(scanner,/\bbuy\s*:|\bbuy\(|\bproposal\s*:|trade\/buy|\/ws\/real/);
});
