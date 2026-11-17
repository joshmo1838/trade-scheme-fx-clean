import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PAPER_MARKETS = new Set(["R_10", "R_25", "R_50", "R_75", "R_100", "frxEURUSD"]);

function getLatestPublicQuote(symbol: string): Promise<number> {
  if (!PAPER_MARKETS.has(symbol)) return Promise.reject(new Error("Unsupported paper market."));
  if (typeof WebSocket === "undefined") return Promise.reject(new Error("Server WebSocket support is unavailable."));

  return new Promise((resolve, reject) => {
    const socket = new WebSocket("wss://api.derivws.com/trading/v1/options/ws/public");
    let finished = false;
    const finish = (error?: Error, price?: number) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      try { socket.close(); } catch { /* Socket may already be closed. */ }
      if (error) reject(error);
      else if (price !== undefined) resolve(price);
      else reject(new Error("No valid market quote was returned."));
    };
    const timer = setTimeout(() => finish(new Error("Timed out waiting for a server-side market quote.")), 7000);

    socket.addEventListener("open", () => {
      socket.send(JSON.stringify({ ticks: symbol, subscribe: 1, req_id: 1 }));
    });
    socket.addEventListener("message", event => {
      try {
        const message = JSON.parse(String(event.data));
        if (message.error) {
          finish(new Error("Deriv public feed returned an error."));
          return;
        }
        if (message.msg_type !== "tick" || !message.tick || message.tick.symbol !== symbol) return;
        const quote = Number(message.tick.quote);
        if (Number.isFinite(quote) && quote > 0) finish(undefined, quote);
      } catch {
        finish(new Error("Could not parse the server-side market quote."));
      }
    });
    socket.addEventListener("error", () => finish(new Error("Could not connect to the Deriv public feed.")));
    socket.addEventListener("close", () => {
      if (!finished) finish(new Error("Deriv public feed closed before returning a quote."));
    });
  });
}

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

    const nextReset = new Date(riskDate + "T00:00:00Z");
    nextReset.setUTCDate(nextReset.getUTCDate() + 1);

    return NextResponse.json({
      enabled: true,
      riskDate,
      stakeAmount,
      dailyLoss,
      reservedLoss,
      dailyLossLimit: effectiveLimit,
      remainingLossBudget,
      limitReached: dailyLoss + reservedLoss + stakeAmount > effectiveLimit,
      resetAt: nextReset.toISOString(),
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
          !PAPER_MARKETS.has(body.marketSymbol) ||
          (body.direction !== "CALL" && body.direction !== "PUT")) {
        return NextResponse.json({ allowed: false, reason: "Invalid paper-trade entry details." }, { status: 400, headers: noStore });
      }

      let entryPrice: number;
      try { entryPrice = await getLatestPublicQuote(body.marketSymbol); }
      catch {
        return NextResponse.json({ allowed: false, reason: "The server could not verify a fresh Deriv market quote. No paper position was opened." }, { status: 503, headers: noStore });
      }

      const { data, error } = await admin.rpc("senfx_paper_reserve_trade", {
        p_customer_id: user.id,
        p_bot_id: body.botId,
        p_market_symbol: body.marketSymbol,
        p_direction: body.direction,
        p_entry_price: entryPrice,
      });
      if (error) {
        console.error("Paper-risk reserve failed:", { code: error.code, message: error.message });
        return NextResponse.json({ allowed: false, reason: "The server could not reserve paper risk. Confirm the SENFX paper-risk migration is applied." }, { status: 503, headers: noStore });
      }
      return NextResponse.json(data, { headers: noStore });
    }

    if (body?.action === "settle") {
      if (!isUuid(body.reservationId)) {
        return NextResponse.json({ settled: false, reason: "Invalid paper-trade settlement details." }, { status: 400, headers: noStore });
      }

      const { data: reservation, error: reservationError } = await admin
        .from("customer_paper_trade_reservations")
        .select("market_symbol,status")
        .eq("id", body.reservationId)
        .eq("customer_id", user.id)
        .maybeSingle();
      if (reservationError || !reservation || reservation.status !== "open" || !PAPER_MARKETS.has(reservation.market_symbol)) {
        return NextResponse.json({ settled: false, reason: "The open paper reservation could not be verified." }, { status: 409, headers: noStore });
      }

      let exitPrice: number;
      try { exitPrice = await getLatestPublicQuote(reservation.market_symbol); }
      catch {
        return NextResponse.json({ settled: false, reason: "The server could not verify a fresh Deriv exit quote. The reservation remains held and the simulation has stopped." }, { status: 503, headers: noStore });
      }

      const { data, error } = await admin.rpc("senfx_paper_settle_trade", {
        p_customer_id: user.id,
        p_reservation_id: body.reservationId,
        p_exit_price: exitPrice,
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
