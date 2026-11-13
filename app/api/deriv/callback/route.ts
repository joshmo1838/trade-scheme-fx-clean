
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
  const options = {
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    path: "/",
    domain: COOKIE_DOMAIN,
    maxAge: 0
  };

  response.cookies.set("deriv_oauth_state", "", options);
  response.cookies.set("deriv_oauth_verifier", "", options);
  response.cookies.set("deriv_oauth_user", "", options);

  return response;
}

function redirectToDashboard(
  status: string,
  stage?: string
) {
  const url = new URL(DASHBOARD_URL);

  url.searchParams.set("deriv", status);

  if (stage) {
    url.searchParams.set("stage", stage);
  }

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

  // Validate the OAuth response.
  if (
    oauthError ||
    !code ||
    !state ||
    !expectedState ||
    state !== expectedState ||
    !verifier ||
    !userId
  ) {
    const url = new URL(DASHBOARD_URL);

    url.searchParams.set(
      "deriv",
      oauthError ? "authorization_cancelled" : "state_check_failed"
    );

    url.searchParams.set("diag_code", String(Boolean(code)));
    url.searchParams.set("diag_state", String(Boolean(state)));
    url.searchParams.set(
      "diag_cookie_state",
      String(Boolean(expectedState))
    );
    url.searchParams.set(
      "diag_state_match",
      String(Boolean(state && expectedState && state === expectedState))
    );
    url.searchParams.set("diag_verifier", String(Boolean(verifier)));
    url.searchParams.set("diag_user", String(Boolean(userId)));

    return clearCookies(NextResponse.redirect(url));
  }

  let stage = "auth_check";

  try {
    // Verify the signed-in customer.
    const supabase = await createClient();

    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user || user.id !== userId) {
      return clearCookies(
        redirectToDashboard(
          "connection_failed",
          "auth_check_failed"
        )
      );
    }

    stage = "configuration";

    // Check server environment configuration.
    const clientId = process.env.DERIV_CLIENT_ID;
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

    if (!clientId || !serviceRole || !supabaseUrl) {
      return clearCookies(
        redirectToDashboard(
          "connection_failed",
          "configuration_failed"
        )
      );
    }

    stage = "token_exchange";

    // Exchange the authorization code securely with Deriv.
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

    if (!tokenResponse.ok) {
      console.error("Deriv token exchange failed:", {
        httpStatus: tokenResponse.status
      });

      return clearCookies(
        redirectToDashboard(
          "connection_failed",
          `token_exchange_http_${tokenResponse.status}`
        )
      );
    }

    const tokenData = await tokenResponse.json();

    if (!tokenData.access_token) {
      console.error("Deriv token response did not contain an access token.");

      return clearCookies(
        redirectToDashboard(
          "connection_failed",
          "token_missing"
        )
      );
    }

    stage = "encryption";

    // Encrypt the access token before database storage.
    const encrypted = encryptToken(tokenData.access_token);

    stage = "database_save";

    // Create the server-side Supabase admin client.
    const admin = createSupabaseAdmin(
      supabaseUrl,
      serviceRole,
      {
        auth: {
          persistSession: false
        }
      }
    );

    // Save the encrypted Deriv connection.
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
      // Log database diagnostics without logging tokens or secrets.
      console.error("Deriv database save failed:", {
        code: saveError.code,
        message: saveError.message,
        hint: saveError.hint
      });

      return clearCookies(
        redirectToDashboard(
          "connection_failed",
          "database_save_failed"
        )
      );
    }

    console.info("Deriv connection saved successfully.");

    return clearCookies(
      redirectToDashboard("connected")
    );

  } catch (error) {
    // Log the failure stage, not the sensitive error contents.
    console.error("Deriv callback failed:", {
      stage,
      errorType:
        error instanceof Error
          ? error.name
          : "UnknownError"
    });

    return clearCookies(
      redirectToDashboard(
        "connection_failed",
        `${stage}_failed`
      )
    );
  }
}
