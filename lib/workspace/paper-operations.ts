/** Derive a read-only, conservative customer PAPER status from API records.
 * Counts reflect the limited API snapshot; never infer broker execution.
 */
export type PaperRunObservation = {
  desired_state?: string;
  observed_state?: string;
  workerConnected?: boolean;
  heartbeat_at?: string | null;
  lease_expires_at?: string | null;
};

export type PaperApiSnapshot = {
  enabled?: boolean;
  mode?: string;
  runs?: PaperRunObservation[];
  commands?: Array<{ status?: string }>;
  positions?: Array<{ status?: string }>;
};

export type PaperOperationsSummary = {
  state: "disabled" | "verified-paper-worker" | "unverified";
  verifiedPaperWorkers: number | null;
  visibleOpenPositions: number | null;
  visiblePendingCommands: number | null;
  note: string;
};

export function hasCurrentPaperLease(run: PaperRunObservation, now: number): boolean {
  if (run.workerConnected !== true) return false;
  const heartbeat = Date.parse(run.heartbeat_at ?? "");
  const expiry = Date.parse(run.lease_expires_at ?? "");
  return Number.isFinite(heartbeat) && Number.isFinite(expiry)
    && heartbeat <= now + 5_000
    && now - heartbeat <= 15_000
    && expiry > now;
}

export function summarizePaperOperations(
  snapshot: PaperApiSnapshot,
  now: number,
): PaperOperationsSummary {
  if (snapshot.enabled !== true) {
    return {
      state: "disabled",
      verifiedPaperWorkers: null,
      visibleOpenPositions: null,
      visiblePendingCommands: null,
      note: "Hosted paper controls are disabled. No persistent worker session is verified.",
    };
  }
  if (snapshot.mode !== "paper" ||
    !Array.isArray(snapshot.runs) ||
    !Array.isArray(snapshot.commands) ||
    !Array.isArray(snapshot.positions)) {
    throw new Error("Incomplete paper status response");
  }

  const verifiedPaperWorkers = snapshot.runs.filter(run =>
    run && hasCurrentPaperLease(run, now) &&
    run.desired_state === "running" &&
    run.observed_state === "running"
  ).length;
  const visibleOpenPositions = snapshot.positions.filter(position =>
    position?.status === "open"
  ).length;
  const visiblePendingCommands = snapshot.commands.filter(command =>
    ["queued", "pending"].includes(command?.status || "")
  ).length;

  return {
    state: verifiedPaperWorkers > 0 ? "verified-paper-worker" : "unverified",
    verifiedPaperWorkers,
    visibleOpenPositions,
    visiblePendingCommands,
    note: verifiedPaperWorkers > 0
      ? "Recent backend heartbeats and leases verified for paper simulation only."
      : "No active paper worker is verified. Queued commands do not confirm execution.",
  };
}
