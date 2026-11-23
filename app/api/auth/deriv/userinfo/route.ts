import { NextRequest, NextResponse } from "next/server";
import { derivUserinfoFromNickname } from "@/lib/deriv/first-login-userinfo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RESPONSE_HEADERS = {
  "Cache-Control": "no-store, private",
  "Vary": "Authorization",
  "X-Content-Type-Options": "nosniff"
};

/**
 * Server-side UserInfo adapter for an eventual Supabase custom OAuth provider.
 * This endpoint never issues a Supabase session, creates a user or stores
 * Deriv access tokens. The token is verified only by Deriv's REST gateway.
 */
export async function GET(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  if (!authorization || !/^Bearer [^\s]{16,4096}$/.test(authorization)) {
    return NextResponse.json({ error: "unauthorized" }, {
      status: 401, headers: RESPONSE_HEADERS
    });
  }

  try {
    const response = await fetch("https://api.derivws.com/account/v1/nickname", {
      method: "GET",
      headers: { Authorization: authorization },
      cache: "no-store",
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) {
      return NextResponse.json({ error: "identity_unavailable" }, {
        status: response.status === 429 ? 429 : 401, headers: RESPONSE_HEADERS
      });
    }
    const userinfo = derivUserinfoFromNickname(await response.json());
    return NextResponse.json(userinfo, { headers: RESPONSE_HEADERS });
  } catch {
    return NextResponse.json({ error: "identity_unavailable" }, {
      status: 503, headers: RESPONSE_HEADERS
    });
  }
}
