# SENFX authenticated paper-control route QA

This suite tests the **real Next.js API route handler** for `/api/bot-control`.
It runs with a test-only Node import loader that substitutes the Supabase
Auth/REST client and service-role RPC, and a minimal Next HTTP response shim.
It never connects to real users, Deriv, Railway, or Supabase.

It checks:
- a missing session is rejected before privileged commands;
- the feature flag defaults to disabled;
- same-origin CSRF checks and malformed command rejection;
- session identity overrides any forged body-level customer ID;
- owner-only bot commands and owner-only RLS-shaped read results;
- duplicate idempotency keys do not create additional queued commands;
- Start, Pause, Resume, Stop revisions are monotonic and **queued, not executed**;
- an offline or stale worker never appears connected;
- database errors fail closed without changing state.

The separately maintained PostgreSQL smoke tests verify actual function/RLS
semantics. The separately maintained worker-process tests verify the real
process against a local test backend. Together, these offer strong offline
coverage but **do not establish a real Supabase JWT login, an authenticated
browser session, a running hosted customer worker, or live Deriv compatibility**.

Run: `npm run test:auth-controls`. Enable no production feature flags and
apply no production migrations based solely on passing these tests.
