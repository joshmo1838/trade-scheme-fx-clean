# SENFX One Pull Full Build Plan

## Product decisions (locked)
- Brand: Trade Scheme FX / SENFX.
- Free access: all registered customers can use every bot, including the Premium category. No subscription, paid tier, paywall, recurring billing, checkout, or payment gateway.
- Customers connect their own Deriv accounts.
- Responsive web app first; native mobile app is deferred.
- Initial trading mode is paper simulation and/or Deriv demo only after the relevant flow is explicitly integrated and tested.
- Real-money order execution remains disabled throughout this build.

## Current repository baseline
The consolidated PR includes the customer workspace redesign, visual strategy builder, configurable rule blocks, validation panel, and a browser-local paper simulator. The paper simulator uses public tick data and an illustrative 1:1 win/loss model; it is not a Deriv demo contract and does not use the customer's account balance or place orders.

## Workstreams and dependency order

### A. Foundation and access
- Audit authentication, Supabase schema/RLS, server routes, account isolation, environment variables, domain/OAuth callback configuration.
- Establish a single navigation map and consistent responsive shell.
- Ensure all bot catalogue entries and tools are accessible without payment checks.
- Add automated checks for unauthenticated access and customer data isolation.

### B. Customer workspace and Deriv connection
- Dashboard, profile, connection status, account selector and market feed.
- Keep Deriv access tokens server-side, encrypted at rest, never returned to browser or logs.
- Verify OAuth state/PKCE, callback URL, expiry, disconnect/reconnect and account selection.

### C. Strategy studio
- Visual block builder, typed strategy schema, validation, import/export and account-backed draft persistence.
- Validate supported markets/contracts/parameters and clearly mark unsupported blocks.
- Paper simulator uses only public ticks and a disclosed illustrative payout model.
- Separately integrate actual Deriv demo contracts only after contract proposal/buy/sell flows, API permissions, balance handling, idempotency and failure recovery are verified.

### D. Trading tools
- Manual trading: safe order ticket UI; no order endpoint until approved demo integration exists.
- Bulk trader: bounded batch preview and confirmation; no unbounded loops.
- Digit tools and analysis: deterministic calculations with documented inputs.
- Signal scanner and Volt AI: data-backed explanations; no invented signals or profit promises.
- Hedging and copy trading: simulation/analysis first; no unattended order replication in this release.

### E. Bot catalogue and management
- Free and Premium-labelled catalogue categories, both equally accessible.
- Bot detail pages, strategy configuration, user-owned selections, history and performance reporting.
- Performance labels distinguish simulated, demo, and verified live records.
- No bot may claim verified profitability without reproducible, sourced performance evidence.

### F. Admin and operations
- Admin-only user, bot publication, support and operational views.
- Server-side role checks; never trust client-supplied admin flags.
- Audit events for sensitive changes, rate limiting, safe error handling and observability.

## Quality gates before production
1. Install dependencies reproducibly and run TypeScript checks, lint (if configured), and production build.
2. Unit-test strategy validation, contract lifecycle state, limits, and P/L calculations.
3. Integration-test Supabase RLS and customer isolation with at least two test users.
4. Test OAuth state/PKCE, encrypted token storage, expiry and disconnect.
5. Test market feed reconnect and stale-data handling.
6. Test simulator with deterministic tick fixtures; label its payout assumptions.
7. Test accessibility, responsive layouts, empty/error/loading states and navigation.
8. Verify no payment/subscription gate exists.
9. Verify no real-money order path is enabled.
10. Review Vercel Preview end-to-end before merging.

## Release definition
A feature is complete only when its UI, backend behavior, authorization, error states, automated tests and documentation are implemented. A placeholder screen is not a completed feature. The integrated PR remains draft until all agreed release gates pass.


## Implemented milestone: account-backed strategy drafts
- Authenticated strategy APIs provide customer-owned create, list, update and delete operations.
- The customer_strategies table uses Supabase row-level security to isolate customer data.
- Server-side validation and a 64 KB request limit protect strategy storage.
- Visual Bot Builder can save and reload account-backed drafts across signed-in devices after applying the SQL migration.
- Browser-local save and JSON export remain available.
- Saving a strategy does not execute orders; real-money execution remains disabled.

