import test from "node:test";
import assert from "node:assert/strict";
import { beginPaperSession, paperNextTickStep } from "../lib/market/smart-entry-next-tick.ts";
import { SMART_ENTRY_DEFAULTS } from "../lib/market/smart-entry-paper.ts";
const tick = (n, quote = 100 + n) => ({ id: "public-" + n, epochMs: n * 1000, quote });
test("paper entry settles only on the next distinct valid tick", () => {
  let s = beginPaperSession(1000);
  let r = paperNextTickStep(s, SMART_ENTRY_DEFAULTS, 1000, tick(1), 75);
  assert.equal(r.action, "observe"); s = r.session;
  assert.equal(s.observations[0].settlement, null);
  r = paperNextTickStep(s, SMART_ENTRY_DEFAULTS, 1001, tick(1), 90);
  assert.equal(r.action, "wait");
  assert.equal(r.session.observations[0].settlement, null);
  r = paperNextTickStep(s, SMART_ENTRY_DEFAULTS, 2000, tick(2), 90);
  assert.equal(r.action, "settle");
  assert.equal(r.session.observations[0].outcome, "up");
  assert.equal(r.session.gate.completed, 1);
});
test("down and flat outcomes are deterministic, not profits", () => {
  let s = beginPaperSession(1000);
  s = paperNextTickStep(s, SMART_ENTRY_DEFAULTS, 1000, tick(1, 100), 75).session;
  s = paperNextTickStep(s, SMART_ENTRY_DEFAULTS, 2000, tick(2, 99)).session;
  assert.equal(s.observations[0].outcome, "down");
  s = paperNextTickStep(s, SMART_ENTRY_DEFAULTS, 3000, tick(3, 100), 75).session;
  s = paperNextTickStep(s, SMART_ENTRY_DEFAULTS, 4000, tick(4, 100)).session;
  assert.equal(s.observations[1].outcome, "flat");
});
test("low score, stale and out-of-order ticks fail closed", () => {
  let s = beginPaperSession(1000);
  let r = paperNextTickStep(s, SMART_ENTRY_DEFAULTS, 1000, tick(1), 74);
  assert.equal(r.action, "wait"); s = r.session;
  r = paperNextTickStep(s, SMART_ENTRY_DEFAULTS, 8000, tick(2), 90);
  assert.equal(r.action, "wait");
  assert.equal(r.reason, "stale-tick");
  r = paperNextTickStep(s, SMART_ENTRY_DEFAULTS, 2000, tick(2), 90);
  assert.equal(r.action, "observe");
});
test("emergency stop prevents settlement and future entries", () => {
  const s = paperNextTickStep(beginPaperSession(1000), SMART_ENTRY_DEFAULTS, 1000, tick(1), 90).session;
  const stopped = paperNextTickStep(s, SMART_ENTRY_DEFAULTS, 2000, tick(2), 90, true);
  assert.equal(stopped.action, "stop");
  assert.equal(stopped.session.observations[0].settlement, null);
  assert.equal(paperNextTickStep(stopped.session, SMART_ENTRY_DEFAULTS, 3000, tick(3), 90).action, "stop");
});
test("invalid paper history is stopped", () => {
  const s = beginPaperSession(1000);
  assert.equal(paperNextTickStep({ ...s, observations: [{ entry: tick(1), settlement: null, outcome: null, researchScore: 99 }] }, SMART_ENTRY_DEFAULTS, 1000, tick(1), 99).action, "stop");
});

test("ten sequential observations cap the paper batch without creating an eleventh", () => {
  let session = beginPaperSession(1000);
  for (let n = 1; n <= 10; n++) {
    const entry = paperNextTickStep(session, SMART_ENTRY_DEFAULTS, (n * 2 - 1) * 1000, tick(n * 2 - 1), 75);
    assert.equal(entry.action, "observe");
    session = entry.session;
    const settle = paperNextTickStep(session, SMART_ENTRY_DEFAULTS, n * 2 * 1000, tick(n * 2), 75);
    assert.equal(settle.action, "settle");
    session = settle.session;
  }
  assert.equal(session.observations.length, 10);
  assert.equal(session.observations.filter(o => o.settlement !== null).length, 10);
  assert.equal(session.gate.exposure, 10);
  const extra = paperNextTickStep(session, SMART_ENTRY_DEFAULTS, 21000, tick(21), 99);
  assert.equal(extra.action, "stop");
  assert.equal(extra.session.observations.length, 10);
});
test("duplicate and out-of-order settlement ticks cannot settle pending observations", () => {
  let session = paperNextTickStep(beginPaperSession(1000), SMART_ENTRY_DEFAULTS, 1000, tick(1), 75).session;
  const duplicate = paperNextTickStep(session, SMART_ENTRY_DEFAULTS, 1001, tick(1), 75);
  assert.equal(duplicate.action, "wait");
  assert.equal(duplicate.session.observations[0].settlement, null);
  const older = paperNextTickStep(session, SMART_ENTRY_DEFAULTS, 1002, { id: "other", epochMs: 1000, quote: 900 }, 75);
  assert.equal(older.action, "wait");
  assert.equal(older.reason, "out-of-order-tick");
  assert.equal(older.session.observations[0].settlement, null);
});

