# Deriv Complete Workflows — user-supplied implementation reference

Archived unchanged in ChatGPT Library: `/Trade Scheme FX/Deriv API/Deriv-Complete-Workflows-2026-11-23.txt`. Received 2026-11-23. The user-supplied document is a 337-line Deriv guide titled "Complete Workflows". Treat as reference pending validation against live API schema.

## New actionable integration facts

- REST base: `https://api.derivws.com`.
- New Deriv developer application registration is required for new APIs; legacy App IDs do not work.
- PAT REST requests: `Authorization: Bearer <PAT>` and `Deriv-App-ID: <APP_ID>`. OAuth REST requests: `Authorization: Bearer <JWT>`; Deriv-App-ID is not required for OAuth per guide. **Do not force a PAT header into OAuth requests.**
- OAuth authorization code with PKCE, cryptographic verifier/challenge and CSRF `state`; HTTPS callback URI must be whitelisted exactly including path. OAuth access tokens expire, and the guide says no refresh token is issued. Store tokens server-side and require new authorization when expired.
- Default demo account is created at signup; do not create another account just to connect.
- Account-scoped OTP REST request: `POST https://api.derivws.com/trading/v1/options/accounts/{accountId}/otp` with Bearer authorization. Response `data.url` is a one-use authenticated WebSocket URL, e.g. `wss://api.derivws.com/trading/v1/options/ws/demo?otp=...`. **Do not log, persist, expose in telemetry, or put the URL in a GitHub commit.**
- WebSocket endpoint selection is derived from account identity. **Explicitly verify Demo account type and reject Real URL before opening any Demo-only connection**; never blindly trust caller-supplied account IDs or URLs.
- Once authenticated, read-only `balance:1, subscribe:1` and `ticks:<symbol>, subscribe:1` subscriptions are documented. Proposal requests are price research, not purchases; keep `buy` and automation off until separate review.

## Integration order

1. Audit existing OAuth callback, encrypted token storage and account enumeration for PKCE, state, exact redirect URI, token expiry and Demo/Real separation.
2. Build server-side Demo-only OTP acquisition with strict account ownership checks, no-store, safe error handling and zero secret logging. Never make a real-account OTP request on a Demo route.
3. Connect Demo WS only from an explicitly authorized user session, subscribe to balance and ticks, handle disconnect/reconnect and invalid/expired OTP without repeated unintended actions.
4. Reuse the existing 300-tick public market monitor; keep public data and authenticated Demo account balances visually distinct.
5. Add tests for OAuth vs PAT headers, Demo account gating, OTP response validation and sensitive data redaction.
6. CI, Vercel preview and signed-in smoke tests before any production change. Broker orders, transfers, balance resets and Real trading remain disabled.

## Documentation caveat

The pasted guide's example uses `console.log('Authenticated WebSocket URL:', wsUrl)`, which would leak a sensitive OTP. **Do not copy this line.** Its sample OAuth flow includes client-side token handling; our production implementation must keep tokens server-side as the guide's security section recommends.
