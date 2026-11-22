import type {GoldenVerdict,GoldenQuote} from "./senfx-golden-rule.mjs";
export type IndependentGoldenVerdict={
 researchCandidate:boolean;
 checks:Record<string,boolean>;blocked:string[];
 discovery:GoldenVerdict;holdoutSamples:number;holdoutWins:number;
 holdoutHitRate:number|null;holdoutConservativeLower:number|null;
 quotedNetWin:number|null;quotedFullStakeLoss:number|null;
 quotedBreakEven:number|null;holdoutConservativeNetEdgePerStake:number|null;
 holdoutPayoutQuality:boolean;statement:string;
};
export function evaluateIndependentGoldenRule(input?:{
 discovery?:{
  observations?:number;wins?:number;quote?:GoldenQuote|null;
  quoteAsOfMs?:number;nowMs?:number;demoBalance?:number;
  demoBalanceAsOfMs?:number;stake?:number;termsMatch?:boolean;
  brokerAligned?:boolean;feedFresh?:boolean;
 };
 holdoutObservations?:number;holdoutWins?:number;holdoutLosses?:number;
 holdoutFirstEntryEpoch?:number;discoveryLastScoredEpoch?:number;
}):IndependentGoldenVerdict;
