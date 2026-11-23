# Deriv-first login: identity and session release gate

## Confirmed
- Existing /api/deriv/connect and callback use PKCE/state and require a signed-in Supabase user.
- Existing /dashboard and /admin are protected by Supabase sessions.
- Deriv's options accounts endpoint returns trading `account_id` values; this is **not** a verified unique Deriv person identity.
- Never use a Deriv trading account ID, unverified email, or a browser-supplied identifier to silently select an existing Supabase user.

## Required before implementation or merge
1. Confirm an official Deriv endpoint that provides a stable, unique user subject after OAuth, including its request and response schema and scope.
2. Design a server-owned identity mapping table with a unique `(provider, provider_subject)` constraint, audit logging, and explicit linking for existing Supabase users. No automatic linking by email.
3. Select and review a supported Supabase authentication mechanism that issues a genuine Supabase session only for a verified, linked identity; do not manufacture access/refresh tokens or use the service-role key as a customer session.
4. Use state, PKCE, expiry, nonce/replay protection, and short-lived HTTP-only secure cookies for the Deriv OAuth callback.
5. Handle denial, token exchange failure, no verified identity, duplicate account, stale state, logout, and expired session without logging secrets.
6. Verify new-user, returning-user, existing-user-linking, cross-account isolation, admin isolation, mobile redirect, and regression tests.
7. Keep the original login as fallback and retain the existing homepage artwork, market ticker, 15 bots, and broker trading safeguards.
8. Require successful CI, preview checks, backup/restore readiness, and release approval before production cutover.

## Current implementation status
The first-login identity guard and tests are an isolated research slice, **not a complete authentication flow**. It must not be wired to a production callback until the above gates are met.

## Verified development checkpoint (2026-11-23)
- GitHub SENFX validation completed successfully for commit `823ffb084f197116ce05f2e404045002e8b8ebb2`.
- The configured workflow's success does not establish that the new `test:deriv-login-guard` script was executed; check the workflow job steps or run the script explicitly before claiming its test cases passed.
- Deriv's documented `GET /trading/v1/options/accounts` provides `account_id` values and is unsuitable as the stable user identity needed for a login bridge.
- Until the provider exposes a verified stable user identifier and a supported Supabase session mechanism is implemented, do not enable Deriv-only login or merge this draft as an authentication feature.
