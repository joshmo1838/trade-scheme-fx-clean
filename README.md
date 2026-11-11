# Trade Scheme FX — clean Next.js starter

This is a clean, minimal Next.js project intended to replace the earlier broken starter. The project has a single app at the repository root and does not import Supabase or require environment variables, so it avoids the missing `lib/supabase/server` build error.

## Included
- Free membership messaging ($0/month; no subscription checkout).
- Blue AI-brain background image supplied for this website.
- Animated glow/orbit effects and responsive layout.
- Homepage and an `/admin` preview page.
- Root-level `package.json`, `app/`, `public/`, and Next.js configuration.

## Important limitations
This is a front-end starter, not a production trading service. It does not authenticate customers or administrators, connect Deriv, execute trades, store broker tokens, or process payments. The `/admin` page is explicitly a preview and is NOT password protected. Do not enter real credentials there. Before launch, implement secure authentication, authorization, encrypted token storage, audit logging, trading risk controls, and test thoroughly with demo accounts. Never collect customers' Deriv passwords. No profits are promised.

## Deploy to Vercel
1. Create a NEW GitHub repository (recommended) and extract this ZIP on your computer.
2. Upload the CONTENTS of this folder to the repository root. Do not upload the ZIP itself and do not create an extra nested project folder.
3. In Vercel, choose Add New → Project and import that new repository.
4. Framework preset: Next.js. Root Directory: leave blank (repository root).
5. Build command: `npm run build`. Install command: `npm install`.
6. Deploy. No environment variables are required for this starter.
7. Test the generated Vercel URL before connecting the custom domain.

## Local development
Requires Node.js 20.9 or later.

```bash
npm install
npm run dev
```

Open http://localhost:3000.
