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
