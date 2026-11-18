import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store, max-age=0" };

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Same-origin request required." }, { status: 403, headers });
  }
  // Never revoke a connection while any server-side execution mode is enabled.
  if (process.env.SENFX_BOT_CONTROL_ENABLED === "true" ||
      process.env.DERIV_DEMO_TRADING_ENABLED === "true" ||
      process.env.DERIV_LIVE_TRADING_ENABLED === "true") {
    return NextResponse.json({
      error: "Disconnect unavailable while trading controls are enabled. Stop and verify all bot runs first."
    }, { status: 409, headers });
  }
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Please sign in." }, { status: 401, headers });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "Disconnect service unavailable." }, { status: 503, headers });
  }
  try {
    const admin = createAdminClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { error } = await admin.from("deriv_connections").delete().eq("user_id", user.id);
    if (error) {
      console.error("Deriv disconnect failed:", { code: error.code });
      return NextResponse.json({ error: "Could not disconnect. Try again later." }, { status: 503, headers });
    }
    return NextResponse.json({ success: true }, { headers });
  } catch {
    return NextResponse.json({ error: "Disconnect service unavailable." }, { status: 503, headers });
  }
}
