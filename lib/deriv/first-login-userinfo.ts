/**
 * Supabase custom OAuth provider userinfo requires a stable top-level subject.
 * Deriv's documented /account/v1/nickname returns a nested identity reference.
 * This adapter does not prove that the reference is stable across customers or
 * sessions; that MUST be verified before the provider is enabled.
 */
export type OAuthUserInfo = Readonly<{ sub: string; id: string }>;

export function derivUserinfoFromNickname(input: unknown): OAuthUserInfo {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Invalid Deriv identity response");
  }
  const payload = input as Record<string, unknown>;
  if ("errors" in payload &&
      (!Array.isArray(payload.errors) || payload.errors.length !== 0)) {
    throw new Error("Deriv identity response has errors");
  }
  const data = payload.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Missing Deriv identity");
  }
  const id = (data as Record<string, unknown>).external_reference_id;
  if (typeof id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error("Unverified Deriv identity reference");
  }
  const subject = id.toLowerCase();
  return Object.freeze({ sub: subject, id: subject });
}
