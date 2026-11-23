import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";

export const dynamic = "force-dynamic";

function base64url(value: Buffer): string {
  return value.toString("base64url");
}

export async function GET(request: NextRequest) {
  const clientId = process.env.DERIV_CLIENT_ID;
  const callback = process.env.DERIV_LOGIN_REDIRECT_URI;
  const enabled = process.env.DERIV_FIRST_LOGIN_ENABLED === "true";
  const origin = request.nextUrl.origin;

  // Fail closed until a separate, verified login callback and session bridge exist.
  if (!enabled || !clientId || !callback) {
    return NextResponse.redirect(new URL("/login?deriv=not_ready", origin));
  }
  let redirectUri: URL;
  try { redirectUri = new URL(callback); }
  catch { return NextResponse.redirect(new URL("/login?deriv=not_ready", origin)); }
  if (redirectUri.protocol !== "https:" || redirectUri.origin !== origin ||
      redirectUri.pathname !== "/api/auth/deriv/callback" ||
      redirectUri.search || redirectUri.hash || redirectUri.username || redirectUri.password) {
    return NextResponse.redirect(new URL("/login?deriv=not_ready", origin));
  }

  const state = base64url(randomBytes(32));
  const verifier = base64url(randomBytes(48));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  const authorize = new URL("https://auth.deriv.com/oauth2/auth");
  authorize.search = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri.toString(),
    scope: "account_manage",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256"
  }).toString();

  const response = NextResponse.redirect(authorize);
  response.headers.set("Cache-Control", "no-store");
  const cookie = { httpOnly: true, secure: true, sameSite: "lax" as const,
    path: "/api/auth/deriv", maxAge: 600 };
  response.cookies.set("deriv_login_state", state, cookie);
  response.cookies.set("deriv_login_verifier", verifier, cookie);
  return response;
}
