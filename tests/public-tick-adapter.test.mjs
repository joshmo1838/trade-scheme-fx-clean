import test from "node:test";
import assert from "node:assert/strict";
import { parsePublicDerivTick } from "../lib/market/public-tick-adapter.ts";
const message = (symbol = "R_100", epoch = 100, quote = 123.5) => ({ msg_type: "tick", tick: { symbol, epoch, quote } });
test("valid public tick maps to reproducible paper tick", () => {
  assert.deepEqual(parsePublicDerivTick(message(), "R_100", 100000), { ok: true, tick: { id: "R_100:100:123.5", epochMs: 100000, quote: 123.5 } });
});
test("rejects other symbols, invalid quote, stale and future ticks", () => {
  assert.equal(parsePublicDerivTick(message("R_50"), "R_100", 100000).ok, false);
  assert.equal(parsePublicDerivTick(message("R_100", 100, -1), "R_100", 100000).ok, false);
  assert.equal(parsePublicDerivTick(message(), "R_100", 110000).ok, false);
  assert.equal(parsePublicDerivTick(message(), "R_100", 98000).ok, false);
  assert.equal(parsePublicDerivTick(message("R_100", 100.5), "R_100", 100000).ok, false);
});
test("rejects errors, malformed data and non-ticks without execution", () => {
  assert.equal(parsePublicDerivTick({ error: { code: "InvalidSymbol" } }, "R_100", 100000).ok, false);
  assert.equal(parsePublicDerivTick({ msg_type: "ping" }, "R_100", 100000).ok, false);
  assert.equal(parsePublicDerivTick(null, "R_100", 100000).ok, false);
});

test("rejects malformed clocks, symbol selectors and nonfinite prices fail closed", () => {
  for (const now of [NaN, Infinity, -Infinity]) {
    assert.equal(parsePublicDerivTick(message(), "R_100", now).ok, false);
  }
  for (const symbol of ["", null, undefined]) {
    assert.equal(parsePublicDerivTick(message(), symbol, 100000).ok, false);
  }
  for (const quote of [NaN, Infinity, -Infinity, 0, "123.5", null]) {
    assert.equal(parsePublicDerivTick(message("R_100", 100, quote), "R_100", 100000).ok, false);
  }
  for (const epoch of [NaN, Infinity, -Infinity, "100", null, 100.5]) {
    assert.equal(parsePublicDerivTick(message("R_100", epoch, 123.5), "R_100", 100000).ok, false);
  }
});

test("accepts exact freshness boundaries but rejects one millisecond beyond", () => {
  assert.equal(parsePublicDerivTick(message(), "R_100", 105000).ok, true);
  assert.equal(parsePublicDerivTick(message(), "R_100", 105001).ok, false);
  assert.equal(parsePublicDerivTick(message(), "R_100", 99000).ok, true);
  assert.equal(parsePublicDerivTick(message(), "R_100", 98999).ok, false);
});


test("rejects array-shaped messages and tick bodies, invalid selectors and clock types", () => {
  for (const raw of [[], [message()], { msg_type: "tick", tick: [] }]) {
    assert.equal(parsePublicDerivTick(raw, "R_100", 100000).ok, false);
  }
  for (const selector of [[], ["R_100"], {}, 100, true, "   "]) {
    assert.equal(parsePublicDerivTick(message(), selector, 100000).ok, false);
  }
  for (const now of ["100000", null, undefined, {}, []]) {
    assert.equal(parsePublicDerivTick(message(), "R_100", now).ok, false);
  }
});
