/**
 * Check the database's paper reservation ledger against local process memory.
 * This is a PURE decision helper: it never performs a broker or DB transaction.
 * An unknown/contradictory ledger fails closed; it cannot authorize a trade.
 */
export type OpenPaperPosition = { id: string; status: string };
export type PaperPositionReconciliation = {
  safe: boolean;
  openPosition: boolean;
  changed: boolean;
};

export function reconcilePaperPosition(
  previouslyOpen: boolean,
  records: readonly OpenPaperPosition[]
): PaperPositionReconciliation {
  if (!Array.isArray(records) || records.length > 1 ||
      records.some(row =>
        row == null || typeof row.id !== "string" ||
        row.id.length === 0 || row.status !== "open")) {
    return { safe: false, openPosition: true, changed: false };
  }
  const authoritativeOpen = records.length === 1;
  return {
    safe: true,
    openPosition: authoritativeOpen,
    changed: previouslyOpen !== authoritativeOpen,
  };
}
