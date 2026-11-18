import assert from "node:assert/strict";
import { test } from "node:test";
import {
  summarizeTickSession, MAX_SESSION_TICKS, ACTIVITY_BUCKET_SECONDS,
  MAX_ACTIVITY_BUCKETS
} from "../lib/market/tick-session-analytics.ts";

test("does not fabricate analytics when no valid public ticks arrived", () => {
  assert.equal(summarizeTickSession([]), null);
  assert.equal(summarizeTickSession([{ epoch: 0, price: 10 }, { epoch: 123, price: -1 }]), null);
});

test("observed session range, change and 10-tick mean use actual quotes", () => {
  const ticks = Array.from({ length: 12 }, (_, i) =>
    ({ epoch: 2000 + i, price: i + 1 }));
  const summary = summarizeTickSession(ticks);
  assert.ok(summary);
  assert.equal(summary.samples, 12);
  assert.equal(summary.low, 1);
  assert.equal(summary.high, 12);
  assert.equal(summary.firstPrice, 1);
  assert.equal(summary.lastPrice, 12);
  assert.equal(summary.changePercent, 1100);
  assert.equal(summary.trend[8].average10, null);
  assert.equal(summary.trend[9].average10, 5.5);
  assert.equal(summary.trend[11].average10, 7.5);
});

test("time-bucket activity includes quiet intervals instead of inventing ticks", () => {
  const base = 1800;
  const summary = summarizeTickSession([
    { epoch: base + 1, price: 100 },
    { epoch: base + 2, price: 101 },
    { epoch: base + ACTIVITY_BUCKET_SECONDS * 2 + 1, price: 103 }
  ]);
  assert.ok(summary);
  assert.deepEqual(summary.activity.map(b => b.count), [2, 0, 1]);
});

test("graph limits memory and time-window size, filters invalid samples", () => {
  const many = Array.from({ length: MAX_SESSION_TICKS + 40 }, (_, i) =>
    ({ epoch: 1000 + i * 15, price: 200 + i }));
  const summary = summarizeTickSession([
    { epoch: Number.NaN, price: 99 },
    ...many,
    { epoch: 1000, price: Infinity }
  ]);
  assert.ok(summary);
  assert.equal(summary.samples, MAX_SESSION_TICKS);
  assert.ok(summary.activity.length <= MAX_ACTIVITY_BUCKETS);
  assert.equal(summary.lastPrice, 200 + MAX_SESSION_TICKS + 39);
  assert.equal(summary.firstPrice, 200 + 40);
});
