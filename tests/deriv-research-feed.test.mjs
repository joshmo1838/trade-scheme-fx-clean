import test from "node:test";
import assert from "node:assert/strict";
import { createDerivResearchFeed } from "../lib/deriv/research-feed.mjs";

const epoch = 1_800_000_000;
const message = (symbol, quote) => ({
  msg_type: "tick", tick: { symbol, epoch, quote, pip_size: 2 },
});

test("feeds valid Deriv ticks into a bounded research snapshot", () => {
  const feed = createDerivResearchFeed({ symbol: "R_100", capacity: 2, clock: () => epoch * 1000 });
  for (const quote of [1, 2, 3]) assert.equal(feed.ingestMessage(message("R_100", quote)).accepted, true);
  assert.deepEqual(feed.snapshot().map(t => t.quote), [2, 3]);
  assert.deepEqual(feed.stats(), { accepted: 3, rejected: 0, buffered: 2, capacity: 2 });
});

test("rejects cross-symbol and duplicate messages without buffering them", () => {
  const feed = createDerivResearchFeed({ symbol: "R_100", clock: () => epoch * 1000 });
  assert.equal(feed.ingestMessage(message("R_50", 1)).reason, "symbol_mismatch");
  assert.equal(feed.ingestMessage(message("R_100", 1)).accepted, true);
  assert.equal(feed.ingestMessage(message("R_100", 1)).reason, "duplicate_tick");
  assert.equal(feed.stats().rejected, 2);
  assert.equal(feed.snapshot().length, 1);
});

test("resets counters and tick history", () => {
  const feed = createDerivResearchFeed({ symbol: "R_100", clock: () => epoch * 1000 });
  feed.ingestMessage(message("R_100", 1));
  feed.reset();
  assert.equal(feed.stats().buffered, 0);
  assert.equal(feed.stats().accepted, 0);
  assert.equal(feed.ingestMessage(message("R_100", 1)).accepted, true);
});

test("requires a valid Deriv symbol", () => {
  assert.throws(() => createDerivResearchFeed({ symbol: "" }), TypeError);
  assert.throws(() => createDerivResearchFeed({ symbol: "invalid symbol" }), TypeError);
});
