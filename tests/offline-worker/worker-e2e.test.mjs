import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

test("offline full worker: START → simulated position → settlement → PAUSE → RESUME → STOP", { timeout: 15_000 }, async () => {
  const child = spawn(process.execPath, [
    "--experimental-strip-types",
    "--import", "./tests/offline-worker/register-mock.mjs",
    "--import", "./tests/offline-worker/mock-public-websocket.mjs",
    "worker/senfx-customer-paper-worker.mjs",
  ], {
    cwd: process.cwd(),
    env: {
      PATH: process.env.PATH || "",
      HOME: process.env.HOME || "",
      SENFX_QA_OFFLINE: "yes",
      SENFX_PAPER_WORKER_ENABLED: "true",
      SUPABASE_URL: "https://qa-offline.invalid",
      SUPABASE_SERVICE_ROLE_KEY: "OFFLINE-TEST-ONLY",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "", stderr = "", completed = false;
  let timer;
  const exitResult = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      if (completed) return;
      child.kill("SIGTERM");
      reject(new Error("Offline worker test timed out. Output: " + stdout + stderr));
    }, 11_000);
    child.stdout.on("data", chunk => {
      stdout += chunk.toString();
      if (!completed && stdout.includes("SENFX_QA:STOP_ACK")) {
        completed = true;
        child.kill("SIGTERM");
      }
    });
    child.stderr.on("data", chunk => { stderr += chunk.toString(); });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      if (completed && (signal === "SIGTERM" || code === 0)) resolve();
      else reject(new Error("Worker quit before Stop acknowledgment. " + JSON.stringify({code,signal,stdout,stderr})));
    });
  });
  try {
    await exitResult;
    const events = [...stdout.matchAll(/SENFX_QA:([A-Z_]+)/g)].map(m => m[1]);
    const expected = [
      "MOCK_DATABASE_CONNECTED", "START_ACK", "PAPER_RESERVE",
      "PAPER_SETTLED", "PAUSE_REQUEST", "PAUSE_ACK",
      "RESUME_REQUEST", "RESUME_ACK", "STOP_REQUEST", "STOP_ACK",
    ];
    let previous = -1;
    for (const item of expected) {
      const at = events.indexOf(item);
      assert.ok(at > previous, "Missing/out-of-order " + item + "; events: " + events.join(","));
      previous = at;
    }
    assert.equal(events.filter(x => x === "PAPER_RESERVE").length, 1);
    assert.equal(events.filter(x => x === "PAPER_SETTLED").length, 1);
    assert.doesNotMatch(stderr, /unexpected.*broker|network is forbidden|uncaught exception/i);
  } finally {
    clearTimeout(timer);
    if (child.exitCode === null && !child.killed) child.kill("SIGTERM");
  }
});
