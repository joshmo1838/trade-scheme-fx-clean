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