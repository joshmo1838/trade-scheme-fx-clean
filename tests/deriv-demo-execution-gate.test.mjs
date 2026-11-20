import test from "node:test";
import assert from "node:assert/strict";
import { evaluateDemoOrderGate } from "../lib/deriv/demo-execution-gate.mjs";

const base = {
  customerConfirmed: true,
  accountType: "demo",
  brokerVerifiedDemo: true,
  emergencyStopped: false,
  riskStateVerified: true,
  currency: "USD",
  stake: 1,
  dailyLoss: 0,
  openOrders: 0,
  aggregateExposure: 0,
  priorBuyAttempts: 0,
  requestId: "12345678-1234-1234-1234-123456789012",
};
const enabled = { enabled: true };
const check = (change, code) =>
  assert.equal(evaluateDemoOrderGate({ ...base, ...change }, enabled).code, code);

test("broker pilot is disabled unless explicitly enabled", () => {
  assert.equal(evaluateDemoOrderGate(base).code, "DEMO_EXECUTION_DISABLED");
  assert.equal(evaluateDemoOrderGate(base, { enabled: false }).allowed, false);
});
test("one verified, explicit $1 virtual-money USD attempt passes advisory gate", () => {
  assert.equal(evaluateDemoOrderGate(base, enabled).allowed, true);
});
for (const [name, input, code] of [
  ["real account", { accountType: "real" }, "VERIFIED_DEMO_ACCOUNT_REQUIRED"],
  ["unverified account", { brokerVerifiedDemo: false }, "VERIFIED_DEMO_ACCOUNT_REQUIRED"],
  ["missing consent", { customerConfirmed: false }, "CUSTOMER_CONFIRMATION_REQUIRED"],
  ["emergency stop", { emergencyStopped: true }, "EMERGENCY_STOP_ACTIVE"],
  ["unknown stop", { emergencyStopped: undefined }, "EMERGENCY_STOP_ACTIVE"],
  ["unverified ledger", { riskStateVerified: false }, "RISK_STATE_UNVERIFIED"],
  ["wrong currency", { currency: "EUR" }, "INVALID_STAKE"],
  ["ten dollar stake", { stake: 10 }, "INVALID_STAKE"],
  ["fractional stake", { stake: 0.5 }, "INVALID_STAKE"],
  ["zero stake", { stake: 0 }, "INVALID_STAKE"],
  ["negative stake", { stake: -1 }, "INVALID_RISK_STATE"],
  ["one open position", { openOrders: 1 }, "OPEN_ORDER_LIMIT"],
  ["fractional open positions", { openOrders: 0.5 }, "OPEN_ORDER_LIMIT"],
  ["first attempted buy already recorded", { priorBuyAttempts: 1 }, "PILOT_ALREADY_ATTEMPTED"],
  ["prior attempt uncertainty", { priorBuyAttempts: 0.5 }, "PILOT_ALREADY_ATTEMPTED"],
  ["daily loss consumes cap", { dailyLoss: 0.01 }, "DEMO_DAILY_LOSS_LIMIT"],
  ["existing reserved exposure", { aggregateExposure: 1 }, "RISK_STATE_UNVERIFIED"],
  ["missing idempotency", { requestId: "" }, "IDEMPOTENCY_KEY_REQUIRED"],
]) test(name, () => check(input, code));

test("malformed numeric state and malformed config fail closed", () => {
  for (const input of [null, undefined, {}, {...base, stake: Infinity},
    {...base, stake: "1"}, {...base, dailyLoss: NaN},
    {...base, priorBuyAttempts: undefined}, {...base, openOrders: -1},
    {...base, customerConfirmed: "true"}, {...base, brokerVerifiedDemo: "true"}]) {
    assert.equal(evaluateDemoOrderGate(input, enabled).allowed, false);
  }
  for (const config of [null, false, 0, [], "enabled", { enabled: true, limits: [] },
    { enabled: true, limits: { maxOpenOrders: 2 } },
    { enabled: true, limits: { stakeUsd: 2 } },
    { enabled: true, limits: { maxDailyVirtualLossUsd: Infinity } }]) {
    assert.equal(evaluateDemoOrderGate(base, config).allowed, false);
  }
});

test("strict idempotency key shape", () => {
  for (const requestId of ["", "12345678-1234-1234-1234-123456789012-", "12345678123412341234123456789012",
    " 12345678-1234-1234-1234-123456789012", "12345678-1234-1234-1234-12345678901z"]) {
    check({ requestId }, "IDEMPOTENCY_KEY_REQUIRED");
  }
});
test("pure check is not a database lock or an order; separately test RPC atomically", () => {
  assert.equal(evaluateDemoOrderGate(base, enabled).allowed, true);
  assert.equal(evaluateDemoOrderGate(base, enabled).allowed, true);
});
