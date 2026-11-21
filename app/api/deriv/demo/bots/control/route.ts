import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {createClient as createAdminClient} from "@supabase/supabase-js";
import {isAuthorizedDemoPilot} from "@/lib/deriv/demo-account-allowlist.mjs";
import {getDerivDemoContext,safeDemoError} from "@/lib/deriv/demo-server";
import {SENFX_DEMO_BOT_TEMPLATES} from "@/lib/deriv/demo-bot-contracts.mjs";

export const dynamic="force-dynamic";
export const runtime="nodejs";
export const maxDuration=25;
const noStore={"Cache-Control":"no-store, max-age=0"};

async function authorizedAdmin() {
 const auth=await createClient();
 const {data:{user},error}=await auth.auth.getUser();
 if(error||!user) return {userId:null,db:null};
 if(!isAuthorizedDemoPilot(user.id,process.env.DERIV_DEMO_PILOT_USER_ID))
  return {userId:null,db:null};
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)return {userId:null,db:null};
 const db=createAdminClient(url,key,{
  auth:{persistSession:false,autoRefreshToken:false}
 });
 const {data:profile,error:profileError}=await db.from("profiles")
  .select("role").eq("id",user.id).maybeSingle();
 if(profileError||profile?.role!=="admin")return {userId:null,db:null};
 return {userId:user.id,db};
}
function denied(code:string,status=403) {
 return NextResponse.json({ok:false,code,brokerOrderPlaced:false},{status,headers:noStore});
}

/** Worker state is only ACTIVE after a fresh database lease/heartbeat.
 * A requested start without an owned worker must never claim bots execute.
 */
