import test from "node:test";
import assert from "node:assert/strict";
import {
 isVerifiedDemoAccount,isFreshPublicTick,validBrokerProposal,
 verifiedBuyResponse,verifiedFinalContract,safeToPurchase,
} from "../lib/deriv/demo-15bot-worker-safety.mjs";

test("only active USD virtual Demo account with sufficient virtual balance passes",()=>{
 const demo={account_id:"D_QA",account_type:"demo",currency:"USD",status:"active",balance:1000};
 assert.equal(isVerifiedDemoAccount(demo,"D_QA"),true);
 for(const x of [
  {...demo,account_type:"real"}, {...demo,currency:"EUR"},
  {...demo,status:"suspended"}, {...demo,balance:0},
  {...demo,account_id:"R_OTHER"}, {...demo,balance:NaN},
 ]){
  assert.equal(isVerifiedDemoAccount(x,"D_QA"),false);
 }
 assert.equal(isVerifiedDemoAccount(demo,"D_QA",100),false);
});
test("only genuine fresh public ticks are eligible, never future, replay or stale",()=>{
 const now=1800000000000;
 const tick={epoch:now/1000,price:100.12,digit:2};
 assert.equal(isFreshPublicTick(tick,now),true);
 assert.equal(isFreshPublicTick({...tick,epoch:tick.epoch+1},now),false);
 assert.equal(isFreshPublicTick({...tick,epoch:tick.epoch-11},now),false);
 assert.equal(isFreshPublicTick({...tick,price:NaN},now),false);
 assert.equal(isFreshPublicTick({...tick,digit:12},now),false);
});
test("Deriv proposal must be a fresh and strict $1 virtual broker quote",()=>{
 const q={id:"a".repeat(40),ask_price:1,payout:1.79,longcode:"R_100 CALL 5min"};
 assert.equal(validBrokerProposal(q),true);
 assert.equal(validBrokerProposal({...q,ask_price:1.01}),false);
 assert.equal(validBrokerProposal({...q,payout:NaN}),false);
 assert.equal(validBrokerProposal({...q,id:"fake"}),false);
 assert.equal(validBrokerProposal(q,10),false);
});
test("one broker buy result must have a Deriv contract and transaction ID and bounded price",()=>{
 const r={buy:{contract_id:"123456",transaction_id:"7891011",buy_price:1}};
 assert.deepEqual(verifiedBuyResponse(r,1),{
  contractId:"123456",buyTransactionId:"7891011",buyPrice:1
 });
 assert.equal(verifiedBuyResponse({buy:{...r.buy,buy_price:10}},1),null);
 assert.equal(verifiedBuyResponse({buy:{...r.buy,transaction_id:""}},1),null);
});
test("only exact broker contract ID and consistent USD profit may settle risk",()=>{
 const expected={contractId:"123456",market:"R_100",contractType:"CALL"};
 const c={contract_id:"123456",underlying_symbol:"R_100",contract_type:"CALL",
   buy_price:1,sell_price:0.54,profit:-0.46,currency:"USD",is_sold:1};
 assert.deepEqual(verifiedFinalContract(c,expected),{
  contractId:"123456",buyPrice:1,sellPrice:0.54,profit:-0.46,finalStatus:"lost"
 });
 assert.equal(verifiedFinalContract({...c,contract_id:"UNKNOWN"},expected),null);
 assert.equal(verifiedFinalContract({...c,is_sold:0},expected),null);
 assert.equal(verifiedFinalContract({...c,profit:10},expected),null);
 assert.equal(verifiedFinalContract({...c,currency:"EUR"},expected),null);
 assert.equal(verifiedFinalContract({...c,contract_type:"PUT"},expected),null);
});
test("permission to buy fails closed when any stop, lease, quote or broker gate is missing",()=>{
 const valid={operatorAllowed:true,globalBuyFlag:true,workerAuthorized:true,
 runVersion:3,controlVersion:3,leaseValid:true,accountVerified:true,
 proposalVerified:true,unresolvedOrders:1};
 assert.equal(safeToPurchase(valid),true);
 for(const field of ["operatorAllowed","globalBuyFlag","workerAuthorized","leaseValid","accountVerified","proposalVerified"]){
  assert.equal(safeToPurchase({...valid,[field]:false}),false,field);
 }
 for(const testCase of [{runVersion:2},{controlVersion:2},{unresolvedOrders:0},{unresolvedOrders:2}]){
  assert.equal(safeToPurchase({...valid,...testCase}),false,JSON.stringify(testCase));
 }
});
