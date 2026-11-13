
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
import { createCipheriv, randomBytes } from "node:crypto";

const REDIRECT_URI =
  "https://www.tradesche.com/api/deriv/callback";

const DASHBOARD_URL =
  "https://www.tradesche.com/dashboard";

const COOKIE_DOMAIN = ".tradesche.com";

function encryptToken(token: string) {
  const keyHex = process.env.DERIV_TOKEN_ENCRYPTION_KEY;

  if (!keyHex || !/^[a-f0-9]{64}$/i.test(keyHex)) {
    throw new Error("Encryption key configuration is invalid");
  }

  const key = Buffer.from(keyHex, "hex");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);

  const encrypted = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final()
  ]);

  return {
    ciphertext: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64")
  };
}

function clearCookies(response: NextResponse) {
  for (const name of [
    "deriv_oauth_state",
    "deriv_oauth_verifier",
    "deriv_oauth_user"
  ]) {
    response.cookies.set(name, "", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      domain: COOKIE_DOMAIN,
      maxAge: 0
    });
  }

  return response;
}

function dashboardRedirect(status: string) {
  const url = new URL(DASHBOARD_URL);
  url.searchParams.set("deriv", status);

  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const state = request.nextUrl.searchParams.get("state");
  const code = request.nextUrl.searchParams.get("code");
  const oauthError = request.nextUrl.searchParams.get("error");

  const expectedState =
    request.cookies.get("deriv_oauth_state")?.value;

  const verifier =
    request.cookies.get("deriv_oauth_verifier")?.value;

  const userId =
    request.cookies.get("deriv_oauth_user")?.value;

  // Reject missing or mismatched OAuth information.
  if (
    oauthError ||
    !code ||
    !state ||
    !expectedState ||
    state !== expectedState ||
    !verifier ||
    !userId
  ) {
    const response = dashboardRedirect(
      oauthError ? "authorization_cancelled" : "state_check_failed"
    );

    // Safe diagnostic flags: these reveal no cookie values.
    const url = new URL(response.headers.get("location")!);

    url.searchParams.set("diag_code", String(Boolean(code)));
    url.searchParams.set("diag_state", String(Boolean(state)));
    url.searchParams.set("diag_cookie_state", String(Boolean(expectedState)));
    url.searchParams.set("diag_state_match", String(Boolean(state && expectedState && state === expectedState)));
    url.searchParams.set("diag_verifier", String(Boolean(verifier)));
    url.searchParams.set("diag_user", String(Boolean(userId)));

    const diagnosticResponse = NextResponse.redirect(url);
    return clearCookies(diagnosticResponse);
  }

  try {
    // Confirm the same customer is still signed in.
    const supabase = await createClient();

    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user || user.id !== userId) {
      return clearCookies(
        dashboardRedirect("user_check_failed")
      );
    }

    const clientId = process.env.DERIV_CLIENT_ID;
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

    if (!clientId || !serviceRole || !supabaseUrl) {
      throw new Error("Server configuration is incomplete");
    }

    // Exchange the authorization code securely on the server.
    const tokenResponse = await fetch(
      "https://auth.deriv.com/oauth2/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: clientId,
          code,
          code_verifier: verifier,
          redirect_uri: REDIRECT_URI
        }),
        cache: "no-store"
      }
    );

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok || !tokenData.access_token) {
      throw new Error("Deriv token exchange failed");
    }

    // Encrypt the token before saving it.
    const encrypted = encryptToken(tokenData.access_token);

    const admin = createSupabaseAdmin(
      supabaseUrl,
      serviceRole,
      {
        auth: {
          persistSession: false
        }
      }
    );

    const { error: saveError } = await admin
      .from("deriv_connections")
      .upsert(
        {
          user_id: user.id,
          encrypted_token: encrypted.ciphertext,
          token_iv: encrypted.iv,
          token_tag: encrypted.tag,
          expires_at: new Date(
            Date.now() +
            Number(tokenData.expires_in || 0) * 1000
          ).toISOString(),
          connected_at: new Date().toISOString(),
          status: "connected"
        },
        {
          onConflict: "user_id"
        }
      );

    if (saveError) {
      throw new Error("Could not save the Deriv connection");
    }

    return clearCookies(
      dashboardRedirect("connected")
    );
  } catch {
    return clearCookies(
      dashboardRedirect("connection_failed")
    );
  }
}
