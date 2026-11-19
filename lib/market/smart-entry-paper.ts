/**
 * Release 2: browser-local paper-only signal gate.
 * Pure deterministic logic: NO networking, credentials, orders or persistence.
 */
export type Tick = { epochMs: number; quote: number; id: string };
export type TickGate = { ok: true; tick: Tick } | { ok: false; reason: string };
export function validateTick(input: Tick, previous: Tick | null, nowMs: number, maxAgeMs = 5000): TickGate {
  if (!input || typeof input.id !== "string" || !input.id.trim()) return { ok: false, reason: "missing-id" };
  if (![input.epochMs, input.quote, nowMs].every(Number.isFinite)) return { ok: false, reason: "invalid-number" };
  if (input.quote <= 0 || input.epochMs > nowMs) return { ok: false, reason: "invalid-tick" };
  if (nowMs - input.epochMs > maxAgeMs) return { ok: false, reason: "stale-tick" };
  if (previous && (input.id === previous.id || input.epochMs === previous.epochMs)) return { ok: false, reason: "duplicate-tick" };
  if (previous && input.epochMs < previous.epochMs) return { ok: false, reason: "out-of-order-tick" };
  return { ok: true, tick: input };
}

export type EntryState = {
  startedAtMs: number;
  signalStartedAtMs: number;
  completed: number;
  exposure: number;
  stopped: boolean;
  lastTick: Tick | null;
};
export type EntryConfig = { maxRuns: number; minimumScore: number; waitMs: number; stake: number; exposureCap: number };
export type EntryResult = { state: EntryState; action: "wait" | "observe" | "stop"; reason: string };
export const SMART_ENTRY_DEFAULTS: EntryConfig = Object.freeze({
  maxRuns: 10, minimumScore: 75, waitMs: 60000, stake: 1, exposureCap: 10
});
export function beginSmartEntry(nowMs: number): EntryState {
  if (!Number.isFinite(nowMs)) throw new Error("invalid-clock");
  return { startedAtMs: nowMs, signalStartedAtMs: nowMs, completed: 0, exposure: 0, stopped: false, lastTick: null };
}
export function smartEntryStep(state: EntryState, config: EntryConfig, nowMs: number, tick: Tick | null, score: number | null, emergencyStop = false): EntryResult {
  const stop = (reason: string): EntryResult => ({ state: { ...state, stopped: true }, action: "stop", reason });
  const wait = (reason: string, next = state): EntryResult => ({ state: next, action: "wait", reason });
  if (state.stopped || emergencyStop) return stop("emergency-or-stopped");
  if (![nowMs, config.maxRuns, config.minimumScore, config.waitMs, config.stake, config.exposureCap].every(Number.isFinite) ||
      !Number.isInteger(config.maxRuns) || config.maxRuns < 1 || config.maxRuns > 10 ||
      config.minimumScore < 0 || config.minimumScore > 100 || config.waitMs <= 0 || config.waitMs > 60000 ||
      config.stake <= 0 || config.exposureCap <= 0 || nowMs < state.signalStartedAtMs) return stop("invalid-config-or-clock");
  if (state.completed >= config.maxRuns) return stop("batch-complete");
  if (state.exposure + config.stake > config.exposureCap) return stop("exposure-cap");
  if (nowMs - state.signalStartedAtMs >= config.waitMs) return stop("signal-timeout-no-entry");
  if (!tick) return wait("awaiting-tick");
  const check = validateTick(tick, state.lastTick, nowMs);
  if (!check.ok) return wait(check.reason);
  const updated = { ...state, lastTick: tick };
  if (score === null || !Number.isFinite(score) || score < config.minimumScore || score > 100) return wait("no-qualifying-signal", updated);
  const next = { ...updated, completed: state.completed + 1, exposure: state.exposure + config.stake, signalStartedAtMs: nowMs };
  return { state: next, action: "observe", reason: "hypothetical-next-tick-only" };
}
