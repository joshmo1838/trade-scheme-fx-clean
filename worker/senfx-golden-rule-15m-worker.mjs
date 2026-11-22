/**
 * SENFX 15M Golden Rule PROSPECTIVE PAPER RESEARCH COLLECTOR.
 *
 * One million potential paper outcomes per each of the 15 ORIGINAL bots.
 * NO Deriv account token, no broker proposal, NO buys, no money execution,
 * no customer sessions, no purchases, no model predictions of certainty.
 *
 * A separate, opt-in Railway service is REQUIRED; it is OFF by default.
 * Uses one database-verified collector lease; only monotonic aggregate
 * checkpoints are persisted. Raw tick replay and lookahead are rejected.
 */
import {randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {FIFTEEN_BOTS} from "../lib/bots/fifteen-paper-bots.ts";
import {DIGIT_MARKETS,parsePublicDigitTick} from "../lib/bots/digit-matrix.ts";
import {
 createGoldenPaperState,applyGoldenPublicTick,resetGoldenPaperFeed
} from "../lib/bots/senfx-golden-rule-research.ts";
import {GOLDEN_RULE_MIN_FORWARD_SAMPLES} from "../lib/bots/senfx-golden-rule.mjs";

if(process.env.SENFX_GOLDEN_RESEARCH_ENABLED!=="true"){
 console.log("[senfx-golden-15m] Disabled by default; no market socket, DB access or orders.");
 process.exit(0);
}
if(typeof WebSocket!=="function")throw Error("Node 22+ WebSocket required.");
const SUPABASE_URL=process.env.SUPABASE_URL||"";
const SUPABASE_SERVICE_ROLE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY||"";
if(!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(SUPABASE_URL)||
 !SUPABASE_SERVICE_ROLE_KEY)throw Error("Research DB private configuration missing.");
const db=createClient(SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,{
 auth:{autoRefreshToken:false,persistSession:false}
});
const COLLECTOR_ID="senfx-golden-"+randomUUID();
const STUDY_KEY="senfx-golden-rule-15m-v1";
const PUBLIC_WS="wss://api.derivws.com/trading/v1/options/ws/public";
const SCANNED=new Set(DIGIT_MARKETS.map(m=>m.symbol));
const botsByMarket=new Map(DIGIT_MARKETS.map(m=>[
 m.symbol,FIFTEEN_BOTS.filter(b=>b.market===m.symbol)
]));
const TICK_FRESH_MS=10_000;
const CHECKPOINT_MS=60_000;
const LEASE_RENEW_MS=12_000;
let state=createGoldenPaperState(),socket=null,stopping=false;
let lastSeen=0,leaseTimer=null,checkpointTimer=null,watchdogTimer=null;
let currentEpochs=new Map();
let checkpointBusy=false,leaseBusy=false;

function log(kind){
 console.log("[senfx-golden-15m] "+kind);
}
async function lease(){
 if(leaseBusy||stopping)return;
 leaseBusy=true;
 try{
  const {data,error}=await db.rpc("senfx_golden_claim_collector",{
   p_collector_id:COLLECTOR_ID
  });
  if(error||data!==true)throw Error("Collector lease declined; stopping.");
 }catch(error){
  shutdown(error instanceof Error?error.message:"Lease unavailable.");
 }finally{leaseBusy=false;}
}
async function restore(){
 const {data,error}=await db.from("senfx_golden_rule_progress")
  .select("bot_id,observations,wins,losses,voids,last_scored_epoch")
  .eq("study_key",STUDY_KEY);
 if(error||!Array.isArray(data))throw Error("Cannot load durable research checkpoints.");
 const validBots=new Set(FIFTEEN_BOTS.map(b=>b.id));
 for(const record of data){
  if(!validBots.has(record.bot_id))throw Error("Unknown persisted research bot.");
  const observations=Number(record.observations),wins=Number(record.wins),
   losses=Number(record.losses),voids=Number(record.voids),
   lastScoredEpoch=Number(record.last_scored_epoch);
  if(![observations,wins,losses,voids,lastScoredEpoch].every(Number.isSafeInteger)||
   observations<0||observations>GOLDEN_RULE_MIN_FORWARD_SAMPLES||
   wins<0||losses<0||voids<0||wins+losses!==observations||
   lastScoredEpoch<0)throw Error("Persisted Golden Rule counts invalid.");
  state.bots[record.bot_id]={
   ...state.bots[record.bot_id],observations,wins,losses,voids,
   lastScoredEpoch
  };
 }
 log("Restored "+data.length+" durable bot checkpoints; no market history replayed.");
}
async function checkpoint(){
 if(checkpointBusy||stopping)return;
 checkpointBusy=true;
 try{
  const rows=FIFTEEN_BOTS.map(bot=>{
   const b=state.bots[bot.id];
   return {bot_id:bot.id,observations:b.observations,
    wins:b.wins,losses:b.losses,voids:b.voids,
    last_scored_epoch:b.lastScoredEpoch};
  });
  const {data,error}=await db.rpc("senfx_golden_checkpoint",{
   p_collector_id:COLLECTOR_ID,p_rows:rows
  });
  if(error||data!==15)throw Error("Durable research checkpoint failed.");
 }catch(error){
  shutdown(error instanceof Error?error.message:"Checkpoint failed.");
 }finally{checkpointBusy=false;}
}
function stopPublicFeed(){
 const old=socket;socket=null;
 if(old){
  old.onopen=null;old.onclose=null;old.onerror=null;old.onmessage=null;
  try{old.close();}catch{/* already closed */}
 }
 state=resetGoldenPaperFeed(state);
 currentEpochs.clear();
}
function shutdown(reason){
 if(stopping)return;
 stopping=true;
 log("Fail-closed research stop: "+reason);
 if(leaseTimer)clearInterval(leaseTimer);
 if(checkpointTimer)clearInterval(checkpointTimer);
 if(watchdogTimer)clearInterval(watchdogTimer);
 stopPublicFeed();
 process.exitCode=1;
 // Exiting promptly avoids a second collector while a lease is uncertain.
 setTimeout(()=>process.exit(1),1500).unref();
}
function openFeed(){
 if(stopping||socket)return;
 const ws=new WebSocket(PUBLIC_WS);socket=ws;
 let directoryReady=false;
 const subscribed=new Set();
 ws.onopen=()=>{
  if(stopping||socket!==ws)return;
  try{ws.send(JSON.stringify({active_symbols:"brief",req_id:1901}));}
  catch{shutdown("Cannot read Deriv public market directory.");}
 };
 ws.onmessage=message=>{
  if(stopping||socket!==ws)return;
  let raw;
  try{raw=JSON.parse(String(message.data));}
  catch{shutdown("Public market payload malformed.");return;}
  if(raw?.error){shutdown("Deriv public feed returned an error.");return;}
  if(raw?.msg_type==="active_symbols"){
   if(!Array.isArray(raw.active_symbols)){
    shutdown("No verified Deriv public market directory.");return;
   }
   const available=new Set(raw.active_symbols.map(m=>m.underlying_symbol??m.symbol));
   if(DIGIT_MARKETS.some(m=>!available.has(m.symbol))){
    shutdown("One or more original markets unavailable.");return;
   }
   directoryReady=true;
   for(const [i,market] of DIGIT_MARKETS.entries()){
    subscribed.add(market.symbol);
    ws.send(JSON.stringify({ticks:market.symbol,subscribe:1,req_id:2000+i}));
   }
   lastSeen=Date.now();
   log("10 public markets subscribed. 15 million PAPER-only observations target.");
   return;
  }
  if(raw?.msg_type!=="tick"||!directoryReady)return;
  const now=Date.now(),tick=parsePublicDigitTick(raw,now);
  if(!tick||!subscribed.has(tick.symbol)||
   now-tick.epoch*1000>TICK_FRESH_MS||
   tick.epoch*1000>now){
   // Gaps cannot be hidden as a valid next-tick result.
   shutdown("Unverified, out-of-order or stale market observation.");return;
  }
  const prior=currentEpochs.get(tick.symbol)||0;
  if(tick.epoch<=prior)return; // duplicate tick ignored, no purchase
  currentEpochs.set(tick.symbol,tick.epoch);
  lastSeen=now;
  const latestSettled=Math.max(0,...(botsByMarket.get(tick.symbol)||[])
   .map(b=>state.bots[b.id]?.lastScoredEpoch||0));
  if(tick.epoch<=latestSettled)return; // never repeat persisted evidence
  state=applyGoldenPublicTick(state,tick,now);
 };
 ws.onerror=()=>shutdown("Deriv public feed socket errored; no fabricated samples.");
 ws.onclose=()=>shutdown("Deriv public feed disconnected; collector must reacquire lease.");
}
async function main(){
 await lease();
 if(stopping)return;
 await restore();
 if(stopping)return;
 openFeed();
 leaseTimer=setInterval(()=>void lease(),LEASE_RENEW_MS);
 checkpointTimer=setInterval(()=>void checkpoint(),CHECKPOINT_MS);
 watchdogTimer=setInterval(()=>{
  if(!stopping&&lastSeen>0&&Date.now()-lastSeen>35_000)
   shutdown("Market feed inactive; cannot establish fresh paper outcomes.");
 },5_000);
 log("Collector started. No broker-account access or orders.");
}
process.on("SIGINT",()=>shutdown("Operator stopped research."));
process.on("SIGTERM",()=>shutdown("Operator stopped research."));
main().catch(error=>shutdown(error instanceof Error?error.message:"Research startup error."));
