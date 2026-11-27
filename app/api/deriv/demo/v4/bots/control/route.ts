import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {createClient as createAdminClient, type SupabaseClient} from '@supabase/supabase-js';
import {isAuthorizedDemoPilot} from '@/lib/deriv/demo-account-allowlist.mjs';
import {getDerivDemoContext,safeDemoError} from '@/lib/deriv/demo-server';
import {STRATEGIES} from '@/lib/quantum/strategy-catalog.mjs';
import {normalizeBlocklyExecutionPlan} from '@/lib/quantum/blockly-execution-plan.mjs';

export const dynamic='force-dynamic';
export const runtime='nodejs';
export const maxDuration=25;
const noStore={'Cache-Control':'no-store, max-age=0'};
type BlocklyPlan={strategyId:string;marketCategory:'synthetic_index'|'cryptocurrency';marketSymbol:string;currency:'USD'|'AUD';contractFamily:'MULTIPLIER';multiplier:number;stake:number;perTradeStopLoss:number;perTradeTakeProfit:number;sessionStopLoss:number;sessionTakeProfit:number};
const flagsOn=()=>process.env.DERIV_DEMO_TRADING_ENABLED==='true'&&
 process.env.DERIV_DEMO_BROKER_BUY_ENABLED==='true'&&
 process.env.SENFX_QUANTUM_DEMO_CONTROL_ENABLED==='true'&&
 process.env.SENFX_QUANTUM_DEMO_BROKER_EXECUTION_ENABLED==='true';

async function serverContext():Promise<{userId:string|null;db:SupabaseClient|null}>{
 const auth=await createClient();
 const {data:{user},error}=await auth.auth.getUser();
 if(error||!user||!isAuthorizedDemoPilot(user.id,process.env.DERIV_DEMO_PILOT_USER_ID))return {userId:null,db:null};
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)return {userId:null,db:null};
 const db=createAdminClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 return {userId:user.id,db};
}
function denied(code:string,status=403){return NextResponse.json({ok:false,code,brokerOrderPlaced:false},{status,headers:noStore});}
function rejectControl(code:string,status=400){console.warn('[quantum-demo-control] command rejected',{code});return denied(code,status);}
function money(value:unknown){
 if(typeof value!=='number'&&typeof value!=='string')return null;
 if(typeof value==='string'&&(value.length>32||!/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,2})?$/.test(value)))return null;
 const amount=Number(value);return Number.isFinite(amount)&&amount>0&&Number.isSafeInteger(Math.round(amount*100))?amount:null;
}

