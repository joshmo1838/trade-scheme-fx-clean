import test from "node:test";
import assert from "node:assert/strict";
import { evaluateDemoOrderGate } from "../lib/deriv/demo-execution-gate.mjs";

const base = { customerConfirmed: true, accountType: "demo", brokerVerifiedDemo: true,
  emergencyStopped: false, riskStateVerified: true, stake: 5, dailyLoss: 0,
  openOrders: 0, aggregateExposure: 0, requestId: "12345678-1234-1234-1234-123456789012" };
const enabled = { enabled: true };
test("disabled by default", () => assert.equal(evaluateDemoOrderGate(base).code, "DEMO_EXECUTION_DISABLED"));
test("verified demo passes explicit guard", () => assert.equal(evaluateDemoOrderGate(base, enabled).allowed, true));
for (const [label, change, expected] of [
  ["real account", { accountType: "real" }, "VERIFIED_DEMO_ACCOUNT_REQUIRED"],
  ["unverified broker account", { brokerVerifiedDemo: false }, "VERIFIED_DEMO_ACCOUNT_REQUIRED"],
  ["no consent", { customerConfirmed: false }, "CUSTOMER_CONFIRMATION_REQUIRED"],
  ["emergency stop", { emergencyStopped: true }, "EMERGENCY_STOP_ACTIVE"],
  ["unknown risk state", { riskStateVerified: false }, "RISK_STATE_UNVERIFIED"],
  ["excessive stake", { stake: 11 }, "STAKE_LIMIT"],
  ["daily loss exhausted", { dailyLoss: 18 }, "DAILY_LOSS_LIMIT"],
  ["open order", { openOrders: 1 }, "OPEN_ORDER_LIMIT"],
  ["exposure exhausted", { aggregateExposure: 8 }, "EXPOSURE_LIMIT"],
  ["missing idempotency key", { requestId: "" }, "IDEMPOTENCY_KEY_REQUIRED"],
  ["invalid loss", { dailyLoss: NaN }, "INVALID_RISK_STATE"],
]) test(label, () => assert.equal(evaluateDemoOrderGate({ ...base, ...change }, enabled).code, expected));

test("exact maximum stake and loss budget is allowed", () => {
  assert.equal(evaluateDemoOrderGate({ ...base, stake: 10, dailyLoss: 10 }, enabled).allowed, true);
});
test("one cent over loss budget is rejected", () => {
  assert.equal(evaluateDemoOrderGate({ ...base, stake: 10, dailyLoss: 10.01 }, enabled).code, "DAILY_LOSS_LIMIT");
});
test("fractional open order count is rejected", () => {
  assert.equal(evaluateDemoOrderGate({ ...base, openOrders: 0.5 }, enabled).code, "OPEN_ORDER_LIMIT");
});
test("negative exposure is rejected", () => {
  assert.equal(evaluateDemoOrderGate({ ...base, aggregateExposure: -1 }, enabled).code, "INVALID_RISK_STATE");
});
test("missing emergency stop state fails closed", () => {
  const { emergencyStopped, ...unknownStop } = base;
  assert.equal(evaluateDemoOrderGate(unknownStop, enabled).code, "EMERGENCY_STOP_ACTIVE");
});
test("real broker account is rejected even with consent", () => {
  assert.equal(evaluateDemoOrderGate({ ...base, accountType: "real" }, enabled).allowed, false);
});

test("malformed order payloads and absent verification fail closed", () => {
  for (const input of [null, undefined, {}, { ...base, stake: Infinity }, { ...base, stake: "5" },
    { ...base, openOrders: -1 }, { ...base, aggregateExposure: NaN },
    { ...base, brokerVerifiedDemo: "true" }, { ...base, customerConfirmed: "true" },
    { ...base, riskStateVerified: undefined }, { ...base, accountType: "REAL" }]) {
    assert.equal(evaluateDemoOrderGate(input, enabled).allowed, false);
  }
});
test("loss and reserved exposure are independently enforced at boundaries", () => {
  assert.equal(evaluateDemoOrderGate({ ...base, stake: 10, dailyLoss: 10, aggregateExposure: 0 }, enabled).allowed, true);
  assert.equal(evaluateDemoOrderGate({ ...base, stake: 10, dailyLoss: 10.001 }, enabled).code, "DAILY_LOSS_LIMIT");
  assert.equal(evaluateDemoOrderGate({ ...base, stake: 5, aggregateExposure: 5.001 }, enabled).code, "EXPOSURE_LIMIT");
  assert.equal(evaluateDemoOrderGate({ ...base, stake: 0 }, enabled).code, "STAKE_LIMIT");
});
test("a pure gate cannot guarantee idempotency or atomic concurrency", () => {
  // Two identical requests both pass a pure local snapshot; the SQL transaction
  // must enforce idempotency, lock the risk row and reserve before any broker buy.
  const a = evaluateDemoOrderGate(base, enabled);
  const b = evaluateDemoOrderGate({ ...base }, enabled);
  assert.equal(a.allowed, true);
  assert.equal(b.allowed, true);
});

test("configured overrides cannot raise immutable demo safety ceilings", () => {
  for (const limits of [
    { maxStake: 10.01 }, { maxDailyLoss: 20.01 },
    { maxOpenOrders: 2 }, { maxAggregateExposure: 10.01 },
    { maxOpenOrders: 0.5 }, { maxStake: Infinity }, { maxDailyLoss: NaN }
  ]) {
    assert.equal(evaluateDemoOrderGate(base, { enabled: true, limits }).code, "INVALID_RISK_LIMITS");
  }
  assert.equal(evaluateDemoOrderGate(base, { enabled: true, limits: { maxStake: 5, maxDailyLoss: 15 } }).allowed, true);
});

test("reserved exposure plus loss plus proposed stake must remain within daily budget", () => {
  assert.equal(evaluateDemoOrderGate({ ...base, dailyLoss: 12, aggregateExposure: 5, stake: 5 }, enabled).code, "DAILY_LOSS_LIMIT");
  assert.equal(evaluateDemoOrderGate({ ...base, dailyLoss: 10, aggregateExposure: 5, stake: 5 }, enabled).allowed, true);
  assert.equal(evaluateDemoOrderGate({ ...base, dailyLoss: 10.01, aggregateExposure: 5, stake: 5 }, enabled).code, "DAILY_LOSS_LIMIT");
});
