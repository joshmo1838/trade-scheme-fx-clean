# Deriv identity stability verification protocol (release-blocking)

The documented `GET /account/v1/nickname` response includes `data.external_reference_id` (UUID). This field's name and schema do **not** prove it is stable per customer or unique across multiple trading accounts. Do not infer those properties from a passing parser test.

## Safe verification procedure (staging only)
1. Obtain Deriv's written definition of `external_reference_id` (identity scope, uniqueness, permanence, reassignment/deletion behavior). If not guaranteed, select a different official identity provider mechanism.
2. For consenting test users A and B, perform separate OAuth PKCE logins. Fetch `GET /account/v1/nickname` on the backend with each session's access token. Record only a salted digest of the returned UUID; do not log tokens or email addresses.
3. For A, log out of Deriv and the staging application, reauthenticate in a fresh browser session, and verify the UUID is identical. Repeat after token renewal.
4. If A has multiple demo/real trading accounts, switch selected trading account and verify the identity is unchanged **only if Deriv confirms the field represents the user rather than an account**.
5. For B, verify the identity differs. Repeat across browsers and devices.
6. Verify that an OAuth token for B can never load A's Supabase profile, bots, or connections. Verify revoked/expired token, missing state, replayed code, mismatched PKCE, canceled consent, and duplicate mapping all fail closed.
7. Implement a reviewed server-side identity mapping and supported Supabase session issuance. Never auto-link accounts using email, trading account ID, or nickname.
8. Verify signup, return login, explicit account linking, logout, expiry, admin isolation, and mobile return using staging users before production.

## Current evidence
- OAuth reference confirms PKCE, server-side token exchange, and no refresh token.
- Nickname response schema documents `external_reference_id` as a UUID identity reference.
- Parser CI passed at commit `a164b9c830b657f103d7b769de98213c739465b3`.
- **No multi-session, multi-user, or cross-account identity evidence has been collected.**
- **No end-to-end Deriv-only Supabase sign-in has passed.**
- This PR remains a draft and is not eligible for production merge.
