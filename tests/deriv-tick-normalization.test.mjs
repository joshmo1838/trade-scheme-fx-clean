import test from "node:test";
import assert from "node:assert/strict";
import { normalizeDerivTickMessage } from "../lib/deriv/normalize-tick-message.mjs";
import { createResearchTickWindow } from "../lib/deriv/research-tick-window.mjs";

const epoch = 1_800_000_000;
const expectedSymbol = "R_100";

test("normalizes a valid Deriv WebSocket tick", () => {
  const response = normalizeDerivTickMessage({
    msg_type: "tick",
    tick: { symbol: expectedSymbol, epoch, quote: 123.45, pip_size: 2 },
  }, expectedSymbol);
  assert.deepEqual(response, { accepted: true, tick: { epoch, quote: 123.45 } });
});

test("rejects messages for another symbol or without a tick", () => {
  assert.equal(normalizeDerivTickMessage({ msg_type: "tick", tick: { symbol: "R_50", epoch, quote: 2 } }, expectedSymbol).reason, "symbol_mismatch");
  assert.equal(normalizeDerivTickMessage({ msg_type: "tick" }, expectedSymbol).reason, "missing_tick");
  assert.equal(normalizeDerivTickMessage({ msg_type: "ping" }, expectedSymbol).reason, "not_tick_message");
});

test("rejects invalid quote and epoch before research ingestion", () => {
  for (const tick of [
    { symbol: expectedSymbol, epoch: "1800000000", quote: 1 },
    { symbol: expectedSymbol, epoch, quote: "1" },
    { symbol: expectedSymbol, epoch, quote: -1 },
    { symbol: expectedSymbol, epoch, quote: Infinity },
  ]) {
    assert.equal(normalizeDerivTickMessage({ msg_type: "tick", tick }, expectedSymbol).reason, "invalid_tick");
  }
});

test("normalized ticks can enter the bounded research window", () => {
  const window = createResearchTickWindow({ clock: () => epoch * 1000 });
  const normalized = normalizeDerivTickMessage({ msg_type: "tick", tick: { symbol: expectedSymbol, epoch, quote: 99 } }, expectedSymbol);
  assert.equal(normalized.accepted, true);
  assert.equal(window.ingest(normalized.tick).accepted, true);
  assert.equal(window.size, 1);
});
