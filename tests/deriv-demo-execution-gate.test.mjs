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
