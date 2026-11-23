import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// This endpoint intentionally never establishes a session until verified
// Deriv customer identity and the Supabase session bridge are implemented.
export async function GET(request: NextRequest) {
  const response = NextResponse.redirect(
    new URL("/login?deriv=not_ready", request.nextUrl.origin)
  );
  const options = { httpOnly: true, secure: true, sameSite: "lax" as const,
    path: "/api/auth/deriv", maxAge: 0 };
  response.cookies.set("deriv_login_state", "", options);
  response.cookies.set("deriv_login_verifier", "", options);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
