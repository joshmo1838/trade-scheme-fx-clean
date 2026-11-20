/** Browser-local research settlement. Pure logic: never places Deriv orders. */
import { beginSmartEntry, validateTick, smartEntryStep, type EntryConfig, type EntryState, type Tick } from "./smart-entry-paper.ts";

export type PaperOutcome = "up" | "down" | "flat";
export type PaperObservation = {
  entry: Tick;
  settlement: Tick | null;
  outcome: PaperOutcome | null;
  researchScore: number;
};
export type PaperSession = { gate: EntryState; observations: PaperObservation[] };
export type PaperUpdate = { session: PaperSession; action: "wait" | "observe" | "settle" | "stop"; reason: string };

export function beginPaperSession(nowMs: number): PaperSession {

  return { gate: beginSmartEntry(nowMs), observations: [] };
}

export function paperNextTickStep(session: PaperSession, config: EntryConfig, nowMs: number, tick: Tick | null, score: number | null, emergencyStop = false): PaperUpdate {
  const stop = (reason: string): PaperUpdate => ({ session: { ...session, gate: { ...session.gate, stopped: true } }, action: "stop", reason });
  if (!Array.isArray(session.observations) || session.observations.length !== session.gate.completed ||
      session.observations.length > 10 || session.observations.some((o, i) => !o || !o.entry || !Number.isFinite(o.researchScore) ||
        o.researchScore < config.minimumScore || o.researchScore > 100 ||
        (i < session.observations.length - 1 && o.settlement === null) ||
        (o.settlement === null && o.outcome !== null) ||
        (o.settlement !== null && (!o.settlement || !Number.isFinite(o.settlement.quote) ||
          !Number.isFinite(o.settlement.epochMs) || o.settlement.epochMs <= o.entry.epochMs ||
          o.settlement.id === o.entry.id ||
          o.outcome !== (o.settlement.quote > o.entry.quote ? "up" : o.settlement.quote < o.entry.quote ? "down" : "flat"))) ||
        !Number.isFinite(o.entry.quote) || !Number.isFinite(o.entry.epochMs) ||
        typeof o.entry.id !== "string" || !o.entry.id.trim()))) return stop("invalid-paper-history");
  if (emergencyStop || session.gate.stopped) return stop("emergency-or-stopped");
  // Check the same deadline, exposure, clock and configuration gates even when settling.
  const guard = smartEntryStep(session.gate, config, nowMs, null, null);
  if (guard.action === "stop" && guard.reason !== "batch-complete" && guard.reason !== "exposure-cap") return stop(guard.reason);
  if (!tick) return { session, action: "wait", reason: "awaiting-tick" };
  const checked = validateTick(tick, session.gate.lastTick, nowMs);
  if (!checked.ok) return { session, action: "wait", reason: checked.reason };
  const last = session.observations.at(-1);
  if (last && last.settlement === null) {
    const outcome: PaperOutcome = tick.quote > last.entry.quote ? "up" : tick.quote < last.entry.quote ? "down" : "flat";
    return { session: { gate: { ...session.gate, lastTick: tick }, observations: [...session.observations.slice(0, -1), { ...last, settlement: tick, outcome }] }, action: "settle", reason: "next-valid-public-tick-paper-settlement" };
  }
  const result = smartEntryStep(session.gate, config, nowMs, tick, score);
  if (result.action !== "observe") return { session: { ...session, gate: result.state }, action: result.action, reason: result.reason };
  return { session: { gate: result.state, observations: [...session.observations, { entry: tick, settlement: null, outcome: null, researchScore: score as number }] }, action: "observe", reason: result.reason };
}
