import { createDerivResearchSession } from "./research-session.mjs";

/**
 * Owns a single read-only Deriv research socket. Reconnects with bounded exponential
 * backoff; each reconnect creates a fresh subscription and empty research window.
 * Socket construction and timers are injected to keep testing deterministic.
 */
export function createDerivResearchSupervisor({
  symbol, connect, clock, capacity = 300, maxAgeMs = 30_000,
  schedule = (fn, ms) => setTimeout(fn, ms),
  cancel = id => clearTimeout(id),
  baseDelayMs = 1000, maxDelayMs = 30_000,
} = {}) {
  if (typeof connect !== "function") throw new TypeError("connect factory required");
  if (!Number.isFinite(baseDelayMs) || baseDelayMs < 1 ||
      !Number.isFinite(maxDelayMs) || maxDelayMs < baseDelayMs) {
    throw new RangeError("Invalid reconnect delays");
  }
  let socket = null, session = null, timer = null;
  let running = false, attempts = 0, generation = 0, state = "idle", lastError = null;

  function clearRetry() {
    if (timer !== null) { cancel(timer); timer = null; }
  }
  function disposeSocket() {
    if (!socket) return;
    socket.removeEventListener("open", onOpen);
    socket.removeEventListener("close", onClose);
    socket.removeEventListener("error", onError);
    if (session) { try { session.stop(); } catch { /* disconnected socket */ } }
    if (typeof socket.close === "function" && socket.readyState < 2) socket.close();
    socket = null;
    session = null;
  }
  function retry() {
    if (!running || timer !== null) return;
    state = "reconnecting";
    const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** Math.min(attempts++, 20));
    timer = schedule(() => { timer = null; if (running) establish(); }, delay);
  }
  function onOpen() {
    if (!running || !socket) return;
    try {
      session = createDerivResearchSession({ symbol, transport: socket, clock, capacity, maxAgeMs });
      session.start();
      attempts = 0;
      state = "streaming";
      lastError = null;
    } catch (error) {
      lastError = "subscription_failed";
      disposeSocket();
      retry();
    }
  }
  function onClose() {
    if (!running) return;
    disposeSocket();
    retry();
  }
  function onError() {
    lastError = "socket_error";
    // Some transports emit error without close; retire it to avoid stalled streams.
    disposeSocket();
    retry();
  }
  function establish() {
    if (!running) return;
    generation++;
    state = "connecting";
    try {
      socket = connect();
      if (!socket || typeof socket.addEventListener !== "function" ||
          typeof socket.removeEventListener !== "function") {
        throw new TypeError("Invalid WebSocket transport");
      }
      socket.addEventListener("open", onOpen);
      socket.addEventListener("close", onClose);
      socket.addEventListener("error", onError);
      if (socket.readyState === 1) onOpen();
      else if (socket.readyState !== 0) { disposeSocket(); retry(); }
    } catch {
      lastError = "connection_failed";
      disposeSocket();
      retry();
    }
  }
  function start() {
    if (running) return false;
    running = true;
    attempts = 0;
    establish();
    return true;
  }
  function stop() {
    if (!running) return false;
    running = false;
    clearRetry();
    disposeSocket();
    state = "stopped";
    return true;
  }
  return {
    start, stop,
    snapshot: () => session?.snapshot() ?? [],
    stats: () => ({
      state, running, attempts, generation, lastError,
      feed: session?.stats() ?? null,
    }),
  };
}
