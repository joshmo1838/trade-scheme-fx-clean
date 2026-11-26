import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {STRATEGIES} from '../lib/quantum/strategy-catalog.mjs';
import {createLive4BotDistributor, evaluateOriginal4Signals} from '../worker/quantum-ai/live-4bot-feed.mjs';

const BASE = 2000000000;
const makeTick = (i, symbol = 'R_100') => ({
  symbol, epoch: BASE + i, quote: 100 + i * .02, pip_size: 2
});

test('the exact original 16 4.0 strategies are preserved byte-for-byte', () => {
  const source = readFileSync(new URL('../lib/quantum/strategy-catalog.mjs', import.meta.url));
  const blob = createHash('sha1')
    .update('blob ' + source.length + String.fromCharCode(0))
    .update(source).digest('hex');
  assert.equal(blob, 'f030c5182318ef075884ec088e99d052c5684158');
  assert.equal(STRATEGIES.length, 16);
  assert.equal(new Set(STRATEGIES.map(strategy => strategy.id)).size, 16);
  assert.equal(STRATEGIES[0].id, 'nexus-flow');
  assert.match(STRATEGIES[0].rule, /300 valid ticks.*EMA\(10\).*EMA\(30\)/);
  assert(STRATEGIES.every(strategy => !strategy.executionEnabled && strategy.mode === 'RESEARCH'));
});

test('all 16 independent bot records consume every accepted tick, not just a 30-second snapshot', () => {
  const feed = createLive4BotDistributor();
  const sample = [];
  for (let i = 0; i < 300; i++) {
    sample.push(makeTick(i));
    assert.equal(feed.onTick('R_100', sample, (BASE + i) * 1000), true);
  }
  const bots = feed.snapshot('R_100', (BASE + 299) * 1000);
  assert.equal(bots.length, 16);
  assert.equal(new Set(bots.map(bot => bot.botId)).size, 16);
  assert(bots.every(bot => bot.processedTicks === 300 && bot.sampleSize === 300));
  assert(bots.every(bot => bot.lastTickEpoch === BASE + 299 && bot.lastProcessedAt === (BASE + 299) * 1000));
  assert(bots.every(bot => bot.ready && bot.feedFresh));
  assert.equal(bots.find(bot => bot.botId === 'nexus-flow').signal.kind, 'RISE');
  assert.equal(bots.find(bot => bot.botId === 'vertex-digits').signal.kind, 'DIFFER');
  assert.equal(bots.find(bot => bot.botId === 'cadence-sequence').signal.kind, 'MATCH');
  assert(bots.every(bot => bot.decision === 'SKIP' && !bot.executionAuthorized));
  assert.equal(feed.onTick('R_100', sample, (BASE + 299) * 1000), false);
  assert(feed.snapshot('R_100', (BASE + 299) * 1000).every(bot => bot.processedTicks === 300));
});

test('invalid or insufficient samples cannot create executable signals', () => {
  const feed = createLive4BotDistributor();
  assert.equal(feed.onTick('R_10', [makeTick(0, 'R_10')], BASE * 1000), true);
  const sample = feed.snapshot('R_10', BASE * 1000);
  assert.equal(sample.length, 16);
  assert(sample.every(bot => bot.processedTicks === 1 && !bot.ready && bot.signal.kind === 'SKIP'));
  assert.equal(feed.onTick('R_10', [makeTick(1, 'R_10')], (BASE + 200) * 1000), false);
  assert.equal(feed.onTick('R_10', [{epoch: BASE + 2, quote: -1, pip_size: 2}], (BASE + 2) * 1000), false);
  assert.equal(feed.snapshot('R_10', BASE * 1000)[0].processedTicks, 1);
  assert(evaluateOriginal4Signals(Array.from({length: 299}, (_, i) => makeTick(i))).every(s => s.kind === 'SKIP'));
});

test('stale markets report stale signal for every bot without losing historical counters', () => {
  const feed = createLive4BotDistributor();
  for (let i = 0; i < 300; i++) feed.onTick('R_75', Array.from({length: i + 1}, (_, j) => makeTick(j, 'R_75')), (BASE + i) * 1000);
  const old = feed.snapshot('R_75', (BASE + 299) * 1000 + 16000);
  assert.equal(old.length, 16);
  assert(old.every(bot => bot.processedTicks === 300 && !bot.ready && !bot.feedFresh));
  assert(old.every(bot => bot.signal.kind === 'SKIP' && bot.decision === 'SKIP' && !bot.executionAuthorized));
});

test('worker persists the live bot snapshots without any broker purchase logic', () => {
  const worker = readFileSync(new URL('../worker/quantum-ai/run.mjs', import.meta.url), 'utf8');
  const signals = readFileSync(new URL('../worker/quantum-ai/live-4bot-feed.mjs', import.meta.url), 'utf8');
  const docker = readFileSync(new URL('../Dockerfile.quantum-ai', import.meta.url), 'utf8');
  assert.match(worker, /liveBotFeed\.onTick\(t\.symbol,s\.ai\.ticks,Date\.now\(\)\)/);
  assert.match(worker, /bots:liveBotFeed\.snapshot\(symbol,Date\.now\(\)\)/);
  assert.match(docker, /COPY lib\/quantum\/strategy-catalog\.mjs/);
  assert.match(docker, /node --test tests\/live-4bot-feed\.test\.mjs/);
  assert.doesNotMatch(signals + worker, /proposal_buy|\/api\/deriv\/demo\/bots\/control|buyContract|purchaseContract/);
});
