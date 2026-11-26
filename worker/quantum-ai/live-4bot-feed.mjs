// Read-only 4.0 signal evaluator. Formulas and order mirror lib/quantum/research.ts.
// DO NOT change the strategy catalog, thresholds, contract family, or recovery logic.
import {STRATEGIES} from '../../lib/quantum/strategy-catalog.mjs';

const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const standardDeviation = values => {
  const average = mean(values);
  return Math.sqrt(mean(values.map(value => (value - average) ** 2)));
};
const ema = (values, period) => {
  if (!values.length || period < 1) return 0;
  const weight = 2 / (period + 1);
  return values.slice(1).reduce((accumulator, value) => value * weight + accumulator * (1 - weight), values[0]);
};
const lastDigit = tick => Number(tick.quote.toFixed(tick.pip_size).slice(-1));
const direction = value => value > 0 ? 'RISE' : value < 0 ? 'FALL' : 'SKIP';
const noSignals = () => STRATEGIES.map(strategy => ({bot: strategy.name, kind: 'SKIP'}));

export function evaluateOriginal4Signals(rawTicks) {
  if (!Array.isArray(rawTicks) || rawTicks.length < 300) return noSignals();
  const ticks = rawTicks.slice(-300);
  if (ticks.some((tick, index) =>
    !Number.isFinite(tick.quote) || tick.quote <= 0 ||
    tick.symbol !== ticks[0].symbol ||
    tick.pip_size !== ticks[0].pip_size ||
    (index > 0 && tick.epoch <= ticks[index - 1].epoch)
  )) return noSignals();
  if (ticks.some(tick =>
    !Number.isSafeInteger(tick.epoch) || tick.epoch <= 0 ||
    !Number.isInteger(tick.pip_size) || tick.pip_size < 0 || tick.pip_size > 12
  )) return noSignals();

  const prices = ticks.map(tick => tick.quote);
  const digits = ticks.map(lastDigit);
  const n = prices.length;
  const latestPrice = prices[n - 1];
  const returns = prices.slice(1).map((price, index) => Math.log(price / prices[index]));
  const volatility = standardDeviation(returns.slice(-60));
  const fast = ema(prices, 10);
  const slow = ema(prices, 30);
  const trend = fast - slow;
  const momentum = latestPrice - prices[n - 6];
  const average = mean(prices.slice(-30));
  const z = (latestPrice - average) / (standardDeviation(prices.slice(-30)) || 1);
  const highest = Math.max(...prices.slice(-31, -1));
  const lowest = Math.min(...prices.slice(-31, -1));
  const acceleration = momentum - (prices[n - 6] - prices[n - 11]);

  const counts = Array(10).fill(0);
  digits.forEach(digit => counts[digit]++);
  const parity = digits.filter(digit => digit % 2 === 0).length;
  const last = digits[n - 1];
  const transitions = Array(10).fill(0);
  for (let i = 1; i < n; i++) if (digits[i - 1] === last) transitions[digits[i]]++;

  const vote = direction(trend) === direction(momentum) ? direction(trend) : 'SKIP';
  const kinds = [
    direction(trend),
    direction(momentum),
    vote,
    Math.abs(z) > 1.5 ? direction(-z) : 'SKIP',
    latestPrice > highest ? 'RISE' : latestPrice < lowest ? 'FALL' : 'SKIP',
    Math.abs(trend) / latestPrice > volatility ? direction(trend) : 'SKIP',
    'DIFFER',
    vote,
    volatility > 0 && Math.abs(mean(returns.slice(-20))) / volatility > .2 ? direction(momentum) : 'SKIP',
    Math.abs(z) > 2 && direction(acceleration) === direction(-z) ? direction(acceleration) : 'SKIP',
    parity === 150 ? 'SKIP' : parity > 150 ? 'EVEN' : 'ODD',
    Math.abs(trend) / latestPrice < volatility && Math.abs(z) > 1 ? direction(-z) : 'SKIP',
    vote,
    direction(acceleration),
    'MATCH',
    vote === direction(acceleration) ? vote : 'SKIP'
  ];
  return STRATEGIES.map((strategy, index) => ({
    bot: strategy.name,
    kind: kinds[index],
    ...(index === 6 ? {barrier: counts.indexOf(Math.min(...counts))} :
       index === 14 ? {barrier: transitions.indexOf(Math.max(...transitions))} : {})
  }));
}

// Every accepted public-market tick is processed for every one of the 16 independent
// research strategies. No broker action, order, permission or real-money execution exists.
export function createLive4BotDistributor() {
  const bySymbol = new Map();

  function onTick(symbol, rawTicks, now = Date.now()) {
    if (typeof symbol !== 'string' || !Array.isArray(rawTicks) || !rawTicks.length ||
        !Number.isFinite(now)) return false;
    const tick = rawTicks.at(-1);
    const tickAgeMs = now - Number(tick.epoch) * 1000;
    if (!Number.isSafeInteger(tick.epoch) || !Number.isFinite(tick.quote) ||
        tick.quote <= 0 || !Number.isInteger(tick.pip_size) ||
        tick.pip_size < 0 || tick.pip_size > 12 ||
        tickAgeMs < 0 || tickAgeMs > 15000) return false;

    let state = bySymbol.get(symbol);
    if (!state) {
      state = {lastEpoch: 0, bots: STRATEGIES.map(strategy => ({
        bot: strategy.name, botId: strategy.id, market: symbol, mode: 'RESEARCH',
        processedTicks: 0, lastTickEpoch: null, lastProcessedAt: null,
        sampleSize: 0, signal: {kind: 'SKIP'}
      }))};
      bySymbol.set(symbol, state);
    }
    if (tick.epoch <= state.lastEpoch) return false;
    const normalized = rawTicks.slice(-300).map(item => ({
      symbol, epoch: item.epoch, quote: item.quote, pip_size: item.pip_size
    }));
    const validSample = normalized.length === 300 && normalized.every((item, index) =>
      Number.isSafeInteger(item.epoch) && item.epoch > 0 &&
      (index === 0 || item.epoch > normalized[index - 1].epoch)
    );
    const signals = validSample ? evaluateOriginal4Signals(normalized) : noSignals();
    state.lastEpoch = tick.epoch;
    state.bots.forEach((bot, index) => {
      bot.processedTicks++;
      bot.lastTickEpoch = tick.epoch;
      bot.lastProcessedAt = now;
      bot.sampleSize = normalized.length;
      bot.signal = signals[index];
    });
    return true;
  }

  function snapshot(symbol, now = Date.now()) {
    const state = bySymbol.get(symbol);
    const bots = state?.bots ?? STRATEGIES.map(strategy => ({
      bot: strategy.name, botId: strategy.id, market: symbol, mode: 'RESEARCH',
      processedTicks: 0, lastTickEpoch: null, lastProcessedAt: null,
      sampleSize: 0, signal: {kind: 'SKIP'}
    }));
    return bots.map(bot => {
      const ageMs = bot.lastTickEpoch === null ? null : now - bot.lastTickEpoch * 1000;
      const fresh = ageMs !== null && ageMs >= 0 && ageMs <= 15000;
      const ready = fresh && bot.sampleSize === 300;
      return {
        ...bot,
        feedFresh: fresh,
        ready,
        signal: ready ? bot.signal : {bot: bot.bot, kind: 'SKIP'},
        decision: 'SKIP',
        reason: !fresh ? 'Feed stale or awaiting ticks' :
          !ready ? '300 ordered fresh ticks required' :
          'Research-only hypothesis; independent validation and payout required',
        executionAuthorized: false
      };
    });
  }
  return {onTick, snapshot};
}
