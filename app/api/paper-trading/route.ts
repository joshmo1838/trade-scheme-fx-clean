import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store, max-age=0" };
const isUuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Paper-risk server configuration is incomplete.");
  return createSupabaseAdmin(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function authenticatedCustomer() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

export async function GET(request: Request) {
  try {
    const user = await authenticatedCustomer();
    if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401, headers: noStore });

    const botId = new URL(request.url).searchParams.get("botId");
    if (!isUuid(botId)) return NextResponse.json({ error: "A valid bot ID is required." }, { status: 400, headers: noStore });

    const admin = adminClient();
    const [configResult, selectionResult] = await Promise.all([
      admin.from("customer_bot_configurations")
        .select("stake_amount,daily_loss_limit")
        .eq("customer_id", user.id).eq("bot_id", botId).eq("trading_mode", "demo").maybeSingle(),
      admin.from("customer_bots")
        .select("id,selected,control_status")
        .eq("customer_id", user.id).eq("bot_id", botId).eq("trading_mode", "demo").maybeSingle(),
    ]);

    if (configResult.error || selectionResult.error) {
      console.error("Paper-risk status lookup failed:", { configCode: configResult.error?.code, selectionCode: selectionResult.error?.code });
      return NextResponse.json({ error: "Could not verify the saved paper-risk settings." }, { status: 500, headers: noStore });
    }

    const config = configResult.data;
    const selection = selectionResult.data;
    const dailyLossLimit = config?.daily_loss_limit == null ? null : Number(config.daily_loss_limit);
    const stakeAmount = config?.stake_amount == null ? null : Number(config.stake_amount);

    if (!config || !selection || selection.selected !== true || selection.control_status !== "selected") {
      return NextResponse.json({ enabled: false, error: "Select this bot and save its paper settings before starting." }, { status: 409, headers: noStore });
    }
    if (!Number.isFinite(dailyLossLimit) || dailyLossLimit === null || dailyLossLimit <= 0 || !Number.isFinite(stakeAmount) || stakeAmount === null || stakeAmount < 10 || stakeAmount > 100) {
      return NextResponse.json({ enabled: false, error: "A positive daily loss limit and valid saved stake are required." }, { status: 409, headers: noStore });
    }

    const riskDate = new Date().toISOString().slice(0, 10);
    const { data: risk, error: riskError } = await admin.from("customer_paper_daily_risk")
      .select("risk_date,daily_loss_limit,realized_loss,reserved_loss")
      .eq("customer_id", user.id).eq("bot_id", botId).eq("risk_date", riskDate).maybeSingle();

    if (riskError) {
      console.error("Paper-risk daily record lookup failed:", riskError.code);
      return NextResponse.json({ error: "Could not read today's paper-risk record. Apply the SENFX paper-risk migration first." }, { status: 503, headers: noStore });
    }

    const dailyLoss = Number(risk?.realized_loss ?? 0);
    const reservedLoss = Number(risk?.reserved_loss ?? 0);
    const effectiveLimit = Math.min(dailyLossLimit, Number(risk?.daily_loss_limit ?? dailyLossLimit));
    const remainingLossBudget = Math.max(0, effectiveLimit - dailyLoss - reservedLoss);

    return NextResponse.json({
      enabled: true,
      riskDate,
      stakeAmount,
      dailyLoss,
      reservedLoss,
      dailyLossLimit: effectiveLimit,
      remainingLossBudget,
      limitReached: dailyLoss + reservedLoss + stakeAmount > effectiveLimit,
      resetAt: riskDate + "T00:00:00Z",
      resetTimeZone: "UTC",
    }, { headers: noStore });
  } catch (error) {
    console.error("Paper-risk status error:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Unable to verify paper-risk status." }, { status: 500, headers: noStore });
  }
}

export async function POST(request: Request) {
  try {
    const user = await authenticatedCustomer();
    if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401, headers: noStore });

    let body: any;
    try { body = await request.json(); }
    catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400, headers: noStore }); }

    const admin = adminClient();

    if (body?.action === "reserve") {
      if (!isUuid(body.botId) || typeof body.marketSymbol !== "string" ||
          (body.direction !== "CALL" && body.direction !== "PUT") ||
          typeof body.entryPrice !== "number" || !Number.isFinite(body.entryPrice) || body.entryPrice <= 0) {
        return NextResponse.json({ allowed: false, reason: "Invalid paper-trade entry details." }, { status: 400, headers: noStore });
      }

      const { data, error } = await admin.rpc("senfx_paper_reserve_trade", {
        p_customer_id: user.id,
        p_bot_id: body.botId,
        p_market_symbol: body.marketSymbol,
        p_direction: body.direction,
        p_entry_price: body.entryPrice,
      });
      if (error) {
        console.error("Paper-risk reserve failed:", { code: error.code, message: error.message });
        return NextResponse.json({ allowed: false, reason: "The server could not reserve paper risk. Confirm the SENFX paper-risk migration is applied." }, { status: 503, headers: noStore });
      }
      return NextResponse.json(data, { headers: noStore });
    }

    if (body?.action === "settle") {
      if (!isUuid(body.reservationId) || typeof body.exitPrice !== "number" ||
          !Number.isFinite(body.exitPrice) || body.exitPrice <= 0) {
        return NextResponse.json({ settled: false, reason: "Invalid paper-trade settlement details." }, { status: 400, headers: noStore });
      }
      const { data, error } = await admin.rpc("senfx_paper_settle_trade", {
        p_customer_id: user.id,
        p_reservation_id: body.reservationId,
        p_exit_price: body.exitPrice,
      });
      if (error) {
        console.error("Paper-risk settlement failed:", { code: error.code, message: error.message });
        return NextResponse.json({ settled: false, reason: "The server could not safely settle this paper trade. The simulation has been stopped." }, { status: 503, headers: noStore });
      }
      return NextResponse.json(data, { headers: noStore });
    }

    if (body?.action === "cancel") {
      if (!isUuid(body.reservationId)) {
        return NextResponse.json({ cancelled: false, reason: "Invalid paper reservation." }, { status: 400, headers: noStore });
      }
      const { data, error } = await admin.rpc("senfx_paper_cancel_reservation", {
        p_customer_id: user.id,
        p_reservation_id: body.reservationId,
      });
      if (error) {
        console.error("Paper-risk cancellation failed:", { code: error.code, message: error.message });
        return NextResponse.json({ cancelled: false, reason: "Could not release the paper reservation." }, { status: 503, headers: noStore });
      }
      return NextResponse.json(data, { headers: noStore });
    }

    return NextResponse.json({ error: "Unsupported paper-risk action." }, { status: 400, headers: noStore });
  } catch (error) {
    console.error("Paper-risk API error:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Unable to process the paper-risk request." }, { status: 500, headers: noStore });
  }
}
