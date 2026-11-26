import assert from 'node:assert/strict';
import { test } from 'node:test';
import { signals } from '../lib/quantum/research.ts';
import { mapQuantumDemoSignal } from '../lib/quantum/demo-contracts.mjs';
import { STRATEGIES } from '../lib/quantum/strategy-catalog.mjs';
import { prepareQuantumDemoCandidate } from '../worker/quantum-ai/demo-candidate.mjs';

const ticks = Array.from({ length: 300 }, (_, index) => ({
  symbol: 'R_100',
  epoch: 1_800_000_000 + index * 2,
  quote: 100 + index / 100,
  pip_size: 2,
}));
const now = ticks.at(-1).epoch * 1000;

test('worker candidates preserve each current 4.0 strategy signal', () => {
  const evaluated = signals(ticks);
  for (const [index, { id }] of STRATEGIES.entries()) {
    const signal = evaluated[index];
    const contract = mapQuantumDemoSignal(id, signal);
    assert.deepEqual(prepareQuantumDemoCandidate(id, ticks, now), contract ? {
      botId: id,
      signal,
      tickEpoch: ticks.at(-1).epoch,
      contract: { underlying_symbol: 'R_100', ...contract },
    } : null);
  }
});

test('worker rejects legacy IDs and unusable tick samples', () => {
  const candidate = (sample, time = now) => prepareQuantumDemoCandidate('nexus-flow', sample, time);
  assert.equal(prepareQuantumDemoCandidate('trend-rise-fall', ticks, now), null);
  assert.equal(candidate(ticks.slice(1)), null);
  assert.equal(candidate(ticks, now + 15_001), null);
  assert.equal(candidate(ticks, now - 1), null);
  assert.equal(candidate([ticks[1], ...ticks.slice(1)]), null);
  assert.equal(candidate([{ ...ticks[0], symbol: 'R_50' }, ...ticks.slice(1)]), null);
  assert.equal(candidate([null, ...ticks.slice(1)]), null);
});
