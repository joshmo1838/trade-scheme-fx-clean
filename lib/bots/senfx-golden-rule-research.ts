/**
 * SENFX prospective 15-bot public-tick research, IN MEMORY and PAPER ONLY.
 * A hypothesis is created from ticks up to T and scored only on future
 * observed ticks; replay, gaps, stale data and reconnects never settle it.
 *
 * Five-minute CALL/PUT direction studies use non-overlapping future 300s
 * observations, not one-tick proxy. They are deliberately NOT broker-aligned
 * until genuine proposal/expiry/entry timing is independently verified.
 * No broker API, token, orders or data persisted to a trading account.
 */
import {
 FIFTEEN_BOTS,predictFifteenBot,testPaperSignal,
 type PaperSignal,type FifteenBot
} from "./fifteen-paper-bots.ts";
import type {DigitSymbol,ObservedTick} from "./digit-matrix.ts";
import {GOLDEN_RULE_MIN_FORWARD_SAMPLES,GOLDEN_RULE_HOLDOUT_SAMPLES} from "./senfx-golden-rule.mjs";

export const GOLDEN_PAPER_MAX_HISTORY=300;
export const GOLDEN_PAPER_STALE_MS=10_000;
export const GOLDEN_PAPER_MIN_SPACING_SECONDS=10;
export const GOLDEN_PAPER_DIRECTIONAL_SECONDS=300;

export type GoldenPaperObservation={
 observations:number;wins:number;losses:number;voids:number;
 holdoutObservations:number;holdoutWins:number;holdoutLosses:number;
 holdoutFirstEntryEpoch:number;
 pending:{signal:PaperSignal;startEpoch:number;expiryEpoch:number}|null;
 lastEntryEpoch:number;lastScoredEpoch:number;
};
export type GoldenPaperState={
 history:Partial<Record<DigitSymbol,ObservedTick[]>>;
 lastEpoch:Partial<Record<DigitSymbol,number>>;
 bots:Record<string,GoldenPaperObservation>;
 disconnects:number;
};
const blank=():GoldenPaperObservation=>({
 observations:0,wins:0,losses:0,voids:0,
 holdoutObservations:0,holdoutWins:0,holdoutLosses:0,holdoutFirstEntryEpoch:0,
 pending:null,lastEntryEpoch:0,lastScoredEpoch:0
});
export function createGoldenPaperState():GoldenPaperState{
 return {history:{},lastEpoch:{},
  bots:Object.fromEntries(FIFTEEN_BOTS.map(b=>[b.id,blank()])),
  disconnects:0
 };
}
export function resetGoldenPaperFeed(state:GoldenPaperState):GoldenPaperState{
 const bots=Object.fromEntries(Object.entries(state.bots).map(([id,b])=>[
  id,{...b,voids:b.voids+(b.pending?1:0),pending:null}
 ]));
 return {...state,history:{},lastEpoch:{},bots,disconnects:state.disconnects+1};
}
export const goldenExpectedTickSeconds=(symbol:DigitSymbol)=>
 symbol.startsWith("1HZ")?1:2;
