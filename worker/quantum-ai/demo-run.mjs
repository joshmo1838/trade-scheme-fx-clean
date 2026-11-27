import { STRATEGIES } from '../../lib/quantum/strategy-catalog.mjs';
import { demoExecutionReadiness, demoQuoteExpectedValue } from '../../lib/quantum/demo-execution-eligibility.mjs';
import { prepareQuantumDemoCandidate } from './demo-candidate.mjs';

/**
 * Coordinates one worker attempt. The ledger owns lease, account, version and
 * session-limit checks. A recorded attempt must survive a worker restart.
 */
export async function runQuantumDemoAttempt({ run, ticks, now = Date.now(), ledger, broker, validateEntry }) {
  if (run.accountType !== 'demo' || run.currency !== 'USD') return 'DEMO_ACCOUNT_REQUIRED';

  const candidate = prepareQuantumDemoCandidate(run.botId, ticks, now);
  if (!candidate) return 'NO_FRESH_SIGNAL';

  const strategy = STRATEGIES.find(item => item.id === run.botId);
  const configuration = {
    marketSymbol: run.marketSymbol || candidate.contract.underlying_symbol || 'R_100',
    currency: run.currency,
    contractFamily: run.contractFamily || candidate.contract.contract_family || 'OPTIONS',
    contractType: candidate.contract.contract_type,
    duration: candidate.contract.duration ?? null,
    durationUnit: candidate.contract.duration_unit ?? null,
    barrier: candidate.contract.barrier ?? null,
    multiplier: candidate.contract.multiplier ?? null,
  };
  const readiness = demoExecutionReadiness(strategy, configuration);
  if (!readiness.allowed) return readiness.code;

  if (!(await ledger.canQuote(run))) return 'RUN_NOT_ACTIVE';
  if (!(await broker.supports(run.accountId, candidate.contract))) return 'CONTRACT_UNAVAILABLE';

  const quote = await broker.quote(run.accountId, candidate.contract, run.stake);
  const economics = demoQuoteExpectedValue(readiness, quote);
  if (!economics.allowed) return economics.code;
  if (!(await validateEntry({ run, candidate, quote, economics }))) return 'ENTRY_REJECTED';

  // The ledger must atomically bind the quote to this account, bot, signal,
  // stake and control version and persist the unknown-buy marker before return.
  const attempt = await ledger.arm({ run, candidate, quote, economics });
  if (!attempt) return 'RESERVATION_REJECTED';

  try {
    const receipt = await broker.buy(run.accountId, quote);
    return await ledger.reconcile(attempt, receipt) ? 'SETTLED' : 'RECONCILIATION_REQUIRED';
  } catch {
    return 'RECONCILIATION_REQUIRED';
  }
}
