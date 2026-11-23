import test from "node:test";
import assert from "node:assert/strict";
import { validateTicksRequest, validateAutoStartRequiredFields } from "../lib/deriv/user-schema-request-checks.ts";

test("tick request accepts a documented symbol subscription", () => {
  assert.deepEqual(validateTicksRequest({ ticks: "1HZ100V", subscribe: 1, req_id: 2 }), { ok: true, errors: [] });
});

test("tick request rejects absent symbol and invalid subscription", () => {
  const result = validateTicksRequest({ subscribe: 0 });
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("Invalid ticks symbol"));
  assert.ok(result.errors.includes("subscribe must be 1"));
});

test("tick request rejects unknown properties and malformed passthrough", () => {
  const result = validateTicksRequest({ ticks: "R_100", subscribe: 1, buy: 1, passthrough: "bad" });
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("Unknown property: buy"));
  assert.ok(result.errors.includes("passthrough must be an object"));
});

test("auto-start rejects incomplete strategy request without sending anything", () => {
  const result = validateAutoStartRequiredFields({ auto_start: 1, strategy_id: "research-only" });
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("strategy_parameters object required"));
  assert.ok(result.errors.includes("contract_template object required"));
});

test("auto-start structural check accepts all required fields, not an execution approval", () => {
  const result = validateAutoStartRequiredFields({
    auto_start: 1,
    strategy_id: "research-only",
    strategy_parameters: {},
    contract_template: { contract_type: "DIGITDIFF", currency: "USD", underlying_symbol: "R_100" }
  });
  assert.equal(result.ok, true);
});

test("non-object payloads are rejected", () => {
  assert.equal(validateTicksRequest(null).ok, false);
  assert.equal(validateAutoStartRequiredFields([]).ok, false);
});


test("tick request rejects empty symbol arrays (fail closed)", () => {
  const result = validateTicksRequest({ ticks: [], subscribe: 1 });
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("Invalid ticks symbol"));
});
