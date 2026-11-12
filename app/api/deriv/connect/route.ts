import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";

const REDIRECT_URI = "https://tradesche.com/api/deriv/callback";
const b64url = (value: Buffer) => value.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login?next=/dashboard", "https://tradesche.com"));

  const clientId = process.env.DERIV_CLIENT_ID;
  if (process.env.DERIV_OAUTH_ENABLED !== "true") return NextResponse.redirect(new URL("/dashboard?deriv=awaiting_approval", "https://tradesche.com"));
  if (!clientId) return NextResponse.redirect(new URL("/dashboard?deriv=not_configured", "https://tradesche.com"));

  const verifier = b64url(randomBytes(48));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  const state = b64url(randomBytes(32));

  const url = new URL("https://auth.deriv.com/oauth2/auth");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", REDIRECT_URI);
  url.searchParams.set("scope", "trade account_manage application_read");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");

  const response = NextResponse.redirect(url);
  const options = { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/", maxAge: 600 };
  response.cookies.set("deriv_oauth_state", state, options);
  response.cookies.set("deriv_oauth_verifier", verifier, options);
  response.cookies.set("deriv_oauth_user", user.id, options);
  return response;
}
