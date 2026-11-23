/**
 * Trade Scheme FX 3.0 — research-only tick window.
 * Pure in-memory utility; never places broker orders or calculates win probabilities.
 * A caller must use a separate window for each symbol/account/feed.
 */
export function createResearchTickWindow({
  capacity = 300,
  maxAgeMs = 30_000,
  clock = () => Date.now(),
} = {}) {
  if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 10_000) {
    throw new RangeError("capacity must be an integer between 1 and 10000");
  }
  if (!Number.isFinite(maxAgeMs) || maxAgeMs < 0) {
    throw new RangeError("maxAgeMs must be a nonnegative finite number");
  }
  const ticks = [];
  let lastEpoch = -Infinity;
  let lastQuote = null;

  function ingest({ epoch, quote } = {}) {
    const timeMs = Number(epoch) * 1000;
    const price = Number(quote);
    const now = clock();
    if (!Number.isFinite(timeMs) || !Number.isFinite(price) ||
        !Number.isFinite(now) || timeMs <= 0 || price < 0) {
      return { accepted: false, reason: "invalid_tick" };
    }
    if (timeMs > now + 5_000) return { accepted: false, reason: "future_tick" };
    if (now - timeMs > maxAgeMs) return { accepted: false, reason: "stale_tick" };
    if (epoch < lastEpoch) return { accepted: false, reason: "out_of_order_tick" };
    if (epoch === lastEpoch && price === lastQuote) {
      return { accepted: false, reason: "duplicate_tick" };
    }
    // Same-second quotes with different prices can be legitimate updates.
    ticks.push(Object.freeze({ epoch: Number(epoch), quote: price }));
    if (ticks.length > capacity) ticks.shift();
    lastEpoch = Number(epoch);
    lastQuote = price;
    return { accepted: true, size: ticks.length };
  }

  return {
    ingest,
    snapshot: () => ticks.slice(),
    clear: () => { ticks.length = 0; lastEpoch = -Infinity; lastQuote = null; },
    get size() { return ticks.length; },
    get capacity() { return capacity; },
  };
}
