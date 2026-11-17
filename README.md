# Trade Scheme FX — Rebuild starter

This is a new Next.js + Supabase starter built from the supplied static site and its AI background image.

## Included now
- Branded responsive homepage
- Supabase email/password signup and login
- Protected customer dashboard
- Admin route protected by a profile role
- SQL schema with row-level security for profile records
- Next.js 16.4.6 and React 19.2.9 dependency pins

## Not yet live
- Deriv OAuth connection
- Bot execution or start/stop commands
- Admin customer-management actions
- Trading history, analytics, payment processing
These require the Deriv application credentials, secure server-side integration, testing, and additional implementation. No trading is performed by this starter.

## Setup
1. Create a Supabase project.
2. In Supabase, open SQL Editor and run `supabase/schema.sql`.
3. In Supabase Project Settings > API, copy the Project URL and the publishable/anon key.
4. Copy `.env.example` to `.env.local` and fill in the URL and key. Do not use or publish the `service_role` secret.
5. In Supabase Authentication > URL Configuration, set the Site URL to your Vercel domain and add these redirect URLs:
   - `http://localhost:3000/auth/callback`
   - `https://YOUR-VERCEL-DOMAIN/auth/callback`
6. Install dependencies with `npm install`, then run `npm run dev`.
7. For Vercel, import the GitHub repository and add the same environment variables in Project Settings > Environment Variables, then redeploy.

## Admin setup
After you create your own user account, copy your user UUID from Supabase Authentication > Users. In SQL Editor run:
`update public.profiles set role = 'admin' where id = 'YOUR-USER-UUID';`

## Security notes
- Never ask customers for their Deriv password.
- Never put Supabase service-role keys or Deriv API secrets in browser code or GitHub.
- Bot execution must have explicit user consent, risk limits, stop controls, and server-side credential handling before it is enabled.
- Trading can result in loss. No profits are guaranteed.


## Admin customer email contact
1. Run `supabase/admin-customer-email.sql` in Supabase SQL Editor.
2. Deploy this updated project to Vercel.
3. Sign in with the administrator account and open `/admin`.
4. The customer list shows names and email addresses. “Email customer” opens the device's email app with a draft addressed to that customer. Review and send it yourself.

This first version uses `mailto:`; it does not send mail from the website. Sending directly from the dashboard later requires a transactional email provider (for example, Resend), verified sender domain, and server-side API key.


## In-app customer messaging and homepage refresh
1. Run `supabase/messaging.sql` in Supabase SQL Editor after the existing admin/customer-email migration.
2. Deploy the updated project to Vercel.
3. Customers sign in and open `/messages` to chat with Trade Scheme FX support.
4. Admins open `/admin` and select **Message customer** beside a customer to open the private thread.
5. Messages update in real time when Supabase Realtime is enabled for the `messages` table.

The homepage now welcomes visitors with “WELCOME TO TRADE SCHEME FX”, moving market/candlestick visuals, floating trading labels, and a responsible-trading notice. The upper-left label says “Independent trading tools for Deriv traders” rather than “Powered by Deriv” because Trade Scheme FX should not imply official Deriv endorsement or partnership unless that has been authorized. If written approval is obtained, the wording can be updated.


## Trading Bot Management Center
1. Run `supabase/bot-center.sql` in Supabase SQL Editor after the existing migrations.
2. Deploy the updated project to Vercel.
3. Admins open `/admin/bots` to add and publish bot profiles.
4. Customers open `/bots` to select, pause, or stop their bot preference.
5. These are catalogue and preference controls only. They do not execute live trades. Deriv OAuth, server-side token storage, trading execution, explicit risk controls, and end-to-end testing must be implemented before live trading is enabled.


## Customer bot settings update

After deploying this version, run `supabase/bot-settings.sql` in Supabase SQL Editor. Customers can open `/bot-settings` or use the Bot settings links on their dashboard and bot workspace. Demo preferences allow a $10–$100 stake and display a $100 virtual starting balance. Real preferences require at least $10 and have no additional platform maximum; Deriv contract and available-balance limits still apply. These are saved preferences only and do not execute or enforce trades until a separately implemented and tested Deriv execution service exists.

## Expanded trading workspace prototype
This update adds navigation and prototype workspaces for:
- Visual Bot Builder (`/builder`)
- Bulk Trader (`/bulk-trader`)
- Manual Trader (`/manual-trader`)
- Copy Trading (`/copy-trading`)
- Digit Tools (`/digit-tools`)
- Charts (`/charts`)
- AI Market Scanner (`/ai-scanner`)
- Trading History (`/history`)

Important: these are prototype interfaces. They do not connect to Deriv, execute orders, mirror provider trades, retrieve live market data, or generate AI trading signals. The bulk planner and digit frequency counter perform local illustrative calculations only. Do not represent any prototype feature as live or operational.

The existing authentication, admin, messaging, bot catalogue, and bot preference code is retained from the supplied project ZIP. Existing Supabase migrations remain in `supabase/`. No new SQL migration is required for these prototype-only pages.
\n\n## Global market ticker and market watch\nSee `MARKET-UPGRADE-SETUP.txt`. Live quotes require a server-side `TWELVEDATA_API_KEY`. No prices are invented and no trades are executed.\n\n\n## T&J Homepage Upgrade\nSee `TJ-HOMEPAGE-UPGRADE.txt` for the homepage redesign and deployment instructions.\n

