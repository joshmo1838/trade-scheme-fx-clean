/**
 * Demo-only public market-feed recovery.
 * A reconnect ALWAYS discards old candidate ticks and never repeats a broker buy.
 * No broker credentials, network access, trading actions or loss-limit changes.
 */
export const DEMO_FEED_RECOVERY = Object.freeze({
 maxRecoveries: 4,
 maxSearchMs: 900_000,
 baseDelayMs: 1_000,
 maxDelayMs: 8_000,
});
export function decideDemoFeedRecovery({elapsedMs,reconnectsUsed,buyAttemptStarted,emergencyStopped}={}) {
 const stop=(reason)=>({action:"stop",reason,delayMs:0});
 if (emergencyStopped!==false) return stop("Emergency Stop or an inactive session prevents feed restart.");
 if (buyAttemptStarted!==false) return stop("A Demo purchase may have been submitted. Reconcile; never retry.");
 if (!Number.isFinite(elapsedMs)||elapsedMs<0||!Number.isInteger(reconnectsUsed)||reconnectsUsed<0)
  return stop("Invalid recovery clock or attempt count.");
 if (elapsedMs>=DEMO_FEED_RECOVERY.maxSearchMs)
  return stop("The bounded 15-minute signal scan expired without a trade.");
 if (reconnectsUsed>=DEMO_FEED_RECOVERY.maxRecoveries)
  return stop("Public market feed could not recover after 4 bounded reconnects.");
 return {
  action:"reconnect",
  delayMs:Math.min(DEMO_FEED_RECOVERY.maxDelayMs, DEMO_FEED_RECOVERY.baseDelayMs*2**reconnectsUsed),
  reason:"RESET_HISTORY_AND_RESTART_PUBLIC_FEED_ONLY",
 };
}
