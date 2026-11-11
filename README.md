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
