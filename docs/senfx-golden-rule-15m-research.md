# SENFX Golden Rule: 15-million-observation forward study

## Scope and reporting

The target is **1,000,000 prospective PAPER observations for each of 15 original SENFX bots**, or **15,000,000 total**. None is a purchased Deriv contract. Never imply that target is already complete unless server-stored checkpoints demonstrate it. All original bot signals, markets, contracts and 10X Deriv Demo execution controls remain unchanged. Real-money trading stays OFF.

## Research architecture

- The Golden Rule research engine scores only future contiguous verified public ticks, using a future five-minute horizon for directional profiles. Missing, duplicated, stale and replayed observations are discarded. Five-minute profiles are not broker-aligned and remain ineligible for execution conclusions.
- The Golden Rule statistical test freezes the first million samples per bot. A 95%-familywise multiple-comparison-adjusted conservative Wilson bound must exceed live Deriv quote break-even by 2 percentage points. This is a research filter, not proof of a future winning contract.
- The separate no-buy collector is default-OFF unless the dedicated environment flag SENFX_GOLDEN_RESEARCH_ENABLED=true is set on a NEW service. It never connects to a broker account, holds a trading token, or calls buy.
- The additive separate research SQL schema supports RLS, service-only durable monotonic checkpointing, and an exclusive leased collector. It stores 15 aggregate rows per checkpoint, not millions of raw price observations.
- The dedicated admin-only progress API and Golden Rule web screen distinguish durable server checkpoints from volatile phone-only preview results. No purchase or automatic bot strategy change is authorized.

## Capacity and timing

One million paper observations at one eligible event every 10 seconds require **approximately 116 days**, plus gaps and skipped signals. One million non-overlapping five-minute observations require **about 9.5 years**, plus missed signals and market interruptions. Historical backtesting can process data faster but is retrospective, NOT one million genuine prospective live observations.

Never overlap correlated signals to fake independent proof, backfill missed observations as if collected live, simulate fake Deriv prices, or claim real profits from paper outcomes.

## Required release safeguards

1. Confirm the exact dedicated research Docker image builds, and exits with zero DB or network traffic when the research enable flag is unset.
2. Run both Golden Rule statistical and isolated infrastructure test suites, plus the disposable PostgreSQL lease/RLS/checkpoint tests.
3. Complete the strict production backup/restore release gate BEFORE applying any new production database migration.
4. Create a separate, single-replica, always-on Railway research service only after the owner explicitly accepts any incremental compute costs. Never reuse or modify the existing live Deriv Demo broker worker.
5. Assign only private Supabase URL and service-role credentials to the server worker; never leak them to the client or repository. Enable research only on the dedicated service.
6. Verify read-only admin progress, exclusive lease, checkpoint monotonicity and zero broker orders.
7. No connection from research verdicts to broker buys without a separate reviewed release and explicit owner authorization.

During operation, a lost lease, malformed feed or missing checkpoint must stop the collector without making up data. A favorable million-sample research result cannot guarantee a profitable Deriv contract.
