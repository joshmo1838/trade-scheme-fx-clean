/**
 * Release-gate evaluator for Deriv-first sign-in.
 * Never treats documentation or mocked tests as live identity verification.
 * No Supabase session is issued here; that requires a reviewed, verified
 * provider-to-user mapping and a supported Supabase auth mechanism.
 */
export function evaluateDerivLoginGate(evidence) {
  const required = [
    "providerIdentityGuarantee",
    "sameCustomerRepeatedLogin",
    "differentCustomerIsolation",
    "multipleAccountStability",
    "supabaseSessionBridge",
    "oauthReplayAndPkce",
    "endToEndBrowserLogin"
  ];
  const checks = Object.fromEntries(required.map(key => [key, evidence?.[key] === true]));
  return Object.freeze({
    checks: Object.freeze(checks),
    ready: Object.values(checks).every(Boolean)
  });
}
