/** Public Deriv tick adapter for browser-local paper research. No credentials or orders. */
import type { Tick } from "./smart-entry-paper.ts";

export type PublicTickResult = { ok: true; tick: Tick } | { ok: false; reason: string };
export function parsePublicDerivTick(raw: unknown, symbol: string, nowMs: number): PublicTickResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || typeof symbol !== "string" || !symbol.trim() || typeof nowMs !== "number" || !Number.isFinite(nowMs)) return { ok: false, reason: "invalid-feed-message" };
  const message = raw as Record<string, unknown>;
  if (message.error) return { ok: false, reason: "feed-error" };
  if (message.msg_type !== "tick" || !message.tick || typeof message.tick !== "object" || Array.isArray(message.tick)) return { ok: false, reason: "not-a-tick" };
  const data = message.tick as Record<string, unknown>;
  if (data.symbol !== symbol || typeof data.epoch !== "number" || typeof data.quote !== "number" ||
      !Number.isInteger(data.epoch) || !Number.isFinite(data.quote) || data.quote <= 0) return { ok: false, reason: "invalid-symbol-or-quote" };
  const epochMs = data.epoch * 1000;
  if (!Number.isFinite(epochMs) || epochMs > nowMs + 1000 || nowMs - epochMs > 5000) return { ok: false, reason: "stale-or-future-tick" };
  return { ok: true, tick: { id: symbol + ":" + String(data.epoch) + ":" + String(data.quote), epochMs, quote: data.quote } };
}
