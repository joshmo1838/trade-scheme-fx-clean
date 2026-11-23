import test from "node:test";
import assert from "node:assert/strict";
import { beginSmartEntry, smartEntryStep, SMART_ENTRY_DEFAULTS, validateTick } from "../lib/market/smart-entry-paper.ts";
const tick = (n) => ({ id: "tick-" + n, epochMs: n * 1000, quote: 100 + n });
test("rejects stale, duplicate, out-of-order and future ticks", () => {
  assert.equal(validateTick(tick(1), null, 7000).ok, false);
  assert.equal(validateTick(tick(2), tick(2), 2000).ok, false);
  assert.equal(validateTick(tick(1), tick(2), 2000).ok, false);
  assert.equal(validateTick(tick(3), null, 2000).ok, false);
});
test("score below 75 never creates an observation", () => {
  const r = smartEntryStep(beginSmartEntry(1000), SMART_ENTRY_DEFAULTS, 1000, tick(1), 74);
  assert.equal(r.action, "wait");
  assert.equal(r.state.completed, 0);
});
test("ten sequential qualifying ticks max, never broker execution", () => {
  let s = beginSmartEntry(1000);
  for (let i = 1; i <= 10; i++) {
    const r = smartEntryStep(s, SMART_ENTRY_DEFAULTS, i * 1000, tick(i), 75);
    assert.equal(r.action, "observe");
    s = r.state;
  }
  assert.equal(s.completed, 10);
  assert.equal(s.exposure, 10);
  assert.equal(smartEntryStep(s, SMART_ENTRY_DEFAULTS, 11000, tick(11), 99).action, "stop");
});
test("60-second timeout never forces entry", () => {
  const r = smartEntryStep(beginSmartEntry(0), SMART_ENTRY_DEFAULTS, 60000, tick(60), 99);
  assert.equal(r.action, "stop");
  assert.equal(r.state.completed, 0);
});
test("emergency stop and exposure limit fail closed", () => {
  const s = beginSmartEntry(1000);
  assert.equal(smartEntryStep(s, SMART_ENTRY_DEFAULTS, 1000, tick(1), 99, true).action, "stop");
  assert.equal(smartEntryStep(s, { ...SMART_ENTRY_DEFAULTS, exposureCap: 0.5 }, 1000, tick(1), 99).action, "stop");
});
test("duplicate tick cannot be counted twice", () => {
  const first = smartEntryStep(beginSmartEntry(1000), SMART_ENTRY_DEFAULTS, 1000, tick(1), 90);
  const second = smartEntryStep(first.state, SMART_ENTRY_DEFAULTS, 1001, tick(1), 90);
  assert.equal(second.action, "wait");
  assert.equal(second.state.completed, 1);
});

test("minimum research threshold cannot be lowered below 75", () => {
  const result = smartEntryStep(beginSmartEntry(1000), { ...SMART_ENTRY_DEFAULTS, minimumScore: 60 }, 1000, tick(1), 99);
  assert.equal(result.action, "stop");
  assert.equal(result.state.completed, 0);
});
test("corrupted state fails closed without recording observations", () => {
  for (const changes of [{ exposure: -1 }, { completed: 11 }, { completed: NaN }, { signalStartedAtMs: NaN }]) {
    const result = smartEntryStep({ ...beginSmartEntry(1000), ...changes }, SMART_ENTRY_DEFAULTS, 1000, tick(1), 90);
    assert.equal(result.action, "stop");
  }
});
test("two distinct ticks with the same timestamp cannot be replayed", () => {
  const first = smartEntryStep(beginSmartEntry(1000), SMART_ENTRY_DEFAULTS, 1000, tick(1), 90);
  const second = smartEntryStep(first.state, SMART_ENTRY_DEFAULTS, 1001, { ...tick(1), id: "another-id" }, 90);
  assert.equal(second.action, "wait");
  assert.equal(second.state.completed, 1);
});
