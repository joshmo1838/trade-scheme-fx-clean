import test from "node:test";
import assert from "node:assert/strict";
import { createDerivBotResearchBridge } from "../lib/deriv/bot-research-bridge.mjs";

function fakeHub() {
  const listeners = new Map([["R_100", new Set()], ["R_50", new Set()]]);
  return {
    symbols: () => [...listeners.keys()],
    subscribe(symbol, fn) {
      listeners.get(symbol).add(fn);
      return () => listeners.get(symbol).delete(fn);
    },
    emit(symbol, quote) {
      for (const fn of listeners.get(symbol)) {
        fn({ symbol, tick: { epoch: 1800000000, quote }, snapshot: [{ epoch: 1800000000, quote }] });
      }
    },
  };
}
test("distributes read-only observations to the correct existing bots", () => {
  const hub = fakeHub(), bridge = createDerivBotResearchBridge({ hub });
  const a = [], b = [];
  const remove = bridge.attach({ botId: "bot-1", symbol: "R_100", onResearch: e => a.push(e.tick.quote) });
  bridge.attach({ botId: "bot-2", symbol: "R_50", onResearch: e => b.push(e.tick.quote) });
  hub.emit("R_100", 100);
  hub.emit("R_50", 50);
  assert.deepEqual(a, [100]);
  assert.deepEqual(b, [50]);
  bridge.setEnabled("bot-1", false);
  hub.emit("R_100", 101);
  assert.deepEqual(a, [100]);
  bridge.setEnabled("bot-1", true);
  remove();
  hub.emit("R_100", 102);
  assert.deepEqual(a, [100]);
  assert.equal(bridge.stats().attached, 1);
  bridge.stop();
  assert.equal(bridge.stats().attached, 0);
});
test("enforces capacity, unique IDs and known market symbols", () => {
  const hub = fakeHub(), bridge = createDerivBotResearchBridge({ hub, maxBots: 1 });
  const entry = { botId: "bot-1", symbol: "R_100", onResearch() {} };
  bridge.attach(entry);
  assert.throws(() => bridge.attach(entry), /already attached/);
  assert.throws(() => bridge.attach({ ...entry, botId: "bot-2" }), /limit/);
  assert.throws(() => bridge.attach({ ...entry, botId: "bot-3", symbol: "R_25" }), /Unknown/);
  bridge.stop();
});
test("failing research consumers do not block other bots", () => {
  const hub = fakeHub(), bridge = createDerivBotResearchBridge({ hub });
  const seen = [];
  bridge.attach({ botId: "bad", symbol: "R_100", onResearch() { throw new Error("fail"); } });
  bridge.attach({ botId: "good", symbol: "R_100", onResearch: e => seen.push(e.tick.quote) });
  hub.emit("R_100", 10);
  assert.deepEqual(seen, [10]);
  assert.equal(bridge.stats().failures, 1);
  assert.equal(bridge.stats().delivered, 1);
});
