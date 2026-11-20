// Fail-closed broker execution guard. Does not place broker orders.
export const DEFAULT_DEMO_LIMITS = Object.freeze({
  maxStake: 10,
  maxDailyLoss: 20,
  maxOpenOrders: 1,
  maxAggregateExposure: 10,
});

export function evaluateDemoOrderGate(input, config = {}) {
  const reject = (code) => ({ allowed: false, code });
  if (config.enabled !== true) return reject("DEMO_EXECUTION_DISABLED");
  if (!input || input.customerConfirmed !== true) return reject("CUSTOMER_CONFIRMATION_REQUIRED");
  if (input.accountType !== "demo" || input.brokerVerifiedDemo !== true) return reject("VERIFIED_DEMO_ACCOUNT_REQUIRED");
  if (input.emergencyStopped !== false) return reject("EMERGENCY_STOP_ACTIVE");
  if (input.riskStateVerified !== true) return reject("RISK_STATE_UNVERIFIED");
  const limits = { ...DEFAULT_DEMO_LIMITS, ...(config.limits || {}) };
  if (Object.entries(limits).some(([key, value]) => !Number.isFinite(value) || value <= 0 || value > DEFAULT_DEMO_LIMITS[key])) return reject("INVALID_RISK_LIMITS");
  if (!Number.isInteger(limits.maxOpenOrders)) return reject("INVALID_RISK_LIMITS");
  const fields = ["stake", "dailyLoss", "openOrders", "aggregateExposure"];
  if (fields.some((field) => !Number.isFinite(input[field]) || input[field] < 0)) return reject("INVALID_RISK_STATE");
  if (input.stake <= 0 || input.stake > limits.maxStake) return reject("STAKE_LIMIT");
  if (!Number.isInteger(input.openOrders) || input.openOrders >= limits.maxOpenOrders) return reject("OPEN_ORDER_LIMIT");
  // Count already-reserved exposure against the daily loss budget before any new reservation.
  // This pure check is advisory: a database transaction must enforce it atomically.
  if (input.dailyLoss + input.aggregateExposure + input.stake > limits.maxDailyLoss) return reject("DAILY_LOSS_LIMIT");
  if (input.aggregateExposure + input.stake > limits.maxAggregateExposure) return reject("EXPOSURE_LIMIT");
  if (typeof input.requestId !== "string" || !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(input.requestId)) return reject("IDEMPOTENCY_KEY_REQUIRED");
  return { allowed: true, code: "DEMO_ORDER_GATE_PASSED" };
}
