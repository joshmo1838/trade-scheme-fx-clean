import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";

function getRedirectUri() {
  const uri = process.env.DERIV_REDIRECT_URI || "https://www.tradesche.com/api/deriv/callback";
  const parsed = new URL(uri);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
    throw new Error("Deriv OAuth redirect URI must use HTTPS.");
  }
  return parsed.toString();
}

function getSiteUrl() {
  return (process.env.DERIV_SITE_URL || new URL(getRedirectUri()).origin).replace(/\/$/, "");
}

function getCookieOptions() {
  const callbackHost = new URL(getRedirectUri()).hostname;
  const inferredDomain = callbackHost === "tradesche.com" || callbackHost.endsWith(".tradesche.com")
    ? ".tradesche.com"
    : undefined;
  const domain = process.env.DERIV_COOKIE_DOMAIN || inferredDomain;
  return {
    httpOnly: true,
    secure: new URL(getRedirectUri()).protocol === "https:",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 600,
    ...(domain ? { domain } : {}),
  };
}

function base64Url(value: Buffer): string {
  return value.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function GET(_request: NextRequest) {
  let siteUrl = "https://www.tradesche.com";
  try {
    const redirectUri = getRedirectUri();
    siteUrl = getSiteUrl();

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.redirect(new URL("/login?next=/dashboard", siteUrl));
    }

    if (process.env.DERIV_OAUTH_ENABLED !== "true") {
      return NextResponse.redirect(new URL("/dashboard?deriv=awaiting_approval", siteUrl));
    }

    const clientId = process.env.DERIV_CLIENT_ID;
    if (!clientId) {
      return NextResponse.redirect(new URL("/dashboard?deriv=not_configured", siteUrl));
    }

    const verifier = base64Url(randomBytes(48));
    const challenge = base64Url(createHash("sha256").update(verifier).digest());
    const state = base64Url(randomBytes(32));

    const authUrl = new URL("https://auth.deriv.com/oauth2/auth");
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    // Least privilege: account listing, OTP issuance and contract trading need trade scope.
    authUrl.searchParams.set("scope", "trade");
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("code_challenge", challenge);
    authUrl.searchParams.set("code_challenge_method", "S256");

    const response = NextResponse.redirect(authUrl);
    const cookieOptions = getCookieOptions();
    response.cookies.set("deriv_oauth_state", state, cookieOptions);
    response.cookies.set("deriv_oauth_verifier", verifier, cookieOptions);
    response.cookies.set("deriv_oauth_user", user.id, cookieOptions);
    return response;
  } catch (error) {
    console.error("Deriv OAuth start failed:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.redirect(new URL("/dashboard?deriv=connect_failed", siteUrl));
  }
}