## Implemented milestone: persistent daily paper-risk enforcement
- Added a server-maintained daily gross-loss ledger per customer and bot, keyed to the UTC calendar date.
- Each simulated paper position reserves its full configured stake before opening; a PostgreSQL row lock serializes reservations across browser tabs and devices.
- The API obtains fresh public Deriv entry and exit quotes server-side; browser-submitted prices are not treated as authoritative.
- Server-side settlement calculates the illustrative paper result from the reserved entry, direction, verified exit quote and stake, writes the customer-owned paper trade, releases the reservation and updates daily gross losses.
- New entries are rejected if the realized gross loss plus outstanding reserved exposure plus the next stake would exceed the effective daily cap.
- Wins do not replenish the loss budget. A cap decrease takes effect immediately; a cap increase cannot loosen the in-progress UTC day.
- Added authenticated server endpoints for daily risk status, reserve, settle and cancel; database write functions are executable only by the server service role.
- Bot Center history now reads persisted paper trade rows instead of session-only local state.
- Manual Supabase migration is required: `supabase/senfx-paper-risk-controls.sql`.
- Real-money and Deriv demo order execution remain disabled. The paper model is still illustrative and uses a simplified 1:1 outcome assumption.

## Verification still required
- Apply the risk migration in the target Supabase project.
- Verify the Vercel Preview has the server-only `SUPABASE_SERVICE_ROLE_KEY` environment variable.
- Test loss-limit enforcement, concurrent reservations, refresh persistence, customer isolation, and the 00:00 UTC reset using test accounts.
- A successful TypeScript/build pipeline does not replace Supabase integration tests or paper-model validation.

## Implemented milestone: Deriv Demo execution foundation (manual Phase 1)

- Added an authenticated server route that issues a Deriv OTP URL only for the customer's selected active Demo account. The returned URL is validated to the Deriv Demo WebSocket path; the Real endpoint is never returned.
- Added a manual Demo trading console at `/demo-trading` for a fixed 10 account-currency-unit, five-minute Rise/Fall proposal.
- The customer reviews a fresh Deriv proposal and manually confirms each purchase. The app reserves the full stake against a 20 account-currency-unit per-account daily loss cap before sending a buy.
- A server-side order record tracks quote, reservation, contract ID, and status. The server verifies the newly purchased contract and retrieves final contract P/L from Deriv before updating the loss ledger.
- Added a per-customer, per-Demo-account UTC daily gross-loss ledger. It allows one active contract at a time, reserves the full stake, does not replenish the loss budget after wins, and retains reserved risk after ambiguous purchase responses.
- The account selector now allows only active Demo accounts for SENFX Demo execution. Real account selection is blocked in this workflow.
- OAuth redirect URI and site URL are environment-configurable for Production and Preview. The OAuth request now asks only for the `trade` scope.
- Required migration: `supabase/senfx-deriv-demo-execution.sql`.
- Required secrets and flags are documented in `.env.example` and `DERIV-OAUTH-SETUP.txt`.

### Verification still required before customer Demo testing
- Apply the Demo execution SQL migration in the target Supabase project.
- Confirm the Deriv OAuth app is approved/configured with the exact Preview callback URL and `trade` scope.
- Configure Preview-only `DERIV_CLIENT_ID`, `DERIV_REDIRECT_URI`, `DERIV_SITE_URL`, `DERIV_TOKEN_ENCRYPTION_KEY`, `DERIV_OAUTH_ENABLED=true`, and `DERIV_DEMO_TRADING_ENABLED=true`. Keep Production's Demo execution flag false until Preview testing is signed off.
- Test Demo OAuth, active Demo account selection, fresh proposal, explicit buy confirmation, contract subscription, early sell, expiry settlement, refresh recovery, duplicate-click prevention, and $20 loss cap reaching zero.
- Verify that Real accounts cannot obtain a SENFX execution session.
- The current release is manual Demo execution only. Do not label it autonomous bot execution until the strategy-to-Demo engine and its lifecycle are separately tested.
- Real-money execution remains disabled.

