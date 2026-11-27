import { STRATEGIES } from './strategy-catalog.mjs';
import { quantumDemoContracts } from './demo-contracts.mjs';

const MONEY = value => typeof value === 'number' && Number.isFinite(value) &&
  value > 0 && Number.isSafeInteger(Math.round(value * 100)) &&
  Math.abs(value * 100 - Math.round(value * 100)) < 0.000001;

export function normalizeBlocklyExecutionPlan(value) {
  const fail = code => ({ ok: false, code });
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('INVALID_BLOCKLY_PLAN');
  const strategy = STRATEGIES.find(item => item.id === value.strategyId);
  if (!strategy) return fail('UNKNOWN_BLOCKLY_STRATEGY');
  const contracts = quantumDemoContracts[strategy.id];
  if (!contracts?.RISE || !contracts?.FALL) return fail('STRATEGY_NOT_SUPPORTED_FOR_MULTIPLIERS');
  if (value.marketCategory !== 'synthetic_index' && value.marketCategory !== 'cryptocurrency') return fail('UNSUPPORTED_BLOCKLY_MARKET');
  if (typeof value.marketSymbol !== 'string' || !/^[A-Za-z0-9_]{2,30}$/.test(value.marketSymbol)) return fail('INVALID_BLOCKLY_SYMBOL');
  if (value.currency !== 'USD' && value.currency !== 'AUD') return fail('UNSUPPORTED_BLOCKLY_CURRENCY');
  if (!['multiplier','multipliers'].includes(String(value.tradeTypeCategory).toLowerCase()) || !['multiplier','multipliers'].includes(String(value.tradeType).toLowerCase()) || String(value.contractType).toLowerCase() !== 'both') return fail('UNSUPPORTED_BLOCKLY_CONTRACT');
  if (!Number.isSafeInteger(value.multiplier) || value.multiplier < 1 || value.multiplier > 1000) return fail('INVALID_BLOCKLY_MULTIPLIER');
  if (!MONEY(value.stake) || !MONEY(value.sessionStopLoss) || !MONEY(value.sessionTakeProfit) || !MONEY(value.perTradeStopLoss) || !MONEY(value.perTradeTakeProfit)) return fail('INVALID_BLOCKLY_RISK_SETTINGS');
  if (value.stake > value.sessionStopLoss) return fail('SESSION_STOP_LOSS_BELOW_STAKE');
  if (value.stake > 1000 || value.sessionStopLoss > 1000 || value.sessionTakeProfit > 1000 || value.perTradeStopLoss > 1000 || value.perTradeTakeProfit > 1000) return fail('BLOCKLY_VALUE_OUT_OF_RANGE');
  return {
    ok: true,
    plan: Object.freeze({
      strategyId: strategy.id,
      marketCategory: value.marketCategory,
      marketSymbol: value.marketSymbol,
      currency: value.currency,
      contractFamily: 'MULTIPLIER',
      multiplier: value.multiplier,
      stake: value.stake,
      perTradeStopLoss: value.perTradeStopLoss,
      perTradeTakeProfit: value.perTradeTakeProfit,
      sessionStopLoss: value.sessionStopLoss,
      sessionTakeProfit: value.sessionTakeProfit,
    }),
  };
}
