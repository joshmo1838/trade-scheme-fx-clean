import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
import { createCipheriv, randomBytes } from "node:crypto";

const REDIRECT_URI = "https://tradesche.com/api/deriv/callback";

function encryptToken(token: string) {
  const keyHex = process.env.DERIV_TOKEN_ENCRYPTION_KEY;
  if (!keyHex || !/^[a-f0-9]{64}$/i.test(keyHex)) throw new Error("DERIV_TOKEN_ENCRYPTION_KEY must be 64 hex characters");
  const key = Buffer.from(keyHex, "hex");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return { ciphertext: encrypted.toString("base64"), iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64") };
}

export async function GET(request: NextRequest) {
  const url = new URL("/dashboard", request.url);
  const state = request.nextUrl.searchParams.get("state");
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");
  const expectedState = request.cookies.get("deriv_oauth_state")?.value;
  const verifier = request.cookies.get("deriv_oauth_verifier")?.value;
  const userId = request.cookies.get("deriv_oauth_user")?.value;

  const clearCookies = (response: NextResponse) => {
    for (const name of ["deriv_oauth_state", "deriv_oauth_verifier", "deriv_oauth_user"]) {
      response.cookies.set(name, "", { path: "/", maxAge: 0 });
    }
    return response;
  };

  if (error || !code || !state || !expectedState || state !== expectedState || !verifier || !userId) {
    url.searchParams.set("deriv", error ? "authorization_cancelled" : "state_check_failed");
    return clearCookies(NextResponse.redirect(url));
  }

  try {
    const clientId = process.env.DERIV_CLIENT_ID;
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!clientId || !serviceRole || !supabaseUrl) throw new Error("Server environment is incomplete");

    const tokenResponse = await fetch("https://auth.deriv.com/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        code,
        code_verifier: verifier,
        redirect_uri: REDIRECT_URI
      }),
      cache: "no-store"
    });
    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenData.access_token) throw new Error("Deriv token exchange failed");

    const encrypted = encryptToken(tokenData.access_token);
    const admin = createSupabaseAdmin(supabaseUrl, serviceRole, { auth: { persistSession: false } });
    const { error: saveError } = await admin.from("deriv_connections").upsert({
      user_id: userId,
      encrypted_token: encrypted.ciphertext,
      token_iv: encrypted.iv,
      token_tag: encrypted.tag,
      expires_at: new Date(Date.now() + Number(tokenData.expires_in || 0) * 1000).toISOString(),
      connected_at: new Date().toISOString(),
      status: "connected"
    }, { onConflict: "user_id" });
    if (saveError) throw new Error("Could not securely save the Deriv connection");

    url.searchParams.set("deriv", "connected");
    return clearCookies(NextResponse.redirect(url));
  } catch {
    url.searchParams.set("deriv", "connection_failed");
    return clearCookies(NextResponse.redirect(url));
  }
}