export function applyGoldenPublicTick(
 state:GoldenPaperState,tick:ObservedTick,nowMs:number
):GoldenPaperState{
 if(!Number.isFinite(nowMs)||!Number.isSafeInteger(tick?.epoch)||
   tick.epoch*1000>nowMs||nowMs-tick.epoch*1000>GOLDEN_PAPER_STALE_MS||
   !Number.isFinite(tick?.price)||tick.price<=0||
   !Number.isInteger(tick?.digit)||tick.digit<0||tick.digit>9||
   !FIFTEEN_BOTS.some(b=>b.market===tick.symbol))return state;
 const prev=state.lastEpoch[tick.symbol];
 if(prev!==undefined&&tick.epoch<=prev)return state;
 const contiguous=prev===undefined||
  tick.epoch-prev===goldenExpectedTickSeconds(tick.symbol);
 const bots={...state.bots};
 // A missing tick or network gap invalidates any in-flight observation,
 // including the five-minute direction model. NEVER score a later tick.
 if(!contiguous){
  for(const bot of FIFTEEN_BOTS){
   if(bot.market!==tick.symbol)continue;
   const old=bots[bot.id];
   bots[bot.id]={...old,voids:old.voids+(old.pending?1:0),
    pending:null};
  }
 }
 const prior=contiguous?state.history[tick.symbol]||[]:[];
 const history=[...prior,tick].slice(-GOLDEN_PAPER_MAX_HISTORY);
 for(const bot of FIFTEEN_BOTS){
  if(bot.market!==tick.symbol)continue;
  const previous=bots[bot.id];
  let next=previous;
  const p=next.pending;
  if(p&&contiguous&&tick.epoch>p.startEpoch){
   const expired=bot.category==="Direction"?
    tick.epoch>=p.expiryEpoch:tick.epoch===p.expiryEpoch;
   // A digital signal only settles against the EXACT immediately next tick.
   // A direction signal cannot settle until >=300 seconds in the future.
   if(expired){
    const neutral=bot.category==="Direction"&&
     tick.price===p.signal.entryPrice;
    if(neutral)next={...next,pending:null,voids:next.voids+1};
    else {
     const hit=testPaperSignal(p.signal,tick);
     // The first fixed 1,000 outcomes are the discovery cohort. Never
     // modify them after completion. The next 300 freshly committed
     // outcomes are a separate, fixed-size holdout cohort.
     if(next.observations<GOLDEN_RULE_MIN_FORWARD_SAMPLES){
      next={...next,pending:null,observations:next.observations+1,
       wins:next.wins+(hit?1:0),losses:next.losses+(hit?0:1),
       lastScoredEpoch:tick.epoch};
     }else if(next.holdoutObservations<GOLDEN_RULE_HOLDOUT_SAMPLES){
      next={...next,pending:null,holdoutObservations:next.holdoutObservations+1,
       holdoutWins:next.holdoutWins+(hit?1:0),
       holdoutLosses:next.holdoutLosses+(hit?0:1)};
     }
    }
   }else if(bot.category!=="Direction"&&tick.epoch>p.expiryEpoch){
    next={...next,pending:null,voids:next.voids+1};
   }
  }
  // Fixed predeclared, no-peeking: 1,000 discovery observations followed
  // by 300 strictly later holdout observations. Neither cohort grows after
  // its cap. A holdout can only begin after the discovery outcome settles.
  if(next.observations>=GOLDEN_RULE_MIN_FORWARD_SAMPLES&&
     next.holdoutObservations>=GOLDEN_RULE_HOLDOUT_SAMPLES){
   bots[bot.id]={...next,pending:null};
   continue;
  }
  if(!next.pending&&history.length>=bot.minTicks&&
    tick.epoch-next.lastEntryEpoch>=GOLDEN_PAPER_MIN_SPACING_SECONDS&&
    (next.observations<GOLDEN_RULE_MIN_FORWARD_SAMPLES||
     tick.epoch>next.lastScoredEpoch)){
   const signal=predictFifteenBot(bot,history);
   if(signal){
    const expiryEpoch=tick.epoch+
     (bot.category==="Direction"?
      GOLDEN_PAPER_DIRECTIONAL_SECONDS:goldenExpectedTickSeconds(tick.symbol));
    next={...next,lastEntryEpoch:tick.epoch,
     holdoutFirstEntryEpoch:
      next.observations>=GOLDEN_RULE_MIN_FORWARD_SAMPLES&&
      next.holdoutFirstEntryEpoch===0?tick.epoch:next.holdoutFirstEntryEpoch,
     pending:{signal,startEpoch:tick.epoch,expiryEpoch}};
   }
  }
  bots[bot.id]=next;
 }
 return {...state,history:{...state.history,[tick.symbol]:history},
  lastEpoch:{...state.lastEpoch,[tick.symbol]:tick.epoch},bots};
}
export function goldenCandidateSignal(state:GoldenPaperState,bot:FifteenBot){
 const h=state.history[bot.market]||[];
 return h.length>=bot.minTicks?predictFifteenBot(bot,h):null;
}
