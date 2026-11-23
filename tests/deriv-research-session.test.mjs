import test from "node:test";
import assert from "node:assert/strict";
import { createDerivResearchSession } from "../lib/deriv/research-session.mjs";

const epoch = 1_800_000_000;
function fakeSocket() {
  const handlers = new Map();
  const sent = [];
  return {
    readyState: 1, sent,
    send(value) { sent.push(JSON.parse(value)); },
    addEventListener(type, fn) { handlers.set(type, fn); },
    removeEventListener(type, fn) { if (handlers.get(type) === fn) handlers.delete(type); },
    emit(data) { handlers.get("message")?.({ data: JSON.stringify(data) }); },
    get listeners() { return handlers.size; },
  };
}
function tick(quote, symbol = "R_100", id = "sub-1") {
  return { msg_type: "tick", tick: { symbol, epoch, quote, pip_size: 2 }, subscription: { id } };
}

test("starts once, ingests validated ticks, unsubscribes on stop", () => {
  const socket = fakeSocket();
  const session = createDerivResearchSession({ symbol: "R_100", transport: socket, clock: () => epoch * 1000 });
  assert.equal(session.start(), true);
  assert.equal(session.start(), false);
  assert.deepEqual(socket.sent, [{ ticks: "R_100", subscribe: 1, req_id: 1 }]);
  socket.emit(tick(10));
  socket.emit(tick(11));
  assert.equal(session.snapshot().length, 2);
  assert.equal(session.stats().subscriptionId, "sub-1");
  assert.equal(session.stop(), true);
  assert.deepEqual(socket.sent[1], { forget: "sub-1" });
  assert.equal(socket.listeners, 0);
  assert.equal(session.stop(), false);
});

test("ignores other subscription ids and rejects cross-symbol ticks", () => {
  const socket = fakeSocket();
  const session = createDerivResearchSession({ symbol: "R_100", transport: socket, clock: () => epoch * 1000 });
  session.start();
  socket.emit(tick(10));
  socket.emit(tick(12, "R_100", "another-sub"));
  socket.emit(tick(13, "R_50"));
  assert.deepEqual(session.snapshot().map(x => x.quote), [10]);
  assert.equal(session.stats().rejected, 1);
});

test("rejects malformed frames and records broker error without trading", () => {
  const socket = fakeSocket();
  const session = createDerivResearchSession({ symbol: "R_100", transport: socket, clock: () => epoch * 1000 });
  session.start();
  socket.emit({ msg_type: "error", error: { code: "InvalidSymbol" } });
  socket.emit(tick("bad"));
  assert.equal(session.stats().lastError, "InvalidSymbol");
  assert.equal(session.snapshot().length, 0);
  assert.ok(socket.sent.every(x => !("buy" in x) && !("authorize" in x)));
});

test("refuses to start on a closed transport", () => {
  const socket = fakeSocket();
  socket.readyState = 3;
  const session = createDerivResearchSession({ symbol: "R_100", transport: socket });
  assert.throws(() => session.start(), /must be open/);
});

test("connection closure deactivates the session and removes listeners", () => {
  const listeners = new Map();
  const socket = {
    readyState: 1,
    send() {},
    addEventListener(type, fn) { listeners.set(type, fn); },
    removeEventListener(type, fn) { if (listeners.get(type) === fn) listeners.delete(type); },
  };
  const session = createDerivResearchSession({ symbol: "R_100", transport: socket, clock: () => epoch * 1000 });
  session.start();
  listeners.get("close")();
  assert.equal(session.stats().active, false);
  assert.equal(session.stats().lastError, "socket_closed");
  assert.equal(listeners.size, 0);
});

test("restart clears stale research observations and counters", () => {
  const socket = fakeSocket();
  const session = createDerivResearchSession({ symbol: "R_100", transport: socket, clock: () => epoch * 1000 });
  session.start();
  socket.emit(tick(10));
  assert.equal(session.stats().buffered, 1);
  session.stop();
  session.start();
  assert.equal(session.stats().buffered, 0);
  assert.equal(session.stats().accepted, 0);
});
