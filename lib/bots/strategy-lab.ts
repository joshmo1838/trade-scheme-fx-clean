/**
 * SENFX Strategy Lab: transparent RESEARCH-ONLY candidate filters.
 *
 * This file never replaces live worker rules, queues orders, reads credentials,
 * assumes verified future P/L, or claims a profitable strategy. Its inputs
 * are strictly observed public prices and it can be benchmarked alongside
 * the legacy paper presets before any separately approved worker change.
 */
import { evaluatePaperSignal,paperPreset,type PaperDirection } from "./paper-strategy.ts";

export type ResearchProfileName =
  | "SENFX Synthetic pro"
  | "Synthetic Trend Scout"
  | "Volatility Watch";
export type ResearchProfile = {
  name:ResearchProfileName;symbol:"R_100"|"R_50"|"R_75";
  tag:string;minimumTicks:number;confirmationTicks:number;
  minimumEfficiency:number;maximumShockRatio:number;
  description:string;
};
export const RESEARCH_PROFILES:readonly ResearchProfile[]=[
  {
    name:"SENFX Synthetic pro",symbol:"R_100",tag:"Trend confirmation",
    minimumTicks:32,confirmationTicks:5,
    minimumEfficiency:0.32,maximumShockRatio:4,
    description:"Legacy 9/21 moving-average direction plus 5-tick momentum agreement and sudden-jump rejection.",
  },
  {
    name:"Synthetic Trend Scout",symbol:"R_50",tag:"Sideways-market filter",
    minimumTicks:32,confirmationTicks:4,
    minimumEfficiency:0.56,maximumShockRatio:4,
    description:"Legacy 5/18 direction plus efficiency filter to reject choppy back-and-forth tick sequences.",
  },
  {
    name:"Volatility Watch",symbol:"R_75",tag:"Spike-aware cooldown candidate",
    minimumTicks:32,confirmationTicks:5,
    minimumEfficiency:0.28,maximumShockRatio:2.5,
    description:"Legacy 10/21 direction plus tighter rejection of abrupt one-tick moves; no martingale.",
  },
] as const;
const PROFILE_MAP=new Map<string,ResearchProfile>(RESEARCH_PROFILES.map(x=>[x.name,x]));

export type ResearchReason =
  |"insufficient-ticks"|"invalid-tick"|"no-baseline-signal"
  |"low-directional-efficiency"|"momentum-disagreement"
  |"abrupt-last-tick-shock"|"research-signal";
export type ResearchResult={
  profile:ResearchProfileName;symbol:ResearchProfile["symbol"];
  baseSignal:PaperDirection|null;
  candidateSignal:PaperDirection|null;
  reason:ResearchReason;sampleSize:number;
  efficiency:number|null;latestShockRatio:number|null;
};

/** Descriptive only. No look-ahead, backfilled ticks or price fabrication. */
export function evaluateResearchProfile(
  profileName:ResearchProfileName,
  prices:readonly number[],
):ResearchResult {
  const profile=PROFILE_MAP.get(profileName);
  if(!profile)throw Error("Unknown research-only bot profile.");
  const empty=(reason:ResearchReason, baseSignal:PaperDirection|null=null,
    efficiency:number|null=null, latestShockRatio:number|null=null):ResearchResult=>({
    profile:profile.name,symbol:profile.symbol,baseSignal,
    candidateSignal:null,reason,sampleSize:prices.length,
    efficiency,latestShockRatio
  });
  if(prices.length<profile.minimumTicks)return empty("insufficient-ticks");
  const recent=prices.slice(-profile.minimumTicks);
  if(recent.some(x=>!Number.isFinite(x)||x<=0))return empty("invalid-tick");
  const baseline=evaluatePaperSignal(prices,paperPreset({
    name:profileName,market:"Synthetic Indices",
  }));
  if(!baseline)return empty("no-baseline-signal");

  const moves=recent.slice(1).map((x,i)=>x-recent[i]);
  const sumAbs=moves.reduce((s,x)=>s+Math.abs(x),0);
  if(!(sumAbs>0))return empty("low-directional-efficiency",baseline,0);
  const efficiency=Math.abs(recent[recent.length-1]-recent[0])/sumAbs;
  if(efficiency<profile.minimumEfficiency)
    return empty("low-directional-efficiency",baseline,efficiency);

  const lookback=profile.confirmationTicks;
  const anchor=recent[recent.length-1-lookback];
  const slope=recent[recent.length-1]-anchor;
  if((baseline==="CALL"&&slope<=0)||(baseline==="PUT"&&slope>=0))
    return empty("momentum-disagreement",baseline,efficiency);

  // Compare the latest move to PRIOR absolute tick changes only. Including
  // the jump itself in this reference would camouflage unusual price shocks.
  const priorMoves=moves.slice(0,-1).map(x=>Math.abs(x));
  const meanPrior=priorMoves.reduce((s,x)=>s+x,0)/priorMoves.length;
  const lastMove=Math.abs(moves[moves.length-1]);
  const shockRatio=meanPrior>0?lastMove/meanPrior:
    lastMove>0?Number.POSITIVE_INFINITY:0;
  if(!Number.isFinite(shockRatio)||shockRatio>profile.maximumShockRatio)
    return empty("abrupt-last-tick-shock",baseline,efficiency,shockRatio);

  return {
    profile:profile.name,symbol:profile.symbol,
    baseSignal:baseline,candidateSignal:baseline,
    reason:"research-signal",sampleSize:prices.length,
    efficiency,latestShockRatio:shockRatio,
  };
}

export type ResearchComparison={
  profile:ResearchProfileName;symbol:string;processedWindows:number;
  baselineSignals:number;candidateSignals:number;filteredSignals:number;
  alignedSignals:number;
};
/**
 * Compare signal FREQUENCY only; no entry prices, fabricated executions,
 * settlement outcomes, P/L, win rate or strategy profitability are computed.
 */
export function compareResearchSignals(
  profile:ResearchProfileName,
  prices:readonly number[],
):ResearchComparison {
  const def=PROFILE_MAP.get(profile);
  if(!def)throw Error("Unknown research-only bot profile.");
  let processed=0,baselineSignals=0,candidateSignals=0,alignedSignals=0;
  const minimum=def.minimumTicks;
  for(let i=minimum;i<=prices.length;i++){
    const result=evaluateResearchProfile(profile,prices.slice(0,i));
    processed++;
    if(result.baseSignal)baselineSignals++;
    if(result.candidateSignal)candidateSignals++;
    if(result.candidateSignal&&result.candidateSignal===result.baseSignal)alignedSignals++;
  }
  return {
    profile,symbol:def.symbol,processedWindows:processed,
    baselineSignals,candidateSignals,filteredSignals:baselineSignals-candidateSignals,
    alignedSignals,
  };
}
