export const GOLDEN_RULE_MIN_FORWARD_SAMPLES:number;
export const GOLDEN_RULE_HOLDOUT_SAMPLES:number;
export const GOLDEN_RULE_MAX_DEMO_BALANCE_RISK:number;
export const GOLDEN_RULE_EDGE_BUFFER_PP:number;
export const GOLDEN_RULE_FAMILYWISE_Z:number;
export const GOLDEN_RULE_MAX_QUOTE_AGE_MS:number;
export const GOLDEN_RULE_MIN_SECONDS_BETWEEN_PAPER_SIGNALS:number;
export type GoldenQuote={askPrice:number;payout:number};
export type GoldenVerdict={
 researchCandidate:boolean;checks:Record<string,boolean>;blocked:string[];
 samples:number;wins:number;empiricalHitRate:number|null;
 conservativeLower:number|null;brokerBreakEven:number|null;
 conservativeNetEdgePerStake:number|null;statement:string
};
export function wilsonConservativeLower(wins:number,samples:number,z?:number):number|null;
export function evaluateGoldenRule(input?:{
 observations?:number;wins?:number;quote?:GoldenQuote|null;
 quoteAsOfMs?:number;nowMs?:number;demoBalance?:number;
 demoBalanceAsOfMs?:number;stake?:number;termsMatch?:boolean;
 brokerAligned?:boolean;feedFresh?:boolean
}):GoldenVerdict;
