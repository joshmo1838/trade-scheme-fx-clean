/**
 * SENFX 10X PRE-BUY GATE — Deriv virtual Demo only.
 * Structural and risk checks, NOT ten proofs of a future winning outcome.
 * This module has no IO, no broker requests, and never makes a purchase.
 */
export const RECOVERY_MIN_PAUSE_MS=120_000;
export const RECOVERY_FRESH_TICKS=64;
export const RECOVERY_CONFIRMATIONS=3;
export const SESSION_MAX_LOSSES=3;
export const MAX_CONSECUTIVE_LOSSES=2;
export const MIN_NET_WIN_RETURN_ON_STAKE=0.10;

const finite = x=>typeof x==="number"&&Number.isFinite(x);
const same = (a,b)=>a?.prediction===b?.prediction&&
 (a?.barrier===undefined?b?.barrier===undefined:a?.barrier===b?.barrier)&&
 a?.kind===b?.kind;
export function newRecoveryState(){
 return {armed:false,since:0,postLossTicks:0,confirmations:0,
  lastConfirmationEpoch:0,lastSignal:null,consecutiveLosses:0,
  totalLosses:0,netProfit:0,hardStop:false};
}
export function settleRecovery(state,{finalStatus,profit,settledAt}){
 if(!state||!["won","lost","sold"].includes(finalStatus)||
  !finite(profit)||!finite(settledAt)||settledAt<=0)
  throw Error("A verified settled Demo result is required for recovery state.");
 const next={...state,netProfit:state.netProfit+profit};
 if(finalStatus==="lost"){
  next.totalLosses++;
  next.consecutiveLosses++;
  next.armed=true;next.since=settledAt;
  next.postLossTicks=0;next.confirmations=0;
  next.lastConfirmationEpoch=0;next.lastSignal=null;
  if(next.consecutiveLosses>=MAX_CONSECUTIVE_LOSSES||
   next.totalLosses>=SESSION_MAX_LOSSES)next.hardStop=true;
 }else if(finalStatus==="won"){
  next.consecutiveLosses=0;
  next.armed=false;next.confirmations=0;next.postLossTicks=0;
 }
 return next;
}
export function recordFreshRecoveryTick(state,tick,signal,now){
 if(!state?.armed||state.hardStop)return state;
 const epoch=tick?.epoch;
 if(!Number.isSafeInteger(epoch)||!finite(now)||epoch*1000>now||
    now-epoch*1000>10_000||epoch<=state.lastConfirmationEpoch)
  return state;
 const next={...state,postLossTicks:state.postLossTicks+1,
  lastConfirmationEpoch:epoch};
 // Signal confirmations must come from different genuine increasing ticks;
 // they demonstrate scanner consistency, NOT odds of a future winning digit.
 if(signal){
  next.confirmations=same(state.lastSignal,signal)?
   state.confirmations+1:1;
  next.lastSignal={kind:signal.kind,prediction:signal.prediction,barrier:signal.barrier};
 }else{
  next.confirmations=0;next.lastSignal=null;
 }
 return next;
}
export function recoveryReady(state,now){
 if(!state||state.hardStop)return false;
 if(!state.armed)return true;
 return finite(now)&&now>=state.since+RECOVERY_MIN_PAUSE_MS&&
  state.postLossTicks>=RECOVERY_FRESH_TICKS&&
  state.confirmations>=RECOVERY_CONFIRMATIONS;
}
export function tenXChecks(input){
 const {
  account,flags,control,leaseOwned,stake,bot,signal,
  marketHistory,now,quote,proposal,recovery,unresolvedCount,previousBuyAt
 }=input||{};
 const last=marketHistory?.at(-1);
 const fresh=last&&Number.isSafeInteger(last.epoch)&&finite(now)&&
  now-last.epoch*1000>=0&&now-last.epoch*1000<=10_000;
 const sequenced=Array.isArray(marketHistory)&&
  marketHistory.every((tick,i)=>Number.isSafeInteger(tick?.epoch)&&
  (i===0||tick.epoch>marketHistory[i-1].epoch));
 const checks=[
  {name:"demo-account",pass:account?.account_type==="demo"&&
   account?.currency===(control?.currency||"USD")&&["USD","AUD"].includes(account?.currency)&&account?.status==="active"},
  {name:"admin-demo-authorization",pass:flags?.authorized===true&&flags?.realMoneyDisabled===true},
  {name:"worker-lease-and-start",pass:leaseOwned===true&&control?.mode==="running"&&
   Number.isSafeInteger(control?.control_version)&&control.control_version>=1},
  {name:"stake-and-balance",pass:finite(stake)&&stake>0&&
   Number.isSafeInteger(Math.round(stake*100))&&finite(Number(account?.balance))&&Number(account.balance)>=stake},
  {name:"fresh-market-tick",pass:!!fresh},
  {name:"ordered-sufficient-samples",pass:sequenced===true&&
   marketHistory.length>=bot?.minTicks},
  {name:"original-strategy-contract-matches",pass:!!bot&&!!signal&&!!proposal&&
   proposal.underlying_symbol===bot.market&&
   (proposal.barrier===undefined?signal.barrier===undefined:
    String(proposal.barrier)===String(signal.barrier))},
  {name:"settled-order-and-duplicate-guard",pass:unresolvedCount===0&&
   finite(previousBuyAt)&&finite(now)&&now-previousBuyAt>=10_000},
  {name:"post-loss-recovery",pass:recoveryReady(recovery,now)},
  {name:"broker-verified-net-win-payout",pass:finite(Number(quote?.ask_price))&&
   finite(Number(quote?.payout))&&Number(quote.ask_price)>0&&
   Number(quote.payout)-Number(quote.ask_price)>=
    Number(quote.ask_price)*MIN_NET_WIN_RETURN_ON_STAKE}
 ];
 return {passed:checks.every(c=>c.pass),checks,failed:checks.filter(x=>!x.pass).map(x=>x.name)};
}
