// Pure, fail-closed advisory guard for the explicitly allowlisted Demo pilot.
// No broker order is placed here. Database transactions must independently
// enforce one active order and idempotency before any broker request.
export const DEFAULT_DEMO_LIMITS = Object.freeze({ maxOpenOrders: 1 });

export function evaluateDemoOrderGate(input, config = {}) {
  const reject = (code) => ({ allowed: false, code });
  if (!config || typeof config !== "object" || Array.isArray(config) || config.enabled !== true) return reject("DEMO_EXECUTION_DISABLED");
  if (!input || input.customerConfirmed !== true) return reject("CUSTOMER_CONFIRMATION_REQUIRED");
  if (input.accountType !== "demo" || input.brokerVerifiedDemo !== true) return reject("VERIFIED_DEMO_ACCOUNT_REQUIRED");
  if (input.emergencyStopped !== false) return reject("EMERGENCY_STOP_ACTIVE");
  if (input.riskStateVerified !== true) return reject("RISK_STATE_UNVERIFIED");
  // No SENFX stake or cumulative-loss ceiling. Broker limits still apply.
  // Reject unexpected limit overrides rather than silently applying old caps.
  if (config.limits != null && (typeof config.limits !== "object" || Array.isArray(config.limits) ||
      Object.keys(config.limits).some((key) => key !== "maxOpenOrders") ||
      config.limits.maxOpenOrders !== 1)) return reject("INVALID_RISK_LIMITS");
  if (["stake", "dailyLoss", "openOrders", "aggregateExposure"].some(
    (field) => typeof input[field] !== "number" || !Number.isFinite(input[field]) || input[field] < 0
  )) return reject("INVALID_RISK_STATE");
  if (input.stake <= 0) return reject("INVALID_STAKE");
  if (!Number.isInteger(input.openOrders) || input.openOrders >= 1) return reject("OPEN_ORDER_LIMIT");
  // No other reservation should exist when no order is active. Inconsistent
  // ledgers fail closed instead of permitting another concurrent purchase.
  if (input.aggregateExposure !== 0) return reject("RISK_STATE_UNVERIFIED");
  if (typeof input.requestId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.requestId)) return reject("IDEMPOTENCY_KEY_REQUIRED");
  return { allowed: true, code: "DEMO_ORDER_GATE_PASSED" };
}
