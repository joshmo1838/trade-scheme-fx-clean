/**
 * SENFX original fifteen-strategy PAPER lab for Deriv synthetic PUBLIC ticks.
 *
 * No broker proposals, purchases, token, customer configuration, historical
 * synthetic returns or claims of positive expected value. A 'hit' is merely
 * a next-public-tick condition check, not a Deriv settled contract or payout.
 *
 * Each profile is a distinct fixed-stake research rule. Recovery/stepwise
 * names NEVER increase stake after a loss (no Martingale / D'Alembert risk).
 */
import {DIGIT_MARKETS, type DigitSymbol, type ObservedTick} from "./digit-matrix.ts";

export type PaperFamily=
  |"over"|"under"|"even"|"odd"|"matches"|"differs"
  |"trend-rise-fall"|"breakout-higher-lower"
  |"recovery-audit"|"stepwise-audit"
  |"adaptive-over"|"entropy-parity"|"pattern-differs"
  |"momentum-rise-fall"|"volatility-scalper";

export type FifteenBot={
  id:string;name:string;market:DigitSymbol;family:PaperFamily;
  category:"Digits"|"Direction"|"Risk research";
  description:string;difference:string;
  threshold?:number; minTicks:number;
};
export const FIFTEEN_BOTS:readonly FifteenBot[]=[
  {id:"digit-over-4",name:"SENFX Digit Over",market:"R_100",family:"over",category:"Digits",
   threshold:4,minTicks:32,description:"Observed next-tick digit greater than 4.",
   difference:"Fixed barrier, 32 real ticks for readiness, zero stake progression."},
  {id:"digit-under-5",name:"SENFX Digit Under",market:"1HZ10V",family:"under",category:"Digits",
   threshold:5,minTicks:32,description:"Observed next-tick digit below 5.",
   difference:"Real quote precision, verified active symbol and bounded paper budget."},
  {id:"parity-even",name:"SENFX Parity EVEN",market:"R_100",family:"even",category:"Digits",
   minTicks:32,description:"Observed next-tick last digit is EVEN.",
   difference:"Correct 0/2/4/6/8 digit interpretation, no pattern-profit claims."},
  {id:"parity-odd",name:"SENFX Parity ODD",market:"R_10",family:"odd",category:"Digits",
   minTicks:32,description:"Observed next-tick last digit is ODD.",
   difference:"Replay-safe, one future quote settles one paper observation."},
  {id:"digit-matches",name:"SENFX Digit Matches",market:"1HZ10V",family:"matches",category:"Digits",
   threshold:3,minTicks:32,description:"Next observed last digit exactly matches digit 3.",
   difference:"Records unmatched digits as misses rather than invented winnings."},
  {id:"digit-differs",name:"SENFX Digit Differs",market:"1HZ25V",family:"differs",category:"Digits",
   threshold:7,minTicks:32,description:"Next observed last digit differs from digit 7.",
   difference:"No assumed broker price or payout for Matches/Differs."},
  {id:"trend-rise-fall",name:"SENFX Rise/Fall Trend",market:"R_50",family:"trend-rise-fall",category:"Direction",
   minTicks:32,description:"Past 8 ticks provide a direction hypothesis for the next tick.",
   difference:"Require meaningful movement before generating a direction signal."},
  {id:"breakout-higher-lower",name:"SENFX Breakout Rise/Fall",market:"R_75",family:"breakout-higher-lower",category:"Direction",
   minTicks:32,description:"Short vs. longer moving averages suggest a Rise/Fall direction; the broker adapter uses Deriv CALL/PUT contracts.",
   difference:"Directional breakout filter; not a barrier-based Higher/Lower strike-price contract."},
  {id:"recovery-audit",name:"SENFX Recovery Risk Audit",market:"R_100",family:"recovery-audit",category:"Risk research",
   minTicks:40,description:"Parity hypothesis with constant stake even after misses.",
   difference:"No Martingale doubling, escalation or loss-chasing orders."},
  {id:"stepwise-audit",name:"SENFX Stepwise Risk Audit",market:"R_25",family:"stepwise-audit",category:"Risk research",
   minTicks:40,description:"Over/Under research using a constant paper stake.",
   difference:"No D'Alembert stake progression or uncapped recovery."},
  {id:"adaptive-over",name:"SENFX Adaptive Digit Radar",market:"1HZ100V",family:"adaptive-over",category:"Digits",
   minTicks:40,description:"Over-4 hypothesis only with a balanced observed digit sample.",
   difference:"Filters research entries; short-sample frequency is not a future advantage."},
  {id:"entropy-parity",name:"SENFX Even/Odd Analyzer",market:"1HZ50V",family:"entropy-parity",category:"Digits",
   minTicks:40,description:"EVEN/ODD paper decision screened by digit entropy.",
   difference:"Suppresses unusually concentrated samples instead of forecasting wins."},
  {id:"pattern-differs",name:"SENFX Matches/Differs Radar",market:"1HZ75V",family:"pattern-differs",category:"Digits",
   minTicks:40,description:"Checks whether next observed last digit differs from the current one.",
   difference:"Dynamic comparison digit set before the next tick; no payouts assumed."},
  {id:"momentum-rise-fall",name:"SENFX Momentum Rise/Fall",market:"R_10",family:"momentum-rise-fall",category:"Direction",
   minTicks:40,description:"Short momentum and longer moving average must agree.",
   difference:"Skip weak or contradictory trends rather than forcing trades."},
  {id:"volatility-scalper",name:"SENFX Volatility Scalper",market:"R_75",family:"volatility-scalper",category:"Direction",
   minTicks:40,description:"Direction-only research with a spike and volatility filter.",
   difference:"Reject abrupt price jumps and extreme tick volatility."},
] as const;
export const BOT_COUNT=15;
export type PaperSignal={
  kind:"digit"|"direction";
  prediction:"OVER"|"UNDER"|"EVEN"|"ODD"|"MATCHES"|"DIFFERS"|"RISE"|"FALL";
  barrier?:number;entryPrice:number;
};
export type PaperObservation={
  sequence:number;digit:number;quote:string;epoch:number;
  hit:boolean;signal:PaperSignal;paperStake:number;
};
// Paper-only freshness limits; never used for broker orders.
export const PAPER_MAX_TICK_AGE_MS=12_000;
export const PAPER_MAX_STALE_SKIPS=5;
export type FifteenSession={
  botId:string;symbol:DigitSymbol;count:number;stake:number;cap:number;
  state:"running"|"stopped"|"completed";message:string;
  lastEpoch:number;pending:PaperSignal|null;
  observations:readonly PaperObservation[];
  skippedStaleTicks:number;
};
const SYMBOL_SET=new Set<string>(DIGIT_MARKETS.map(x=>x.symbol));
export function findFifteenBot(id:string):FifteenBot|undefined{
  return FIFTEEN_BOTS.find(x=>x.id===id);
}
const mean=(a:readonly number[])=>a.reduce((s,v)=>s+v,0)/a.length;
function entropy(digits:readonly number[]):number{
  const count=Array<number>(10).fill(0);
  for(const digit of digits)count[digit]++;
  return count.reduce((total,c)=>{
    const p=c/digits.length;
    return p>0?total-p*Math.log2(p):total;
  },0);
}
/** Only use information available BEFORE a future quote; never a lookahead. */
export function predictFifteenBot(bot:FifteenBot,history:readonly ObservedTick[]):PaperSignal|null{
  const quotes=history.filter(x=>x.symbol===bot.market).slice(-160);
  if(quotes.length<bot.minTicks || quotes.some(x=>
    !Number.isFinite(x.price)||x.price<=0||!Number.isInteger(x.digit)||
    x.digit<0||x.digit>9))return null;
  const prices=quotes.map(x=>x.price);
  const digits=quotes.map(x=>x.digit);
  const latest=prices[prices.length-1];
  const signal=(prediction:PaperSignal["prediction"],barrier?:number):PaperSignal=>
    ({kind:prediction==="RISE"||prediction==="FALL"?"direction":"digit",
      prediction,barrier,entryPrice:latest});
  switch(bot.family){
    case "over": return signal("OVER",bot.threshold);
    case "under": return signal("UNDER",bot.threshold);
    case "even":return signal("EVEN");
    case "odd":return signal("ODD");
    case "matches":return signal("MATCHES",bot.threshold);
    case "differs":return signal("DIFFERS",bot.threshold);
    case "recovery-audit":return signal("EVEN");
    case "stepwise-audit":return signal("OVER",4);
    case "adaptive-over":{
      const recent=digits.slice(-40);
      const observedOver=recent.filter(d=>d>4).length/recent.length;
      if(observedOver<0.35||observedOver>0.65)return null;
      return signal("OVER",4);
    }
    case "entropy-parity":{
      const recent=digits.slice(-40);
      if(entropy(recent)<3.05)return null;
      const even=recent.filter(d=>d%2===0).length;
      // Explanatory counter-trend hypothesis, NOT a measured advantage.
      return signal(even<=recent.length/2?"EVEN":"ODD");
    }
    case "pattern-differs":return signal("DIFFERS",digits[digits.length-1]);
    case "trend-rise-fall":{
      const delta=latest-prices[prices.length-9];
      const movement=prices.slice(-9).map((v,i,a)=>i?Math.abs(v-a[i-1]):0)
        .reduce((a,b)=>a+b,0);
      if(!(movement>0)||Math.abs(delta)/movement<0.4)return null;
      return signal(delta>0?"RISE":"FALL");
    }
    case "breakout-higher-lower":{
      const fast=mean(prices.slice(-7));
      const slow=mean(prices.slice(-21));
      const spread=Math.abs(fast-slow)/slow*10000;
      if(spread<0.25)return null;
      return signal(fast>slow?"RISE":"FALL");
    }
    case "momentum-rise-fall":{
      const last5=latest-prices[prices.length-6];
      const avg10=mean(prices.slice(-10));
      const avg30=mean(prices.slice(-30));
      if(last5===0||(last5>0&&avg10<=avg30)||(last5<0&&avg10>=avg30))return null;
      if(Math.abs(avg10-avg30)/avg30*10000<0.3)return null;
      return signal(last5>0?"RISE":"FALL");
    }
    case "volatility-scalper":{
      const recent=prices.slice(-20);
      const diffs=recent.slice(1).map((v,i)=>v-recent[i]);
      const abs=diffs.map(Math.abs);
      const typical=mean(abs.slice(0,-1));
      if(!(typical>0)||abs[abs.length-1]>typical*2.4)return null;
      const drift=latest-recent[0];
      const directionalEfficiency=Math.abs(drift)/abs.reduce((a,b)=>a+b,0);
      if(directionalEfficiency<0.35)return null;
      return signal(drift>0?"RISE":"FALL");
    }
  }
}
/** A 'hit' is a tick-condition observation, NEVER a broker payout or P/L. */
export function testPaperSignal(signal:PaperSignal,tick:ObservedTick):boolean{
  if(!Number.isFinite(tick.price)||tick.price<=0||!Number.isInteger(tick.digit)||
      tick.digit<0||tick.digit>9)throw Error("Invalid observed quote");
  switch(signal.prediction){
    case "OVER":return Number.isInteger(signal.barrier)&&tick.digit>(signal.barrier as number);
    case "UNDER":return Number.isInteger(signal.barrier)&&tick.digit<(signal.barrier as number);
    case "EVEN":return tick.digit%2===0;
    case "ODD":return tick.digit%2===1;
    case "MATCHES":return tick.digit===signal.barrier;
    case "DIFFERS":return tick.digit!==signal.barrier;
    case "RISE":return tick.price>signal.entryPrice;
    case "FALL":return tick.price<signal.entryPrice;
  }
}
export type StartResult={ok:true;session:FifteenSession}|{ok:false;reason:string};
export function startFifteenPaperSession(input:{
  botId:string;history:readonly ObservedTick[];stake:number;count:number;cap:number;nowMs:number;
}):StartResult {
 const bot=findFifteenBot(input.botId);
 if(!bot||!SYMBOL_SET.has(bot.market))return{ok:false,reason:"Unknown research bot."};
 if(!Number.isFinite(input.stake)||input.stake<1||input.stake>25||
   !Number.isInteger(input.count)||input.count<1||input.count>10||
   !Number.isFinite(input.cap)||input.cap<1||
   Math.round(input.stake*input.count*100)/100>input.cap)
    return{ok:false,reason:"Use $1–$25 per simulated trade, 1–10 trades, and a batch cap covering all planned stake."};
 const history=input.history.filter(x=>x.symbol===bot.market).slice(-160);
 const latest=history[history.length-1];
 if(!latest||!Number.isFinite(input.nowMs)||
    input.nowMs-latest.epoch*1000<0||input.nowMs-latest.epoch*1000>PAPER_MAX_TICK_AGE_MS)
   return{ok:false,reason:"Fresh, verified public-market ticks are required."};
 const decision=predictFifteenBot(bot,history);
 if(!decision)return{ok:false,reason:"Insufficient research samples or no eligible strategy hypothesis."};
 return{ok:true,session:{
  botId:bot.id,symbol:bot.market,stake:input.stake,count:input.count,cap:input.cap,
  state:"running",message:"Waiting for next genuine public tick.",
  lastEpoch:latest.epoch,pending:decision,observations:[],skippedStaleTicks:0,
 }};
}
export function stopFifteenPaperSession(session:FifteenSession,reason="Emergency Stop requested."):FifteenSession{
 return session.state==="running"?{...session,state:"stopped",message:reason,pending:null}:session;
}
/**
 * Called with the exact tick and history recorded BEFORE that tick arrived.
 * The previously committed hypothesis alone decides this result. Future
 * hypotheses can only be formed AFTER the new tick has settled that one.
 */