export async function GET(){
 try{
  const {userId,db}=await serverContext();if(!userId||!db)return denied('SIGNED_IN_DEMO_PILOT_REQUIRED',401);
  const {data,error}=await db.from('quantum_demo_bot_control').select('account_id,mode,observed_state,control_version,heartbeat_at,lease_expires_at,bot_id,stake,session_stop_loss,session_take_profit,market_category,market_symbol,contract_family,multiplier,per_trade_stop_loss,per_trade_take_profit,last_error,stopped_at,updated_at').eq('user_id',userId).maybeSingle();
  if(error)return denied('QUANTUM_DEMO_SCHEMA_NOT_RELEASED',503);
  const now=Date.now(),lease=new Date(data?.lease_expires_at||0).getTime(),heartbeat=new Date(data?.heartbeat_at||0).getTime();
  const workerConnected=!!data&&data.mode==='running'&&data.observed_state==='running'&&lease>now&&heartbeat>now-15000&&heartbeat<=now+5000;
  const version=data?.mode==='stopped'?Number(data.control_version)-1:Number(data?.control_version);
  const orders=data?.bot_id?await db.from('quantum_demo_bot_orders').select('status,profit,buy_requested_at,contract_id').eq('user_id',userId).eq('control_version',version).eq('bot_id',data.bot_id).order('created_at',{ascending:false}).limit(200):null;
  if(orders?.error)return denied('QUANTUM_DEMO_ORDER_STATUS_UNAVAILABLE',503);
  const rows=orders?.data||[];
  const completed=rows.filter(x=>['won','lost','sold'].includes(x.status));
  const progress={
   tradesAttempted:rows.filter(x=>x.buy_requested_at!==null).length,
   pending:rows.filter(x=>['reserved','buy_unknown','open'].includes(x.status)).length,
   completed:completed.length,wins:completed.filter(x=>x.status==='won').length,
   losses:completed.filter(x=>x.status==='lost').length,
   netVirtualProfit:completed.reduce((sum,x)=>sum+Number(x.profit||0),0),
   latestContractId:completed.find(x=>x.contract_id)?.contract_id||null,
  };
  return NextResponse.json({ok:true,mode:'virtual-deriv-demo-only',botCount:STRATEGIES.length,
   run:data?{desiredState:data.mode,observedState:workerConnected?'running':'stopped-or-disconnected',version:Number(data.control_version),accountId:data.account_id,botId:data.bot_id,stake:Number(data.stake),sessionStopLoss:Number(data.session_stop_loss),sessionTakeProfit:Number(data.session_take_profit),marketCategory:data.market_category,marketSymbol:data.market_symbol,contractFamily:data.contract_family,multiplier:Number(data.multiplier),perTradeStopLoss:Number(data.per_trade_stop_loss),perTradeTakeProfit:Number(data.per_trade_take_profit),workerConnected,progress,lastError:data.last_error,restartCooldownSeconds:data.mode==='stopped'&&data.stopped_at?Math.max(0,Math.ceil((new Date(data.stopped_at).getTime()+30_000-now)/1000)):0,updatedAt:data.updated_at}:null,
   controlsEnabled:flagsOn(),realMoneySupported:false,
   message:workerConnected?'Current 4.0 Demo worker lease is fresh; contract IDs and settlements are read from the server order ledger.':'No current 4.0 Demo worker lease is attached.'
  },{headers:noStore});
 }catch{return denied('QUANTUM_DEMO_STATUS_UNAVAILABLE',503);}
}

