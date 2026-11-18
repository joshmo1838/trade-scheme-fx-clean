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
