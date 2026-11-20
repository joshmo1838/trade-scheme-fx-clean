import test from "node:test";
import assert from "node:assert/strict";
import { replayPaperTicks } from "../lib/market/market-time-machine.ts";
const tick = (n, quote = 100 + n) => ({ id: "replay-" + n, epochMs: n * 1000, quote });
const input = (n, score = 75, quote) => ({ tick: tick(n, quote), score, receivedAtMs: n * 1000 });
test("replay is reproducible and settles only on next valid tick", () => {
  const rows = [input(1), input(2), input(3), input(4)];
  const a = replayPaperTicks(rows, 1000);
  const b = replayPaperTicks(rows, 1000);
  assert.deepEqual(a, b);
  assert.equal(a.session.observations.length, 2);
  assert.equal(a.session.observations[0].outcome, "up");
  assert.equal(a.session.observations[1].outcome, "up");
});
test("replay ignores duplicate ticks and does not settle on duplicates", () => {
  const rows = [input(1), input(1), input(2)];
  const result = replayPaperTicks(rows, 1000);
  assert.equal(result.events[1].reason, "duplicate-tick");
  assert.equal(result.session.observations[0].settlement?.id, "replay-2");
});
test("emergency stop and invalid clocks fail closed", () => {
  const stopped = replayPaperTicks([input(1), input(2), input(3)], 1000, 1);
  assert.equal(stopped.session.gate.stopped, true);
  assert.equal(stopped.session.observations[0].settlement, null);
  const bad = replayPaperTicks([{ ...input(1), receivedAtMs: 0 }], 1000);
  assert.equal(bad.session.gate.stopped, true);
});
test("replay caps observations at ten and never submits orders", () => {
  const rows = Array.from({ length: 30 }, (_, i) => input(i + 1));
  const result = replayPaperTicks(rows, 1000);
  assert.equal(result.session.observations.length, 10);
  assert.equal(result.session.observations.every(o => o.settlement !== null), true);
  assert.equal(result.events.length, 20);
});

test("replay rejects malformed and out-of-order inputs without hypothetical settlement", () => {
  const malformed = replayPaperTicks([input(1), { ...input(2), tick: { ...tick(2), quote: NaN } }], 1000);
  assert.equal(malformed.session.observations[0].settlement, null);
  assert.equal(malformed.events[1].reason, "invalid-number");
  const reversed = replayPaperTicks([input(1), { ...input(2), tick: tick(1) }], 1000);
  assert.equal(reversed.events[1].reason, "duplicate-tick");
  assert.equal(reversed.session.observations[0].settlement, null);
  const stale = replayPaperTicks([input(1), { ...input(2), receivedAtMs: 8000 }], 1000);
  assert.equal(stale.events[1].reason, "stale-tick");
  assert.equal(stale.session.observations[0].settlement, null);
});
test("low quality research scores never create paper observations", () => {
  const result = replayPaperTicks([input(1, 74), input(2, 74), input(3, 74)], 1000);
  assert.equal(result.session.observations.length, 0);
  assert.equal(result.events.every(e => e.reason === "no-qualifying-signal"), true);
});

test("invalid emergency stop indices are rejected before replay", () => {
  const rows = [input(1), input(2)];
  for (const index of [-1, 0.5, NaN, Infinity, 2]) {
    assert.throws(() => replayPaperTicks(rows, 1000, index), /invalid-emergency-stop-index/);
  }
  assert.equal(replayPaperTicks(rows, 1000, 0).session.gate.stopped, true);
});
