/**
 * Read-only bot research fanout for the existing Deriv market hub.
 * Does not modify bot strategies, manage customer credentials, or place orders.
 * Callers must create a separate adapter per authenticated customer/account scope.
 */
export function createDerivBotResearchBridge({ hub, maxBots = 15 } = {}) {
  if (!hub || typeof hub.subscribe !== "function" || typeof hub.symbols !== "function") {
    throw new TypeError("A research hub is required");
  }
  if (!Number.isSafeInteger(maxBots) || maxBots < 1 || maxBots > 100) {
    throw new RangeError("maxBots must be between 1 and 100");
  }
  const available = new Set(hub.symbols());
  const bots = new Map();
  let delivered = 0, failures = 0;

  function attach({ botId, symbol, onResearch }) {
    if (typeof botId !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(botId)) {
      throw new TypeError("Invalid bot identifier");
    }
    if (!available.has(symbol)) throw new RangeError("Unknown research symbol");
    if (typeof onResearch !== "function") throw new TypeError("onResearch callback required");
    if (bots.has(botId)) throw new Error("Bot is already attached");
    if (bots.size >= maxBots) throw new RangeError("Research bot limit reached");
    const state = { symbol, enabled: true, delivered: 0, failures: 0, unsubscribe: null };
    const listener = observation => {
      if (!state.enabled) return;
      try {
        onResearch(Object.freeze({
          botId, symbol,
          tick: Object.freeze({ ...observation.tick }),
          snapshot: Object.freeze(observation.snapshot.map(t => Object.freeze({ ...t }))),
        }));
        state.delivered++;
        delivered++;
      } catch {
        state.failures++;
        failures++;
      }
    };
    state.unsubscribe = hub.subscribe(symbol, listener);
    bots.set(botId, state);
    return () => detach(botId);
  }
  function detach(botId) {
    const state = bots.get(botId);
    if (!state) return false;
    state.unsubscribe();
    bots.delete(botId);
    return true;
  }
  function setEnabled(botId, enabled) {
    const state = bots.get(botId);
    if (!state) throw new RangeError("Bot is not attached");
    if (typeof enabled !== "boolean") throw new TypeError("enabled must be boolean");
    state.enabled = enabled;
  }
  function stop() {
    for (const id of [...bots.keys()]) detach(id);
  }
  return Object.freeze({
    attach, detach, setEnabled, stop,
    stats: () => ({
      attached: bots.size, delivered, failures,
      bots: Object.fromEntries([...bots].map(([id, state]) => [id, {
        symbol: state.symbol, enabled: state.enabled,
        delivered: state.delivered, failures: state.failures,
      }])),
    }),
  });
}
