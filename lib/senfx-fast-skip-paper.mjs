// Paper-research decision gate only. No broker purchase or order submission.
export const FAST_ENTRY_WINDOW_MS = 15_000;
export const BASELINE_ENTRY_WINDOW_MS = 60_000;
export function evaluatePaperEntry(signal, nowMs, windowMs = FAST_ENTRY_WINDOW_MS) {
  if (!Number.isFinite(nowMs) || !Number.isFinite(windowMs) || windowMs <= 0 || windowMs > BASELINE_ENTRY_WINDOW_MS)
    return { action: 'SKIP', reason: 'INVALID_WINDOW' };
  if (!signal || !Number.isFinite(signal.startedAtMs) || signal.startedAtMs > nowMs)
    return { action: 'SKIP', reason: 'INVALID_SIGNAL' };
  if (nowMs - signal.startedAtMs >= windowMs)
    return { action: 'SKIP', reason: 'TIMEOUT' };
  if (signal.emergencyStop || signal.exposureExceeded)
    return { action: 'SKIP', reason: 'SAFETY_BLOCK' };
  if (signal.staleTick || signal.duplicateTick || signal.invalidTick)
    return { action: 'SKIP', reason: 'UNRELIABLE_TICK' };
  if (signal.conflictingIndicators || signal.negativeSignal || signal.weakSignal)
    return { action: 'SKIP', reason: 'UNFAVORABLE_SIGNAL' };
  if (signal.payoutAcceptable !== true || signal.riskChecksPassed !== true || signal.goldenRulePassed !== true)
    return { action: 'SKIP', reason: 'CHECKS_NOT_PASSED' };
  // Research observation only; NEVER a broker order authorization.
  return { action: 'PAPER_CANDIDATE', reason: 'ALL_CHECKS_PASSED' };
}
