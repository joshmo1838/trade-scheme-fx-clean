import { mapQuantumDemoSignal } from '../../lib/quantum/demo-contracts.mjs';
import { signals } from '../../lib/quantum/research.ts';
import { STRATEGIES } from '../../lib/quantum/strategy-catalog.mjs';

const market = 'R_100';
const sampleSize = 300;
const maximumTickAgeMs = 15_000;

export function prepareQuantumDemoCandidate(botId, ticks, now = Date.now()) {
  const strategyIndex = STRATEGIES.findIndex(strategy => strategy.id === botId);
  if (strategyIndex === -1 || !Array.isArray(ticks) || ticks.length < sampleSize || !Number.isFinite(now)) {
    return null;
  }

  const sample = ticks.slice(-sampleSize);
  if (sample.some(tick => tick?.symbol !== market)) return null;

  const lastTick = sample.at(-1);
  const age = now - lastTick.epoch * 1000;
  if (!Number.isFinite(age) || age < 0 || age > maximumTickAgeMs) return null;

  const signal = signals(sample)[strategyIndex];
  const contract = mapQuantumDemoSignal(botId, signal);
  if (!contract) return null;

  return {
    botId,
    signal,
    tickEpoch: lastTick.epoch,
    contract: { underlying_symbol: market, ...contract },
  };
}
