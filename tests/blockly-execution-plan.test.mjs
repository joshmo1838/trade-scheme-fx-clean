import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeBlocklyExecutionPlan} from '../lib/quantum/blockly-execution-plan.mjs';

const plan=overrides=>({strategyId:'nexus-flow',marketCategory:'cryptocurrency',marketSymbol:'cryBTCUSD',tradeTypeCategory:'multiplier',tradeType:'multiplier',contractType:'both',currency:'USD',multiplier:100,stake:2,perTradeStopLoss:10,perTradeTakeProfit:15,sessionStopLoss:10,sessionTakeProfit:15,...overrides});

test('normalizes a valid Blockly Multiplier plan for Demo execution',()=>{
 const result=normalizeBlocklyExecutionPlan(plan());
 assert.equal(result.ok,true);
 assert.equal(result.plan.marketSymbol,'cryBTCUSD');
 assert.equal(result.plan.contractFamily,'MULTIPLIER');
 assert.equal(result.plan.multiplier,100);
});

test('preserves AUD from the Blockly currency block',()=>{
 const result=normalizeBlocklyExecutionPlan(plan({currency:'AUD'}));
 assert.equal(result.ok,true);
 assert.equal(result.plan.currency,'AUD');
});

test('rejects unsupported Blockly choices and malformed risk settings',()=>{
 assert.equal(normalizeBlocklyExecutionPlan(plan({marketSymbol:'BTC/USD'})).code,'INVALID_BLOCKLY_SYMBOL');
 assert.equal(normalizeBlocklyExecutionPlan(plan({marketCategory:'forex'})).code,'UNSUPPORTED_BLOCKLY_MARKET');
 assert.equal(normalizeBlocklyExecutionPlan(plan({currency:'EUR'})).code,'UNSUPPORTED_BLOCKLY_CURRENCY');
 assert.equal(normalizeBlocklyExecutionPlan(plan({tradeType:'callput'})).code,'UNSUPPORTED_BLOCKLY_CONTRACT');
 assert.equal(normalizeBlocklyExecutionPlan(plan({multiplier:1001})).code,'INVALID_BLOCKLY_MULTIPLIER');
 assert.equal(normalizeBlocklyExecutionPlan(plan({stake:20,sessionStopLoss:10})).code,'SESSION_STOP_LOSS_BELOW_STAKE');
 assert.equal(normalizeBlocklyExecutionPlan(plan({strategyId:'vertex-digits'})).code,'STRATEGY_NOT_SUPPORTED_FOR_MULTIPLIERS');
});
