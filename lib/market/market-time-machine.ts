/** Deterministic, offline-only Market Time Machine. Never opens a socket or places orders. */
import { beginPaperSession, paperNextTickStep, type PaperSession } from "./smart-entry-next-tick.ts";
import { SMART_ENTRY_DEFAULTS, type Tick } from "./smart-entry-paper.ts";

export type ReplayInput = { tick: Tick; score: number | null; receivedAtMs: number };
export type ReplayResult = { session: PaperSession; events: Array<{ action: string; reason: string; tickId: string }> };
export function replayPaperTicks(inputs: readonly ReplayInput[], startMs: number, emergencyStopAtIndex: number | null = null): ReplayResult {
  let session = beginPaperSession(startMs);
  const events: ReplayResult["events"] = [];
  if (!Array.isArray(inputs) || inputs.length > 10000) throw new Error("invalid-replay-input");
  if (emergencyStopAtIndex !== null && (!Number.isInteger(emergencyStopAtIndex) || emergencyStopAtIndex < 0 || emergencyStopAtIndex >= inputs.length)) throw new Error("invalid-emergency-stop-index");
  for (let i = 0; i < inputs.length; i++) {
    if (session.gate.stopped) break;
    const row = inputs[i];
    if (!row || !Number.isFinite(row.receivedAtMs) || row.receivedAtMs < startMs) {
      const stopped = paperNextTickStep(session, SMART_ENTRY_DEFAULTS, startMs, null, null, true);
      session = stopped.session;
      events.push({ action: "stop", reason: "invalid-replay-clock", tickId: "" });
      break;
    }
    const result = paperNextTickStep(session, SMART_ENTRY_DEFAULTS, row.receivedAtMs, row.tick, row.score, emergencyStopAtIndex === i);
    session = result.session;
    events.push({ action: result.action, reason: result.reason, tickId: row.tick?.id ?? "" });
    if (session.gate.completed >= SMART_ENTRY_DEFAULTS.maxRuns && session.observations.at(-1)?.settlement) break;
  }
  return { session, events };
}