export async function GET(){
 try{
  const {userId,db}=await authorizedAdmin();
  if(!userId||!db)return denied("ADMIN_DEMO_LOGIN_REQUIRED",401);
  const {data,error}=await db.from("senfx_demo_bot_control")
   .select("account_id,mode,observed_state,control_version,heartbeat_at,lease_expires_at,stake_amount,selected_bot_id,target_trades,updated_at")
   .eq("user_id",userId).maybeSingle();
  if(error)return denied("STAGED_15BOT_SCHEMA_NOT_RELEASED",503);
  const now=Date.now();
  const lease=new Date(data?.lease_expires_at||0).getTime();
  const heartbeat=new Date(data?.heartbeat_at||0).getTime();
  const attached=!!data&&data.mode==="running"&&data.observed_state==="running"&&
   lease>now&&heartbeat>now-15000&&heartbeat<=now+5000;
  const historyVersion=data?.mode==="stopped"?data.control_version-1:data?.control_version;
  const history=data?.selected_bot_id
   ?await db.from("senfx_demo_bot_orders")
     .select("status,profit,buy_requested_at")
     .eq("user_id",userId).eq("control_version",historyVersion)
     .eq("bot_id",data.selected_bot_id).limit(200)
   :null;
  const completed=(history?.data||[]).filter(x=>["won","lost","sold"].includes(x.status));
  const progress=history&&!history.error?{
   tradesAttempted:(history.data||[]).filter(x=>x.buy_requested_at!==null).length,
   completed:completed.length,
   wins:completed.filter(x=>x.status==="won").length,
   losses:completed.filter(x=>x.status==="lost").length,
   netVirtualProfit:completed.reduce((sum,x)=>sum+Number(x.profit||0),0)
  }:null;
  const buyOn=process.env.DERIV_DEMO_BROKER_BUY_ENABLED==="true";
  const operatorOn=process.env.SENFX_DEMO_15BOT_CONTROL_ENABLED==="true";
  const workerEnabled=process.env.SENFX_DEMO_15BOT_BROKER_EXECUTION_ENABLED==="true";
  return NextResponse.json({
   ok:true,mode:"virtual-deriv-demo-only",botCount:15,
   run:data?{
    desiredState:data.mode,observedState:attached?"running":"stopped-or-disconnected",
    version:data.control_version,accountId:data.account_id,
    stakeAmount:data.stake_amount===null?null:Number(data.stake_amount),
    appDailyLossCap:null,appDailyTradeCountCap:null,workerConnected:attached,
    selectedBotId:data.selected_bot_id,targetTrades:data.target_trades,progress,
    updatedAt:data.updated_at,
   }:null,
   controlsEnabled:operatorOn&&workerEnabled&&buyOn,
   brokerBuyingEnabled:buyOn&&workerEnabled,
   realMoneySupported:false,
   message:attached?"15-bot worker lease verified; use broker order records to confirm actual trades.":
    "15-bot broker worker is not attached. Requested states alone are not evidence of trading.",
  },{headers:noStore});
 }catch{
  return denied("DEMO_CONTROL_UNAVAILABLE",503);
 }
}
export async function POST(request:NextRequest){
 try{
  const origin=request.headers.get("origin");
  if(!origin||origin!==request.nextUrl.origin)return denied("SAME_ORIGIN_REQUIRED",403);
  const raw=await request.text();
  if(raw.length>1024)return denied("CONTROL_REQUEST_TOO_LARGE",400);
  let body:any;
  try{body=JSON.parse(raw);}catch{return denied("INVALID_JSON",400);}
  if(!body||typeof body!=="object"||!["start","stop","start_one"].includes(body.action))
   return denied("UNKNOWN_CONTROL_ACTION",400);
  const {userId,db}=await authorizedAdmin();
  if(!userId||!db)return denied("ADMIN_DEMO_LOGIN_REQUIRED",401);
  const current=await db.from("senfx_demo_bot_control")
   .select("account_id,control_version").eq("user_id",userId).maybeSingle();
  if(current.error)return denied("STAGED_15BOT_SCHEMA_NOT_RELEASED",503);

  // Stop is ALWAYS allowed for the authenticated owner. No active Deriv
  // token, live broker balance, worker permission, or buy feature flag required.
  if(body.action==="stop"){
   if(!current.data)return NextResponse.json({
    ok:true,desiredState:"stopped",brokerOrderPlaced:false
   },{headers:noStore});
   const {data,error}=await db.rpc("senfx_demo_bots_control",{
    p_user_id:userId,p_account_id:current.data.account_id,
    p_command:"stop",p_expected_version:null,p_stake:null
   });
   if(error||data?.ok!==true)return denied("STOP_NOT_CONFIRMED",503);
   return NextResponse.json({
    ok:true,desiredState:"stopped",version:data.version,brokerOrderPlaced:false,
    warning:"Emergency Stop prevents new broker buys, but cannot reverse an already-submitted Deriv contract. Reconcile all unknown orders.",
   },{headers:noStore});
  }

  // Staged branch ships all features OFF by default.
  if(process.env.DERIV_DEMO_TRADING_ENABLED!=="true"||
     process.env.DERIV_DEMO_BROKER_BUY_ENABLED!=="true"||
     process.env.SENFX_DEMO_15BOT_CONTROL_ENABLED!=="true"||
     process.env.SENFX_DEMO_15BOT_BROKER_EXECUTION_ENABLED!=="true")
   return denied("AUTO_BROKER_EXECUTION_NOT_AUTHORIZED_OR_RELEASED",503);
  // The owner explicitly chooses a positive finite USD virtual stake.
  // There is NO SENFX-imposed maximum, daily virtual-loss cap, or daily trade-count cap.
  // Broker constraints and virtual Demo balance still decide what can execute.
  const rawStake=body.stakeAmount;
  if(body.confirmVirtualDemoAutomation!==true||
     typeof rawStake!=="string"||!/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,2})?$/.test(rawStake)||
     rawStake.length>50||!Number.isFinite(Number(rawStake))||Number(rawStake)<=0||
     !Number.isSafeInteger(Math.round(Number(rawStake)*100))||
     !Number.isSafeInteger(body.expectedVersion)||body.expectedVersion<0)
   return denied("EXPLICIT_DEMO_STAKE_AND_CONSENT_REQUIRED",400);
  const chosenStake=Number(rawStake);
  if(body.action==="start_one"&&(
    typeof body.botId!=="string"||
    !SENFX_DEMO_BOT_TEMPLATES.some(x=>x.id===body.botId)||
    !Number.isSafeInteger(body.targetTrades)||
    body.targetTrades<1||body.targetTrades>200
   ))return denied("INDIVIDUAL_BOT_AND_TRADE_COUNT_REQUIRED",400);
  const context=await getDerivDemoContext();
  if(context.user.id!==userId||context.account.account_type!=="demo"||
     context.account.currency!=="USD"||!Number.isFinite(Number(context.account.balance))||
     Number(context.account.balance)<chosenStake)
   return denied("VALID_DERIV_DEMO_USD_REQUIRED",403);
  const {data,error}=body.action==="start_one"
   ?await db.rpc("senfx_demo_bots_start_one",{
     p_user_id:userId,p_account_id:context.account.account_id,
     p_expected_version:body.expectedVersion,p_stake:chosenStake,
     p_bot_id:body.botId,p_target_trades:body.targetTrades
    })
   :await db.rpc("senfx_demo_bots_control",{
     p_user_id:userId,p_account_id:context.account.account_id,
     p_command:"start",p_expected_version:body.expectedVersion,p_stake:chosenStake
    });
  if(error||data?.ok!==true)return denied(String(data?.code||"DEMO_CONTROL_START_REJECTED"),409);
  return NextResponse.json({
   ok:true,desiredState:"running",version:data.version,
   brokerOrderPlaced:false,workerConnected:false,
   selectedBotId:data.selectedBotId||null,targetTrades:data.targetTrades||null,
   message:"Start requested. Broker trading is NOT confirmed until a worker lease and real Deriv order records are verified."
  },{headers:noStore});
 }catch(error){
  const safe=safeDemoError(error);
  return NextResponse.json({ok:false,code:safe.code,error:safe.error,
   brokerOrderPlaced:false},{status:safe.status,headers:noStore});
 }
}
