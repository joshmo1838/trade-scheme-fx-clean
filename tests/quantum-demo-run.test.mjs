import assert from 'node:assert/strict';
import { test } from 'node:test';
import { STRATEGIES } from '../lib/quantum/strategy-catalog.mjs';
import { runQuantumDemoAttempt } from '../worker/quantum-ai/demo-run.mjs';

const ticks = Array.from({ length: 300 }, (_, index) => ({
  symbol: 'R_100', epoch: 1_800_000_000 + index * 2, quote: 100 + index / 100, pip_size: 2,
}));
const now = ticks.at(-1).epoch * 1000;

function fixture(botId = 'nexus-flow') {
  const state = { buys: 0, armed: false, active: true, supported: true, timeout: false, pnl: 0 };
  const run = { botId, currency: 'USD', accountType: 'demo', accountId: 'mock-demo', stake: 1, version: 1 };
  const ledger = {
    canQuote: async session => state.active && !state.armed && session.accountId === 'mock-demo',
    arm: async ({ run: session, candidate, quote }) => {
      if (!state.active || state.armed || state.pnl < 0 || session.version !== 1 ||
          quote.accountId !== session.accountId || candidate.botId !== session.botId ||
          quote.stake !== session.stake) return null;
      state.armed = true;
      return { id: 'mock-attempt' };
    },
    reconcile: async (_attempt, receipt) => receipt?.id === 'mock-contract',
  };
  const broker = {
    supports: async () => state.supported,
    quote: async (accountId, contract, stake) => ({ accountId, contract, stake }),
    buy: async () => {
      state.buys++;
      if (state.timeout) throw new Error('Unknown buy outcome');
      return { id: 'mock-contract' };
    },
  };
  return { state, args: { run, ticks, now, ledger, broker, validateEntry: async () => true } };
}

test('the worker evaluates every current bot and buys only for an eligible signal', async () => {
  for (const { id } of STRATEGIES) {
    const { state, args } = fixture(id);
    const result = await runQuantumDemoAttempt(args);
    assert.ok(['NO_FRESH_SIGNAL', 'SETTLED'].includes(result), id);
    assert.equal(state.buys, result === 'SETTLED' ? 1 : 0, id);
  }
});

test('stale ticks, real accounts, mismatches and unsupported contracts never buy', async () => {
  const { state, args } = fixture();
  assert.equal(await runQuantumDemoAttempt({ ...args, now: now + 16_000 }), 'NO_FRESH_SIGNAL');
  assert.equal(await runQuantumDemoAttempt({ ...args, run: { ...args.run, accountType: 'real' } }), 'DEMO_ACCOUNT_REQUIRED');
  state.supported = false;
  assert.equal(await runQuantumDemoAttempt(args), 'CONTRACT_UNAVAILABLE');
  state.supported = true;
  args.broker.quote = async () => ({ accountId: 'different-demo', stake: 1 });
  assert.equal(await runQuantumDemoAttempt(args), 'RESERVATION_REJECTED');
  assert.equal(state.buys, 0);
});

test('entry rejection, stop or a reached loss limit before arming prevent buys', async () => {
  const { state, args } = fixture();
  assert.equal(await runQuantumDemoAttempt({ ...args, validateEntry: async () => false }), 'ENTRY_REJECTED');
  state.pnl = -1;
  assert.equal(await runQuantumDemoAttempt(args), 'RESERVATION_REJECTED');
  state.pnl = 0;
  args.validateEntry = async () => { state.active = false; return true; };
  assert.equal(await runQuantumDemoAttempt(args), 'RESERVATION_REJECTED');
  assert.equal(state.buys, 0);
});

test('concurrent attempts and a new worker cannot retry an unknown buy', async () => {
  const { state, args } = fixture();
  state.timeout = true;
  const results = await Promise.all([runQuantumDemoAttempt(args), runQuantumDemoAttempt(args)]);
  assert.deepEqual(results.sort(), ['RECONCILIATION_REQUIRED', 'RESERVATION_REJECTED']);
  assert.equal(await runQuantumDemoAttempt({ ...args }), 'RUN_NOT_ACTIVE');
  assert.equal(state.buys, 1);
});
