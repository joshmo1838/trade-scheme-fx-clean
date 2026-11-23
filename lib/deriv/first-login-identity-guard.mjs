/**
 * Deriv-first sign-in identity boundary.
 *
 * OAuth authorization and trading account IDs do not establish a unique
 * platform-user identity. Never infer one from account_id, email, loginid,
 * or browser-supplied values. Until a stable, verified Deriv user subject
 * is documented and fetched server-side, fail closed.
 */
export function validatedDerivIdentity(identity, expectedAppId) {
  if (typeof expectedAppId !== "string" || !expectedAppId.trim()) {
    throw new Error("Missing OAuth application binding");
  }
  if (!identity || typeof identity !== "object" || Array.isArray(identity)) {
    throw new Error("Missing verified Deriv user identity");
  }
  // This field must come from a future verified user-identity endpoint,
  // never from an options trading account listing or client request.
  if (identity.source !== "verified_deriv_user_endpoint") {
    throw new Error("Unverified Deriv identity source");
  }
  const id = identity.subject;
  if (typeof id !== "string" || !/^[a-zA-Z0-9_-]{3,128}$/.test(id)) {
    throw new Error("Invalid Deriv user subject");
  }
  return Object.freeze({
    provider: "deriv",
    subject: id,
    providerKey: `deriv:${expectedAppId}:${id}`
  });
}
