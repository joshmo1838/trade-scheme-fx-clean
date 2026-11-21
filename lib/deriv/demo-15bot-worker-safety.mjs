/**
 * Pure fail-closed Deriv virtual Demo broker checks.
 * No network calls, credentials, database access or broker orders.
 */
const USD="USD";
export const MIN_WORKER_SAMPLE=32;
export const MAX_PUBLIC_TICK_AGE_MS=10000;
export const MAX_QUOTE_AGE_MS=15000;
export const BROKER_DEMO_STAKE=1;

export function isVerifiedDemoAccount(record,selectedAccountId,stake=1){
 if(!record||typeof record!=="object")return false;
 const type=String(record.account_type||"").toLowerCase();
 const status=String(record.status||"").toLowerCase();
 const balance=Number(record.balance);
 return type==="demo"&&status==="active"&&
   record.account_id===selectedAccountId&&
   record.currency===USD&&
   Number.isFinite(balance)&&balance>=stake&&
   stake===BROKER_DEMO_STAKE;
}
export function isFreshPublicTick(tick,now=Date.now()){
 if(!tick||typeof tick!=="object")return false;
 const epochMs=Number(tick.epoch)*1000;
 return Number.isSafeInteger(tick.epoch)&&
  Number.isFinite(tick.price)&&tick.price>0&&
  Number.isInteger(tick.digit)&&tick.digit>=0&&tick.digit<=9&&
  Number.isFinite(now)&&epochMs<=now&&now-epochMs<=MAX_PUBLIC_TICK_AGE_MS;
}
export function validBrokerProposal(quote,stake=1){
 const ask=Number(quote?.ask_price);
 const payout=Number(quote?.payout);
 const id=quote?.id;
 return stake===BROKER_DEMO_STAKE&&
  typeof id==="string"&&/^[A-Za-z0-9_-]{32,128}$/.test(id)&&
  Number.isFinite(ask)&&ask>0&&ask<=stake&&
  Number.isFinite(payout)&&payout>0&&
  typeof quote?.longcode==="string"&&quote.longcode.length>3&&quote.longcode.length<=500;
}
export function verifiedBuyResponse(message,expectedAmount){
 const v=message?.buy;
 if(!v||typeof v!=="object")return null;
 const contractId=String(v.contract_id||"");
 const buyTransactionId=String(v.transaction_id||"");
 const buyPrice=Number(v.buy_price);
 if(!/^[A-Za-z0-9_-]{3,100}$/.test(contractId)||
  !/^[A-Za-z0-9_-]{3,100}$/.test(buyTransactionId)||
  !Number.isFinite(buyPrice)||buyPrice<=0||buyPrice>expectedAmount||
  expectedAmount!==BROKER_DEMO_STAKE)return null;
 return Object.freeze({contractId,buyTransactionId,buyPrice});
}
export function verifiedFinalContract(contract,expected){
 if(!contract||!expected||!contract.is_sold)return null;
 const contractId=String(contract.contract_id||"");
 if(contractId!==String(expected.contractId))return null;
 const buy=Number(contract.buy_price),sell=Number(contract.sell_price);
 const profit=Number(contract.profit);
 if(!Number.isFinite(buy)||buy<=0||buy>1||
    !Number.isFinite(sell)||sell<0||sell>100||
    !Number.isFinite(profit)||Math.abs((sell-buy)-profit)>0.02)return null;
 if(contract.currency&&contract.currency!=="USD")return null;
 if(contract.underlying_symbol&&contract.underlying_symbol!==expected.market)return null;
 if(contract.contract_type&&contract.contract_type!==expected.contractType)return null;
 return Object.freeze({
  contractId,buyPrice:buy,sellPrice:sell,profit,
  finalStatus:profit>0?"won":profit<0?"lost":"sold"
 });
}
export function safeToPurchase({operatorAllowed,globalBuyFlag,workerAuthorized,runVersion,
controlVersion,leaseValid,accountVerified,proposalVerified,unresolvedOrders}){
 return operatorAllowed===true&&globalBuyFlag===true&&workerAuthorized===true&&
   Number.isSafeInteger(runVersion)&&runVersion>=1&&runVersion===controlVersion&&
   leaseValid===true&&accountVerified===true&&proposalVerified===true&&
   Number.isInteger(unresolvedOrders)&&unresolvedOrders===1;
}
