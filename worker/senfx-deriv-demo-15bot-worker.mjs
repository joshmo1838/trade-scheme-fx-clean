/**
 * SENFX 15-BOT VIRTUAL DERIV DEMO WORKER — OFF BY DEFAULT.
 *
 * Deploy as ONE isolated long-lived worker process, never a Vercel function.
 * Requires an explicit admin Start All command and DB lease.
 * Never uses a real account or /ws/real. Never retries an uncertain buy.
 * No claims of statistical edge or guaranteed virtual profit.
 */
import {randomUUID,createDecipheriv} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {FIFTEEN_BOTS,predictFifteenBot} from "../lib/bots/fifteen-paper-bots.ts";
import {DIGIT_MARKETS,parsePublicDigitTick} from "../lib/bots/digit-matrix.ts";
import {deriveDemoProposal} from "../lib/deriv/demo-bot-contracts.mjs";
import {
 isVerifiedDemoAccount,isFreshPublicTick,validBrokerProposal,
 verifiedBuyResponse,verifiedFinalContract,safeToPurchase,
} from "../lib/deriv/demo-15bot-worker-safety.mjs";

const ACTIVE=["SENFX_DEMO_15BOT_BROKER_EXECUTION_ENABLED",
 "SENFX_DEMO_15BOT_CONTROL_ENABLED",
 "DERIV_DEMO_BROKER_BUY_ENABLED",
 "DERIV_DEMO_TRADING_ENABLED"].every(k=>process.env[k]==="true");
if(!ACTIVE){
 console.log("[senfx-demo-15] Disabled. No Deriv account connection or broker orders.");
 process.exit(0);
}
const ADMIN=process.env.DERIV_DEMO_PILOT_USER_ID||"";
const SUPABASE_URL=process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL;
const SECRET=process.env.SUPABASE_SERVICE_ROLE_KEY;
const ENC=process.env.DERIV_TOKEN_ENCRYPTION_KEY||"";
if(!/^[0-9a-f-]{36}$/i.test(ADMIN)||!SUPABASE_URL||!SECRET||
   !/^[0-9a-f]{64}$/i.test(ENC))throw Error("Demo-only worker private configuration unavailable.");
if(typeof WebSocket!=="function")throw Error("Node 22+ global WebSocket required.");

const db=createClient(SUPABASE_URL,SECRET,{
 auth:{persistSession:false,autoRefreshToken:false}
});
const BASE="https://api.derivws.com";
const PUBLIC_WS="wss://api.derivws.com/trading/v1/options/ws/public";
const BOT_MARKETS=new Set(DIGIT_MARKETS.map(x=>x.symbol));
const WORKER="senfxdemo_"+randomUUID().replaceAll("-","");
const MAX_HISTORY=160;
const FRESH_MS=10_000;
const RUN_POLL_MS=4_000;
const SETTLEMENT_TIMEOUT_MS=8*60_000;
const MAX_WAIT_FOR_MARKET_MS=35_000;
const MARKETS_NEEDED=new Set(FIFTEEN_BOTS.map(x=>x.market));
const histories=new Map();
const previousEpoch=new Map();
let feed=null;
let activeVersion=null;
let controlRow=null;
let feedReady=false;
let finishing=false;
let busy=false;
let pollBusy=false;
let lastTickReceived=0;
let lastBuyAt=0;
let lastCandidateAt=0;
let roundRobin=0;
let interval=null;

