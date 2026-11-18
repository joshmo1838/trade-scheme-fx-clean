import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { nextBotDesiredState } from "@/lib/bots/control-state";
import { DIGIT_MATRIX_NAME } from "@/lib/bots/digit-matrix";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const noStore = { "Cache-Control": "no-store, max-age=0" };
const isUuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

async function userId(): Promise<string | null> {
  const client = await createClient();
  const { data: { user }, error } = await client.auth.getUser();
  return error || !user ? null : user.id;
}

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Bot control server configuration unavailable.");
  return createAdminClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function disabled() {
  return process.env.SENFX_BOT_CONTROL_ENABLED !== "true";
}

export async function GET() {
  const customerId = await userId();
  if (!customerId) {
    return NextResponse.json({ error: "Please sign in." }, { status: 401, headers: noStore });
  }
  if (disabled()) {
    return NextResponse.json({
      enabled: false, mode: "paper", runs: [], commands: [], positions: [], dailyRisk: [],
      message: "Server bot control is not enabled. Existing browser paper trading is separate.",
    }, { headers: noStore });
  }

  try {
    const db = await createClient();
    const riskDate = new Date().toISOString().slice(0, 10);
    const [runs, commands, positions, dailyRisk] = await Promise.all([
      db.from("bot_execution_runs")
        .select("id,bot_id,mode,desired_state,observed_state,control_version,heartbeat_at,lease_expires_at,last_error,updated_at")
        .eq("customer_id", customerId).order("updated_at", { ascending: false }).limit(40),
      db.from("bot_execution_commands")
        .select("id,bot_id,action,requested_state,version,status,created_at,acknowledged_at")
        .eq("customer_id", customerId).order("created_at", { ascending: false }).limit(30),
      db.from("bot_execution_paper_positions")
        .select("id,bot_id,status,remaining_ticks,entered_at")
        .eq("customer_id", customerId).eq("status", "open")
        .order("entered_at", { ascending: false }).limit(40),
      db.from("customer_paper_daily_risk")
        .select("bot_id,risk_date,daily_loss_limit,realized_loss,reserved_loss")
        .eq("customer_id", customerId).eq("risk_date", riskDate).limit(80),
    ]);
    if (runs.error || commands.error || positions.error || dailyRisk.error) {
      return NextResponse.json({ error: "Bot control database is unavailable. Apply the reviewed migration." },
        { status: 503, headers: noStore });
    }
    // A worker is connected only if its database lease AND recent heartbeat
    // are valid; stale rows must not advertise an active bot.
    const now = Date.now();
    const monitoredRuns = (runs.data || []).map(run => {
      const heartbeatMs = run.heartbeat_at ? new Date(run.heartbeat_at).getTime() : NaN;
      const expiryMs = run.lease_expires_at ? new Date(run.lease_expires_at).getTime() : NaN;
      const connected = Number.isFinite(heartbeatMs) && Number.isFinite(expiryMs)
        && heartbeatMs <= now + 5_000 && now - heartbeatMs <= 15_000 && expiryMs > now;
      return { ...run, workerConnected: connected };
    });
    return NextResponse.json({
      enabled: true, mode: "paper",
      workerAttached: monitoredRuns.some(run => run.workerConnected),
      runs: monitoredRuns, commands: commands.data || [],
      positions: positions.data || [], dailyRisk: dailyRisk.data || [], riskDate,
      message: "Requested states and queued commands do not prove actual execution. Open paper positions and reserved amounts reflect saved database records.",
    }, { headers: noStore });
  } catch {
    return NextResponse.json({ error: "Unable to read paper bot controls." },
      { status: 503, headers: noStore });
  }
}

export async function POST(request: NextRequest) {
  const customerId = await userId();
  if (!customerId) {
    return NextResponse.json({ error: "Please sign in." }, { status: 401, headers: noStore });
  }
  if (disabled()) {
    return NextResponse.json({ error: "Server bot control is disabled until the paper worker is verified." },
      { status: 503, headers: noStore });
  }
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "A same-origin request is required." },
      { status: 403, headers: noStore });
  }

  let body: { botId?: unknown; commandId?: unknown; action?: unknown };
  try {
    const raw = await request.text();
    if (raw.length > 2048) {
      return NextResponse.json({ error: "Command exceeds size limit." },
        { status: 413, headers: noStore });
    }
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400, headers: noStore });
  }

  const action = body?.action;
  const botId = body?.botId;
  const commandId = body?.commandId ?? randomUUID();

  if (!isUuid(botId) || !isUuid(commandId) ||
      (action !== "start" && action !== "pause" && action !== "resume" && action !== "stop") ||
      nextBotDesiredState("stopped", action) === null && action !== "pause" && action !== "resume") {
    return NextResponse.json({ error: "Invalid paper bot command." },
      { status: 400, headers: noStore });
  }

  try {
    const db = admin();
    // This product analyzes digits but does not implement Digit contracts.
    // Do not let a user queue the generic CALL/PUT worker under its name.
    const { data: bot, error: botError } = await db.from("bots")
      .select("name").eq("id", botId).maybeSingle();
    if (botError) {
      return NextResponse.json({ error: "Bot catalog database unavailable." },
        { status: 503, headers: noStore });
    }
    if (!bot) {
      return NextResponse.json({ error: "Unknown bot." },
        { status: 409, headers: noStore });
    }
    if (bot.name === DIGIT_MATRIX_NAME) {
      return NextResponse.json({
        error: "SENFX Digit Matrix is scanner-only. Open /digit-matrix; no broker or paper-direction orders are supported.",
      }, { status: 409, headers: noStore });
    }
    const { data, error } = await db.rpc("senfx_queue_paper_bot_command", {
      p_customer_id: customerId,
      p_bot_id: botId,
      p_command_id: commandId,
      p_action: action,
    });
    if (error) {
      console.error("Paper bot control command failed:", error.code);
      return NextResponse.json({ error: "Server could not store the paper command safely." },
        { status: 503, headers: noStore });
    }
    if (!data?.accepted) {
      return NextResponse.json({ accepted: false, error: data?.reason || "Command rejected." },
        { status: 409, headers: noStore });
    }
    return NextResponse.json({
      ...data, mode: "paper",
      executed: false, brokerOrderPlaced: false,
      message: "Command queued. Verify observed state and worker connection in bot control status. No broker order was placed.",
    }, { status: 202, headers: noStore });
  } catch {
    return NextResponse.json({ error: "Bot control service unavailable." },
      { status: 503, headers: noStore });
  }
}
