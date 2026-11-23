import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildResearchSnapshot } from "@/lib/ai/senfx-openai-research";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const noStore = { "Cache-Control": "no-store, max-age=0" };
const cooldown = new Map<string, number>(); // Best-effort per-instance throttle, not global rate limiting.
const COOLDOWN_MS = 60_000;

function enabled() {
  return process.env.SENFX_OPENAI_RESEARCH_ENABLED === "true" &&
    Boolean(process.env.OPENAI_API_KEY?.trim());
}

async function authUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  return error || !user ? null : user.id;
}

export async function GET() {
  const userId = await authUserId();
  if (!userId) return NextResponse.json({ error: "Sign in to view research." }, { status: 401, headers: noStore });
  return NextResponse.json({ ready: enabled(), mode: "manual-read-only-explanation" }, { headers: noStore });
}

export async function POST(request: NextRequest) {
  const userId = await authUserId();
  if (!userId) return NextResponse.json({ error: "Sign in to view research." }, { status: 401, headers: noStore });
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Same-origin request required." }, { status: 403, headers: noStore });
  }
  if (!enabled()) {
    return NextResponse.json({ error: "OpenAI research is not configured or enabled for this deployment." },
      { status: 503, headers: noStore });
  }
  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 10_000) return NextResponse.json({ error: "Sample exceeds size limit." }, { status: 413, headers: noStore });
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid research request." }, { status: 400, headers: noStore });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid research request." }, { status: 400, headers: noStore });
  }
  const data = body as Record<string, unknown>;
  const snapshot = buildResearchSnapshot(data.botId, data.observations, Date.now());
  if (!snapshot.ok) {
    return NextResponse.json({ error: snapshot.error }, { status: 400, headers: noStore });
  }

  const now = Date.now();
  const last = cooldown.get(userId) ?? 0;
  if (now - last < COOLDOWN_MS) {
    return NextResponse.json({ error: "Please allow a minute between AI explanations." }, { status: 429, headers: noStore });
  }
  if (cooldown.size > 2000) cooldown.clear();
  cooldown.set(userId, now);

  const key = process.env.OPENAI_API_KEY!.trim();
  const model = process.env.SENFX_OPENAI_MODEL?.trim() || "gpt-4.1-mini";
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
      body: JSON.stringify({
        model,
        store: false,
        max_output_tokens: 250,
        instructions: [
          "You are SENFX's cautious, descriptive research explainer.",
          "Describe ONLY the aggregate browser-reported tick observations supplied.",
          "Provenance is not independently verified by this API; say so.",
          "These short synthetic-index samples do not establish predictive advantage.",
          "Do not produce entry instructions, BUY/SELL decisions, contract recommendations,",
          "win probability, guaranteed returns, trade approval, or broker execution commands.",
          "Do not change or reinterpret the bot's underlying strategy.",
          "Limit the explanation to 120 words in plain language."
        ].join(" "),
        input: JSON.stringify(snapshot.snapshot),
      }),
    });
    if (!response.ok) {
      return NextResponse.json({ error: "The OpenAI research provider is temporarily unavailable." }, { status: 502, headers: noStore });
    }
    const result: unknown = await response.json();
    if (!result || typeof result !== "object") throw new Error("Malformed model result");
    const output = (result as { output?: unknown }).output;
    const explanation = Array.isArray(output) ? output
      .filter((item: unknown) => item && typeof item === "object" && (item as { type?: string }).type === "message")
      .flatMap((item: { content?: unknown }) => Array.isArray(item.content) ? item.content : [])
      .filter((part: unknown) => part && typeof part === "object" && (part as { type?: string }).type === "output_text")
      .map((part: { text?: unknown }) => typeof part.text === "string" ? part.text : "")
      .join("\n").trim().slice(0, 1800) : "";
    if (!explanation) throw new Error("Empty model explanation");
    return NextResponse.json({
      explanation, botId: snapshot.snapshot.botId,
      observed: snapshot.snapshot.sampleSize, lastEpoch: snapshot.snapshot.lastEpoch,
      mode: "manual-research-explanation", brokerOrderPlaced: false,
    }, { headers: noStore });
  } catch {
    return NextResponse.json({ error: "Could not generate a research explanation. No trades were affected." },
      { status: 502, headers: noStore });
  }
}
