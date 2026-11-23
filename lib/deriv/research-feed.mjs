import { normalizeDerivTickMessage } from "./normalize-tick-message.mjs";
import { createResearchTickWindow } from "./research-tick-window.mjs";

/**
 * Per-symbol research-only Deriv tick processor.
 * Receives already-decoded WebSocket messages; never opens sockets or places orders.
 * Use one processor per customer/account/symbol feed to prevent cross-feed mixing.
 */
export function createDerivResearchFeed({ symbol, capacity = 300, maxAgeMs = 30_000, clock } = {}) {
  if (typeof symbol !== "string" || !/^[A-Za-z0-9_]{2,30}$/.test(symbol)) {
    throw new TypeError("A valid Deriv symbol is required");
  }
  const window = createResearchTickWindow({ capacity, maxAgeMs, clock });
  const counters = { accepted: 0, rejected: 0 };

  function ingestMessage(message) {
    const normalized = normalizeDerivTickMessage(message, symbol);
    const result = normalized.accepted ? window.ingest(normalized.tick) : normalized;
    if (result.accepted) counters.accepted += 1;
    else counters.rejected += 1;
    return result;
  }

  return {
    symbol,
    ingestMessage,
    snapshot: () => window.snapshot(),
    stats: () => ({ ...counters, buffered: window.size, capacity: window.capacity }),
    reset: () => { window.clear(); counters.accepted = 0; counters.rejected = 0; },
  };
}
