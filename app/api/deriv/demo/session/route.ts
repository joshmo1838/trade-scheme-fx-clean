import { NextResponse } from "next/server";
import {
  getDerivDemoContext,
  getDemoWebSocketUrl,
  safeDemoError,
} from "@/lib/deriv/demo-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 15;

const noStore = { "Cache-Control": "no-store, max-age=0" };

export async function GET() {
  try {
    if (process.env.DERIV_DEMO_TRADING_ENABLED !== "true") {
      return NextResponse.json(
        { enabled: false, error: "Deriv Demo execution is not enabled for this deployment yet." },
        { status: 503, headers: noStore },
      );
    }

    const context = await getDerivDemoContext();
    const wsUrl = await getDemoWebSocketUrl(context);

    return NextResponse.json({
      success: true,
      account: {
        accountId: context.account.account_id,
        accountType: "demo",
        currency: context.account.currency,
        balance: Number(context.account.balance),
      },
      wsUrl,
      otpExpiresInSeconds: 120,
      note: "This URL contains a short-lived, single-use Demo OTP. Do not share or log it.",
    }, { headers: noStore });
  } catch (error) {
    const safe = safeDemoError(error);
    return NextResponse.json(
      { success: false, error: safe.error, code: safe.code },
      { status: safe.status, headers: noStore },
    );
  }
}
