import { STRATEGIES } from './strategy-catalog.mjs';

const direction = Object.freeze({ RISE: 'CALL', FALL: 'PUT' });
const contractsByModel = {
  DIGIT_ANALYSIS: Object.freeze({ DIFFER: 'DIGITDIFF' }),
  ODD_EVEN: Object.freeze({ EVEN: 'DIGITEVEN', ODD: 'DIGITODD' }),
  SEQUENTIAL_ANALYSIS: Object.freeze({ MATCH: 'DIGITMATCH' }),
};

export const quantumDemoContracts = Object.freeze(Object.fromEntries(
  STRATEGIES.map(strategy => [
    strategy.id,
    Object.hasOwn(contractsByModel, strategy.model) ? contractsByModel[strategy.model] : direction,
  ]),
));

// The research strategies evaluate the next tick. Eligibility for a one-tick
// contract must still be checked for the selected market and verified Demo account.
export function mapQuantumDemoSignal(strategyId, signal) {
  if (!Object.hasOwn(quantumDemoContracts, strategyId)) return null;
  const contracts = quantumDemoContracts[strategyId];
  if (!signal || !Object.hasOwn(contracts, signal.kind)) return null;

  const contractType = contracts[signal.kind];
  const requiresBarrier = contractType === 'DIGITMATCH' || contractType === 'DIGITDIFF';
  const { barrier } = signal;
  if (requiresBarrier ? !Number.isInteger(barrier) || barrier < 0 || barrier > 9 : barrier !== undefined) {
    return null;
  }

  return {
    contract_type: contractType,
    duration: 1,
    duration_unit: 't',
    ...(requiresBarrier ? { barrier: String(barrier) } : {}),
  };
}
