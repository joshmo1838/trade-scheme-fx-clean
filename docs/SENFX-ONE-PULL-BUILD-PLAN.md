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
