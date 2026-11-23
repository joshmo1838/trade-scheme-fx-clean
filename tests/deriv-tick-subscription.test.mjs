import test from "node:test";
import assert from "node:assert/strict";
import { createDerivTickSubscription } from "../lib/deriv/tick-subscription.mjs";

test("builds a schema-aligned read-only Deriv subscription", () => {
  assert.deepEqual(createDerivTickSubscription("R_100"), { ticks: "R_100", subscribe: 1 });
  assert.deepEqual(createDerivTickSubscription("R_50", 7), { ticks: "R_50", subscribe: 1, req_id: 7 });
});

test("rejects invalid symbols and request ids", () => {
  for (const symbol of ["", "bad symbol", "R-100", null, "a"]) {
    assert.throws(() => createDerivTickSubscription(symbol), TypeError);
  }
  for (const reqId of [0, -1, 1.5, NaN, "2"]) {
    assert.throws(() => createDerivTickSubscription("R_100", reqId), RangeError);
  }
});

test("subscription request never contains purchase or authorization fields", () => {
  const request = createDerivTickSubscription("R_100", 42);
  assert.deepEqual(Object.keys(request).sort(), ["req_id", "subscribe", "ticks"]);
});
