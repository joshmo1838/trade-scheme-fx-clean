import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
import { createCipheriv, randomBytes } from "node:crypto";

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
    maxAge: 0,
    ...(domain ? { domain } : {}),
  };
}

function encryptToken(token: string) {
  const keyHex = process.env.DERIV_TOKEN_ENCRYPTION_KEY;
  if (!keyHex || !/^[a-f0-9]{64}$/i.test(keyHex)) {
    throw new Error("Deriv token encryption is not configured.");
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(keyHex, "hex"), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return {
    ciphertext: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

function clearCookies(response: NextResponse) {
  const options = getCookieOptions();
  response.cookies.set("deriv_oauth_state", "", options);
  response.cookies.set("deriv_oauth_verifier", "", options);
  response.cookies.set("deriv_oauth_user", "", options);
  return response;
}

function redirectToDashboard(status: string) {
  const url = new URL("/dashboard", getSiteUrl());
  url.searchParams.set("deriv", status);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const state = request.nextUrl.searchParams.get("state");
  const code = request.nextUrl.searchParams.get("code");
  const oauthError = request.nextUrl.searchParams.get("error");
  const expectedState = request.cookies.get("deriv_oauth_state")?.value;
  const verifier = request.cookies.get("deriv_oauth_verifier")?.value;
  const userId = request.cookies.get("deriv_oauth_user")?.value;

  if (
    oauthError || !code || !state || !expectedState ||
    state !== expectedState || !verifier || !userId
  ) {
    return clearCookies(redirectToDashboard(oauthError ? "authorization_cancelled" : "connection_failed"));
  }

  let stage = "auth_check";
  try {
    const redirectUri = getRedirectUri();
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user || user.id !== userId) {
      return clearCookies(redirectToDashboard("connection_failed"));
    }

    stage = "configuration";
    const clientId = process.env.DERIV_CLIENT_ID;
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!clientId || !serviceRole || !supabaseUrl || !process.env.DERIV_TOKEN_ENCRYPTION_KEY) {
      return clearCookies(redirectToDashboard("not_configured"));
    }

    stage = "token_exchange";
    const tokenResponse = await fetch("https://auth.deriv.com/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        code,
        code_verifier: verifier,
        redirect_uri: redirectUri,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });

    const tokenData = await tokenResponse.json().catch(() => null);
    if (!tokenResponse.ok || typeof tokenData?.access_token !== "string") {
      console.error("Deriv OAuth token exchange failed:", { httpStatus: tokenResponse.status });
      return clearCookies(redirectToDashboard("connection_failed"));
    }

    const expiresIn = Number(tokenData.expires_in);
    if (!Number.isFinite(expiresIn) || expiresIn <= 0) {
      console.error("Deriv OAuth returned an invalid token lifetime.");
      return clearCookies(redirectToDashboard("connection_failed"));
    }

    stage = "encryption";
    const encrypted = encryptToken(tokenData.access_token);
    stage = "database_save";
    const admin = createSupabaseAdmin(supabaseUrl, serviceRole, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { error: saveError } = await admin.from("deriv_connections").upsert({
      user_id: user.id,
      encrypted_token: encrypted.ciphertext,
      token_iv: encrypted.iv,
      token_tag: encrypted.tag,
      expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
      connected_at: new Date().toISOString(),
      status: "connected",
      active_account_id: null,
      active_account_type: null,
    }, { onConflict: "user_id" });

    if (saveError) {
      console.error("Deriv connection save failed:", { code: saveError.code });
      return clearCookies(redirectToDashboard("connection_failed"));
    }

    console.info("Deriv OAuth connection saved.");
    return clearCookies(redirectToDashboard("connected"));
  } catch (error) {
    console.error("Deriv OAuth callback failed:", {
      stage,
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
    return clearCookies(redirectToDashboard("connection_failed"));
  }
}