export function observeFifteenPaperTick(
 session:FifteenSession,tick:ObservedTick,historyBefore:readonly ObservedTick[],
 nowMs:number,
):FifteenSession{
 if(session.state!=="running")return session;
 if(tick.symbol!==session.symbol)return session;
 // A missed tick invalidates the one-next-tick hypothesis. Never score
 // a later tick against it or leave the paper session stuck at 0/N.
 if(historyBefore.at(-1)?.epoch!==session.lastEpoch)
   return stopFifteenPaperSession(session,"Market history changed while paper batch was armed. Stopped safely; restart with fresh ticks.");
 if(tick.epoch<=session.lastEpoch)return session;
 const ageMs=nowMs-tick.epoch*1000;
 if(!Number.isFinite(ageMs)||ageMs<0)
   return stopFifteenPaperSession(session,"Market tick timestamp is invalid or ahead of the device clock. Stopped safely; check automatic date/time.");
 if(ageMs>PAPER_MAX_TICK_AGE_MS){
   // An aged packet must NEVER settle the previously committed next-tick
   // hypothesis. Void it and require a genuinely fresh tick to re-arm.
   const skippedStaleTicks=session.skippedStaleTicks+1;
   if(skippedStaleTicks>PAPER_MAX_STALE_SKIPS)
     return stopFifteenPaperSession(session,"Repeated delayed market ticks. Paper batch stopped; reconnect and verify phone time/feed.");
   return {...session,lastEpoch:tick.epoch,pending:null,skippedStaleTicks,
     message:"Delayed market tick skipped (not scored); previous hypothesis discarded. Waiting for fresh data to re-arm."};
 }
 const bot=findFifteenBot(session.botId);
 if(!bot)return stopFifteenPaperSession(session,"Unknown bot. Stopped.");
 const observations=[...session.observations];
 if(session.pending){
   if(Math.round((observations.length+1)*session.stake*100)/100>session.cap)
     return stopFifteenPaperSession(session,"Paper exposure cap reached.");
   observations.push({
     sequence:observations.length+1,digit:tick.digit,
     quote:tick.quoteText,epoch:tick.epoch,
     paperStake:session.stake,
     hit:testPaperSignal(session.pending,tick),signal:session.pending,
   });
 }
 const completed=observations.length>=session.count;
 const next=predictFifteenBot(bot,[...historyBefore,tick]);
 return {
  ...session,observations,lastEpoch:tick.epoch,
  state:completed?"completed":"running",
  pending:completed?null:next,
  message:completed?"Paper batch completed. No broker trades or payouts.":
    next?"Waiting for next genuine public tick.":"Research filter idle; waiting for eligible data.",
 };
}
