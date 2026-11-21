import {NextRequest,NextResponse} from "next/server";
import {createClient as createAdminClient} from "@supabase/supabase-js";
import {getDerivDemoContext,openDerivDemoSession,safeDemoError} from "@/lib/deriv/demo-server";
import {deriveDemoProposal} from "@/lib/deriv/demo-bot-contracts.mjs";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=35;
const noStore={"Cache-Control":"private, no-store, max-age=0"};
type Candidate={botId:string;prediction:string;barrier?:number};
type QuoteRow={
 botId:string;symbol:string;contractType:string;barrier:string|null;
 stake:number;askPrice:number;payout:number;netWinProfit:number;
 returnOnStakePercent:number;breakEvenWinRatePercent:number;
};

function failure(code:string,status=400){
 return NextResponse.json({ok:false,code,brokerOrdersPlaced:0},{status,headers:noStore});
}

/**
 * Read-only broker price discovery for the UNCHANGED fifteen SENFX contract
 * mappings. The browser's prediction merely selects what to quote; it
 * is not a verified trade signal and is NEVER used to place an order.
 */
export async function POST(request:NextRequest){
 let session:Awaited<ReturnType<typeof openDerivDemoSession>>|null=null;
 try{
  const origin=request.headers.get("origin");
  if(!origin||origin!==request.nextUrl.origin)return failure("SAME_ORIGIN_REQUIRED",403);
  const raw=await request.text();
  if(raw.length>6000)return failure("PAYOUT_PREVIEW_REQUEST_TOO_LARGE",400);
  let body:unknown;
  try{body=JSON.parse(raw);}catch{return failure("INVALID_JSON",400);}
  if(!body||typeof body!=="object")return failure("INVALID_PREVIEW_REQUEST",400);
  const b=body as Record<string,unknown>;
  const rawStake=b.stakeAmount;
  if(typeof rawStake!=="string"||
     !/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(rawStake)||
     rawStake.length>16||!Number.isFinite(Number(rawStake))||
     Number(rawStake)<=0||!Number.isSafeInteger(Math.round(Number(rawStake)*100)))
   return failure("FINITE_DEMO_QUOTE_STAKE_REQUIRED",400);
  const stake=Number(rawStake);
  if(!Array.isArray(b.candidates)||b.candidates.length===0||
     b.candidates.length>15)return failure("INVALID_PREVIEW_CANDIDATES",400);
  const ids=new Set<string>();
  const requests:{item:Candidate;proposal:NonNullable<ReturnType<typeof deriveDemoProposal>>}[]=[];
  for(const entry of b.candidates){
   if(!entry||typeof entry!=="object")return failure("INVALID_PREVIEW_CANDIDATE",400);
   const c=entry as Candidate;
   if(typeof c.botId!=="string"||typeof c.prediction!=="string"||
      ids.has(c.botId)||c.botId.length>90||
      (c.barrier!==undefined&&(!Number.isInteger(c.barrier)||c.barrier<0||c.barrier>9)))
    return failure("INVALID_PREVIEW_CANDIDATE",400);
   const proposal=deriveDemoProposal(c.botId,c.prediction,c.barrier,stake);
   if(!proposal)return failure("BOT_CONTRACT_MAPPING_MISMATCH",400);
   ids.add(c.botId);
   requests.push({item:c,proposal});
  }

  const context=await getDerivDemoContext();
  const {data:profile,error}=await context.admin.from("profiles")
   .select("role").eq("id",context.user.id).maybeSingle();
  if(error||profile?.role!=="admin")return failure("ADMIN_DEMO_LOGIN_REQUIRED",403);
  if(context.account.account_type!=="demo"||context.account.currency!=="USD"||
     context.account.status!=="active")return failure("VIRTUAL_USD_DEMO_REQUIRED",409);
  if(!Number.isFinite(Number(context.account.balance))||
     Number(context.account.balance)<stake)return failure("INSUFFICIENT_DEMO_QUOTE_BALANCE",409);

  session=await openDerivDemoSession(context);
  // Read-only Deriv proposals. No database mutation, no buy instruction,
  // no automatic contract change and no real-money account.
  const settled=await Promise.allSettled(requests.map(async ({item,proposal})=>{
   const response=await session!.request("proposal",proposal,9000);
   const quote=response?.proposal;
   const ask=Number(quote?.ask_price);
   const payout=Number(quote?.payout);
   if(typeof quote?.id!=="string"||!quote.id||
      !Number.isFinite(ask)||ask<=0||!Number.isFinite(payout)||payout<=0||
      Math.abs(ask-stake)>0.011)
    throw Error("BROKER_QUOTE_INVALID");
   const row:QuoteRow={
    botId:item.botId,symbol:String(proposal.underlying_symbol),
    contractType:String(proposal.contract_type),
    barrier:proposal.barrier===undefined?null:String(proposal.barrier),
    stake,askPrice:ask,payout,
    netWinProfit:Number((payout-ask).toFixed(2)),
    returnOnStakePercent:Number(((payout-ask)/ask*100).toFixed(2)),
    breakEvenWinRatePercent:Number((ask/payout*100).toFixed(2))
   };
   return row;
  }));
  const quotes:QuoteRow[]=[];
  const skipped:{botId:string;code:string}[]=[];
  settled.forEach((result,i)=>{
   if(result.status==="fulfilled")quotes.push(result.value);
   else skipped.push({botId:requests[i].item.botId,code:"QUOTE_NOT_AVAILABLE"});
  });
  quotes.sort((a,b)=>b.returnOnStakePercent-a.returnOnStakePercent);
  return NextResponse.json({
   ok:true,mode:"deriv-virtual-demo-quotes-only",asOf:new Date().toISOString(),
   stakeAmount:stake,quoted:quotes.length,requested:requests.length,
   quotes,skipped,brokerOrdersPlaced:0,realMoneySupported:false,
   warning:"Quotes are time-sensitive and do not guarantee an edge. Higher payout generally means a lower chance of winning. The original 15 strategies and their executable contracts have not changed."
  },{headers:noStore});
 }catch(error){
  const safe=safeDemoError(error);
  return NextResponse.json({ok:false,code:safe.code,error:safe.error,
   brokerOrdersPlaced:0},{status:safe.status,headers:noStore});
 }finally{
  try{session?.close();}catch{/* A read-only quote session has no purchase to reconcile. */}
 }
}
