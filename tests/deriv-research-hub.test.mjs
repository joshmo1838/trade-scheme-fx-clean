import test from "node:test";
import assert from "node:assert/strict";
import { createDerivResearchHub } from "../lib/deriv/research-hub.mjs";

function sockets() {
  const opened = [];
  return {
    opened,
    connect(symbol) {
      const listeners = new Map();
      const sent = [];
      const socket = {
        symbol, sent, readyState: 1,
        addEventListener(type, fn) { listeners.set(type, fn); },
        removeEventListener(type, fn) { if (listeners.get(type) === fn) listeners.delete(type); },
        send(value) { sent.push(JSON.parse(value)); },
        close() { socket.readyState = 3; },
        emit(data) { listeners.get("message")?.({ data: JSON.stringify(data) }); },
      };
      opened.push(socket);
      return socket;
    },
  };
}
const epoch = 1_800_000_000;
const tick = (symbol, quote) => ({
  msg_type: "tick", tick: { symbol, quote, epoch, pip_size: 2 },
  subscription: { id: "subscription-" + symbol },
});

test("starts independent market subscriptions and maintains symbol isolation", () => {
  const source = sockets();
  const hub = createDerivResearchHub({
    symbols: ["R_100", "R_50"], connect: source.connect,
    clock: () => epoch * 1000,
  });
  assert.equal(hub.start(), true);
  assert.equal(hub.start(), false);
  assert.equal(source.opened.length, 2);
  assert.equal(source.opened[0].sent[0].ticks, "R_100");
  assert.equal(source.opened[1].sent[0].ticks, "R_50");
  source.opened[0].emit(tick("R_100", 100));
  source.opened[1].emit(tick("R_50", 50));
  source.opened[0].emit(tick("R_50", 99));
  assert.deepEqual(hub.snapshot("R_100").map(t => t.quote), [100]);
  assert.deepEqual(hub.snapshot("R_50").map(t => t.quote), [50]);
  assert.equal(hub.status("R_100").feed.rejected, 1);
  assert.equal(hub.stop(), true);
  assert.equal(hub.stop(), false);
});

test("validates symbols and never silently creates new feeds", () => {
  const source = sockets();
  assert.throws(() => createDerivResearchHub({ symbols: ["R_100", "R_100"], connect: source.connect }), TypeError);
  assert.throws(() => createDerivResearchHub({ symbols: [], connect: source.connect }), TypeError);
  const hub = createDerivResearchHub({ symbols: ["R_100"], connect: source.connect });
  assert.throws(() => hub.snapshot("R_50"), RangeError);
});

test("delivers accepted ticks only to symbol-matched subscribers", () => {
  const source = sockets();
  const hub = createDerivResearchHub({
    symbols: ["R_100", "R_50"], connect: source.connect, clock: () => epoch * 1000,
  });
  const first = [], second = [];
  const unsubscribe = hub.subscribe("R_100", event => first.push(event.tick.quote));
  hub.subscribe("R_50", event => second.push(event.tick.quote));
  hub.start();
  source.opened[0].emit(tick("R_100", 101));
  source.opened[1].emit(tick("R_50", 51));
  source.opened[0].emit(tick("R_100", 101));
  assert.deepEqual(first, [101]);
  assert.deepEqual(second, [51]);
  unsubscribe();
  source.opened[0].emit(tick("R_100", 102));
  assert.deepEqual(first, [101]);
  hub.stop();
});

test("one failing listener does not block another research consumer", () => {
  const source = sockets();
  const hub = createDerivResearchHub({
    symbols: ["R_100"], connect: source.connect, clock: () => epoch * 1000,
  });
  const received = [];
  hub.subscribe("R_100", () => { throw new Error("consumer failed"); });
  hub.subscribe("R_100", event => received.push(event.tick.quote));
  hub.start();
  source.opened[0].emit(tick("R_100", 42));
  assert.deepEqual(received, [42]);
  assert.equal(hub.listenerErrors, 1);
  hub.stop();
});
