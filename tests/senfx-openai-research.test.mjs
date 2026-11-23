import test from "node:test";
import assert from "node:assert/strict";
import { FIFTEEN_BOTS } from "../lib/bots/fifteen-paper-bots.ts";
import { buildResearchSnapshot, MAX_RESEARCH_OBSERVATIONS } from "../lib/ai/senfx-openai-research.ts";

const now = Math.floor(Date.now() / 1000) * 1000;
function sample(n = 40) {
  const latest = Math.floor(now / 1000);
  return Array.from({ length: n }, (_, i) => ({
    epoch: latest - n + i + 1,
    price: 100 + i * 0.01,
    digit: i % 10,
  }));
}

test("all 15 known bots independently produce only bounded descriptive snapshots", () => {
  assert.equal(FIFTEEN_BOTS.length, 15);
  for (const bot of FIFTEEN_BOTS) {
    const result = buildResearchSnapshot(bot.id, sample(40), now);
    assert.equal(result.ok, true, bot.id);
    if (!result.ok) continue;
    assert.equal(result.snapshot.botId, bot.id);
    assert.equal(result.snapshot.market, bot.market);
    assert.equal(result.snapshot.family, bot.family);
    assert.equal(result.snapshot.sampleSize, 40);
    assert.equal(result.snapshot.digitCounts.reduce((a, b) => a + b, 0), 40);
    assert.equal("buy" in result.snapshot, false);
    assert.equal("probability" in result.snapshot, false);
  }
});
test("rejects unsupported bot and missing sample", () => {
  assert.equal(buildResearchSnapshot("invented", sample(), now).ok, false);
  assert.equal(buildResearchSnapshot(FIFTEEN_BOTS[0].id, [], now).ok, false);
});
test("rejects duplicate, reordered, stale, and future observations", () => {
  const bot = FIFTEEN_BOTS[0].id;
  const duplicate = sample(); duplicate[12].epoch = duplicate[11].epoch;
  assert.equal(buildResearchSnapshot(bot, duplicate, now).ok, false);
  const reordered = sample(); reordered[15].epoch -= 2;
  assert.equal(buildResearchSnapshot(bot, reordered, now).ok, false);
  const stale = sample().map(t => ({ ...t, epoch: t.epoch - 100 }));
  assert.equal(buildResearchSnapshot(bot, stale, now).ok, false);
  const future = sample(); future[39].epoch += 60;
  assert.equal(buildResearchSnapshot(bot, future, now).ok, false);
});
test("rejects bogus digits, prices, and oversized input", () => {
  const bot = FIFTEEN_BOTS[0].id;
  const badDigit = sample(); badDigit[4].digit = 10;
  assert.equal(buildResearchSnapshot(bot, badDigit, now).ok, false);
  const badPrice = sample(); badPrice[7].price = -1;
  assert.equal(buildResearchSnapshot(bot, badPrice, now).ok, false);
  assert.equal(buildResearchSnapshot(bot, sample(MAX_RESEARCH_OBSERVATIONS + 1), now).ok, false);
});
