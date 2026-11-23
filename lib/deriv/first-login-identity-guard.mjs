/**
 * Deriv-first login identity guard.
 *
 * A Deriv access token is NOT a Supabase session. Call this guard only with
 * account identity returned by an authenticated Deriv API request made with
 * the freshly exchanged OAuth access token; never trust browser-provided IDs.
 *
 * This module deliberately does not create sessions, link existing users,
 * or alter the existing Deriv account-connection flow.
 */
export function validatedDerivIdentity(account, expectedAppId) {
  if (!account || typeof account !== "object" || Array.isArray(account)) {
    throw new Error("Missing authenticated Deriv identity");
  }
  const id = account.id;
  if (typeof id !== "string" || !/^[a-zA-Z0-9_-]{3,128}$/.test(id)) {
    throw new Error("Invalid Deriv identity");
  }
  if (typeof expectedAppId !== "string" || !expectedAppId.trim()) {
    throw new Error("Missing OAuth application binding");
  }
  return Object.freeze({
    provider: "deriv",
    subject: id,
    providerKey: `deriv:${expectedAppId}:${id}`
  });
}
