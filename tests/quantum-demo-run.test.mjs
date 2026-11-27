import assert from 'node:assert/strict';
import { test } from 'node:test';
import { STRATEGIES } from '../lib/quantum/strategy-catalog.mjs';
import { signals } from '../lib/quantum/research.ts';
import { runQuantumDemoAttempt } from '../worker/quantum-ai/demo-run.mjs';

function signalTicks(seed) {
  let value = seed;
  let price = 100;
  return Array.from({ length: 300 }, (_, index) => {
    value = (value * 48271) % 2147483647;
    price = Math.max(1, price + (value % 2000 - 1000) / 100000);
    return { symbol: 'R_100', epoch: 1_800_000_000 + index * 2, quote: price, pip_size: 2 };
  });
}

test('all 16 research-only strategies can scan but cannot request a quote or buy', async () => {
  for (const { id } of STRATEGIES) {
    const ticks = Array.from({ length: 1000 }, (_, seed) => signalTicks(seed + 1))
      .find(sample => signals(sample)[STRATEGIES.findIndex(strategy => strategy.id === id)].kind !== 'SKIP');
    assert.ok(ticks, `test sample should produce a signal for ${id}`);

    const state = { quotes: 0, buys: 0 };
    const run = { botId: id, currency: 'USD', accountType: 'demo', accountId: 'mock-demo', stake: 1, version: 1 };
    const ledger = { canQuote: async () => true };
    const broker = {
      supports: async () => true,
      quote: async () => { state.quotes++; return { ask_price: 1, payout: 2 }; },
      buy: async () => { state.buys++; return { id: 'mock-contract' }; },
    };

    const result = await runQuantumDemoAttempt({
      run, ticks, now: ticks.at(-1).epoch * 1000, ledger, broker,
      validateEntry: async () => true,
    });
    assert.equal(result, 'STRATEGY_NOT_DEMO_VALIDATED', id);
    assert.equal(state.quotes, 0, id);
    assert.equal(state.buys, 0, id);
  }
});

test('stale signals and non-Demo accounts never request a quote or buy', async () => {
  const ticks = signalTicks(23);
  const state = { quotes: 0, buys: 0 };
  const run = { botId: 'nexus-flow', currency: 'USD', accountType: 'demo', accountId: 'mock-demo', stake: 1, version: 1 };
  const ledger = { canQuote: async () => true };
  const broker = {
    supports: async () => true,
    quote: async () => { state.quotes++; return { ask_price: 1, payout: 2 }; },
    buy: async () => { state.buys++; return { id: 'mock-contract' }; },
  };
  const args = { run, ticks, ledger, broker, validateEntry: async () => true };
  const now = ticks.at(-1).epoch * 1000;
  assert.equal(await runQuantumDemoAttempt({ ...args, now: now + 16_000 }), 'NO_FRESH_SIGNAL');
  assert.equal(await runQuantumDemoAttempt({ ...args, now, run: { ...run, accountType: 'real' } }), 'DEMO_ACCOUNT_REQUIRED');
  assert.equal(state.quotes, 0);
  assert.equal(state.buys, 0);
});
