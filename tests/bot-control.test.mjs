import test from "node:test";
import assert from "node:assert/strict";
import { nextBotDesiredState, describeBotControl } from "../lib/bots/control-state.ts";
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
test("migration uses ownership controls and service-only command executor", () => {
  const migration = readFileSync("supabase/senfx-persistent-bot-controls.sql", "utf8");
  assert.match(migration, /unique\s*\(customer_id,\s*bot_id,\s*mode\)/i);
  assert.match(migration, /revoke\s+all\s+on\s+function\s+public\.senfx_queue_paper_bot_command[\s\S]*?from\s+public,\s*anon,\s*authenticated/i);
  assert.match(migration, /grant\s+execute\s+on\s+function\s+public\.senfx_queue_paper_bot_command[\s\S]*?to\s+service_role/i);
  assert.match(migration, /create\s+policy[\s\S]*?customer_id\s*=\s*\(select auth\.uid\(\)\)/i);
  assert.match(migration, /unique\s*\(run_id,\s*version\)/i);
});
