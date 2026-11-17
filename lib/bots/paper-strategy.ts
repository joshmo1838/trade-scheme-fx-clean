/**
 * Deterministic, side-effect-free SENFX paper signal rules.
 *
 * A signal is only a paper research decision. This module intentionally
 * contains NO broker token, WebSocket, order placement, or account access.
 * It can be reused by a future server-side worker after a separately tested
 * Demo execution and risk-verification layer has approved an order.
 */
export type PaperDirection = "CALL" | "PUT";
export type PaperMarket = "R_10" | "R_25" | "R_50" | "R_75" | "R_100" | "frxEURUSD";
export type PaperRule = {
  market: PaperMarket;
  fast: number;
  slow: number;
  thresholdBps: number;
  description: string;
};
export type BotDescriptor = { name: string; market: string };

const PRESETS = {
  synthetic: {
    market: "R_100", fast: 9, slow: 21, thresholdBps: 0.25,
    description: "9/21 simple-moving-average synthetic learning rule",
  },
  trend: {
    market: "R_50", fast: 5, slow: 18, thresholdBps: 0.35,
    description: "5/18 simple-moving-average trend learning rule",
  },
  volatility: {
    market: "R_75", fast: 10, slow: 21, thresholdBps: 0.45,
    description: "10/21 simple-moving-average learning rule",
  },
  forex: {
    market: "frxEURUSD", fast: 9, slow: 21, thresholdBps: 0.30,
    description: "9/21 simple-moving-average forex learning rule",
  },
} as const satisfies Record<string, PaperRule>;

/** Preserve the existing published learning profiles and their settings. */
export function paperPreset(bot: BotDescriptor): PaperRule {
  const name = bot.name.toLowerCase();
  if (name.includes("trend scout")) return PRESETS.trend;
  if (name.includes("volatility watch")) return PRESETS.volatility;
  if (bot.market.toLowerCase().includes("forex")) return PRESETS.forex;
  return PRESETS.synthetic;
}

/**
 * Compute a direction from the most recent prices. Invalid, missing, or
 * insufficient data fails closed (no signal), never silently creates a buy.
 * The output is NOT a Deriv contract proposal or an order instruction.
 */
export function evaluatePaperSignal(prices: readonly number[], rule: PaperRule): PaperDirection | null {
  if (!Number.isInteger(rule.fast) || !Number.isInteger(rule.slow) ||
      rule.fast < 2 || rule.fast >= rule.slow || rule.slow > 1_000 ||
      !Number.isFinite(rule.thresholdBps) || rule.thresholdBps <= 0 ||
      prices.length < rule.slow) return null;

  const recent = prices.slice(-rule.slow);
  if (!recent.every(value => Number.isFinite(value) && value > 0)) return null;

  const average = (values: readonly number[]) =>
    values.reduce((total, value) => total + value, 0) / values.length;
  const fast = average(recent.slice(-rule.fast));
  const slow = average(recent);
  const spreadBps = Math.abs(fast - slow) / Math.abs(slow) * 10_000;

  if (!Number.isFinite(spreadBps) || spreadBps < rule.thresholdBps || fast === slow) return null;
  return fast > slow ? "CALL" : "PUT";
}
