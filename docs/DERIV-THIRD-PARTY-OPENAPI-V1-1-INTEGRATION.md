# Deriv Third Party API v1.1.0 — user-supplied integration register

Source: User-uploaded OpenAPI 3.1 specification, archived in ChatGPT Library at `/Trade Scheme FX/Deriv API/Deriv-Third-Party-OpenAPI-v1.1.0-2026-11-23.md`. Snapshot received 2026-11-23. This is reference material, not proof of currently available production endpoints.

Inventory: 32 paths, 34 GET/POST/PATCH operations. API host not defined in the supplied spec; do not guess REST base URL. Existing Deriv public tick WS remains independently implemented. Every new authenticated operation requires confirmation against current official Deriv docs, live schema, scopes, account type and consent.

## Apply in phases without replacing existing 15 bots

1. **Read-only public market data**: `GET /trading/v1/options/ws/public`. Already used for browser public ticks; validate streaming message schemas, stale/duplicate/out-of-order handling, reconnect, and session 300-tick visualization. No broker orders.
2. **Account-scoped Demo connection**: `GET /trading/v1/options/accounts` (OAuth `trade`), `POST /trading/v1/options/accounts/{accountId}/otp` (OAuth `trade`), `GET /trading/v1/options/ws/demo` (one-time OTP). OTP is short-lived (spec says 120 seconds), one-use and secret: generate server-side, never persist/log or display URL. Verify the authenticated account is Demo before connecting; preserve user account isolation.
3. **Broker Demo execution**: User-supplied spec describes `POST /trading/v1/options/contracts/bulk-purchase/demo`, with per-account PAT and up to 100 accounts. **NOT APPROVED FOR EXECUTION**; this is not a replacement for 15 distinct bot strategies, and PAT-based multi-account purchasing is not equivalent to a user-scoped OAuth Demo socket. Requires separate reviewed design, explicit account-specific consent, verified scopes, limits, idempotency, reconciliation, emergency stop, dry-run and audited test before enabling.
4. **Account and history**: `GET /trading/v1/options/legacy/accounts`, `GET /trading/v1/options/legacy/statement`, `GET /trading/v1/options/legacy/migration-status`. Legacy only, deprecated; do not assume available for new accounts. Demo balance reset `POST /trading/v1/options/accounts/{account_id}/reset-demo-balance` remains disabled until explicit confirmation.
5. **Business/reporting**: `GET /applications/v1/markup-statistics`, `GET /partners/analytics/v1/overview`, `POST /partners/client-tags/check`, `GET /v1/health`. Restricted by partner/application scopes or availability; implement separately if verified.
6. **Financial operations**: `/payment-agents/v1/*` and `/wallet/v1/*` include money movement and account-sensitive endpoints. Inventory only, **no transfers/withdrawals** without specific user authorization and independent release review.

## Release gates

- Never commit PATs, OAuth access tokens, OTP URLs, account identifiers, or user personal information.
- Do not infer a working endpoint from a schema file; no unverified broker purchases, real-money actions, balance resets or money transfers.
- Preserve existing production and pending release gates; use development PR, CI, preview and account-scoped smoke tests before any merge.
- UI must distinguish public ticks, hypothetical paper simulation, authenticated Demo transactions and Real transactions. Do not advertise guaranteed returns.
