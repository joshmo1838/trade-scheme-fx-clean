# SENFX real local Supabase Auth verification

The CI suite starts a **temporary Supabase GoTrue Auth server** with a disposable
PostgreSQL database. It registers two test users, signs them in with
passwords, and uses GoTrue's real `/user` endpoint to verify the JWT passed
to the actual `app/api/bot-control/route.ts` handler.

Test coverage: no token; signed user; forged customer body; another signed-in
customer attempting to control a bot; owner-scoped GET results; replayed
idempotency key; corrupted JWT; and a valid Pause using the original token.

Only the authentication token validation is handled by a real GoTrue process.
The API route executes unmodified, but the test harness substitutes the
Next request wrapper and the service-role database command adapter.
It does **not** test Next.js SSR browser cookies, production Supabase
authorization policies, or real signed-in users.

The PostgreSQL test is disposable and only exists in GitHub Actions. The
GoTrue image is pinned, tests use randomly generated credentials, no real
Supabase organization or project token is present, and there is no new paid
cloud resource. No broker endpoints or real trading are used.

Run locally after starting GoTrue: `SENFX_TEST_REAL_AUTH_URL=http://127.0.0.1:9999 node --experimental-strip-types --experimental-loader ./tests/auth-control/loader.mjs --test tests/auth-control/gotrue-route.test.mjs`.

A green result **does not authorize activating** the production paper worker.
