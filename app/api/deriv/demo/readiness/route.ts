import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAuthorizedDemoPilot } from "@/lib/deriv/demo-account-allowlist.mjs";

// Informational readiness only. Never loads OAuth tokens, places an order,
// or claims that live Deriv connectivity and production DB risk rules are proven.
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return NextResponse.json(
      { ready: false, reason: "AUTH_REQUIRED", mode: "demo" },
      { status: 401, headers },
    );
  }

  const pilotAuthorized = isAuthorizedDemoPilot(
    user.id,
    process.env.DERIV_DEMO_PILOT_USER_ID,
  );
  const executionEnabled = process.env.DERIV_DEMO_TRADING_ENABLED === "true";
  const brokerBuyEnabled = process.env.DERIV_DEMO_BROKER_BUY_ENABLED === "true";

  // Fail closed at every gate. A switch alone cannot prove account ownership,
  // broker authorization, a successful production migration, or a safe quote.
  const reason = !pilotAuthorized ? "DEMO_PILOT_NOT_AUTHORIZED"
    : !executionEnabled ? "DEMO_EXECUTION_DISABLED"
    : !brokerBuyEnabled ? "DEMO_BROKER_BUY_SAFETY_HOLD"
    : "ACCOUNT_AND_DATABASE_VERIFICATION_REQUIRED";

  return NextResponse.json({
    ready: false,
    executionEnabled: pilotAuthorized && executionEnabled,
    brokerBuyEnabled: pilotAuthorized && executionEnabled && brokerBuyEnabled,
    reason,
    mode: "demo",
  }, { headers });
}
