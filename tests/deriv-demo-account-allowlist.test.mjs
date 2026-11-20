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

test("allowlist rejects malformed, spoofed, and non-canonical pilot identifiers", () => {
  for (const value of [null, undefined, 123, {}, [], "", " ", "admin", owner + "x",
    owner.slice(0, -1), "123e4567-e89b-02d3-a456-426614174000",
    "123e4567-e89b-42d3-0456-426614174000", " " + owner, owner + " "]) {
    assert.equal(isAuthorizedDemoPilot(value, owner), false);
    assert.equal(isAuthorizedDemoPilot(owner, value), false);
  }
});
test("UUID casing is normalized but does not authorize a second account", () => {
  assert.equal(isAuthorizedDemoPilot(owner.toUpperCase(), owner), true);
  assert.equal(isAuthorizedDemoPilot(other.toUpperCase(), owner), false);
});
