import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { createServerClient } from "@supabase/ssr";

export const dynamic = "force-dynamic";

function base64url(value: Buffer): string {
  return value.toString("base64url");
}

export async function GET(request: NextRequest) {
  // Supabase owns the OAuth code exchange and application session.
  // Opt in only when a verified, stable Deriv customer subject is available
  // and custom:deriv is fully configured in Supabase.
  if (process.env.DERIV_SUPABASE_CUSTOM_PROVIDER_ENABLED === "true") {
    const origin = request.nextUrl.origin;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key || request.nextUrl.protocol !== "https:") {
      return NextResponse.redirect(new URL("/login?deriv=not_ready", origin));
    }
    const response = NextResponse.redirect(new URL("/login?deriv=not_ready", origin));
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (items) => {
          for (const item of items) response.cookies.set(item.name, item.value, item.options);
        }
      }
    });
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "custom:deriv",
      options: {
        redirectTo: new URL("/auth/callback", origin).toString(),
        skipBrowserRedirect: true
      }
    });
    if (error || !data.url || new URL(data.url).origin !== new URL(url).origin) {
      console.error("Deriv custom OAuth initiation unavailable", { code: error?.code ?? "no_url" });
      return NextResponse.redirect(new URL("/login?deriv=not_ready", origin));
    }
    response.headers.set("Location", data.url);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }

  const clientId = process.env.DERIV_CLIENT_ID;
  const callback = process.env.DERIV_LOGIN_REDIRECT_URI;
  const enabled = process.env.DERIV_FIRST_LOGIN_ENABLED === "true";
  const origin = request.nextUrl.origin;

  // Fail closed until a separate, verified login callback and session bridge exist.
  if (!enabled || !clientId || !callback) {
    return NextResponse.redirect(new URL("/login?deriv=not_ready", origin));
  }
  const redirectUri = new URL(callback);
  if (redirectUri.protocol !== "https:" || redirectUri.origin !== origin ||
      redirectUri.pathname !== "/api/auth/deriv/callback") {
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
    scope: process.env.DERIV_FIRST_LOGIN_CONNECT_ENABLED === "true"
      ? "account_manage trade" : "account_manage",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256"
  }).toString();

  const response = NextResponse.redirect(authorize);
  const cookie = { httpOnly: true, secure: true, sameSite: "lax" as const,
    path: "/api/auth/deriv", maxAge: 600 };
  response.cookies.set("deriv_login_state", state, cookie);
  response.cookies.set("deriv_login_verifier", verifier, cookie);
  return response;
}
