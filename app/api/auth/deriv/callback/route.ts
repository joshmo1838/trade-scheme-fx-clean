import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient as createSessionClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CLEAR = {
  httpOnly: true, secure: true, sameSite: "lax" as const,
  path: "/api/auth/deriv", maxAge: 0
};

function finish(request: NextRequest, status: string, dashboard = false) {
  const url = new URL(dashboard ? "/dashboard" : "/login", request.nextUrl.origin);
  url.searchParams.set("deriv", status);
  const response = NextResponse.redirect(url);
  response.cookies.set("deriv_login_state", "", CLEAR);
  response.cookies.set("deriv_login_verifier", "", CLEAR);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function sameSecret(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function verifiedIdentity(input: unknown): string {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Deriv identity response is missing");
  }
  const record = input as Record<string, unknown>;
  if (!Array.isArray(record.errors) || record.errors.length > 0) {
    throw new Error("Deriv identity response contains errors");
  }
  const data = record.data as Record<string, unknown> | undefined;
  const id = data?.external_reference_id;
  if (typeof id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error("Deriv identity reference is invalid");
  }
  // Identity from the authenticated Deriv endpoint, never client input or a trading account ID.
  return id.toLowerCase();
}

function aliasForIdentity(clientId: string, subject: string): string {
  const domain = process.env.DERIV_LOGIN_ALIAS_DOMAIN;
  // Dedicated administrator-controlled domain; never the customer's own email.
  if (!domain || !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(domain)) {
    throw new Error("Deriv login alias domain has not been configured");
  }
  const digest = createHash("sha256")
    .update("deriv:" + clientId + ":" + subject).digest("hex");
  return "deriv-" + digest + "@" + domain;
}

async function issueVerifiedSupabaseSession(clientId: string, subject: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase server auth is not configured");

  const providerKey = "deriv:" + clientId + ":" + subject;
  const alias = aliasForIdentity(clientId, subject);
  const admin = createAdminClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  // Isolate the new Deriv identity; never impersonate or auto-link an existing
  // email/password customer based on a matching email address.
  const created = await admin.auth.admin.createUser({
    email: alias,
    email_confirm: true,
    app_metadata: { deriv_provider_key: providerKey }
  });
  if (created.error && created.error.status !== 422) {
    throw new Error("Cannot create Deriv identity");
  }

  // Server-only magic link hash; never sent in a browser URL or logged.
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: alias
  });
  const user = link?.user;
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !user || !tokenHash ||
      user.app_metadata?.deriv_provider_key !== providerKey ||
      (created.data.user && created.data.user.id !== user.id)) {
    throw new Error("Deriv identity is not exclusively bound to this user");
  }

  const supabase = await createSessionClient();
  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: "magiclink"
  });
  if (error || !data.user || data.user.id !== user.id) {
    throw new Error("Supabase session verification failed");
  }
}

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const redirectUri = process.env.DERIV_LOGIN_REDIRECT_URI;
  const clientId = process.env.DERIV_CLIENT_ID;
  if (process.env.DERIV_FIRST_LOGIN_ENABLED !== "true" || !redirectUri || !clientId) {
    return finish(request, "not_ready");
  }

  let callback: URL;
  try { callback = new URL(redirectUri); }
  catch { return finish(request, "not_ready"); }
  if (origin !== callback.origin || callback.protocol !== "https:" ||
      callback.pathname !== "/api/auth/deriv/callback" ||
      callback.search || callback.hash) {
    return finish(request, "not_ready");
  }

  const state = request.nextUrl.searchParams.get("state");
  const code = request.nextUrl.searchParams.get("code");
  const expected = request.cookies.get("deriv_login_state")?.value;
  const verifier = request.cookies.get("deriv_login_verifier")?.value;
  if (request.nextUrl.searchParams.has("error")) return finish(request, "cancelled");
  if (!code || !state || !expected || !verifier ||
      !sameSecret(state, expected) ||
      !/^[A-Za-z0-9_-]{43,128}$/.test(verifier)) {
    return finish(request, "invalid_callback");
  }

  let failureStage = "token_exchange";
  try {
    const exchange = await fetch("https://auth.deriv.com/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        code, code_verifier: verifier, redirect_uri: redirectUri
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10000)
    });
    if (!exchange.ok) return finish(request, "token_exchange_failed");
    failureStage = "token_response";
    const token = await exchange.json() as Record<string, unknown>;
    const accessToken = token.access_token;
    if (typeof accessToken !== "string" || !accessToken) {
      return finish(request, "token_exchange_failed");
    }

    failureStage = "identity_fetch";
    const identityResponse = await fetch("https://api.derivws.com/account/v1/nickname", {
      headers: { Authorization: "Bearer " + accessToken },
      cache: "no-store",
      signal: AbortSignal.timeout(10000)
    });
    if (!identityResponse.ok) return finish(request, "identity_failed");
    failureStage = "identity_response";
    const subject = verifiedIdentity(await identityResponse.json());

    // Staging verifies actual Deriv identity without issuing a session until
    // repeated-login stability and cross-customer isolation have been tested.
    if (process.env.DERIV_FIRST_LOGIN_SESSION_ENABLED !== "true") {
      return finish(request, "identity_verified");
    }

    failureStage = "session_issue";
    await issueVerifiedSupabaseSession(clientId, subject);
    return finish(request, "authenticated", true);
  } catch (error) {
    console.error("Deriv-first callback rejected", {
      stage: failureStage,
      type: error instanceof Error ? error.name : "UnknownError"
    });
    return finish(request, "login_failed");
  }
}
