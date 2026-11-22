/**
 * SENFX GOLDEN RULE — prospective PAPER-ONLY research verdict.
 *
 * This module has NO broker access, HTTP calls, token access, purchase
 * authority, DB writes or automatic order permissions. Positive statistical
 * evidence here does not imply a future trade will win.
 *
 * 95% one-sided family-wise conservative Wilson bound across 15 predeclared
 * strategies, Bonferroni alpha=0.05/15. Approximate, not a predictive oracle.
 */
export const GOLDEN_RULE_MIN_FORWARD_SAMPLES=1000;
export const GOLDEN_RULE_MAX_DEMO_BALANCE_RISK=0.005;
export const GOLDEN_RULE_EDGE_BUFFER_PP=2;
export const GOLDEN_RULE_FAMILYWISE_Z=2.713;
export const GOLDEN_RULE_MAX_QUOTE_AGE_MS=15000;
export const GOLDEN_RULE_MIN_SECONDS_BETWEEN_PAPER_SIGNALS=10;

const valid=(v)=>typeof v==="number"&&Number.isFinite(v);
export function wilsonConservativeLower(wins,samples,z=GOLDEN_RULE_FAMILYWISE_Z){
 if(!Number.isSafeInteger(samples)||samples<=0||
   !Number.isSafeInteger(wins)||wins<0||wins>samples||
   !valid(z)||z<=0)return null;
 const p=wins/samples,z2=z*z,denom=1+z2/samples;
 return Math.max(0,(p+z2/(2*samples)-
   z*Math.sqrt((p*(1-p)+z2/(4*samples))/samples))/denom);
}
export function evaluateGoldenRule({
 observations,wins,quote,quoteAsOfMs,nowMs,demoBalance,demoBalanceAsOfMs,
 stake,termsMatch,brokerAligned,feedFresh
}={}){
 const passes={
  "valid prospective sample":Number.isSafeInteger(observations)&&observations>=0&&
   Number.isSafeInteger(wins)&&wins>=0&&wins<=observations,
  "1,000 prospective forward observations":false,
  "broker-aligned expiry model":brokerAligned===true,
  "fresh Deriv public feed":feedFresh===true,
  "verified virtual Demo balance":valid(demoBalance)&&demoBalance>0&&
    valid(demoBalanceAsOfMs)&&valid(nowMs)&&
    nowMs>=demoBalanceAsOfMs&&nowMs-demoBalanceAsOfMs<=60_000,
  "maximum 0.5% balance exposure":false,
  "fresh original Deriv broker terms":termsMatch===true&&
   !!quote&&valid(quote.askPrice)&&quote.askPrice>0&&
   valid(quote.payout)&&quote.payout>quote.askPrice&&
   valid(quoteAsOfMs)&&valid(nowMs)&&
   nowMs>=quoteAsOfMs&&nowMs-quoteAsOfMs<=GOLDEN_RULE_MAX_QUOTE_AGE_MS,
  "multiple-test-adjusted conservative edge":false
 };
 passes["1,000 prospective forward observations"]=passes["valid prospective sample"]&&
  observations>=GOLDEN_RULE_MIN_FORWARD_SAMPLES;
 passes["maximum 0.5% balance exposure"]=passes["verified virtual Demo balance"]&&
  valid(stake)&&stake>0&&Number.isSafeInteger(Math.round(stake*100))&&
  stake<=demoBalance*GOLDEN_RULE_MAX_DEMO_BALANCE_RISK+0.0000001&&
  quote?.askPrice!==undefined&&Math.abs(stake-quote.askPrice)<=0.011;
 const lower=passes["valid prospective sample"]?
  wilsonConservativeLower(wins,observations):null;
 const breakeven=passes["fresh original Deriv broker terms"]?
  quote.askPrice/quote.payout:null;
 const edgePerStake=lower!==null&&breakeven!==null?
  lower*(quote.payout/quote.askPrice)-1:null;
 passes["multiple-test-adjusted conservative edge"]=
  passes["1,000 prospective forward observations"]&&
  breakeven!==null&&lower!==null&&
  lower>breakeven+GOLDEN_RULE_EDGE_BUFFER_PP/100&&
  edgePerStake>0;
 return Object.freeze({
  // Research verdict only; NEVER permission to send "buy".
  researchCandidate:Object.values(passes).every(Boolean),
  checks:passes,
  blocked:Object.entries(passes).filter(([,ok])=>!ok).map(([name])=>name),
  samples:passes["valid prospective sample"]?observations:0,
  wins:passes["valid prospective sample"]?wins:0,
  empiricalHitRate:passes["valid prospective sample"]&&observations>0?wins/observations:null,
  conservativeLower:lower,brokerBreakEven:breakeven,
  conservativeNetEdgePerStake:edgePerStake,
  statement:"Prospective research verdict only. No orders, no guaranteed profits, no change to any SENFX bot."
 });
}
