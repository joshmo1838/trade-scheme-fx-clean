import {NextRequest, NextResponse} from "next/server";
import {getDerivDemoContext,openDerivDemoSession,safeDemoError} from "@/lib/deriv/demo-server";
import {deriveDemoProposal,getDemoBotTemplate,brokerSupportsTemplate} from "@/lib/deriv/demo-bot-contracts.mjs";

export const dynamic="force-dynamic";
export const runtime="nodejs";
export const maxDuration=25;
const noStore={"Cache-Control":"no-store, max-age=0"};

/**
 * REAL DERIV DEMO BROKER PROPOSAL ONLY.
 * NOT an automated strategy signal or broker buy.
 * The quote socket closes at completion: do NOT reuse its proposal ID in a buy.
 */
export async function POST(request:NextRequest){
 let session:Awaited<ReturnType<typeof openDerivDemoSession>>|null=null;
 try{
  const origin=request.headers.get("origin");
  if(!origin||origin!==request.nextUrl.origin)
   return NextResponse.json({success:false,code:"SAME_ORIGIN_REQUIRED"},{status:403,headers:noStore});
  if(process.env.DERIV_DEMO_TRADING_ENABLED!=="true")
   return NextResponse.json({success:false,code:"DEMO_DISABLED"},{status:503,headers:noStore});
  const raw=await request.text();
  if(raw.length>2048)return NextResponse.json({success:false,code:"REQUEST_TOO_LARGE"},{status:400,headers:noStore});
  let body:Record<string,unknown>;
  try{body=JSON.parse(raw);}catch{
   return NextResponse.json({success:false,code:"INVALID_JSON"},{status:400,headers:noStore});
  }
  if(!body||typeof body!=="object"||Array.isArray(body)||
     typeof body.botId!=="string"||typeof body.prediction!=="string"||
   typeof body.stake!=="number")
   return NextResponse.json({success:false,code:"INVALID_CONTRACT_SELECTION"},{status:400,headers:noStore});
  const proposal=deriveDemoProposal(
   body.botId,body.prediction,
   typeof body.barrier==="string"||typeof body.barrier==="number"?body.barrier:undefined,
   body.stake);
  const bot=getDemoBotTemplate(body.botId);
  if(!bot||!proposal)
   return NextResponse.json({success:false,code:"UNSUPPORTED_DEMO_BOT_CONTRACT"},{status:400,headers:noStore});
  const context=await getDerivDemoContext();
  if(context.account.account_type!=="demo"||context.account.currency!=="USD")
   return NextResponse.json({success:false,code:"DEMO_ACCOUNT_REQUIRED"},{status:403,headers:noStore});
  const virtualBalance=Number(context.account.balance);
  if(!Number.isFinite(virtualBalance)||virtualBalance<body.stake)
   return NextResponse.json({success:false,code:"INSUFFICIENT_VIRTUAL_BALANCE"},{status:409,headers:noStore});
  session=await openDerivDemoSession(context); // server verifies wss ... /ws/demo via OTP.
  const availability=await session.request<any>("contracts_for",{contracts_for:bot.symbol,currency:"USD"},8000);
  if(!brokerSupportsTemplate(bot,availability?.contracts_for?.available))
   return NextResponse.json({success:false,code:"BROKER_CONTRACT_NOT_AVAILABLE"},{status:409,headers:noStore});
  const price=await session.request<any>("proposal",proposal,8000);
  const quote=price?.proposal;
  const askPrice=Number(quote?.ask_price),payout=Number(quote?.payout);
  const quoteId=typeof quote?.id==="string"?quote.id:"";
  if(!/^[A-Za-z0-9_-]{32,128}$/.test(quoteId)||
     !Number.isFinite(askPrice)||askPrice<=0||askPrice>body.stake||
     !Number.isFinite(payout)||payout<=0||
     typeof quote?.longcode!=="string"||quote.longcode.length>500)
   return NextResponse.json({success:false,code:"INVALID_DERIV_DEMO_PROPOSAL"},{status:502,headers:noStore});
  return NextResponse.json({
   success:true,accountType:"demo",mode:"verified-broker-proposal-no-buy",
   botId:bot.id,symbol:bot.symbol,
   contractType:proposal.contract_type,
   duration:proposal.duration,durationUnit:proposal.duration_unit,
   barrier:"barrier" in proposal?proposal.barrier:null,
   virtualStake:body.stake,currency:"USD",askPrice,payout,
   longcode:quote.longcode,
   expiresWithSession:true,
   brokerOrderPlaced:false,
   purchaseEnabled:false,
  },{headers:noStore});
 }catch(error){
  const safe=safeDemoError(error);
  return NextResponse.json({success:false,error:safe.error,code:safe.code},
   {status:safe.status,headers:noStore});
 }finally{
  session?.close();
 }
}
