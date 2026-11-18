/**
 * Session analytics use only public market ticks actually received by this browser.
 * These values are descriptive, not trade signals, historical candles or forecasts.
 */
export type TickSample = { epoch: number; price: number };
export type TickTrendPoint = { epoch: number; price: number; average10: number | null };
export type TickActivityBucket = { epoch: number; count: number };

export type TickSessionSummary = {
  samples: number;
  firstPrice: number;
  lastPrice: number;
  high: number;
  low: number;
  changePercent: number;
  trend: TickTrendPoint[];
  activity: TickActivityBucket[];
};

export const MAX_SESSION_TICKS = 240;
export const ACTIVITY_BUCKET_SECONDS = 15;
export const MAX_ACTIVITY_BUCKETS = 16;

export function summarizeTickSession(input: TickSample[]): TickSessionSummary | null {
  const valid = input
    .filter(tick => Number.isFinite(tick.epoch) && tick.epoch > 0 &&
      Number.isFinite(tick.price) && tick.price > 0)
    .sort((a, b) => a.epoch - b.epoch)
    .slice(-MAX_SESSION_TICKS);

  if (valid.length === 0) return null;

  let low = Number.POSITIVE_INFINITY;
  let high = Number.NEGATIVE_INFINITY;
  let rollingSum = 0;
  const trend = valid.map((tick, index): TickTrendPoint => {
    low = Math.min(low, tick.price);
    high = Math.max(high, tick.price);
    rollingSum += tick.price;
    if (index >= 10) rollingSum -= valid[index - 10].price;
    return {
      epoch: tick.epoch,
      price: tick.price,
      average10: index >= 9 ? rollingSum / 10 : null
    };
  });

  const lastBucket = Math.floor(valid[valid.length - 1].epoch / ACTIVITY_BUCKET_SECONDS) *
    ACTIVITY_BUCKET_SECONDS;
  const firstBucket = Math.max(
    Math.floor(valid[0].epoch / ACTIVITY_BUCKET_SECONDS) * ACTIVITY_BUCKET_SECONDS,
    lastBucket - (MAX_ACTIVITY_BUCKETS - 1) * ACTIVITY_BUCKET_SECONDS
  );
  const counts = new Map<number, number>();
  for (const tick of valid) {
    const bucket = Math.floor(tick.epoch / ACTIVITY_BUCKET_SECONDS) *
      ACTIVITY_BUCKET_SECONDS;
    if (bucket >= firstBucket && bucket <= lastBucket) {
      counts.set(bucket, (counts.get(bucket) || 0) + 1);
    }
  }
  const activity: TickActivityBucket[] = [];
  for (let epoch = firstBucket; epoch <= lastBucket; epoch += ACTIVITY_BUCKET_SECONDS) {
    activity.push({ epoch, count: counts.get(epoch) || 0 });
  }

  const firstPrice = valid[0].price;
  const lastPrice = valid[valid.length - 1].price;
  return {
    samples: valid.length,
    firstPrice,
    lastPrice,
    high,
    low,
    changePercent: (lastPrice - firstPrice) / firstPrice * 100,
    trend,
    activity
  };
}
