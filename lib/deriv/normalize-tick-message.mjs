/**
 * Convert a Deriv WebSocket ticks response to a research-window observation.
 * Schema reference: https://developers.deriv.com/llms/ticks.md
 * No credentials, subscriptions, or broker orders are handled here.
 */
export function normalizeDerivTickMessage(message, expectedSymbol) {
  if (!message || typeof message !== "object" || message.msg_type !== "tick") {
    return { accepted: false, reason: "not_tick_message" };
  }
  const tick = message.tick;
  if (!tick || typeof tick !== "object" || Array.isArray(tick)) {
    return { accepted: false, reason: "missing_tick" };
  }
  if (typeof expectedSymbol !== "string" || !expectedSymbol ||
      tick.symbol !== expectedSymbol) {
    return { accepted: false, reason: "symbol_mismatch" };
  }
  if (!Number.isSafeInteger(tick.epoch) || tick.epoch <= 0 ||
      typeof tick.quote !== "number" || !Number.isFinite(tick.quote) ||
      tick.quote < 0) {
    return { accepted: false, reason: "invalid_tick" };
  }
  return { accepted: true, tick: { epoch: tick.epoch, quote: tick.quote } };
}