## SENFX account-backed strategy drafts
1. Open your Supabase project and go to SQL Editor.
2. Run the complete migration in `supabase/senfx-platform.sql`.
3. Deploy the updated branch preview. Sign in and open `/builder`.
4. Use **Save to my account** to store a strategy, then select it under **My saved strategies** to reload it on another device.

Strategy drafts are private to the signed-in customer through row-level security. This feature stores configuration only; it does not place Deriv demo or real-money orders.


## SENFX bot-management schema reconciliation

After the earlier `bot-center.sql` and `bot-settings.sql` migrations, run `supabase/senfx-bot-management-v2.sql` once in Supabase SQL Editor. This migration separates each customer's Demo and Real bot selections, fixes the account-mode key for general settings, and creates the missing per-bot configuration table used by `/bots`. It is designed to be safe to rerun.

After applying it, sign in with a customer account that has a Deriv account connected and selected, then open `/bots`. Published bots can be selected, paused, or stopped as saved preferences, and per-bot Demo/Real stake and loss-limit preferences can be stored independently. An administrator must publish bot catalogue entries before customers can see them.

**Important:** Select, pause, and stop are currently configuration states only. They do not start, pause, or stop an automated trading process. No Deriv orders are sent by this feature; real-money execution remains disabled.

## SENFX persistent daily paper-risk controls

After applying `supabase/senfx-bot-management-v2.sql`, run `supabase/senfx-paper-risk-controls.sql` in the connected Supabase project's SQL Editor. The risk migration creates customer-scoped daily risk ledgers and trade reservations, and server-only database functions to reserve, settle, and cancel paper positions.

Before testing the updated Preview:
1. Confirm `SUPABASE_SERVICE_ROLE_KEY` is configured in Vercel for the Preview environment. It must remain a server-only secret and must never use a `NEXT_PUBLIC_` prefix.
2. Sign in as a test customer and open Customer Bot Center → My Bots.
3. Save a positive daily loss cap that is at least as large as the paper stake.
4. Start a paper simulation and confirm the server reports a reservation before the simulator opens each position.
5. Complete a simulated losing position; confirm the daily gross-loss amount increases and remains after refresh/sign-in from another device.
6. Use a fresh test customer with a published synthetic bot, saved Demo stake $10, and daily cap $20. Replace the UUID placeholders in `supabase/tests/senfx-paper-risk-controls-smoke-test.sql` and run it in Supabase SQL Editor. It ends with `ROLLBACK`, so its test rows are not retained.

Risk behavior:
- The cap is per customer, per bot, per UTC calendar day and is enforced in PostgreSQL under a row lock.
- Each open paper position reserves its full stake as maximum potential loss. Concurrent browser tabs/devices cannot spend the same risk budget.
- A settled losing result increases daily gross losses; wins do not replenish the loss budget.
- The daily ledger rolls over at 00:00 UTC. A cap reduction takes effect immediately; raising a cap cannot loosen the current day's ledger and takes effect on the next UTC day.
- Customers can read only their own paper trades and risk rows. Writes use authenticated server routes and service-role-only database functions.
- The paper engine continues to use a simplified illustrative 1:1 payout model and public quotes. It is not a Deriv contract, not verified trading performance, and it does not submit demo or real-money orders.

Real-money execution remains disabled. Do not treat successful deployment or paper tests as approval for live trading.

## SENFX Deriv Demo contract execution — Phase 1

This phase adds a **manual Demo-only execution console** at `/demo-trading`. It uses the user's own Deriv OAuth connection and a selected active Demo account.

Before enabling it in a deployment:

1. Register the exact callback URI in the Deriv OAuth developer dashboard. Production default: `https://www.tradesche.com/api/deriv/callback`. A Preview deployment needs its own exact registered callback URI and Preview values for `DERIV_REDIRECT_URI` and `DERIV_SITE_URL`.
2. Add the server-only variables in `.env.example` to Vercel. Generate `DERIV_TOKEN_ENCRYPTION_KEY` with `openssl rand -hex 32`; never commit or share it.
3. Keep `DERIV_OAUTH_ENABLED=false` until the OAuth app and callback are approved/configured. Keep `DERIV_DEMO_TRADING_ENABLED=false` until the migration is applied and Preview is ready.
4. Apply `supabase/senfx-deriv-demo-execution.sql` in the target Supabase project's SQL Editor.
5. Set both flags to `true` in the **Preview environment only** after checking the Deriv OAuth application configuration, then redeploy Preview.
6. Connect Deriv, select an active Demo account, and open `/demo-trading`.

Phase 1 deliberately uses a manual confirmation before each Deriv contract. The stake is fixed at 10 account-currency units, duration is five minutes, one active contract is allowed, and SENFX reserves risk against a 20 account-currency-unit daily gross-loss cap per connected Demo account. The full stake is reserved before the buy request. Contract existence and final P/L are checked against Deriv on the server. Ambiguous buy outcomes keep their reservation held.

The Demo OTP URL is short-lived and single-use. The OAuth access token is decrypted and used only on the server; no Real WebSocket URL or Real buy/sell route is used. The daily ledger only covers trades sent through SENFX, not trades the user places directly on Deriv outside the app. A successful Demo order is not evidence of future live profitability.

**Important:** This is the first actual Demo contract lifecycle, not unattended bot automation. Automatic bot execution is a subsequent milestone after the manual Demo order, contract monitoring, early sell, settlement, and risk ledger pass end-to-end testing.

