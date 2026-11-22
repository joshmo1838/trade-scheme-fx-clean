import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../worker/senfx-forward-worker.mjs", import.meta.url), "utf8");
const stopFunction = source.match(/function stopCompletedStudy\(\) \{[\s\S]*?\n\}/)?.[0];

test("completed paper worker clears its feed and every repeating timer only once", () => {
  assert.ok(stopFunction, "terminal cleanup function must exist");
  const clearedIntervals = [];
  const clearedTimeouts = [];
  let closed = 0;
  const sandbox = {
    stopped: false,
    heartbeatTimer: "heartbeat",
    diagnosticsTimer: "diagnostics",
    derivPingTimer: "keepalive",
    reconnectTimer: "reconnect",
    connectionStableTimer: "stable",
    socket: { close() { closed += 1; } },
    clearInterval(value) { clearedIntervals.push(value); },
    clearTimeout(value) { clearedTimeouts.push(value); },
    console: { log() {} }
  };
  vm.runInNewContext(stopFunction + "\nstopCompletedStudy(); stopCompletedStudy();", sandbox);
  assert.equal(sandbox.stopped, true);
  assert.deepEqual(clearedIntervals.sort(), ["diagnostics", "heartbeat", "keepalive"]);
  assert.deepEqual(clearedTimeouts.sort(), ["reconnect", "stable"]);
  assert.equal(closed, 1, "the socket must not be repeatedly closed");
});

test("completion cleanup runs only after final trade and state are persisted", () => {
  const persist = source.indexOf("await persistTrade(trade).then(() => saveState()).then(() => {");
  const completion = source.indexOf("stopCompletedStudy();", persist);
  assert.ok(persist >= 0, "trade and state must persist before stop");
  assert.ok(completion > persist, "terminal cleanup must follow both writes");
  assert.ok(source.slice(persist, completion).includes("state.completedTrades >= TARGET_TRADES"));
  assert.doesNotMatch(stopFunction, /buy\s*\(|proposal\s*\(|\/ws\/real/);
});
