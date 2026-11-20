import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "Connection service unavailable." }, { status: 503 });
  }

  // Delete only this signed-in user's locally stored encrypted Deriv authorization.
  // This does not revoke Deriv authorization remotely or affect any other customer.
  const admin = createAdminClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await admin.from("deriv_connections").delete().eq("user_id", user.id);
  if (error) {
    console.error("Deriv disconnect database operation failed:", { code: error.code });
    return NextResponse.json({ error: "Could not disconnect Deriv. Try again." }, { status: 500 });
  }

  return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
}
