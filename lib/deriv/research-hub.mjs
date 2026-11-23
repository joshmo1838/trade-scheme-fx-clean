import { createDerivResearchSupervisor } from "./research-supervisor.mjs";

/**
 * Multi-symbol, read-only research coordinator.
 * One isolated socket and bounded 300-tick window per symbol. Consumer callbacks
 * receive snapshots, never trading authority. Does not place broker orders.
 */
export function createDerivResearchHub({
  symbols, connect, clock, capacity = 300, maxAgeMs = 30_000,
  schedule, cancel, baseDelayMs, maxDelayMs,
} = {}) {
  if (!Array.isArray(symbols) || symbols.length === 0 || symbols.length > 30 ||
      symbols.some(s => typeof s !== "string" || !/^[A-Za-z0-9_]{2,30}$/.test(s)) ||
      new Set(symbols).size !== symbols.length) {
    throw new TypeError("Provide 1–30 unique valid market symbols");
  }
  if (typeof connect !== "function") throw new TypeError("A socket factory is required");
  const supervisors = new Map(symbols.map(symbol => [
    symbol,
    createDerivResearchSupervisor({
      symbol, connect: () => connect(symbol), clock, capacity, maxAgeMs,
      ...(schedule === undefined ? {} : { schedule }),
      ...(cancel === undefined ? {} : { cancel }),
      ...(baseDelayMs === undefined ? {} : { baseDelayMs }),
      ...(maxDelayMs === undefined ? {} : { maxDelayMs }),
    }),
  ]));
  let started = false;
  function start() {
    if (started) return false;
    started = true;
    for (const supervisor of supervisors.values()) supervisor.start();
    return true;
  }
  function stop() {
    if (!started) return false;
    started = false;
    for (const supervisor of supervisors.values()) supervisor.stop();
    return true;
  }
  function requireSymbol(symbol) {
    const supervisor = supervisors.get(symbol);
    if (!supervisor) throw new RangeError("Symbol is not registered");
    return supervisor;
  }
  return Object.freeze({
    start, stop,
    symbols: () => [...symbols],
    snapshot: symbol => requireSymbol(symbol).snapshot(),
    status: symbol => requireSymbol(symbol).stats(),
    statuses: () => Object.fromEntries(
      [...supervisors].map(([symbol, supervisor]) => [symbol, supervisor.stats()])
    ),
    get running() { return started; },
  });
}
