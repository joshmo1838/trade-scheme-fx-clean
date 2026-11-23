import test from "node:test";
import assert from "node:assert/strict";
import { createResearchTickWindow } from "../lib/deriv/research-tick-window.mjs";

const now = 1_800_000_000_000;
const epoch = Math.floor(now / 1000);

test("keeps only latest 300 valid ticks", () => {
  const window = createResearchTickWindow({ clock: () => now, maxAgeMs: 1_000_000 });
  for (let i = 0; i < 320; i++) {
    assert.equal(window.ingest({ epoch, quote: i + 1 }).accepted, true);
  }
  assert.equal(window.size, 300);
  assert.equal(window.snapshot()[0].quote, 21);
  assert.equal(window.snapshot()[299].quote, 320);
});

test("rejects duplicate, stale, future and out-of-order ticks", () => {
  const window = createResearchTickWindow({ clock: () => now, maxAgeMs: 3000 });
  assert.equal(window.ingest({ epoch, quote: 1 }).accepted, true);
  assert.equal(window.ingest({ epoch, quote: 1 }).reason, "duplicate_tick");
  assert.equal(window.ingest({ epoch: epoch - 10, quote: 2 }).reason, "stale_tick");
  assert.equal(window.ingest({ epoch: epoch + 10, quote: 2 }).reason, "future_tick");
  assert.equal(window.ingest({ epoch: epoch - 1, quote: 2 }).reason, "out_of_order_tick");
  assert.equal(window.ingest({ epoch, quote: 2 }).accepted, true);
  assert.equal(window.size, 2);
});

test("rejects invalid ticks and resets without placing orders", () => {
  const window = createResearchTickWindow({ clock: () => now });
  assert.equal(window.ingest({ epoch, quote: "not-a-price" }).reason, "invalid_tick");
  assert.equal(window.ingest({ epoch, quote: 2 }).accepted, true);
  const snapshot = window.snapshot();
  snapshot.pop();
  assert.equal(window.size, 1);
  window.clear();
  assert.equal(window.size, 0);
  assert.equal(window.ingest({ epoch, quote: 2 }).accepted, true);
});

test("validates research-window configuration", () => {
  assert.throws(() => createResearchTickWindow({ capacity: 0 }), RangeError);
  assert.throws(() => createResearchTickWindow({ maxAgeMs: -1 }), RangeError);
});

test("rejects blank and missing fields without coercing them to zero", () => {
  const window = createResearchTickWindow({ clock: () => now });
  for (const tick of [
    { epoch, quote: null },
    { epoch, quote: "" },
    { epoch, quote: " " },
    { epoch, quote: false },
    { epoch: null, quote: 2 },
    { epoch: "", quote: 2 },
    { epoch: true, quote: 2 },
  ]) {
    assert.equal(window.ingest(tick).reason, "invalid_tick");
  }
  assert.equal(window.size, 0);
});

test("treats numeric-string epochs as duplicates of numeric epochs", () => {
  const window = createResearchTickWindow({ clock: () => now });
  assert.equal(window.ingest({ epoch: String(epoch), quote: 3 }).accepted, true);
  assert.equal(window.ingest({ epoch, quote: 3 }).reason, "duplicate_tick");
  assert.equal(window.size, 1);
});
