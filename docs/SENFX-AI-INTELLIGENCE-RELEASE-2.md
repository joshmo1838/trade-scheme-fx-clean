# SENFX AI Intelligence Suite — Release 2 (paper-only)

Status: isolated development; NOT approved for merge or deployment.
Base production-release SHA: cb568243635d9c997ea0e413eb1ab1fe5a54ae76

## Modules
1. AI Strategy Scientist — rule-traceable explanations, out-of-sample validation and calibrated uncertainty.
2. Multi-Bot Intelligence Center — 15 strategies evaluated on identical timestamped tick sequences.
3. Market Time Machine — deterministic historical replay without future-data access.
4. Risk Guardian — fail-closed local exposure, consecutive-loss, stale-data and emergency-stop controls.
5. Smart Entry Engine — sequential selective-entry paper observations only.

## Smart Entry contract
- Maximum 10 sequential hypothetical next-tick observations per batch, never concurrent orders.
- Require research quality score >= 75/100 before each observation. This is NOT a 75% win probability.
- Wait at most 60 seconds for each qualifying signal; on timeout, record skipped/no-entry and stop or advance only according to explicitly tested policy. Never force an entry.
- Reject stale, duplicate, out-of-order, invalid and non-finite ticks; fail closed if timestamps cannot be trusted.
- Enforce user-visible batch exposure cap, per-observation hypothetical stake cap and emergency Stop before recording new observations.
- Show every rejection reason and retain local-only audit history. No broker calls, Deriv buy/sell APIs, token handling, server workers, database writes or enrollment.
- Use causal features only: at tick t, decision may use ticks <= t; outcome uses subsequent tick and cannot influence the decision.
- Verify research scores against held-out data, adequate samples and a random-entry baseline. When no validated edge exists, show “No verified edge — waiting.”

## Build sequence
1. Inspect existing tick feed, browser-local paper bot utilities and tests.
2. Implement pure tick validation + deterministic fixtures with zero network side effects.
3. Add Smart Entry state machine with 60-second clock abstraction, 10-run cap, stop and exposure tests.
4. Add Scientist explanations and identical-tick multi-bot comparisons.
5. Add replay engine and Risk Guardian integration.
6. Build responsive dark-navy/blue/green dashboards under /intelligence/.
7. Run tests and open draft PR only; no merge/deploy without separate approval and Release 1 verification.

## Acceptance tests
- Exactly 10 or fewer completed observations; no forced entry at timeout.
- Each observation follows a qualifying score and fresh, unique tick.
- Stale, duplicate and out-of-order ticks never produce an entry.
- Emergency Stop blocks any further observation.
- Exposure cap cannot be exceeded, including on restart or repeated events.
- Replay is deterministic and has no look-ahead leakage.
- No broker-order endpoint, credentials, production database changes or background execution.
- Existing /bot-library, /digit-matrix, /bot-research and /strategy-lab remain unaffected.

Do not merge this branch into main, deploy a preview or modify the approved Release 1 SHA without separate authorization.
