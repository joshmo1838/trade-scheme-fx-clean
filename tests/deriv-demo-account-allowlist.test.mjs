import test from "node:test";
import assert from "node:assert/strict";
import { isAuthorizedDemoPilot } from "../lib/deriv/demo-account-allowlist.mjs";
const owner = "123e4567-e89b-42d3-a456-426614174000";
const other = "123e4567-e89b-42d3-a456-426614174001";
test("only the configured account is eligible", () => {
  assert.equal(isAuthorizedDemoPilot(owner, owner), true);
  assert.equal(isAuthorizedDemoPilot(other, owner), false);
  assert.equal(isAuthorizedDemoPilot(owner, undefined), false);
  assert.equal(isAuthorizedDemoPilot(owner, ""), false);
  assert.equal(isAuthorizedDemoPilot("admin", "admin"), false);
});
