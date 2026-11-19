import test from "node:test";
import assert from "node:assert/strict";
import { summarizeForwardTrades } from "../lib/forward/metrics.ts";

const t = (epoch, outcome) => ({
  signal_epoch: epoch, outcome, direction: "CALL",
  pnl_r: outcome === "WIN" ? 1 : -1,
  closed_at: new Date(epoch * 1_000).toISOString(),
});

test("forward research dashboard uses only recorded win/loss direction scores", () => {
  const r = summarizeForwardTrades([
    t(1700000000, "WIN"), t(1700000001, "LOSS"),
    t(1700000002, "LOSS"), t(1700000003, "WIN"),
    t(1700000004, "LOSS"),
  ]);
  assert.equal(r.count, 5);
  assert.equal(r.wins, 2);
  assert.equal(r.losses, 3);
  assert.equal(r.hitRate, 40);
  assert.equal(r.netScoreR, -1);
  assert.equal(r.maxDrawdownR, 2);
  assert.equal(r.longestLossStreak, 2);
  assert.deepEqual(r.curve.map(p => p.scoreR), [0, 1, 0, -1, 0, -1]);
});
test("empty forward test must not invent a percentage or return", () => {
  const r = summarizeForwardTrades([]);
  assert.equal(r.hitRate, null);
  assert.equal(r.count, 0);
  assert.equal(r.netScoreR, 0);
});
test("reject duplicate epochs and mismatched broker-like profitability claims", () => {
  assert.throws(() => summarizeForwardTrades([t(1700000000, "WIN"), t(1700000000, "WIN")]));
  assert.throws(() => summarizeForwardTrades([{ ...t(1700000000, "LOSS"), pnl_r: 1 }]));
  assert.throws(() => summarizeForwardTrades([{ ...t(1700000000, "WIN"), pnl_r: 200 }]));
  assert.throws(() => summarizeForwardTrades([{ ...t(1700000000, "WIN"), direction: "BUY" }]));
});
