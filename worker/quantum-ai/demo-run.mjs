import { prepareQuantumDemoCandidate } from './demo-candidate.mjs';

/**
 * Coordinates one worker attempt. The ledger owns lease, account, version and
 * session-limit checks. A recorded attempt must survive a worker restart.
 */
export async function runQuantumDemoAttempt({ run, ticks, now = Date.now(), ledger, broker, validateEntry }) {
  if (run.accountType !== 'demo' || run.currency !== 'USD') return 'DEMO_ACCOUNT_REQUIRED';

  const candidate = prepareQuantumDemoCandidate(run.botId, ticks, now);
  if (!candidate) return 'NO_FRESH_SIGNAL';
  if (!(await ledger.canQuote(run))) return 'RUN_NOT_ACTIVE';

  if (!(await broker.supports(run.accountId, candidate.contract))) return 'CONTRACT_UNAVAILABLE';
  const quote = await broker.quote(run.accountId, candidate.contract, run.stake);
  if (!(await validateEntry({ run, candidate, quote }))) return 'ENTRY_REJECTED';

  // The ledger must atomically bind the quote to this account, bot, signal,
  // stake and control version and persist the unknown-buy marker before return.
  const attempt = await ledger.arm({ run, candidate, quote });
  if (!attempt) return 'RESERVATION_REJECTED';

  try {
    const receipt = await broker.buy(run.accountId, quote);
    return await ledger.reconcile(attempt, receipt) ? 'SETTLED' : 'RECONCILIATION_REQUIRED';
  } catch {
    return 'RECONCILIATION_REQUIRED';
  }
}
