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
