/**
 * SENFX Digit Matrix bulk PAPER simulator.
 *
 * Observational, next-tick parity experiments only. Every result is derived
 * from an actually received public quote AFTER the batch was armed. No
 * broker contract, payout quote, funds, order API or inferred historical tick.
 */
import {
  DIGIT_MARKETS, plannedExposure, type DigitSymbol, type ObservedTick,
} from "./digit-matrix.ts";

export type PaperParitySide="EVEN"|"ODD";
export type PaperBatchState="running"|"completed"|"stopped";
export type PaperBatchResult={
  index:number; epoch:number; observedDigit:number; observedQuote:string;
  matchingParity:boolean; stakeAtRisk:number;
};
export type DigitPaperBatch={
  symbol:DigitSymbol; side:PaperParitySide; stake:number; requested:number;
  dailyCap:number; startedAtMs:number; startEpoch:number;
  lastEpoch:number; lastKey:string|null;
  state:PaperBatchState; stopReason:string|null;
  entries:readonly PaperBatchResult[];
};
export type ArmPaperBatchResult=
  |{ok:true;batch:DigitPaperBatch}
  |{ok:false;reason:string};

const VALID_MARKETS=new Set<string>(DIGIT_MARKETS.map(item=>item.symbol));
/** Only a fresh, already observed quote can arm a batch. No backfilling. */
export function armDigitPaperBatch(input:{
  symbol:string;side:string;stake:number;count:number;dailyCap:number;
  lastObservedEpoch:number;lastObservedAtMs:number;nowMs:number;
}):ArmPaperBatchResult{
  const {
    symbol,side,stake,count,dailyCap,lastObservedEpoch,lastObservedAtMs,nowMs,
  }=input;
  if(!VALID_MARKETS.has(symbol))
    return {ok:false,reason:"Market is not among supported public digit symbols."};
  if(side!=="EVEN"&&side!=="ODD")
    return {ok:false,reason:"Choose EVEN or ODD before starting."};
  const budget=plannedExposure(stake,count,dailyCap);
  if(!budget.valid||!budget.withinCap)
    return {ok:false,reason:budget.reason};
  if(!Number.isSafeInteger(lastObservedEpoch)||lastObservedEpoch<1||
     !Number.isFinite(nowMs)||!Number.isFinite(lastObservedAtMs)||
     nowMs-lastObservedAtMs<0||nowMs-lastObservedAtMs>15_000||
     lastObservedEpoch*1000>nowMs+5000||
     nowMs-lastObservedEpoch*1000>15_000){
    return {ok:false,reason:"A fresh, genuine public quote is required to start this paper batch."};
  }
  return {ok:true,batch:{
    symbol:symbol as DigitSymbol,side:side as PaperParitySide,stake,
    requested:count,dailyCap,startedAtMs:nowMs,
    startEpoch:lastObservedEpoch,lastEpoch:lastObservedEpoch,lastKey:null,
    state:"running",stopReason:null,entries:[],
  }};
}
/** Duplicate, out-of-order, off-market, or stale messages cannot settle a leg. */
export function observeDigitPaperTick(
  batch:DigitPaperBatch,tick:ObservedTick,receivedAtMs:number,
):DigitPaperBatch {
  if(batch.state!=="running"||tick.symbol!==batch.symbol ||
     !Number.isFinite(receivedAtMs)||tick.epoch<=batch.lastEpoch||
     tick.epoch<=batch.startEpoch||
     receivedAtMs-tick.epoch*1000>12_000||
     tick.epoch*1000>receivedAtMs+5000||
     tick.digit<0||tick.digit>9||!Number.isInteger(tick.digit))return batch;
  const key=tick.tickId||String(tick.epoch)+":"+tick.quoteText;
  if(key===batch.lastKey)return batch;
  if((batch.entries.length+1)*batch.stake>batch.dailyCap+0.000001){
    return stopDigitPaperBatch(batch,"Risk budget exhausted. No further paper observations recorded.");
  }
  const matchingParity=(tick.digit%2===0)===(batch.side==="EVEN");
  const entry:PaperBatchResult={
    index:batch.entries.length+1,epoch:tick.epoch,
    observedDigit:tick.digit,observedQuote:tick.quoteText,
    matchingParity,stakeAtRisk:batch.stake,
  };
  const entries=[...batch.entries,entry];
  return {
    ...batch,entries,lastEpoch:tick.epoch,lastKey:key,
    state:entries.length>=batch.requested?"completed":"running",
  };
}
export function stopDigitPaperBatch(
  batch:DigitPaperBatch,reason="Stopped by customer.",
):DigitPaperBatch{
  return batch.state==="running"
    ?{...batch,state:"stopped",stopReason:reason}
    :batch;
}
export function paperBatchSummary(batch:DigitPaperBatch){
  const hits=batch.entries.filter(entry=>entry.matchingParity).length;
  const misses=batch.entries.length-hits;
  return {
    completed:batch.entries.length,
    remaining:batch.requested-batch.entries.length,
    hits,misses,observedStake:batch.entries.length*batch.stake,
    maximumBudgetedStake:batch.requested*batch.stake,
  };
}
