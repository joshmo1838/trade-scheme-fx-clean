import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePaperSignal, paperPreset } from '../lib/bots/paper-strategy.ts';
// Include deterministic risk planning checks in the existing CI engine test job.
import './risk-command-center.test.mjs';

const synthetic = paperPreset({ name: 'SENFX Synthetic pro', market: 'Synthetic Indices' });

test('published existing paper profiles preserve markets and thresholds', () => {
  assert.deepEqual([synthetic.market, synthetic.fast, synthetic.slow, synthetic.thresholdBps], ['R_100',9,21,0.25]);
  const trend = paperPreset({ name: 'Synthetic Trend Scout', market: 'Synthetic Indices' });
  assert.deepEqual([trend.market, trend.fast, trend.slow, trend.thresholdBps], ['R_50',5,18,0.35]);
  const volatility = paperPreset({ name: 'Volatility Watch', market: 'Synthetic Indices' });
  assert.deepEqual([volatility.market, volatility.fast, volatility.slow, volatility.thresholdBps], ['R_75',10,21,0.45]);
  assert.equal(paperPreset({ name: 'Any forex learning bot', market: 'Forex' }).market, 'frxEURUSD');
});

test('insufficient or flat prices never produce a signal', () => {
  assert.equal(evaluatePaperSignal([], synthetic), null);
  assert.equal(evaluatePaperSignal(Array(20).fill(100), synthetic), null);
  assert.equal(evaluatePaperSignal(Array(21).fill(100), synthetic), null);
});

test('rising and falling ticks produce deterministic paper directions', () => {
  assert.equal(evaluatePaperSignal(Array.from({length: 21}, (_, i) => 100 + i), synthetic), 'CALL');
  assert.equal(evaluatePaperSignal(Array.from({length: 21}, (_, i) => 121 - i), synthetic), 'PUT');
});

test('invalid prices fail closed, including stale invalid ticks in the active window', () => {
  for (const value of [Number.NaN, Number.POSITIVE_INFINITY, -1, 0]) {
    const prices = Array.from({length:21}, (_, i) => 100 + i);
    prices[12] = value;
    assert.equal(evaluatePaperSignal(prices, synthetic), null);
  }
  assert.equal(evaluatePaperSignal([...Array(10).fill(-5), ...Array.from({length:21}, (_, i) => 100 + i)], synthetic), 'CALL');
});

test('bad strategy configuration cannot generate paper signals', () => {
  const prices = Array.from({length:21}, (_, i) => 100 + i);
  for (const change of [{fast:0}, {fast:21}, {slow:0}, {slow:2000}, {fast:2.5}, {thresholdBps:-1}, {thresholdBps:0}, {thresholdBps:Number.NaN}]) {
    assert.equal(evaluatePaperSignal(prices, {...synthetic,...change}), null);
  }
  assert.equal(evaluatePaperSignal(prices, {...synthetic,thresholdBps:9999}), null);
});

test('only latest slow ticks contribute to next signal', () => {
  const active = Array.from({length:21}, (_, i) => 100 + i);
  assert.equal(evaluatePaperSignal([...Array(100).fill(0), ...active], synthetic), 'CALL');
});
