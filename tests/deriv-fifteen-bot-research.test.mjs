import test from "node:test";
import assert from "node:assert/strict";
import { FIFTEEN_BOTS } from "../lib/bots/fifteen-paper-bots.ts";
import { getFifteenBotResearchMarkets, attachFifteenBotResearch } from "../lib/deriv/fifteen-bot-research.ts";

test("research markets match canonical fifteen-bot catalog exactly", () => {
  const expected = [...new Set(FIFTEEN_BOTS.map(bot => bot.market))];
  assert.equal(FIFTEEN_BOTS.length, 15);
  assert.deepEqual(getFifteenBotResearchMarkets(), expected);
});

test("attaches all fifteen canonical bot IDs and cleans up all subscriptions", () => {
  const attached = [], detached = [];
  const bridge = {
    attach({ botId, symbol, onResearch }) {
      attached.push({ botId, symbol, onResearch });
      return () => detached.push(botId);
    },
    detach() {},
  };
  const stop = attachFifteenBotResearch({ bridge, onResearchByBotId: () => () => {} });
  assert.deepEqual(attached.map(x => x.botId), FIFTEEN_BOTS.map(x => x.id));
  assert.deepEqual(attached.map(x => x.symbol), FIFTEEN_BOTS.map(x => x.market));
  stop();
  assert.equal(detached.length, 15);
});

test("partial registration failure rolls back previous subscriptions", () => {
  const detached = [];
  const bridge = {
    attach({ botId }) { return () => detached.push(botId); },
    detach() {},
  };
  assert.throws(() => attachFifteenBotResearch({
    bridge, onResearchByBotId: (id, bot) => id === FIFTEEN_BOTS[5].id ? null : () => {},
  }), /Missing research handler/);
  assert.equal(detached.length, 5);
});
