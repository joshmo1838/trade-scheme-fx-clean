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
