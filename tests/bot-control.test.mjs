import test from "node:test";
import assert from "node:assert/strict";
import { nextBotDesiredState, describeBotControl, paperBotDisplayStatus, paperWorkerHasCurrentLease } from "../lib/bots/control-state.ts";
import { readFileSync } from "node:fs";

test("start only from stopped", () => {
  assert.equal(nextBotDesiredState("stopped", "start"), "running");
  assert.equal(nextBotDesiredState("running", "start"), null);
  assert.equal(nextBotDesiredState("paused", "start"), null);
});
test("pause and resume require correct current state", () => {
  assert.equal(nextBotDesiredState("running", "pause"), "paused");
  assert.equal(nextBotDesiredState("paused", "pause"), null);
  assert.equal(nextBotDesiredState("paused", "resume"), "running");
  assert.equal(nextBotDesiredState("stopped", "resume"), null);
});
test("stop is always allowed and supersedes queued starts", () => {
  for (const state of ["stopped", "paused", "running"]) {
    assert.equal(nextBotDesiredState(state, "stop"), "stopped");
  }
});
test("unrecognized actions and modes always fail closed", () => {
  for (const action of ["buy", "sell", "real", "execute", "", null, 3]) {
    assert.equal(nextBotDesiredState("running", action), null);
  }
  for (const state of ["queued", "real", "demo", undefined]) {
    assert.equal(nextBotDesiredState(state, "stop"), null);
  }
});
test("UI never labels queued state as executing", () => {
  assert.match(describeBotControl("running", "stopped"), /Requested running/);
  assert.match(describeBotControl("running", null), /Not connected/);
  assert.equal(describeBotControl("running", "running"), "Worker running paper simulation");
});

test("customer status never presents queued or expired paper sessions as running", () => {
  const now=Date.parse("2026-11-18T12:00:00.000Z");
  const base={
    desired_state:"running",observed_state:"running",workerConnected:true,
    heartbeat_at:new Date(now-3_000).toISOString(),
    lease_expires_at:new Date(now+12_000).toISOString(),
  };
  assert.equal(paperWorkerHasCurrentLease(base,now),true);
  assert.equal(paperBotDisplayStatus(base,now).verifiedRunning,true);
  assert.equal(paperBotDisplayStatus(base,now).label,"RUNNING · PAPER ONLY");
  assert.equal(paperBotDisplayStatus({...base,observed_state:"stopped"},now).label,"START QUEUED");
  assert.equal(paperBotDisplayStatus({...base,observed_state:"starting"},now).verifiedRunning,false);
  assert.equal(paperBotDisplayStatus({...base,observed_state:"error"},now).verifiedRunning,false);
  assert.equal(paperBotDisplayStatus({...base,workerConnected:false},now).label,"OFFLINE / UNVERIFIED");
  assert.equal(paperBotDisplayStatus({...base,heartbeat_at:new Date(now-20_000).toISOString()},now).verifiedRunning,false);
  assert.equal(paperBotDisplayStatus({...base,lease_expires_at:new Date(now-1).toISOString()},now).verifiedRunning,false);
  assert.equal(paperBotDisplayStatus({...base,heartbeat_at:new Date(now+20_000).toISOString()},now).verifiedRunning,false);
  assert.equal(paperBotDisplayStatus({...base,desired_state:"paused",observed_state:"running"},now).label,"PAUSE REQUESTED");
  assert.equal(paperBotDisplayStatus({...base,desired_state:"paused",observed_state:"paused"},now).label,"PAUSED");
  assert.equal(paperBotDisplayStatus({...base,desired_state:"stopped",observed_state:"running"},now).label,"STOP REQUESTED");
  assert.equal(paperBotDisplayStatus({...base,desired_state:"stopped",observed_state:"stopped"},now).label,"STOPPED");
  assert.equal(paperBotDisplayStatus(null,now).label,"NOT STARTED");
});

test("migration uses ownership controls and service-only command executor", () => {
  const migration = readFileSync("supabase/senfx-persistent-bot-controls.sql", "utf8");
  assert.match(migration, /unique\s*\(customer_id,\s*bot_id,\s*mode\)/i);
  assert.match(migration, /revoke\s+all\s+on\s+function\s+public\.senfx_queue_paper_bot_command[\s\S]*?from\s+public,\s*anon,\s*authenticated/i);
  assert.match(migration, /grant\s+execute\s+on\s+function\s+public\.senfx_queue_paper_bot_command[\s\S]*?to\s+service_role/i);
  assert.match(migration, /create\s+policy[\s\S]*?customer_id\s*=\s*\(select auth\.uid\(\)\)/i);
  assert.match(migration, /unique\s*\(run_id,\s*version\)/i);
});
