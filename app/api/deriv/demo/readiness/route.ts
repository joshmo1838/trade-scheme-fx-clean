import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Read-only readiness status. No token access, no order placement.
export const dynamic = "force-dynamic";
export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return NextResponse.json({ ready: false, reason: "AUTH_REQUIRED" }, {
      status: 401, headers: { "Cache-Control": "no-store" },
    });
  }
  return NextResponse.json({
    ready: false,
    executionEnabled: false,
    reason: "BROKER_EXECUTION_NOT_INTEGRATED",
    mode: "demo",
  }, { headers: { "Cache-Control": "no-store" } });
}