export async function POST(request:NextRequest){
 try{
  if(request.headers.get('origin')!==request.nextUrl.origin)return rejectControl('SAME_ORIGIN_REQUIRED');
  const raw=await request.text();if(raw.length>2048)return rejectControl('CONTROL_REQUEST_TOO_LARGE',400);
  let body:Record<string,unknown>;try{body=JSON.parse(raw);}catch{return rejectControl('INVALID_JSON',400);}
  if(!body||typeof body!=='object'||Array.isArray(body)||!['start','stop'].includes(String(body.action)))return rejectControl('UNKNOWN_CONTROL_ACTION',400);
  console.info('[quantum-demo-control] command received',{action:String(body.action),hasBlocklyPlan:body.tradePlan!==undefined});
  const {userId,db}=await serverContext();if(!userId||!db)return rejectControl('SIGNED_IN_DEMO_PILOT_REQUIRED',401);
  const {data:current,error:readError}=await db.from('quantum_demo_bot_control').select('account_id,control_version').eq('user_id',userId).maybeSingle();
  if(readError)return rejectControl('QUANTUM_DEMO_SCHEMA_NOT_RELEASED',503);
  if(body.action==='stop'){
   const {data,error}=await db.rpc('quantum_demo_control',{p_user_id:userId,p_account_id:current?.account_id||'',p_action:'stop',p_expected_version:null,p_bot_id:null,p_stake:null,p_stop_loss:null,p_take_profit:null});
   if(error||data?.ok!==true)return rejectControl('STOP_NOT_CONFIRMED',503);
   return NextResponse.json({ok:true,desiredState:'stopped',version:data.version,brokerOrderPlaced:false,warning:'Stop blocks new purchases. An already submitted or uncertain Deriv contract must still be reconciled.'},{headers:noStore});
  }
  if(!flagsOn())return rejectControl('QUANTUM_DEMO_EXECUTION_NOT_RELEASED',503);
  if(body.confirmVirtualDemoAutomation!==true||!Number.isSafeInteger(body.expectedVersion)||Number(body.expectedVersion)<0)return rejectControl('EXPLICIT_CURRENT_BOT_AND_DEMO_CONSENT_REQUIRED',400);
  let plan:BlocklyPlan|null=null;
  if(body.tradePlan!==undefined){
   if(!body.tradePlan||typeof body.tradePlan!=='object')return rejectControl('BLOCKLY_PLAN_AND_DEMO_CONSENT_REQUIRED',400);
   const normalized:{ok:boolean;code?:string;plan?:BlocklyPlan}=normalizeBlocklyExecutionPlan(body.tradePlan);
   if(!normalized.ok||!normalized.plan)return rejectControl(normalized.code||'INVALID_BLOCKLY_PLAN',400);
   if(body.botId!==normalized.plan.strategyId)return rejectControl('BLOCKLY_STRATEGY_MISMATCH',400);
   plan=normalized.plan;
  }else if(typeof body.botId!=='string'||!STRATEGIES.some(x=>x.id===body.botId))return rejectControl('EXPLICIT_CURRENT_BOT_AND_DEMO_CONSENT_REQUIRED',400);
  const stake=money(body.stake),stopLoss=money(body.sessionStopLoss),takeProfit=money(body.sessionTakeProfit);
  if(stake===null||stopLoss===null||takeProfit===null||stake>stopLoss)return rejectControl('POSITIVE_STAKE_AND_SESSION_LIMITS_REQUIRED',400);
  const context=await getDerivDemoContext();
  const requiredCurrency=plan?.currency||'USD';
  if(context.user.id!==userId||context.account.account_type!=='demo'||context.account.currency!==requiredCurrency||!Number.isFinite(Number(context.account.balance))||Number(context.account.balance)<stake||Number(context.account.balance)<stopLoss||Number(context.account.balance)<takeProfit)return rejectControl('VERIFIED_DEMO_BALANCE_AND_BLOCK_CURRENCY_REQUIRED',403);
  if(current&&Number(current.control_version)!==body.expectedVersion)return rejectControl('VERSION_OR_ACCOUNT_MISMATCH',409);
  let result;
  if(plan){
   if(stake!==plan.stake||stopLoss!==plan.sessionStopLoss||takeProfit!==plan.sessionTakeProfit)return rejectControl('BLOCKLY_RISK_SETTINGS_MISMATCH',400);
   result=await db.rpc('quantum_demo_start_blockly',{p_user_id:userId,p_account_id:context.account.account_id,p_expected_version:body.expectedVersion,p_plan:plan});
  }else result=await db.rpc('quantum_demo_control',{p_user_id:userId,p_account_id:context.account.account_id,p_action:'start',p_expected_version:body.expectedVersion,p_bot_id:body.botId,p_stake:stake,p_stop_loss:stopLoss,p_take_profit:takeProfit});
  const {data,error}=result;
  if(error||data?.ok!==true)return rejectControl(String(data?.code||'DEMO_RUN_REJECTED'),409);
  console.info('[quantum-demo-control] run accepted',{botId:data.botId,version:data.version});
  return NextResponse.json({ok:true,desiredState:'running',version:data.version,botId:data.botId,brokerOrderPlaced:false,workerConnected:false,realMoneyEnabled:false,message:'Run requested. Broker execution is not confirmed until the server worker lease, Deriv contract ID, and settlement are recorded.'},{headers:noStore});
 }catch(error){const safe=safeDemoError(error);console.warn('[quantum-demo-control] command rejected',{code:safe.code,status:safe.status});return NextResponse.json({ok:false,code:safe.code,error:safe.error,brokerOrderPlaced:false},{status:safe.status,headers:noStore});}
}
