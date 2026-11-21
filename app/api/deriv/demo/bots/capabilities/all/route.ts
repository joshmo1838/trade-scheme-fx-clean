import { NextResponse } from "next/server";
import { getDerivDemoContext, openDerivDemoSession, safeDemoError } from "@/lib/deriv/demo-server";
import { SENFX_DEMO_BOT_TEMPLATES } from "@/lib/deriv/demo-bot-contracts.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 35;
const headers = { "Cache-Control": "no-store, max-age=0" };

/**
 * A single authenticated Demo-only OTP session checks all fifteen original
 * strategy contract TYPES over the ten underlying markets. Never buys.
 * Deriv proposal (stake, duration, barrier) support is a separate check.
 */
export async function GET() {
 let session: Awaited<ReturnType<typeof openDerivDemoSession>> | null = null;
 try {
  if (process.env.SENFX_DEMO_READONLY_DIAGNOSTICS_ENABLED !== "true") {
   return NextResponse.json({ ok: false, code: "DEMO_DIAGNOSTIC_DISABLED" },
    { status: 503, headers });
  }
  const context = await getDerivDemoContext();
  if (context.account.account_type !== "demo" || context.account.currency !== "USD") {
   return NextResponse.json({ ok: false, code: "DEMO_USD_ACCOUNT_REQUIRED" },
    { status: 403, headers });
  }
  session = await openDerivDemoSession(context);
  const symbols = [...new Set(SENFX_DEMO_BOT_TEMPLATES.map(x => x.symbol))];
  const checks = await Promise.all(symbols.map(async (symbol) => {
   try {
    const reply = await session!.request<any>("contracts_for", {
     contracts_for: symbol
    }, 9000);
    const available = reply?.contracts_for?.available;
    if (!Array.isArray(available)) return { symbol, types: [] as string[], verified: false };
    return {
     symbol,
     types: available.filter((x:any) => typeof x?.contract_type === "string")
      .map((x:any) => x.contract_type as string),
     verified: true
    };
   } catch {
    return { symbol, types: [] as string[], verified: false };
   }
  }));
  const bySymbol = new Map(checks.map(x => [x.symbol, x]));
  const bots = SENFX_DEMO_BOT_TEMPLATES.map((bot) => {
   const found = bySymbol.get(bot.symbol);
   const types = found?.types ?? [];
   const supportedTypes = bot.types.filter(type => types.includes(type));
   return {
    id: bot.id, market: bot.symbol,
    typeCheckCompleted: found?.verified === true,
    contractTypeSupported: found?.verified === true &&
      supportedTypes.length === bot.types.length,
    requiredTypes: bot.types, supportedTypes,
    // Explicitly do not claim a real valid broker proposal was returned.
    durationAndStakeVerified: false,
    proxyMapping: bot.id === "breakout-higher-lower"
   };
  });
  return NextResponse.json({
   ok: true,
   mode: "Deriv Demo live contract-type check only",
   accountType: "demo",
   checkedMarkets: symbols.length, checkedBots: bots.length,
   verifiedMarkets: checks.filter(x => x.verified).length,
   compatibleBotTypes: bots.filter(x => x.contractTypeSupported).length,
   unresolvedBots: bots.filter(x => !x.contractTypeSupported).length,
   allFifteenReadyForBrokerPurchases: false,
   actualBrokerOrdersPlaced: 0,
   brokerPurchasesEnabledByCheck: false,
   bots,
   note: "Type availability is not proof that each duration, barrier and user-selected virtual stake can be purchased. All buys remain disabled by this diagnostic."
  }, { headers });
 } catch (error) {
  const safe = safeDemoError(error);
  return NextResponse.json({ok:false,code:safe.code,error:safe.error},
   {status:safe.status,headers});
 } finally {
  session?.close();
 }
}