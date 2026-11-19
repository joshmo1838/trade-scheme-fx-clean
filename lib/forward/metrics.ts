/** Read-only arithmetic for the SENFX R100 forward PAPER study.
 * Each +1/-1 is a directional research score, NOT a Deriv payout.
 * Fail closed on mismatched or duplicated outcomes rather than invent metrics.
 */
export type ForwardTradeRecord = {
  signal_epoch: number;
  outcome: string;
  pnl_r: number | string;
  direction: string;
  closed_at: string;
};
export type ForwardMetrics = {
  count: number;
  wins: number;
  losses: number;
  hitRate: number | null;
  netScoreR: number;
  maxDrawdownR: number;
  longestLossStreak: number;
  curve: ReadonlyArray<{ index: number; scoreR: number }>;
};
export function summarizeForwardTrades(rows: readonly ForwardTradeRecord[]): ForwardMetrics {
  if (rows.length > 200) throw new Error("Forward study exceeds its 200-row limit.");
  let wins = 0, losses = 0, score = 0, peak = 0, drawdown = 0;
  let lossStreak = 0, maxLossStreak = 0;
  const seen = new Set<number>();
  const curve = [{ index: 0, scoreR: 0 }];
  for (let i = 0; i < rows.length; i++) {
    const trade = rows[i];
    const r = Number(trade.pnl_r);
    if (!Number.isSafeInteger(trade.signal_epoch) || trade.signal_epoch <= 0 ||
        seen.has(trade.signal_epoch) ||
        !["CALL", "PUT"].includes(trade.direction) ||
        !Number.isFinite(Date.parse(trade.closed_at)) ||
        !((trade.outcome === "WIN" && r === 1) ||
          (trade.outcome === "LOSS" && r === -1))) {
      throw new Error("Inconsistent forward-test record. Metrics withheld.");
    }
    seen.add(trade.signal_epoch);
    if (r === 1) { wins++; lossStreak = 0; }
    else { losses++; lossStreak++; maxLossStreak = Math.max(maxLossStreak, lossStreak); }
    score += r;
    peak = Math.max(peak, score);
    drawdown = Math.max(drawdown, peak - score);
    curve.push({ index: i + 1, scoreR: score });
  }
  return {
    count: rows.length, wins, losses,
    hitRate: rows.length ? wins / rows.length * 100 : null,
    netScoreR: score, maxDrawdownR: drawdown,
    longestLossStreak: maxLossStreak, curve,
  };
}
