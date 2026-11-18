/**
 * SENFX persistent PAPER control-plane state machine.
 * No order execution or Deriv credentials are used in this module.
 * Commands request a desired state; only a separately approved worker may
 * later report observed execution state.
 */
export type BotCommandAction = "start" | "pause" | "resume" | "stop";
export type BotDesiredState = "stopped" | "running" | "paused";
export type BotObservedState = "stopped" | "starting" | "running" | "pausing" | "paused" | "stopping" | "error";

export function nextBotDesiredState(current: unknown, action: unknown): BotDesiredState | null {
  if (current !== "stopped" && current !== "running" && current !== "paused") return null;
  if (action === "start") return current === "stopped" ? "running" : null;
  if (action === "pause") return current === "running" ? "paused" : null;
  if (action === "resume") return current === "paused" ? "running" : null;
  if (action === "stop") return "stopped"; // emergency stop can supersede stale commands
  return null;
}

/** A queued command must never be displayed as confirmed worker execution. */
export function describeBotControl(desired: BotDesiredState, observed: BotObservedState | null): string {
  if (!observed) return "Not connected to a worker";
  if (desired !== observed) return "Requested " + desired + " · worker " + observed;
  if (observed === "running") return "Worker running paper simulation";
  if (observed === "paused") return "Worker paused";
  if (observed === "stopped") return "Worker stopped";
  return "Worker " + observed;
}

/**
 * Accurate customer-facing PAPER worker indication. A queued Start and an old
 * running observation are NOT evidence of an active execution process.
 * Never use this label to authorize a trade; the SQL lease is authoritative.
 */
export type PaperControlObservation = {
  desired_state: string;
  observed_state: string;
  workerConnected?: boolean;
  heartbeat_at?: string | null;
  lease_expires_at?: string | null;
};

export function paperWorkerHasCurrentLease(run: PaperControlObservation | null, now: number = Date.now()): boolean {
  if (!run || run.workerConnected !== true) return false;
  const heartbeat = Date.parse(run.heartbeat_at ?? "");
  const expiry = Date.parse(run.lease_expires_at ?? "");
  return Number.isFinite(heartbeat) && Number.isFinite(expiry) &&
    heartbeat <= now + 5_000 && now - heartbeat <= 15_000 && expiry > now;
}

/** Always distinguish customer intention from verified observed state. */
export function paperBotDisplayStatus(run: PaperControlObservation | null, now: number = Date.now()):
  { label: string; detail: string; verifiedRunning: boolean } {
  if (!run) return {
    label: "NOT STARTED", detail: "No persistent paper worker session recorded.", verifiedRunning: false,
  };
  const connected = paperWorkerHasCurrentLease(run, now);
  const wanted = run.desired_state;
  const observed = run.observed_state;
  if (observed === "error") return {
    label: "ERROR / CHECK BOT", detail: "The worker reported an error; no running state is verified.", verifiedRunning: false,
  };
  if (wanted === "stopped") {
    return observed === "stopped"
      ? { label: "STOPPED", detail: "Stop confirmed by the backend.", verifiedRunning: false }
      : { label: "STOP REQUESTED", detail: connected
        ? "Awaiting worker acknowledgement." : "No current worker lease; Stop is not yet acknowledged.", verifiedRunning: false };
  }
  if (wanted === "paused") {
    return observed === "paused"
      ? { label: "PAUSED", detail: "Pause was acknowledged; no paper entries should continue.", verifiedRunning: false }
      : { label: "PAUSE REQUESTED", detail: connected
        ? "Waiting for the worker to pause." : "No current worker lease; Pause has not been acknowledged.", verifiedRunning: false };
  }
  if (wanted === "running") {
    if (observed === "running" && connected) return {
      label: "RUNNING · PAPER ONLY", detail: "Recent heartbeat and unexpired worker lease verified.",
      verifiedRunning: true,
    };
    if (observed === "stopped") return {
      label: "START QUEUED", detail: "Start requested but not acknowledged by a connected worker.",
      verifiedRunning: false,
    };
    if (!connected) return {
      label: "OFFLINE / UNVERIFIED",
      detail: "Worker lease or heartbeat is missing, stale or expired. No execution is confirmed.",
      verifiedRunning: false,
    };
    return {
      label: observed === "paused" ? "RESUME REQUESTED" : "STARTING",
      detail: "Worker is attached, but has not confirmed running paper mode.", verifiedRunning: false,
    };
  }
  return {label:"UNKNOWN STATE",detail:"Unrecognized backend state; no execution is confirmed.",verifiedRunning:false};
}
