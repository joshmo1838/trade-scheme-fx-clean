import { createDerivResearchFeed } from "./research-feed.mjs";
import { createDerivTickSubscription } from "./tick-subscription.mjs";

/**
 * Research-only socket session: subscribe, process, and unsubscribe.
 * Inject an already connected WebSocket-compatible transport.
 * Never sends authorization, proposals, purchases, or other trading commands.
 */
export function createDerivResearchSession({ symbol, transport, clock, capacity = 300, maxAgeMs = 30_000, requestId = 1 } = {}) {
  if (!transport || typeof transport.send !== "function" ||
      typeof transport.addEventListener !== "function" ||
      typeof transport.removeEventListener !== "function") {
    throw new TypeError("A WebSocket-compatible transport is required");
  }
  const request = createDerivTickSubscription(symbol, requestId);
  const feed = createDerivResearchFeed({ symbol, clock, capacity, maxAgeMs });
  let active = false;
  let subscriptionId = null;
  let lastError = null;
  let malformed = 0;

  function onMessage(event) {
    if (!active) return;
    let payload;
    try {
      payload = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
    } catch {
      malformed += 1;
      return;
    }
    if (!payload || typeof payload !== "object") { malformed += 1; return; }
    if (payload.error) {
      lastError = typeof payload.error.code === "string" ? payload.error.code : "broker_error";
      return;
    }
    if (payload.msg_type !== "tick") return;
    // Only accept subscription ids observed on matching symbol messages.
    if (!payload.tick || payload.tick.symbol !== symbol) {
      feed.ingestMessage(payload);
      return;
    }
    const incomingId = payload.subscription?.id;
    if (subscriptionId && incomingId !== subscriptionId) return;
    if (incomingId !== undefined && (typeof incomingId !== "string" || !incomingId)) {
      malformed += 1;
      return;
    }
    const result = feed.ingestMessage(payload);
    if (result.accepted && incomingId && !subscriptionId) subscriptionId = incomingId;
  }

  function start() {
    if (active) return false;
    if (transport.readyState !== 1) throw new Error("WebSocket must be open before subscribing");
    active = true;
    transport.addEventListener("message", onMessage);
    try { transport.send(JSON.stringify(request)); }
    catch (error) {
      active = false;
      transport.removeEventListener("message", onMessage);
      throw error;
    }
    return true;
  }

  function stop() {
    if (!active) return false;
    active = false;
    transport.removeEventListener("message", onMessage);
    if (subscriptionId && transport.readyState === 1) {
      transport.send(JSON.stringify({ forget: subscriptionId }));
    }
    subscriptionId = null;
    return true;
  }

  return {
    start, stop,
    snapshot: feed.snapshot,
    stats: () => ({ ...feed.stats(), active, subscriptionId, malformed, lastError }),
  };
}