function safeLog(label,extra=""){
 console.log("[senfx-demo-15] "+label+(extra?" · "+String(extra).slice(0,110):""));
}
function stopFeed(){
 const old=feed;feed=null;feedReady=false;
 if(old){old.onopen=null;old.onmessage=null;old.onerror=null;old.onclose=null;
  try{old.close();}catch{}}
 histories.clear();previousEpoch.clear();
}
async function stopOwnedRun(reason){
 if(finishing)return;
 finishing=true;stopFeed();
 if(interval){clearInterval(interval);interval=null;}
 try{
  if(controlRow?.mode==="running"&&controlRow?.control_version===activeVersion){
   const {data,error}=await db.from("senfx_demo_bot_control")
    .select("worker_id,control_version,mode").eq("user_id",ADMIN).maybeSingle();
   if(!error&&data?.worker_id===WORKER&&data.control_version===activeVersion&&data.mode==="running"){
    const {error:stopError}=await db.rpc("senfx_demo_bots_control",{
     p_user_id:ADMIN,p_account_id:controlRow.account_id,
     p_command:"stop",p_expected_version:null,p_stake:null
    });
    if(stopError)safeLog("Server Stop confirmation unavailable; worker exiting fail-closed");
   }
  }
 }catch{
  safeLog("Server Stop confirmation failed; stale lease will expire");
 }
 safeLog("Safety stop",reason);
}
async function rpc(name,args){
 const {data,error}=await db.rpc(name,args);
 if(error)throw Error("DB RPC unavailable: "+name+" "+String(error.code||""));
 return data;
}
async function checkedAccount(stake){
 const {data:connection,error}=await db.from("deriv_connections")
  .select("encrypted_token,token_iv,token_tag,expires_at,status,active_account_id,active_account_type")
  .eq("user_id",ADMIN).maybeSingle();
 if(error||!connection||connection.status!=="connected"||connection.active_account_type!=="demo"||
  !connection.active_account_id||new Date(connection.expires_at).getTime()<=Date.now())
  throw Error("Selected, connected Demo account not verified.");
 const decipher=createDecipheriv("aes-256-gcm",Buffer.from(ENC,"hex"),
   Buffer.from(connection.token_iv,"base64"));
 decipher.setAuthTag(Buffer.from(connection.token_tag,"base64"));
 const token=Buffer.concat([decipher.update(Buffer.from(connection.encrypted_token,"base64")),
  decipher.final()]).toString("utf8");
 const response=await fetch(BASE+"/trading/v1/options/accounts",{
  method:"GET",headers:{Authorization:"Bearer "+token,Accept:"application/json"},
  cache:"no-store",signal:AbortSignal.timeout(10_000)
 });
 if(!response.ok)throw Error("Deriv account verification rejected.");
 const json=await response.json();
 const record=Array.isArray(json?.data)?
   json.data.find(x=>x?.account_id===connection.active_account_id):null;
 if(!isVerifiedDemoAccount(record,connection.active_account_id,stake))
  throw Error("Broker did not confirm the virtual Demo balance covers the selected stake.");
 return {token,account:record};
}
async function openDemoSocket(token,accountId){
 const otp=await fetch(BASE+"/trading/v1/options/accounts/"+
  encodeURIComponent(accountId)+"/otp",{
  method:"POST",headers:{Authorization:"Bearer "+token,Accept:"application/json"},
  cache:"no-store",signal:AbortSignal.timeout(10_000)
 });
 if(!otp.ok)throw Error("Deriv Demo OTP verification unavailable.");
 const answer=await otp.json(),url=new URL(answer?.data?.url||"https://invalid.local");
 if(url.protocol!=="wss:"||url.hostname!=="api.derivws.com"||
  url.pathname!=="/trading/v1/options/ws/demo"||!url.searchParams.has("otp"))
  throw Error("Broker session is not explicitly Demo.");
 const ws=new WebSocket(url);
 await new Promise((resolve,reject)=>{
  let settled=false;
  const timer=setTimeout(()=>{if(!settled){settled=true;try{ws.close();}catch{}reject(Error("Demo WebSocket timeout"));}},10_000);
  ws.addEventListener("open",()=>{if(settled)return;settled=true;clearTimeout(timer);resolve();},{once:true});
  ws.addEventListener("error",()=>{if(settled)return;settled=true;clearTimeout(timer);reject(Error("Demo WebSocket failed"));},{once:true});
  ws.addEventListener("close",()=>{if(settled)return;settled=true;clearTimeout(timer);reject(Error("Demo WebSocket closed"));},{once:true});
 });
 const pending=new Map();
 let id=1000,closed=false;
 const failPending=()=>{
  for(const [requestId,p] of pending){clearTimeout(p.timer);p.reject(Error("Demo session disconnected"));pending.delete(requestId);}
 };
 ws.addEventListener("message",event=>{
  let msg;
  try{msg=JSON.parse(String(event.data));}catch{return;}
  const p=pending.get(Number(msg.req_id));
  if(!p)return;
  if(msg.error){
   clearTimeout(p.timer);pending.delete(Number(msg.req_id));
   p.reject(Error("Deriv declined Demo request: "+String(msg.error.code||"UNKNOWN")));return;
  }
  if(msg.msg_type===p.type){
   clearTimeout(p.timer);pending.delete(Number(msg.req_id));p.resolve(msg);
  }
 });
 ws.addEventListener("close",()=>{closed=true;failPending();});
 ws.addEventListener("error",()=>{closed=true;failPending();});
 const request=(type,body,timeoutMs=8_000)=>{
  if(closed||ws.readyState!==WebSocket.OPEN)return Promise.reject(Error("Demo session not open"));
  const reqId=++id;
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{pending.delete(reqId);reject(Error("Demo request timed out"));},timeoutMs);
   pending.set(reqId,{type,resolve,reject,timer});
   try{ws.send(JSON.stringify({...body,req_id:reqId}));}
   catch{clearTimeout(timer);pending.delete(reqId);reject(Error("Could not send Demo request"));}
  });
 };
 const close=()=>{closed=true;failPending();try{ws.close();}catch{}};
 return {request,close};
}
async function verifyLease(version){
 const heartbeat=await rpc("senfx_demo_bots_worker_heartbeat",{
  p_user_id:ADMIN,p_worker_id:WORKER,p_expected_version:version
 });
 return heartbeat?.owned===true;
}
async function getUnresolvedOrderCount(){
 const {count,error}=await db.from("senfx_demo_bot_orders")
  .select("id",{count:"exact",head:true}).eq("user_id",ADMIN)
  .in("status",["reserved","buy_unknown","open"]);
 if(error||!Number.isInteger(count))throw Error("Unresolved broker ledger lookup failed.");
 return count;
}
async function verifyControl(version){
 const {data,error}=await db.from("senfx_demo_bot_control")
  .select("mode,observed_state,worker_id,lease_expires_at,control_version")
  .eq("user_id",ADMIN).maybeSingle();
 if(error||!data)throw Error("Control lookup failed.");
 const leaseValid=data.mode==="running"&&data.observed_state==="running"&&
  data.worker_id===WORKER&&data.control_version===version&&
  new Date(data.lease_expires_at).getTime()>Date.now();
 return leaseValid;
}
async function reconcilePurchased(session,orderId,purchase,proposal,stake,version){
 const start=Date.now();
 while(Date.now()-start<SETTLEMENT_TIMEOUT_MS){
  const contractIdNumeric=Number(purchase.contractId);
  if(!Number.isSafeInteger(contractIdNumeric)||contractIdNumeric<=0)
   throw Error("Broker contract ID is not a safe integer. Reconcile manually.");
  const response=await session.request("proposal_open_contract",{
   proposal_open_contract:1,contract_id:contractIdNumeric
  },10_000);
  const contract=response?.proposal_open_contract;
  const final=verifiedFinalContract(contract,{
   contractId:purchase.contractId,market:proposal.underlying_symbol,
   contractType:proposal.contract_type,stake
  });
  if(final){
   const result=await rpc("senfx_demo_bots_record_settlement",{
    p_user_id:ADMIN,p_order_id:orderId,p_contract_id:purchase.contractId,
    p_transaction_id:purchase.buyTransactionId,p_final_status:final.finalStatus,
    p_buy_price:final.buyPrice,p_sell_price:final.sellPrice
   });
   if(result?.settled!==true)throw Error("Broker settled but database reconciliation refused; manual review required.");
   safeLog("Deriv virtual Demo settlement recorded",final.finalStatus);
   return;
  }
  if(contract?.is_sold)throw Error("Final broker contract failed validation; risk held for review.");
  await new Promise(resolve=>setTimeout(resolve,3000));
 }
 throw Error("Broker contract not settled within verified time window; risk held.");
}
async function executeSignal(bot,signal){
 const version=activeVersion;
 if(!Number.isSafeInteger(version)||!controlRow||finishing)return;
 busy=true;
 let session=null,orderId=null,marked=false,firstAttempt=false;
 try{
  if(!await verifyLease(version))throw Error("Lease lost before broker quote.");
  // The owner-chosen finite stake is frozen in the durable run control,
  // never calculated from a bot's signal or a paper result.
  const stake=Number(controlRow.stake_amount);
  const {token,account}=await checkedAccount(stake);
  if(controlRow.account_id!==account.account_id)throw Error("Deriv account switched during worker run.");
  const selected=deriveDemoProposal(bot.id,signal.prediction,signal.barrier,stake);
  if(!selected)throw Error("Unsupported broker contract mapping.");
  session=await openDemoSocket(token,account.account_id);
  const availability=await session.request("contracts_for",{
    contracts_for:bot.market,currency:"USD"
  },9000);
  const allowed=availability?.contracts_for?.available;
  if(!Array.isArray(allowed)||!allowed.some(x=>x.contract_type===selected.contract_type))
   throw Error("Actual Demo broker does not offer selected contract type.");
  const response=await session.request("proposal",selected,9000);
  const quote=response?.proposal;
  if(!validBrokerProposal(quote,stake))throw Error("Broker Demo proposal failed price/identity verification.");
  if(finishing||!await verifyLease(version))throw Error("Stop requested before reservation.");
  const {data:created,error:createError}=await db.from("senfx_demo_bot_orders")
   .insert({
    request_id:randomUUID(),user_id:ADMIN,account_id:account.account_id,
    control_version:version,bot_id:bot.id,market_symbol:bot.market,
    contract_type:selected.contract_type,barrier:selected.barrier??null,
    duration:selected.duration,duration_unit:selected.duration_unit,
    currency:"USD",stake,ask_price:Number(quote.ask_price),
    payout:Number(quote.payout),proposal_id:quote.id,status:"quoted",
    quote_expires_at:new Date(Date.now()+15000).toISOString()
   }).select("id").single();
  if(createError||!created?.id)throw Error("Demo broker quote could not be reserved in audit ledger.");
  orderId=created.id;
  const reserved=await rpc("senfx_demo_bots_reserve",{
   p_user_id:ADMIN,p_order_id:orderId,p_expected_version:version
  });
  if(reserved?.allowed!==true){
   await rpc("senfx_demo_bots_release_unused",{p_user_id:ADMIN,p_order_id:orderId});
   orderId=null;
   // A risk/cooldown denial is an expected skip, NOT a broker order.
   safeLog("No trade: duplicate-buy cooldown or unresolved contract prevented reservation");
   return;
  }
  const owned=await verifyControl(version),count=await getUnresolvedOrderCount();
  const permitted=safeToPurchase({
   operatorAllowed:process.env.SENFX_DEMO_15BOT_CONTROL_ENABLED==="true",
   globalBuyFlag:process.env.DERIV_DEMO_BROKER_BUY_ENABLED==="true",
   workerAuthorized:process.env.SENFX_DEMO_15BOT_BROKER_EXECUTION_ENABLED==="true",
   runVersion:version,controlVersion:version,leaseValid:owned,
   accountVerified:isVerifiedDemoAccount(account,account.account_id,stake),
   proposalVerified:validBrokerProposal(quote,stake),unresolvedOrders:count
  });
  if(!permitted||finishing)throw Error("Final broker Demo buy gate failed; no order sent.");
  // Irrevocable once-only buy marker is persisted BEFORE the broker call.
  const marker=await rpc("senfx_demo_bots_mark_attempt",{
   p_user_id:ADMIN,p_order_id:orderId,p_expected_version:version
  });
  if(marker?.allowed!==true)throw Error("Attempt ledger not armed; buy not sent.");
  marked=true;lastBuyAt=Date.now();
  // Once the marker is written, never reset it, even if Stop happens now.
  // A second control check closes the Stop/Buy window before network send.
  if(finishing||!await verifyControl(version))
    throw Error("Stop detected after attempt marker; no buy sent, reconcile unknown risk.");
  // No retry of buy under ANY failure, timeout, reconnect or crash.
  firstAttempt=true;
  const reply=await session.request("buy",{buy:quote.id,price:Number(quote.ask_price)},12_000);
  const purchase=verifiedBuyResponse(reply,Number(quote.ask_price));
  if(!purchase)throw Error("Broker purchase response unverified; never retry.");
  const {data:opened,error:openError}=await db.from("senfx_demo_bot_orders")
   .update({
    status:"open",contract_id:purchase.contractId,
    buy_transaction_id:purchase.buyTransactionId,buy_price:purchase.buyPrice,
    opened_at:new Date().toISOString(),updated_at:new Date().toISOString()
   }).eq("id",orderId).eq("user_id",ADMIN).eq("status","buy_unknown")
   .select("id").maybeSingle();
  if(openError||!opened)throw Error("Broker buy confirmed but order ledger update failed; reconcile, no retry.");
  safeLog("One genuine Deriv virtual Demo contract opened",bot.id);
  await reconcilePurchased(session,orderId,purchase,selected,stake,version);
 }catch(error){
  const why=error instanceof Error?error.message:"unknown failure";
  if(marked||firstAttempt){
   safeLog("STOP: broker purchase may have occurred; manual reconciliation required");
  }else if(orderId){
   try{
    await rpc("senfx_demo_bots_release_unused",{p_user_id:ADMIN,p_order_id:orderId});
   }catch{
    safeLog("Unattempted reservation release failed. Held for review.");
   }
  }
  await stopOwnedRun(why);
 }finally{
  session?.close();
  busy=false;
 }
}
function startPublicFeed(){
 if(feed||finishing)return;
 feedReady=false;
 const ws=new WebSocket(PUBLIC_WS);
 feed=ws;
 const subscribed=new Set();
 let gotDirectory=false;
 ws.addEventListener("open",()=>{
  if(finishing||feed!==ws)return;
  try{ws.send(JSON.stringify({active_symbols:"brief",req_id:101}));}
  catch{void stopOwnedRun("Cannot request public market directory.");}
 });
 ws.addEventListener("message",event=>{
  if(finishing||feed!==ws)return;
  let msg;
  try{msg=JSON.parse(String(event.data));}
  catch{void stopOwnedRun("Public tick payload malformed.");return;}
  if(msg?.error){void stopOwnedRun("Public feed rejected a request.");return;}
  if(msg.msg_type==="active_symbols"){
   gotDirectory=true;
   if(!Array.isArray(msg.active_symbols)){
    void stopOwnedRun("No Deriv public market directory.");return;
   }
   const available=new Set(msg.active_symbols.map(x=>x?.underlying_symbol??x?.symbol));
   if([...MARKETS_NEEDED].some(m=>!available.has(m)||!BOT_MARKETS.has(m))){
    void stopOwnedRun("Not all fifteen strategy markets are publicly available.");return;
   }
   for(const [i,market] of [...MARKETS_NEEDED].entries()){
    subscribed.add(market);
    try{ws.send(JSON.stringify({ticks:market,subscribe:1,req_id:1000+i}));}
    catch{void stopOwnedRun("Public market subscription failed.");return;}
   }
   feedReady=true;safeLog("15 strategies subscribed to verified public Demo markets");
   return;
  }
  if(msg.msg_type!=="tick"||!feedReady||!gotDirectory)return;
  const now=Date.now(),tick=parsePublicDigitTick(msg,now);
  if(!tick||!subscribed.has(tick.symbol)||!isFreshPublicTick(tick,now)){
   void stopOwnedRun("Public tick invalid, out of order or stale.");return;
  }
  const prior=previousEpoch.get(tick.symbol)||0;
  if(tick.epoch<=prior)return;
  previousEpoch.set(tick.symbol,tick.epoch);
  lastTickReceived=now;
  const hist=[...(histories.get(tick.symbol)||[]),tick].slice(-MAX_HISTORY);
  histories.set(tick.symbol,hist);
  if(busy||finishing||!Number.isSafeInteger(activeVersion)||
     now-lastBuyAt<30_000||now-lastCandidateAt<30_000)return;
  // Each strategy evaluates genuine prior public ticks, not paper payouts.
  for(let i=0;i<FIFTEEN_BOTS.length;i++){
   const index=(roundRobin+i)%FIFTEEN_BOTS.length,bot=FIFTEEN_BOTS[index];
   if(bot.market!==tick.symbol||hist.length<bot.minTicks)continue;
   const signal=predictFifteenBot(bot,hist);
   if(!signal)continue;
   roundRobin=(index+1)%FIFTEEN_BOTS.length;
   lastCandidateAt=now;
   void executeSignal(bot,signal);
   return;
  }
 });
 ws.addEventListener("error",()=>{void stopOwnedRun("Deriv public data WebSocket error.");});
 ws.addEventListener("close",()=>{if(!finishing)void stopOwnedRun("Public feed disconnected; no guessing or auto retry.");});
}
async function poll(){
 if(finishing||pollBusy)return;
 pollBusy=true;
 try{
  const {data,error}=await db.from("senfx_demo_bot_control")
   .select("user_id,account_id,stake_amount,mode,control_version,worker_id,lease_expires_at")
   .eq("user_id",ADMIN).maybeSingle();
  if(error)throw Error("Cannot verify durable Demo auto control.");
  if(!data||data.mode!=="running"){
   if(activeVersion!==null)await stopOwnedRun("Operator stopped Demo automation.");
   return;
  }
  if(activeVersion!==null&&activeVersion!==data.control_version){
   await stopOwnedRun("Demo worker generation changed. Stopping stale worker.");
   return;
  }
  controlRow=data;activeVersion=data.control_version;
  if(!await verifyLease(activeVersion)){
   await stopOwnedRun("A different worker holds the Demo lease, or Stop was requested.");return;
  }
  if(!feed)startPublicFeed();
  if(feedReady&&!busy&&lastTickReceived>0&&Date.now()-lastTickReceived>MAX_WAIT_FOR_MARKET_MS)
   await stopOwnedRun("Public feed has no fresh ticks; no purchases permitted.");
 }catch(error){
  await stopOwnedRun(error instanceof Error?error.message:"Control heartbeat failed.");
 }finally{pollBusy=false;}
}
process.once("SIGINT",()=>{void stopOwnedRun("Operator terminated worker.");});
process.once("SIGTERM",()=>{void stopOwnedRun("Worker service terminating.");});
safeLog("Ready for owner-controlled DEMO-only worker lease. No buys without Start All.");
interval=setInterval(()=>void poll(),RUN_POLL_MS);
void poll();
