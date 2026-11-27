const CONFIG_KEYS = [
  'marketSymbol',
  'currency',
  'contractFamily',
  'contractType',
  'duration',
  'durationUnit',
  'barrier',
  'multiplier',
];

const finite = value => typeof value === 'number' && Number.isFinite(value);

/**
 * Research-only catalog entries may run in observation mode, but cannot reach
 * a broker purchase path. Evidence is versioned with the strategy and exact
 * market/contract configuration.
 */
export function demoExecutionReadiness(strategy, configuration) {
  if (!strategy || strategy.mode !== 'DEMO_VALIDATED' ||
      strategy.validated !== true || strategy.executionEnabled !== true) {
    return { allowed: false, code: 'STRATEGY_NOT_DEMO_VALIDATED' };
  }

  const evidence = strategy.validation;
  if (!evidence || evidence.status !== 'passed' ||
      evidence.strategyVersion !== strategy.version ||
      evidence.evaluationMethod !== 'chronological-block-bootstrap' ||
      evidence.predeclaredCriteriaPassed !== true ||
      !/^[a-f0-9]{64}$/i.test(String(evidence.evidenceDigest || '')) ||
      !Number.isInteger(evidence.effectiveSampleSize) ||
      evidence.effectiveSampleSize < 1000 ||
      !finite(evidence.probabilityLowerBound) ||
      evidence.probabilityLowerBound <= 0 ||
      evidence.probabilityLowerBound > 1 ||
      !finite(evidence.costsPerTrade) || evidence.costsPerTrade < 0 ||
      !evidence.validatedAt || !Number.isFinite(Date.parse(evidence.validatedAt))) {
    return { allowed: false, code: 'OUT_OF_SAMPLE_EVIDENCE_INCOMPLETE' };
  }

  if (!configuration || configuration.contractFamily !== 'OPTIONS') {
    return { allowed: false, code: 'UNSUPPORTED_EXPECTED_VALUE_MODEL' };
  }

  const expected = evidence.configuration;
  if (!expected || CONFIG_KEYS.some(key => {
    const actualValue = configuration[key] ?? null;
    const expectedValue = expected[key] ?? null;
    return actualValue !== expectedValue;
  })) {
    return { allowed: false, code: 'VALIDATION_CONFIGURATION_MISMATCH' };
  }

  return { allowed: true, code: null, evidence };
}

/**
 * Compares the frozen, conservative out-of-sample probability estimate with
 * the current Deriv quote. payout is the gross winning payout; ask_price is
 * the stake/cost to buy. Missing economics fail closed.
 */
export function demoQuoteExpectedValue(readiness, quote) {
  if (!readiness?.allowed || !readiness.evidence) {
    return { allowed: false, code: readiness?.code || 'OUT_OF_SAMPLE_EVIDENCE_REQUIRED' };
  }

  const ask = Number(quote?.ask_price);
  const payout = Number(quote?.payout);
  const costs = readiness.evidence.costsPerTrade;
  const probability = readiness.evidence.probabilityLowerBound;
  if (!finite(ask) || ask <= 0 || !finite(payout) || payout <= ask ||
      !finite(costs) || costs < 0) {
    return { allowed: false, code: 'INVALID_QUOTE_ECONOMICS' };
  }

  const breakEvenProbability = (ask + costs) / payout;
  const expectedValuePerTrade = probability * payout - ask - costs;
  // Strictly positive after floating-point rounding; equality is a no-entry.
  const minimumEdge = Math.max(1e-9, ask * 1e-9);
  if (probability <= breakEvenProbability || expectedValuePerTrade <= minimumEdge) {
    return {
      allowed: false,
      code: 'NO_POSITIVE_EXPECTED_VALUE_AFTER_COSTS',
      breakEvenProbability,
      probabilityLowerBound: probability,
      expectedValuePerTrade,
    };
  }

  return {
    allowed: true,
    code: null,
    breakEvenProbability,
    probabilityLowerBound: probability,
    expectedValuePerTrade,
  };
}
