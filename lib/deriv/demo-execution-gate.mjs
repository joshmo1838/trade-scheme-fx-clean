// Advisory fail-closed check for ONE specifically approved virtual-money pilot.
// This never places a broker order. Production must also enforce limits
// transactionally in Supabase, verify the account at Deriv and keep buy OFF.
export const DEFAULT_DEMO_LIMITS = Object.freeze({
  maxOpenOrders: 1,
  stakeUsd: 1,
  maxDailyVirtualLossUsd: 1,
});

export function evaluateDemoOrderGate(input, config = {}) {
  const reject = (code) => ({ allowed: false, code });
  if (!config || typeof config !== "object" || Array.isArray(config) || config.enabled !== true) {
    return reject("DEMO_EXECUTION_DISABLED");
  }
  if (!input || input.customerConfirmed !== true) return reject("CUSTOMER_CONFIRMATION_REQUIRED");
  if (input.accountType !== "demo" || input.brokerVerifiedDemo !== true) return reject("VERIFIED_DEMO_ACCOUNT_REQUIRED");
  if (input.emergencyStopped !== false) return reject("EMERGENCY_STOP_ACTIVE");
  if (input.riskStateVerified !== true) return reject("RISK_STATE_UNVERIFIED");
  if (config.limits != null && (
      typeof config.limits !== "object" || Array.isArray(config.limits) ||
      Object.keys(config.limits).some((key) => !Object.hasOwn(DEFAULT_DEMO_LIMITS, key)) ||
      Object.entries(config.limits).some(([key, value]) => value !== DEFAULT_DEMO_LIMITS[key])
  )) return reject("INVALID_RISK_LIMITS");
  for (const field of ["stake", "dailyLoss", "openOrders", "aggregateExposure", "priorBuyAttempts"]) {
    if (typeof input[field] !== "number" || !Number.isFinite(input[field]) || input[field] < 0) {
      return reject("INVALID_RISK_STATE");
    }
  }
  if (input.currency !== "USD" || input.stake !== 1) return reject("INVALID_STAKE");
  if (!Number.isInteger(input.openOrders) || input.openOrders >= 1) return reject("OPEN_ORDER_LIMIT");
  if (!Number.isInteger(input.priorBuyAttempts) || input.priorBuyAttempts !== 0) return reject("PILOT_ALREADY_ATTEMPTED");
  if (input.aggregateExposure !== 0) return reject("RISK_STATE_UNVERIFIED");
  if (input.dailyLoss + input.stake > DEFAULT_DEMO_LIMITS.maxDailyVirtualLossUsd) return reject("DEMO_DAILY_LOSS_LIMIT");
  if (typeof input.requestId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.requestId)) {
    return reject("IDEMPOTENCY_KEY_REQUIRED");
  }
  return { allowed: true, code: "DEMO_ORDER_GATE_PASSED" };
}
