/**
 * Independent, fixed-size, forward-only SENFX Golden Rule confirmation.
 * Pure research math. NO broker, network, DB, positions or buy authority.
 * A quote is a current indicative price, not evidence of broker execution
 * latency, fills, settled profits or independence of synthetic outcomes.
 */
import {
 GOLDEN_RULE_HOLDOUT_SAMPLES,GOLDEN_RULE_EDGE_BUFFER_PP,
 wilsonConservativeLower,evaluateGoldenRule,
} from "./senfx-golden-rule.mjs";

const finite=x=>typeof x==="number"&&Number.isFinite(x);
const nonnegativeInteger=x=>Number.isSafeInteger(x)&&x>=0;

/** Discovery and holdout never share observations; no moving cutoff. */
export function evaluateIndependentGoldenRule({
 discovery,holdoutObservations,holdoutWins,holdoutLosses,
 holdoutFirstEntryEpoch,discoveryLastScoredEpoch
}={}){
 const base=evaluateGoldenRule(discovery);
 const holdoutValid=nonnegativeInteger(holdoutObservations)&&
  nonnegativeInteger(holdoutWins)&&nonnegativeInteger(holdoutLosses)&&
  holdoutWins+holdoutLosses===holdoutObservations&&
  holdoutObservations<=GOLDEN_RULE_HOLDOUT_SAMPLES;
 const forwardOnly=holdoutValid&&
  nonnegativeInteger(discoveryLastScoredEpoch)&&discoveryLastScoredEpoch>0&&
  nonnegativeInteger(holdoutFirstEntryEpoch)&&
  holdoutFirstEntryEpoch>discoveryLastScoredEpoch;
 const complete=forwardOnly&&holdoutObservations===GOLDEN_RULE_HOLDOUT_SAMPLES;
 const quote=discovery?.quote;
 const priceValid=!!quote&&finite(quote.askPrice)&&quote.askPrice>0&&
  finite(quote.payout)&&quote.payout>quote.askPrice;
 const quotedNetWin=priceValid?quote.payout-quote.askPrice:null;
 const quotedLoss=priceValid?quote.askPrice:null;
 const breakEven=priceValid?quote.askPrice/quote.payout:null;
 const lower=complete?wilsonConservativeLower(holdoutWins,holdoutObservations):null;
 const edge=lower!==null&&priceValid?lower*(quote.payout/quote.askPrice)-1:null;
 const holdoutPayoutQuality=complete&&priceValid&&
  base.checks["fresh original Deriv broker terms"]===true&&
  base.checks["maximum 0.5% balance exposure"]===true&&
  lower!==null&&breakEven!==null&&
  lower>breakEven+GOLDEN_RULE_EDGE_BUFFER_PP/100&&edge>0;
 const checks={
  ...base.checks,
  "independent forward holdout chronology":forwardOnly,
  "300 fixed out-of-sample observations":complete,
  "holdout conservative payout-adjusted edge":holdoutPayoutQuality,
 };
 return Object.freeze({
  // Eligibility for RESEARCH discussion only. Never interpreted as a buy.
  researchCandidate:Object.values(checks).every(Boolean),
  checks,blocked:Object.entries(checks).filter(([,ok])=>!ok).map(([name])=>name),
  discovery:base,holdoutSamples:holdoutValid?holdoutObservations:0,
  holdoutWins:holdoutValid?holdoutWins:0,
  holdoutHitRate:complete?holdoutWins/holdoutObservations:null,
  holdoutConservativeLower:lower,
  quotedNetWin,quotedFullStakeLoss:quotedLoss,quotedBreakEven:breakEven,
  holdoutConservativeNetEdgePerStake:edge,
  holdoutPayoutQuality,
  statement:"Fresh, broker-priced, forward-only paper validation only; real settlement and execution alignment remain unverified. No buy permission."
 });
}
