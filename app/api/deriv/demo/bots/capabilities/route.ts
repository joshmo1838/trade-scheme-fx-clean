import { NextRequest, NextResponse } from "next/server";
import { getDerivDemoContext, openDerivDemoSession, safeDemoError } from "@/lib/deriv/demo-server";
import {
 getDemoBotTemplate, brokerSupportsTemplate, SENFX_DEMO_BOT_TEMPLATES,
} from "@/lib/deriv/demo-bot-contracts.mjs";

export const dynamic="force-dynamic";
export const runtime="nodejs";
export const maxDuration=25;
const noStore={"Cache-Control":"no-store, max-age=0"};

/**
 * READ-ONLY DEMO BROKER CAPABILITIES.
 * Uses the authenticated /ws/demo OTP-backed session, NOT /ws/real.
 * No proposal purchase, no automatic buy and no new trading grants.
 */
export async function GET(request:NextRequest) {
 try {
  if(process.env.SENFX_DEMO_READONLY_DIAGNOSTICS_ENABLED!=="true") {
   return NextResponse.json({ready:false,code:"DEMO_NOT_ENABLED"}, {status:503,headers:noStore});
  }
  const botId=request.nextUrl.searchParams.get("botId");
  if(!botId||!getDemoBotTemplate(botId)) {
   return NextResponse.json({ready:false,code:"UNKNOWN_SENFX_BOT",total:SENFX_DEMO_BOT_TEMPLATES.length},
    {status:400,headers:noStore});
  }
  const bot=getDemoBotTemplate(botId)!;
  const context=await getDerivDemoContext();
  if(context.account.account_type!=="demo"||context.account.currency!=="USD") {
   return NextResponse.json({ready:false,code:"VERIFIED_DEMO_USD_ACCOUNT_REQUIRED"},
    {status:403,headers:noStore});
  }
  const session=await openDerivDemoSession(context);
  try {
   const result=await session.request<any>("contracts_for",{
    contracts_for:bot.symbol,
   },10000);
   const entries=result?.contracts_for?.available;
   if(!Array.isArray(entries)) {
    return NextResponse.json({ready:false,botId,market:bot.symbol,
     code:"DERIV_CONTRACTS_METADATA_MISSING"},{status:503,headers:noStore});
   }
   const supportedTypes=bot.types.filter((type:string)=>
    entries.some((x:any)=>x&&x.contract_type===type));
   const supported=brokerSupportsTemplate(bot,entries);
   return NextResponse.json({
    broker:"Deriv Options",
    accountType:"demo",
    mode:"broker-contract-capability-read-only",
    botId,market:bot.symbol,
    supported,supportedTypes,
    requiredTypes:bot.types,
    contractDuration:bot.ticks?{ticks:bot.ticks}:{minutes:bot.minutes},
    note:bot.id==="breakout-higher-lower"
     ?"Direction-only Rise/Fall mapping, not a barrier-based HIGHER/LOWER contract."
     :"Deriv-supported contracts still require verified quotes, risk, consent and settlement handling.",
    purchaseEnabled:false,
    botOrdersPlaced:0,
   },{headers:noStore});
  } finally {
   session.close();
  }
 }catch(error) {
  const safe=safeDemoError(error);
  return NextResponse.json({ready:false,error:safe.error,code:safe.code},
   {status:safe.status,headers:noStore});
 }
}
