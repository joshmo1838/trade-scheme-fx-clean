import test from "node:test";
import assert from "node:assert/strict";
import {
  hasCurrentPaperLease,
  summarizePaperOperations,
} from "../lib/workspace/paper-operations.ts";

const now = Date.parse("2026-11-18T10:00:00.000Z");
const healthyRun = {
  desired_state: "running",
  observed_state: "running",
  workerConnected: true,
  heartbeat_at: new Date(now - 3_000).toISOString(),
  lease_expires_at: new Date(now + 9_000).toISOString(),
};

test("disabled controls never fabricate positions, workers or command counts", () => {
  const summary = summarizePaperOperations({ enabled: false }, now);
  assert.equal(summary.state, "disabled");
  assert.equal(summary.verifiedPaperWorkers, null);
  assert.equal(summary.visibleOpenPositions, null);
  assert.equal(summary.visiblePendingCommands, null);
});

test("backend lease and current heartbeat are required for any running label", () => {
  assert.equal(hasCurrentPaperLease(healthyRun, now), true);
  assert.equal(hasCurrentPaperLease({ ...healthyRun, workerConnected: false }, now), false);
  assert.equal(hasCurrentPaperLease({ ...healthyRun, heartbeat_at: new Date(now - 16_000).toISOString() }, now), false);
  assert.equal(hasCurrentPaperLease({ ...healthyRun, heartbeat_at: new Date(now + 6_000).toISOString() }, now), false);
  assert.equal(hasCurrentPaperLease({ ...healthyRun, lease_expires_at: new Date(now).toISOString() }, now), false);
  assert.equal(hasCurrentPaperLease({ ...healthyRun, lease_expires_at: "unknown" }, now), false);
});

test("running is only verified when both requested and reported state match", () => {
  const baseline = { enabled: true, mode: "paper", runs: [healthyRun], positions: [], commands: [] };
  assert.equal(summarizePaperOperations(baseline, now).state, "verified-paper-worker");
  assert.equal(summarizePaperOperations({
    ...baseline, runs: [{...healthyRun, desired_state: "stopped"}],
  }, now).state, "unverified");
  assert.equal(summarizePaperOperations({
    ...baseline, runs: [{...healthyRun, observed_state: "starting"}],
  }, now).state, "unverified");
  assert.equal(summarizePaperOperations(baseline, now + 20_000).state, "unverified");
});

test("counts only saved open positions and queued or pending commands", () => {
  const summary = summarizePaperOperations({
    enabled: true, mode: "paper", runs: [],
    commands: [{ status: "queued" }, { status: "pending" }, { status: "acknowledged" }],
    positions: [{ status: "open" }, { status: "closed" }, { status: "open" }],
  }, now);
  assert.equal(summary.state, "unverified");
  assert.equal(summary.visibleOpenPositions, 2);
  assert.equal(summary.visiblePendingCommands, 2);
  assert.equal(summary.verifiedPaperWorkers, 0);
});

test("missing account-scoped data fails closed instead of claiming zero", () => {
  assert.throws(() => summarizePaperOperations({
    enabled: true, mode: "paper", runs: [], commands: [],
  }, now), /Incomplete paper status/);
  assert.throws(() => summarizePaperOperations({
    enabled: true, mode: "real", runs: [], positions: [], commands: [],
  }, now), /Incomplete paper status/);
});