test("corrupted settled paper history fails closed without accepting new ticks", () => {
  let session = beginPaperSession(1000);
  session = paperNextTickStep(session, SMART_ENTRY_DEFAULTS, 1000, tick(1), 75).session;
  session = paperNextTickStep(session, SMART_ENTRY_DEFAULTS, 2000, tick(2), 75).session;
  const original = session.observations[0];
  const corruptions = [
    { ...original, outcome: "down" },
    { ...original, settlement: null, outcome: "up" },
    { ...original, settlement: { ...original.settlement, epochMs: 1000 } },
    { ...original, settlement: { ...original.settlement, id: original.entry.id } },
    { ...original, entry: { ...original.entry, quote: Number.NaN } }
  ];
  for (const corrupted of corruptions) {
    const result = paperNextTickStep({ ...session, observations: [corrupted] }, SMART_ENTRY_DEFAULTS, 3000, tick(3), 90);
    assert.equal(result.action, "stop");
    assert.equal(result.reason, "invalid-paper-history");
    assert.equal(result.session.gate.stopped, true);
    assert.equal(result.session.observations.length, 1);
  }
});

test("paper ledger rejects inconsistent last-tick gate state", () => {
  let s = paperNextTickStep(beginPaperSession(1000), SMART_ENTRY_DEFAULTS, 1000, tick(1), 75).session;
  const tampered = { ...s, gate: { ...s.gate, lastTick: { ...tick(1), quote: 999 } } };
  const result = paperNextTickStep(tampered, SMART_ENTRY_DEFAULTS, 2000, tick(2), 75);
  assert.equal(result.action, "stop");
  assert.equal(result.reason, "invalid-paper-history");
});
test("newer nonqualifying tick does not invalidate settled ledger", () => {
  let s = paperNextTickStep(beginPaperSession(1000), SMART_ENTRY_DEFAULTS, 1000, tick(1), 75).session;
  s = paperNextTickStep(s, SMART_ENTRY_DEFAULTS, 2000, tick(2), 75).session;
  const rejected = paperNextTickStep(s, SMART_ENTRY_DEFAULTS, 3000, tick(3), 74);
  assert.equal(rejected.action, "wait");
  assert.equal(rejected.reason, "no-qualifying-signal");
  const next = paperNextTickStep(rejected.session, SMART_ENTRY_DEFAULTS, 4000, tick(4), 75);
  assert.equal(next.action, "observe");
  assert.equal(next.session.observations.length, 2);
});

test("invalid, future and stale settlement ticks never resolve a pending paper observation", () => {
  const pending = paperNextTickStep(beginPaperSession(1000), SMART_ENTRY_DEFAULTS, 1000, tick(1, 100), 75).session;
  const cases = [
    { now: 2000, value: { id: "bad-price", epochMs: 2000, quote: -1 }, reason: "invalid-tick" },
    { now: 2000, value: { id: "future", epochMs: 2001, quote: 101 }, reason: "invalid-tick" },
    { now: 8000, value: { id: "stale", epochMs: 2000, quote: 101 }, reason: "stale-tick" },
    { now: 2000, value: { id: "nonfinite", epochMs: 2000, quote: Number.NaN }, reason: "invalid-number" }
  ];
  for (const { now, value, reason } of cases) {
    const result = paperNextTickStep(pending, SMART_ENTRY_DEFAULTS, now, value, 99);
    assert.equal(result.action, "wait");
    assert.equal(result.reason, reason);
    assert.equal(result.session.observations[0].settlement, null);
    assert.equal(result.session.gate.completed, 1);
  }
});

test("replaying identical public ticks reproduces the same paper ledger without broker actions", () => {
  const events = [
    { now: 1000, tick: tick(1, 100), score: 75 },
    { now: 1001, tick: tick(1, 100), score: 99 },
    { now: 2000, tick: tick(2, 101), score: null },
    { now: 3000, tick: tick(3, 101), score: 74 },
    { now: 4000, tick: tick(4, 101), score: 80 },
    { now: 5000, tick: tick(5, 100), score: null },
  ];
  const replay = () => {
    let session = beginPaperSession(1000);
    const actions = [];
    for (const event of events) {
      const update = paperNextTickStep(session, SMART_ENTRY_DEFAULTS, event.now, event.tick, event.score);
      actions.push([update.action, update.reason]);
      session = update.session;
    }
    return { session, actions };
  };
  const first = replay();
  assert.deepEqual(replay(), first);
  assert.deepEqual(first.session.observations.map(o => o.outcome), ["up", "down"]);
  assert.equal(first.session.observations.length, 2);
  assert.equal(first.session.gate.completed, 2);
});


test("malformed paper ledger prices and settlement identities must fail closed", () => {
  let session = paperNextTickStep(beginPaperSession(1000), SMART_ENTRY_DEFAULTS, 1000, tick(1, 100), 75).session;
  session = paperNextTickStep(session, SMART_ENTRY_DEFAULTS, 2000, tick(2, 101), null).session;
  const original = session.observations[0];
  for (const corruption of [
    { ...original, entry: { ...original.entry, quote: 0 } },
    { ...original, entry: { ...original.entry, quote: -1 } },
    { ...original, settlement: { ...original.settlement, quote: 0 } },
    { ...original, settlement: { ...original.settlement, id: null } },
    { ...original, settlement: { ...original.settlement, id: "" } }
  ]) {
    const result = paperNextTickStep({ ...session, observations: [corruption] }, SMART_ENTRY_DEFAULTS, 3000, tick(3), 80);
    assert.equal(result.action, "stop");
    assert.equal(result.reason, "invalid-paper-history");
  }
});
