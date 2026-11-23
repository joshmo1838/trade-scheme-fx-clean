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


## Consolidated preview verification — 2026-11-23 09:07 CST

- Latest observed Vercel preview deployment: `dpl_AJhEuA66Y6ZLZgNwrh72Yh9mfBCh`, READY, commit `d89e2a16304839ab3b60fb7f2e5d0216fdaf03f2`. READY is build/deployment status only; OAuth callback and customer session are **not** end-to-end verified.
- Consolidated branch was **84 commits ahead and 2 behind** `main` at this audit; `main` comparison base SHA `85353d9988ea5af2d3870601411e0e4e7b56cd46`. This divergence blocks an unreviewed merge.
- Existing Deriv-first routes: `app/api/auth/deriv/start/route.ts` and `app/api/auth/deriv/callback/route.ts`. PKCE/state logic present, but current session issuance calls `createSessionClient().auth.verifyOtp()` and then constructs a separate redirect response. **Cookie persistence on that redirect has not been verified**; investigate and test before enabling `DERIV_FIRST_LOGIN_SESSION_ENABLED`.
- Deriv OAuth first-login redirect is enabled **on the isolated 3.0 preview branch only**; customer-session issuance remains disabled. Preview callback URI must be registered exactly in the Deriv application before completing an OAuth round trip. Do not mistake an enabled redirect for a working login.
- Vercel preview configuration uses an existing centrally configured `DERIV_CLIENT_ID`; its validity, Deriv application permissions and redirect registration remain unverified. No secrets were read or modified in this audit.
- Supabase project inventory returned two ACTIVE_HEALTHY projects; this is **not** proof of schema correctness, backup completeness or a successful restore. No database writes performed.
- Release gate remains CLOSED pending complete identity/session isolation tests, CI evidence, 15-strategy regression, database backup/restore proof and production smoke tests. No broker orders, balance resets, markup or financial transfers authorized by this checkpoint.

## Consolidated release audit — 2026-11-23 14:06 CST

- GitHub comparison `main...feature/trade-scheme-fx-3-unified-workspace-20261123`: **89 ahead / 2 behind**, status **diverged**. Current `main` comparison SHA: `85353d9988ea5af2d3870601411e0e4e7b56cd46`; merge base: `cfe0146052a5e6e902f119ea1ac99d92ac4339c5`. Do not conflate the merge base with the latest main/production SHA.
- Vercel 3.0 preview `dpl_GzGZCK7M55DH5E8R4zLhwDaA3qxE` was **READY** at `fae079f8fa83f783f927f424307b875fb65e22c9` (duplicate OAuth callback parameter rejection). Preview URL: https://trade-scheme-fx-clean-git-feature-trade-scheme-f93bf6-tradesche.vercel.app . This is **not** proof of functional OAuth, CI, or production readiness.
- Reviewed `app/api/auth/deriv/start/route.ts`: it checks exact HTTPS callback origin/path, issues a PKCE S256 challenge and state, and uses short-lived HttpOnly cookies. These are static code observations; the Deriv authorization endpoint, scope, registered callback and browser round-trip must be checked against current official documentation and real staging behavior before enabling session issuance.
- The matrix remains a **candidate inventory**, not a completed endpoint-by-endpoint schema certification. Unverified endpoints, rate limits, account eligibility and scope are blockers for their respective integrations. Preserve all 15 original strategies and independent release gates.
- No production merge, trading operation, reset, wallet/payment transfer, markup change, database mutation, or secret rotation was performed in this audit.

## Preview OAuth redirect HTTP checkpoint — 2026-11-23 15:05 CST

- Verified the live branch-stable preview `/api/auth/deriv/start` via authenticated Vercel fetch: HTTP **307** with `Cache-Control: no-store`, redirecting to `https://auth.deriv.com/oauth2/auth` with authorization-code response type, PKCE S256 challenge, nonempty state, `account_manage` scope and exact branch-stable callback URI. This is direct HTTP behavior, not merely a build result.
- The redirect therefore **does leave Trade Scheme FX for Deriv** at the start endpoint. Whether the UI login control actually targets this endpoint, whether Deriv accepts the app registration and callback, and whether an authenticated browser returns with a verified customer session remain **UNVERIFIED**.
- Preview deployment `dpl_AZ17qcfkA2TYkLowT2nd5EtXymeE` was READY at commit `efb208c9debb4155692eb6b92d4b2ec4e6bd65c7`; `main` and the consolidated branch remain diverged (**90 ahead / 2 behind**) as of this checkpoint. Main comparison SHA `85353d9988ea5af2d3870601411e0e4e7b56cd46`; merge base `cfe0146052a5e6e902f119ea1ac99d92ac4339c5`.
- Never log OAuth state, authorization code, access tokens or full authorization URLs in user-facing reporting. Keep session issuance OFF and strict production release gate CLOSED pending browser round-trip, account-isolation tests, backup/restore proof and strategy regression.
