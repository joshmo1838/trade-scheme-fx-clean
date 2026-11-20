// Server-only, fail-closed eligibility check for isolated Deriv Demo rollout.
// Never use an email, display name, or browser-supplied user ID as authorization.
export function isAuthorizedDemoPilot(userId, configuredUserId) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return typeof userId === "string" &&
    typeof configuredUserId === "string" &&
    uuid.test(userId) &&
    uuid.test(configuredUserId) &&
    userId.toLowerCase() === configuredUserId.toLowerCase();
}
