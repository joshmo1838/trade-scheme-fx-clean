# Trade Scheme FX — static clean deployment

This package intentionally removes Next.js, TypeScript, Supabase, server actions, authentication imports, and build scripts. It is a static HTML/CSS website so the previous missing-module/build errors cannot occur.

## Deploy to Vercel
1. Extract this ZIP.
2. Upload `index.html` and the `assets` folder directly into the root of a NEW GitHub repository.
3. In Vercel, import that repository.
4. Framework Preset: **Other**.
5. Build Command: leave blank.
6. Output Directory: leave blank (or `.` if Vercel requires a value).
7. Deploy.

No npm install, build command, environment variables, or Supabase setup are needed.

## Included
- Free membership messaging; no subscription checkout.
- User-provided blue AI-brain background image.
- CSS glow/orbit animations with reduced-motion support.
- Responsive landing page.

## Limitations
This is a static marketing website only. It does not provide real customer accounts, protected admin access, Deriv OAuth, automated trading, billing, or secure account management. Do not enter passwords or broker credentials. Those features require a separately built and security-tested backend.
