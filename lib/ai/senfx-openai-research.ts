/**
 * Bound, descriptive inputs for optional OpenAI explanations on the existing
 * 15-bot public-tick paper research screen. No broker orders or model-driven
 * strategy, scoring or purchase decisions are wired here.
 */
import { findFifteenBot } from "../bots/fifteen-paper-bots.ts";

export const MAX_RESEARCH_OBSERVATIONS = 80;
export type ResearchSnapshot = {
  botId: string; botName: string; market: string; family: string;
  sampleSize: number; firstEpoch: number; lastEpoch: number;
  lastPrice: number; minPrice: number; maxPrice: number;
  lastDigit: number; digitCounts: number[]; priceUp: number;
  priceDown: number; priceUnchanged: number;
  provenance: "browser-reported Deriv public ticks; not independently authenticated by API";
};
export type SnapshotResult =
  | { ok: true; snapshot: ResearchSnapshot }
  | { ok: false; error: string };

export function buildResearchSnapshot(botId: unknown, observations: unknown, nowMs: number): SnapshotResult {
  if (typeof botId !== "string") return { ok: false, error: "Unknown research bot." };
  const bot = findFifteenBot(botId);
  if (!bot) return { ok: false, error: "Unknown research bot." };
  if (!Array.isArray(observations) || observations.length < bot.minTicks ||
      observations.length > MAX_RESEARCH_OBSERVATIONS) {
    return { ok: false, error: "A bounded sample of recent public ticks is required." };
  }
  if (!Number.isFinite(nowMs) || nowMs < 1_000_000_000_000) {
    return { ok: false, error: "Server time unavailable." };
  }
  let prevEpoch = 0;
  let prevPrice: number | null = null;
  let priceUp = 0, priceDown = 0, priceUnchanged = 0;
  let minPrice = Infinity, maxPrice = -Infinity;
  const counts = Array<number>(10).fill(0);
  for (const item of observations) {
    if (!item || typeof item !== "object") return { ok: false, error: "Malformed tick." };
    const tick = item as Record<string, unknown>;
    const { epoch, price, digit } = tick;
    if (typeof epoch !== "number" || !Number.isSafeInteger(epoch) || epoch <= prevEpoch ||
        epoch * 1000 > nowMs + 5_000 ||
        typeof price !== "number" || !Number.isFinite(price) || price <= 0 || price >= 1e13 ||
        typeof digit !== "number" || !Number.isInteger(digit) || digit < 0 || digit > 9) {
      return { ok: false, error: "Invalid, out-of-order, or future market observation." };
    }
    if (prevPrice !== null) {
      if (price > prevPrice) priceUp++;
      else if (price < prevPrice) priceDown++;
      else priceUnchanged++;
    }
    prevPrice = price;
    prevEpoch = epoch;
    minPrice = Math.min(minPrice, price);
    maxPrice = Math.max(maxPrice, price);
    counts[digit]++;
  }
  const last = observations[observations.length - 1] as { epoch: number; price: number; digit: number };
  if (nowMs - last.epoch * 1000 > 15_000) {
    return { ok: false, error: "The selected market sample is stale." };
  }
  return { ok: true, snapshot: {
    botId: bot.id, botName: bot.name, market: bot.market, family: bot.family,
    sampleSize: observations.length, firstEpoch: observations[0].epoch,
    lastEpoch: last.epoch, lastPrice: last.price,
    minPrice, maxPrice, lastDigit: last.digit,
    digitCounts: counts, priceUp, priceDown, priceUnchanged,
    provenance: "browser-reported Deriv public ticks; not independently authenticated by API",
  } };
}
