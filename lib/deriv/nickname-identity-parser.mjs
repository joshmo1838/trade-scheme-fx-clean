/**
 * Parse the documented Deriv GET /account/v1/nickname response.
 * The external_reference_id is a documented identity reference, but its
 * stability across accounts and OAuth sessions MUST be verified before it
 * can authorize automatic Supabase sign-in.
 */
export function parseDerivNicknameIdentity(response) {
  if (!response || typeof response !== "object" || Array.isArray(response)) {
    throw new Error("Missing Deriv nickname response");
  }
  if ("errors" in response &&
      (!Array.isArray(response.errors) || response.errors.length !== 0)) {
    throw new Error("Deriv nickname response contains errors");
  }
  const id = response.data?.external_reference_id;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (typeof id !== "string" || !uuid.test(id)) {
    throw new Error("Missing valid Deriv identity reference");
  }
  return Object.freeze({ externalReferenceId: id.toLowerCase() });
}
