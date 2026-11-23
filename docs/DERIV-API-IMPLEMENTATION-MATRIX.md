# Deriv API integration matrix — Trade Scheme FX 3.0

Updated 2026-11-23. This is an implementation *tracking inventory*, **not** evidence that every endpoint is currently supported, integrated, tested or authorized. Recheck each official reference against the live Deriv documentation and product updates before writing a client. Unknown transport/scope/limits are deliberately marked **VERIFY**, never guessed.

## Mandatory verification and status fields
For every row: reference URL; transport (REST/WS); current/legacy/deprecated; OAuth scope and authentication; request/response schema; eligible account types; rate/subscription limits; user consent; security; code owner; mock/integration tests; preview SHA; production SHA. A blank or VERIFY field is a release blocker for that feature, not for independent safe work.

Official documentation entry points:
- https://developers.deriv.com/
- https://developers.deriv.com/docs/intro/api-overview/
- https://developers.deriv.com/docs/intro/authentication/
- https://developers.deriv.com/docs/intro/oauth/
- https://developers.deriv.com/docs/options/
- https://developers.deriv.com/docs/automation/
- https://developers.deriv.com/docs/limits/
- https://developers.deriv.com/product-updates/
- https://developers.deriv.com/comparison/

| Category | Candidate operations requiring endpoint verification | Classification | Default enablement | Verified code/test status |
|---|---|---|---|---|
| OAuth and account setup | Get accounts, create account, Demo balance reset, public/Demo/Real WebSocket | Core account | Read-only until scopes and account type verified; reset requires confirmation | VERIFY |
| Legacy migration | Migration status, legacy accounts, statements, schema/field comparison | Legacy compatibility | Adapter only, no destructive migration | VERIFY |
| Account management | Nickname, balance, portfolio, profit table, statement, transaction | Customer account | Authenticated read-only first | VERIFY |
| Market data | Active symbols, contracts for, contracts list, ticks, ticks history, trading times | Core market | Public read-only, validate freshness and rate limits | VERIFY |
| Trading | Proposal, buy, sell, proposal open contract, contract update, update history, cancel, bulk purchase | Restricted broker operation | Proposal read-only first; all buys OFF pending Demo gates; bulk OFF | VERIFY |
| Automation | Auto list strategies, start, get, list, pause, resume, stop | Core/optional depending on strategy compatibility | Discovery only; execution OFF pending independent Demo gates | VERIFY |
| Subscriptions | Forget, forget all | Core transport | Subscription ownership and cleanup safeguards | VERIFY |
| System | Ping, time, trading times, health, workflows, limits, best practices | Core reliability | Read-only diagnostics | VERIFY |
| Wallet | List wallets, wallet transactions, exchange rate, validate transfer, wallet/cross-currency/platform transfers | Restricted financial operation | Read-only first; transfers OFF | VERIFY |
| Payment agent | List/get agent, statistics, client settings, update settings, deposit transfer/status, withdrawal code/withdraw/status | Partner-only/restricted | Read-only eligibility first; all money movements OFF | VERIFY |
| Partners/markup | Analytics overview, check client tags, markup statistics, commission eligibility | Partner-only | Markup OFF; requires eligibility, approval and customer disclosure | VERIFY |

## Release invariants
- Preserve 15 original strategy identifiers and behaviors; never map them silently to a different Deriv Automation strategy.
- Verify selected account with broker evidence; **unknown account type must remain UNVERIFIED**, not inferred Real or Demo.
- Real-money execution permanently OFF until separately authorized. Demo broker purchases OFF until verified consent, permissions, emergency stop, exposure limits, atomic idempotency/concurrency and reconciliation tests.
- No Demo reset without direct confirmation. No payment, withdrawal, transfer, customer settings mutation or markup without separate approval.
- Unknown/expired proposals fail closed; do not retry a purchase with uncertain broker outcome.
- Keep existing production SHA and restore evidence before merging. Preview READY does not prove functional or production readiness.

## Baselines / reconciliation checkpoint
- Production main rollback SHA: `cfe0146052a5e6e902f119ea1ac99d92ac4339c5`.
- Consolidated 3.0 branch: `feature/trade-scheme-fx-3-unified-workspace-20261123`, previously at `105451ae9527da91b6617000f4b9ad0941d082e0`.
- AI branch `feature/senfx-ai-intelligence-suite` was 64 ahead and 122 behind main at this check; **do not merge blindly**.
- The account-type display safeguard was committed on the 3.0 branch; its preview was READY. This is not an end-to-end account or Demo execution test.

## Next engineering steps
1. Verify official endpoint schema, auth scopes, limits, account eligibility and availability row by row.
2. Map existing code and tests to each row, separating production, preview, mock and not implemented.
3. Reconcile isolated AI changes selectively; add regression tests for all 15 strategies.
4. Implement validated shared public tick feed, subscription lifecycle and offline research fixtures.
5. Verify independent Demo safety gate and database restore before any execution enablement or production merge.

## Verified live documentation checkpoint — 2026-11-23

The following endpoint identities and authentication metadata were retrieved from the live official Deriv API endpoint index. This **does not** validate field-level schemas, rate limits, runtime behavior or account eligibility. Keep all broker execution OFF.

| Endpoint | Official page | Transport | Auth documented | Scope documented | Current integration status |
|---|---|---|---|---|---|
| ticks | https://developers.deriv.com/llms/ticks.md | WS | No | None | Research feed exists; end-to-end live compatibility VERIFY |
| ticks_history | https://developers.deriv.com/llms/ticks-history.md | WS | No | None | Historical adapter compatibility VERIFY |
| forget | https://developers.deriv.com/llms/forget.md | WS | No | None | Subscription cleanup implementation VERIFY |
| forget_all | https://developers.deriv.com/llms/forget-all.md | WS | No | None | Must never unsubscribe other consumers accidentally; implementation VERIFY |
| proposal | https://developers.deriv.com/llms/proposal.md | WS | No | None | Research-only price discovery; request schema VERIFY |
| proposal_open_contract | https://developers.deriv.com/llms/proposal-open-contract.md | WS | Yes | trade | Auth metadata from reviewed pinned reference; schema and runtime VERIFY |

For all six endpoints: request/response schema = VERIFY; rate limits = VERIFY; account eligibility = VERIFY; production release = NOT VERIFIED. A public proposal does not grant permission to buy. No financial operations are authorized by this checkpoint.
