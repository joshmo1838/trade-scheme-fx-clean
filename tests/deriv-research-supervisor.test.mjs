import test from "node:test";
import assert from "node:assert/strict";
import { createDerivResearchSupervisor } from "../lib/deriv/research-supervisor.mjs";

function socketFactory() {
  const sockets = [];
  function connect() {
    const handlers = new Map(), sent = [];
    const socket = {
      readyState: 0, sent,
      addEventListener(type, fn) { handlers.set(type, fn); },
      removeEventListener(type, fn) { if (handlers.get(type) === fn) handlers.delete(type); },
      send(json) { sent.push(JSON.parse(json)); },
      close() { socket.readyState = 3; },
      emit(type) { handlers.get(type)?.(); },
    };
    sockets.push(socket);
    return socket;
  }
  return { connect, sockets };
}

test("opens a research subscription and reconnects with a new one after closure", () => {
  const { connect, sockets } = socketFactory();
  let pending;
  const delays = [];
  const supervisor = createDerivResearchSupervisor({
    symbol: "R_100", connect,
    schedule(fn, delay) { pending = fn; delays.push(delay); return 1; },
    cancel() { pending = null; },
  });
  assert.equal(supervisor.start(), true);
  assert.equal(supervisor.start(), false);
  sockets[0].readyState = 1;
  sockets[0].emit("open");
  assert.deepEqual(sockets[0].sent[0], { ticks: "R_100", subscribe: 1, req_id: 1 });
  assert.equal(supervisor.stats().state, "streaming");
  sockets[0].readyState = 3;
  sockets[0].emit("close");
  assert.equal(supervisor.stats().state, "reconnecting");
  assert.deepEqual(delays, [1000]);
  pending();
  sockets[1].readyState = 1;
  sockets[1].emit("open");
  assert.deepEqual(sockets[1].sent[0], { ticks: "R_100", subscribe: 1, req_id: 1 });
  assert.equal(supervisor.stats().state, "streaming");
  assert.equal(supervisor.stats().generation, 2);
  assert.equal(supervisor.stop(), true);
  assert.equal(supervisor.stats().state, "stopped");
});

test("stop cancels scheduled retry and prevents reconnect", () => {
  const { connect, sockets } = socketFactory();
  let pending = null, cancelled = false;
  const supervisor = createDerivResearchSupervisor({
    symbol: "R_100", connect,
    schedule(fn) { pending = fn; return 7; },
    cancel(id) { assert.equal(id, 7); cancelled = true; },
  });
  supervisor.start();
  sockets[0].emit("error");
  assert.equal(supervisor.stats().state, "reconnecting");
  supervisor.stop();
  assert.equal(cancelled, true);
  pending();
  assert.equal(sockets.length, 1);
});

test("invalid factory and retry configuration are rejected", () => {
  assert.throws(() => createDerivResearchSupervisor({ symbol: "R_100" }), TypeError);
  assert.throws(() => createDerivResearchSupervisor({ symbol: "R_100", connect: () => null, baseDelayMs: 0 }), RangeError);
});
