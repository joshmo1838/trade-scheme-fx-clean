
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

function redirectToDashboard(status: string) {
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
      oauthError ? "authorization_cancelled" : "connection_failed"
    );

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
        redirectToDashboard("connection_failed")
      );
    }

    stage = "configuration";

    // Check server environment configuration.
    const clientId = process.env.DERIV_CLIENT_ID;
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

    if (!clientId || !serviceRole || !supabaseUrl) {
      return clearCookies(
        redirectToDashboard("connection_failed")
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
        redirectToDashboard("connection_failed")
      );
    }

    const tokenData = await tokenResponse.json();

    if (!tokenData.access_token) {
      console.error("Deriv token response did not contain an access token.");

      return clearCookies(
        redirectToDashboard("connection_failed")
      );
    }

    stage = "account_lookup";

    // Verify an active Demo account from Deriv before saving the connection.
    const accountsResponse = await fetch(
      "https://api.derivws.com/trading/v1/options/accounts",
      {
        headers: {
          Authorization: "Bearer " + tokenData.access_token,
          Accept: "application/json"
        },
        cache: "no-store",
        signal: AbortSignal.timeout(10000)
      }
    );

    if (!accountsResponse.ok) {
      console.error("Deriv account verification failed:", {
        httpStatus: accountsResponse.status
      });
      return clearCookies(
        redirectToDashboard("connection_failed")
      );
    }

    const accountsPayload = await accountsResponse.json();
    if (!Array.isArray(accountsPayload?.data)) {
      console.error("Deriv account response was invalid.");
      return clearCookies(
        redirectToDashboard("connection_failed")
      );
    }

    const demoAccounts = accountsPayload.data.filter(
      (account: Record<string, unknown>) =>
        account &&
        account.account_type === "demo" &&
        account.status === "active" &&
        typeof account.account_id === "string" &&
        /^[A-Za-z0-9]+$/.test(account.account_id) &&
        typeof account.balance === "number" &&
        Number.isFinite(account.balance) &&
        typeof account.currency === "string" &&
        ["USD", "AUD"].includes(account.currency)
    );

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

    // Preserve the user's previously chosen Demo account when it is
    // still available; otherwise choose the first verified supported Demo.
    const { data: previousSelection } = await admin
      .from("deriv_connections")
      .select("active_account_id")
      .eq("user_id", user.id)
      .maybeSingle();
    const selectedDemo = demoAccounts.find(
      (account: Record<string, unknown>) => account.account_id === previousSelection?.active_account_id
    ) || demoAccounts[0] || null;

    // Save the encrypted Deriv connection and verified Demo selection.
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
          status: "connected",
          active_account_id: selectedDemo?.account_id ?? null,
          active_account_type: selectedDemo ? "demo" : null
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
        redirectToDashboard("connection_failed")
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
      redirectToDashboard("connection_failed")
    );
  }
}
