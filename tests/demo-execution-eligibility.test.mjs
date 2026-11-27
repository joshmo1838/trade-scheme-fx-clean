import assert from 'node:assert/strict';
import { test } from 'node:test';
import { STRATEGIES } from '../lib/quantum/strategy-catalog.mjs';
import { demoExecutionReadiness, demoQuoteExpectedValue } from '../lib/quantum/demo-execution-eligibility.mjs';

const configuration = {
  marketSymbol: 'R_100',
  currency: 'USD',
  contractFamily: 'OPTIONS',
  contractType: 'CALL',
  duration: 1,
  durationUnit: 't',
  barrier: null,
  multiplier: null,
};

function validatedStrategy(overrides = {}) {
  return {
    ...STRATEGIES[0],
    mode: 'DEMO_VALIDATED',
    validated: true,
    executionEnabled: true,
    validation: {
      status: 'passed',
      strategyVersion: '1.0.0',
      evaluationMethod: 'chronological-block-bootstrap',
      predeclaredCriteriaPassed: true,
      evidenceDigest: 'a'.repeat(64),
      effectiveSampleSize: 1200,
      probabilityLowerBound: 0.9,
      costsPerTrade: 0.01,
      validatedAt: '2026-11-27T00:00:00Z',
      configuration,
    },
    ...overrides,
  };
}

test('research-only strategies fail closed', () => {
  const result = demoExecutionReadiness(STRATEGIES[0], configuration);
  assert.deepEqual(result, { allowed: false, code: 'STRATEGY_NOT_DEMO_VALIDATED' });
});

test('validated evidence must match the selected contract configuration', () => {
  const strategy = validatedStrategy();
  assert.equal(demoExecutionReadiness(strategy, configuration).allowed, true);
  assert.equal(demoExecutionReadiness(strategy, { ...configuration, marketSymbol: 'R_50' }).code,
    'VALIDATION_CONFIGURATION_MISMATCH');
});

test('incomplete validation evidence and multiplier EV models fail closed', () => {
  const noDigest = validatedStrategy({ validation: { ...validatedStrategy().validation, evidenceDigest: '' } });
  assert.equal(demoExecutionReadiness(noDigest, configuration).code, 'OUT_OF_SAMPLE_EVIDENCE_INCOMPLETE');
  assert.equal(demoExecutionReadiness(validatedStrategy(), { ...configuration, contractFamily: 'MULTIPLIER' }).code,
    'UNSUPPORTED_EXPECTED_VALUE_MODEL');
});

test('fresh quote passes only when the conservative probability bound beats break-even after costs', () => {
  const readiness = demoExecutionReadiness(validatedStrategy(), configuration);
  const passed = demoQuoteExpectedValue(readiness, { ask_price: 1, payout: 1.2 });
  assert.equal(passed.allowed, true);
  assert.ok(passed.expectedValuePerTrade > 0);
  assert.ok(passed.probabilityLowerBound > passed.breakEvenProbability);

  const equal = demoExecutionReadiness(validatedStrategy({
    validation: { ...validatedStrategy().validation, probabilityLowerBound: 0.8, costsPerTrade: 0.2 },
  }), configuration);
  assert.equal(demoQuoteExpectedValue(equal, { ask_price: 1, payout: 1.5 }).code,
    'NO_POSITIVE_EXPECTED_VALUE_AFTER_COSTS');
  assert.equal(demoQuoteExpectedValue(readiness, { ask_price: 1 }).code, 'INVALID_QUOTE_ECONOMICS');
});
