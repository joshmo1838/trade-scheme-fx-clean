import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const readiness = readFileSync(
  new URL("../app/api/deriv/demo/readiness/route.ts", import.meta.url),
  "utf8",
);

test("readiness does not incorrectly claim broker integration is absent", () => {
  assert.doesNotMatch(readiness, /BROKER_EXECUTION_NOT_INTEGRATED/);
  assert.match(readiness, /DEMO_BROKER_BUY_SAFETY_HOLD/);
});

test("readiness checks authentication and server-only pilot allowlist", () => {
  assert.match(readiness, /supabase\.auth\.getUser\(\)/);
  assert.match(readiness, /isAuthorizedDemoPilot\(/);
  assert.match(readiness, /process\.env\.DERIV_DEMO_PILOT_USER_ID/);
  assert.match(readiness, /AUTH_REQUIRED/);
  assert.match(readiness, /DEMO_PILOT_NOT_AUTHORIZED/);
});

test("readiness checks separate execution and purchase switches, always fails closed", () => {
  assert.match(readiness, /DERIV_DEMO_TRADING_ENABLED === "true"/);
  assert.match(readiness, /DERIV_DEMO_BROKER_BUY_ENABLED === "true"/);
  assert.match(readiness, /ACCOUNT_AND_DATABASE_VERIFICATION_REQUIRED/);
  assert.match(readiness, /ready: false/);
  assert.match(readiness, /"Cache-Control": "no-store"/);
  assert.doesNotMatch(readiness, /session\.request\("buy"/);
});
