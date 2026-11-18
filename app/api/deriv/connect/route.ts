
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";

const DEFAULT_ORIGIN = origin;

function oauthOrigin(): string {
  const configured = process.env.DERIV_OAUTH_ORIGIN || DEFAULT_ORIGIN;
  const url = new URL(configured);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("Invalid DERIV_OAUTH_ORIGIN");
  }
  return url.origin;
}



function base64Url(value: Buffer): string {
  return value
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function GET(request: NextRequest) {
  try {
    // Never initiate an OAuth flow on a different host than its registered callback.
    const origin = oauthOrigin();
    if (request.nextUrl.origin !== origin) {
      return NextResponse.json({ error: "Deriv connection is unavailable on this host." }, { status: 409 });
    }

    // Verify that the customer is signed in.
    const supabase = await createClient();

    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.redirect(
        new URL(
          "/login?next=/dashboard",
          origin
        )
      );
    }

    // Check whether Deriv OAuth is enabled.
    if (process.env.DERIV_OAUTH_ENABLED !== "true") {
      return NextResponse.redirect(
        new URL(
          "/dashboard?deriv=awaiting_approval",
          origin
        )
      );
    }

    const clientId = process.env.DERIV_CLIENT_ID;

    if (!clientId) {
      return NextResponse.redirect(
        new URL(
          "/dashboard?deriv=not_configured",
          origin
        )
      );
    }

    // Generate secure OAuth state and PKCE values.
    const verifier = base64Url(randomBytes(48));

    const challenge = base64Url(
      createHash("sha256")
        .update(verifier)
        .digest()
    );

    const state = base64Url(randomBytes(32));

    // Build the Deriv authorization URL.
    const authUrl = new URL(
      "https://auth.deriv.com/oauth2/auth"
    );

    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", `${origin}/api/deriv/callback`);
    authUrl.searchParams.set(
      "scope",
      "trade payment account_manage application_read"
    );
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("code_challenge", challenge);
    authUrl.searchParams.set("code_challenge_method", "S256");

    // Attach temporary, secure cookies to the Deriv redirect.
    const response = NextResponse.redirect(authUrl);

    const cookieOptions = {
      httpOnly: true,
      secure: true,
      sameSite: "lax" as const,
      path: "/",
      maxAge: 600
    };

    response.cookies.set(
      "deriv_oauth_state",
      state,
      cookieOptions
    );

    response.cookies.set(
      "deriv_oauth_verifier",
      verifier,
      cookieOptions
    );

    response.cookies.set(
      "deriv_oauth_user",
      user.id,
      cookieOptions
    );

    return response;
  } catch {
    return NextResponse.redirect(
      new URL(
        "/dashboard?deriv=connect_failed",
        origin
      )
    );
  }
}
