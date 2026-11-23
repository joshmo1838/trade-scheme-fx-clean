import test from "node:test";
import assert from "node:assert/strict";
import { createDerivResearchHub } from "../lib/deriv/research-hub.mjs";
import { createDerivBotResearchBridge } from "../lib/deriv/bot-research-bridge.mjs";
import { getFifteenBotResearchMarkets, attachFifteenBotResearch } from "../lib/deriv/fifteen-bot-research.ts";
import { FIFTEEN_BOTS } from "../lib/bots/fifteen-paper-bots.ts";

const epoch = 1_800_000_000;
function transportFactory() {
  const sockets = new Map();
  return {
    sockets,
    connect(symbol) {
      const listeners = new Map();
      const sent = [];
      const socket = {
        readyState: 1, sent,
        addEventListener(type, listener) { listeners.set(type, listener); },
        removeEventListener(type, listener) { if (listeners.get(type) === listener) listeners.delete(type); },
        send(payload) { sent.push(JSON.parse(payload)); },
        close() { socket.readyState = 3; },
        tick(quote, market = symbol) {
          listeners.get("message")?.({ data: JSON.stringify({
            msg_type: "tick", tick: { symbol: market, quote, epoch, pip_size: 2 },
            subscription: { id: "research-" + symbol },
          }) });
        },
      };
      sockets.set(symbol, socket);
      return socket;
    },
  };
}

test("all fifteen canonical bots receive only validated market observations", () => {
  const transport = transportFactory();
  const hub = createDerivResearchHub({
    symbols: getFifteenBotResearchMarkets(),
    connect: transport.connect,
    clock: () => epoch * 1000,
  });
  const bridge = createDerivBotResearchBridge({ hub, maxBots: 15 });
  const received = new Map();
  const detach = attachFifteenBotResearch({
    bridge,
    onResearchByBotId: botId => event => {
      const observations = received.get(botId) ?? [];
      observations.push(event);
      received.set(botId, observations);
    },
  });
  assert.equal(bridge.stats().attached, 15);
  hub.start();
  for (const symbol of hub.symbols()) {
    assert.deepEqual(transport.sockets.get(symbol).sent[0].ticks, symbol);
    transport.sockets.get(symbol).tick(100);
  }
  assert.equal([...received.values()].reduce((sum, events) => sum + events.length, 0), 15);
  for (const bot of FIFTEEN_BOTS) {
    assert.equal(received.get(bot.id).length, 1);
    assert.equal(received.get(bot.id)[0].symbol, bot.market);
  }
  const firstSymbol = hub.symbols()[0];
  transport.sockets.get(firstSymbol).tick(99, "INVALID_SYMBOL");
  assert.equal(bridge.stats().delivered, 15);
  assert.equal(hub.status(firstSymbol).feed.rejected, 1);
  detach();
  assert.equal(bridge.stats().attached, 0);
  hub.stop();
  assert.ok([...transport.sockets.values()].every(socket => socket.readyState === 3));
  assert.ok([...transport.sockets.values()].every(socket => socket.sent.every(msg => !("buy" in msg) && !("authorize" in msg))));
});
