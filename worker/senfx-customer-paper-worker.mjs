/**
 * SENFX Phase 4 customer PAPER-only worker.
 * Consumes PUBLIC Deriv ticks. Never requests broker credentials, proposals,
 * or authenticated contracts. Run separately from Vercel; default OFF.
 *
 * Requires reviewed control/risk/worker database migrations and 1 worker replica.
 * Process lease, desired-state version and risk reservations are verified in SQL.
 */
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { paperPreset, evaluatePaperSignal } from "../lib/bots/paper-strategy.ts";
import { reconcilePaperPosition } from "../lib/bots/paper-reconcile.ts";

if (process.env.SENFX_PAPER_WORKER_ENABLED !== "true") {
  console.error("SENFX paper worker is disabled. Set the explicit worker-only opt-in in its own service.");
  process.exit(0);
}
const url = process.env.SUPABASE_URL;
const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !secret) throw Error("Paper worker missing private Supabase configuration.");
if (!globalThis.WebSocket) throw Error("Node 22+ with global WebSocket required.");

const db = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const WORKER_ID = "senfxpaper_" + randomUUID().replaceAll("-", "");
const PUBLIC_WS = "wss://api.derivws.com/trading/v1/options/ws/public";
const POLL_MS = 4_000;
const FRESH_MS = 10_000;
const LEASE_MS = 20_000;
const MAX_RUNS = 10;
const ALL_MARKETS = new Set(["R_10", "R_25", "R_50", "R_75", "R_100", "frxEURUSD"]);
const sessions = new Map();
const subscribed = new Set();
const marketTicks = new Map();
let socket = null;
let stopped = false;
let pollBusy = false;
let reconnectMs = 1_000;
let reconnectTimer;
let pollTimer;
let lastConnected = 0;
let heartbeatTimer;

function logError(context, error) {
  const code = error && typeof error === "object" ? error.code : null;
  console.error("[paper-worker] " + context + (code ? " code=" + String(code) : ""));
}
async function rpc(name, args) {
  const { data, error } = await db.rpc(name, args);
  if (error) throw error;
  return data;
}
function utcTomorrow() {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()+1);
}
function isFreshTick(market) {
  const tick = marketTicks.get(market);
  return socket?.readyState === WebSocket.OPEN &&
    tick && Date.now()-tick.receivedAt < FRESH_MS && Date.now()-tick.epoch*1_000 < 30_000;
}
function makeSession(run) {
  return {
    id:run.id,desired:run.desired_state,version:run.control_version,
    published:false,market:null,rule:null,owned:false,
    prices:[],lastEpoch:0,lastSync:0,pending:null,processing:false,
    openPosition:false,cooldown:0,blockedUntil:0
  };
}
function ensureFeed(market) {
  if (!ALL_MARKETS.has(market)) throw Error("Unsupported public market.");
  if (socket?.readyState !== WebSocket.OPEN || subscribed.has(market)) return;
  socket.send(JSON.stringify({ticks:market,subscribe:1,req_id:500+subscribed.size}));
  subscribed.add(market);
}
async function synchronize(s, requestedState) {
  // Never promote stale or absent quotes to a worker 'running' state.
  const report=requestedState==="running"
    ? (s.market && isFreshTick(s.market) ? "running" : "starting")
    : requestedState;
  const data=await rpc("senfx_paper_worker_sync",{
    p_run_id:s.id,p_worker_id:WORKER_ID,p_report:report
  });
  if (!data?.owned) {
    s.owned=false;
    s.openPosition=false;
    return;
  }
  s.owned=true;
  s.desired=data.desiredState;
  if (s.version !== data.version) {
    s.version=data.version;
    s.prices=[];
    s.lastEpoch=0;
    s.openPosition=false;
    s.pending=null;
    s.cooldown=0;
    s.blockedUntil=0;
  }
  s.lastSync=Date.now();
  s.published=data.isPublished===true;
  if (!s.published) {
    s.owned=false;
    return;
  }
  const rule=paperPreset({name:data.botName,market:data.botMarket});
  if (s.market!==rule.market) {
    s.market=rule.market;
    s.prices=[];
    s.lastEpoch=0;
    s.openPosition=false;
    s.pending=null;
  }
  s.rule=rule;
  if (s.desired!=="running") {
    // SQL cancels held paper reservations before acknowledging Pause/Stop.
    s.openPosition=false;
    s.pending=null;
    s.prices=[];
    return;
  }
  ensureFeed(s.market);
  // An expired or reclaimed lease may cancel a previous paper reservation.
  // Always reconcile BOTH directions; an old local "open" is not authority.
  // Do not overwrite an in-flight entry/settlement; the next poll will verify it.
  if (!s.processing) {
    const {data:existing,error}=await db.from("bot_execution_paper_positions")
      .select("id,status")
      .eq("run_id",s.id).eq("status","open").limit(2);
    if (error) throw error;
    const before = s.openPosition;
    const reconciled = reconcilePaperPosition(before, existing || []);
    if (!reconciled.safe) {
      s.owned=false;
      throw Error("Conflicting open paper positions detected; refusing new entries.");
    }
    s.openPosition = reconciled.openPosition;
    if (reconciled.changed) {
      // On cancellation, restart from clean market data with a cooldown.
      // On recovered open risk, never create a duplicate reservation.
      s.prices=[];
      s.pending=null;
      if (!s.openPosition) s.cooldown=Math.max(s.cooldown,5);
    }
  }
}
async function poll() {
  if (stopped||pollBusy) return;
  pollBusy=true;
  try {
    const {data,error}=await db.from("bot_execution_runs")
      .select("id,desired_state,observed_state,control_version")
      .eq("mode","paper")
      .or("desired_state.neq.stopped,observed_state.neq.stopped")
      .order("updated_at",{ascending:false}).limit(60);
    if (error) throw error;
    const active=new Set();
    for (const run of (data||[]).slice(0,MAX_RUNS)) {
      active.add(run.id);
      let s=sessions.get(run.id);
      if (!s) {
        s=makeSession(run);
        sessions.set(run.id,s);
      }
      try {
        await synchronize(s,run.desired_state);
      } catch(error) {
        s.owned=false;
        logError("run sync failed",error);
      }
      if(s.desired==="stopped")sessions.delete(run.id);
    }
    for(const id of sessions.keys()) {
      if(!active.has(id))sessions.delete(id);
    }
  } catch(error){logError("control database poll failed",error);}
  finally{pollBusy=false;}
}
async function onPaperTick(s,price,epoch) {
  if (stopped || !s.owned || s.desired!=="running" || !s.published ||
      !s.rule || s.market===null || s.processing || Date.now()-s.lastSync>=LEASE_MS/2 ||
      !isFreshTick(s.market) || epoch<=s.lastEpoch) return;
  s.processing=true;
  s.lastEpoch=epoch;
  try {
    if(s.openPosition) {
      const result=await rpc("senfx_paper_worker_tick",{
        p_run_id:s.id,p_worker_id:WORKER_ID,p_version:s.version,
        p_quote:price,p_tick_epoch:epoch
      });
      if(!result?.accepted) {
        s.owned=false; // Unknown tick outcome: stop immediately until a fresh sync.
        logError("paper tick rejected",new Error(result?.reason||"unknown"));
        return;
      }
      if(result.settled===true) {
        s.openPosition=false;
        s.cooldown=5;
        console.log("[paper-worker] paper trade recorded; run="+s.id.slice(0,8));
      }
      return;
    }
    if(s.blockedUntil>Date.now())return;
    s.prices.push(price);
    if(s.prices.length>50)s.prices.shift();
    if(s.cooldown>0){s.cooldown--;return;}
    const direction=evaluatePaperSignal(s.prices,s.rule);
    if(!direction)return;
    const result=await rpc("senfx_paper_worker_reserve",{
      p_run_id:s.id,p_worker_id:WORKER_ID,p_version:s.version,
      p_symbol:s.market,p_direction:direction,p_entry:price,p_tick_epoch:epoch
    });
    if(result?.allowed) {
      s.openPosition=true;
      console.log("[paper-worker] paper risk reserved; run="+s.id.slice(0,8));
    } else if (String(result?.reason||"").toLowerCase().includes("daily")) {
      s.blockedUntil=utcTomorrow();
    } else {
      s.cooldown=10;
      // A lost RPC response might leave an open reservation in the DB.
      // Poll/sync reconciles this before any subsequent reserve call.
    }
  }catch(error){
    // No retry of an ambiguous reserve/tick operation; wait for reconciliation.
    s.owned=false;
    logError("paper position request failed",error);
  }finally{s.processing=false;}
}
function onMessage(raw) {
  let msg;
  try{msg=JSON.parse(String(raw));}catch{return;}
  if(msg.error){logError("public feed rejected message",{code:msg.error.code});return;}
  if(msg.msg_type!=="tick"||!msg.tick)return;
  const market=msg.tick.symbol;
  const price=Number(msg.tick.quote), epoch=Number(msg.tick.epoch);
  if(!ALL_MARKETS.has(market)||!Number.isFinite(price)||price<=0 ||
     !Number.isInteger(epoch)||Math.abs(Date.now()/1_000-epoch)>30)return;
  marketTicks.set(market,{epoch,receivedAt:Date.now(),price});
  for(const s of sessions.values()){
    if(s.market===market)void onPaperTick(s,price,epoch);
  }
}
function connectFeed(){
  if(stopped)return;
  try{
    const ws=new WebSocket(PUBLIC_WS);
    socket=ws;
    ws.addEventListener("open",()=>{
      subscribed.clear();
      reconnectMs=1_000;
      lastConnected=Date.now();
      clearInterval(heartbeatTimer);
      // Public Deriv connections may be closed after inactivity. Ping only
      // while OPEN; this is a market-data keepalive, never a broker order.
      heartbeatTimer=setInterval(()=>{
        if(ws.readyState!==WebSocket.OPEN)return;
        try{ws.send(JSON.stringify({ping:1}));}
        catch(error){logError("public feed keepalive send failed",error);}
      },30_000);
      for(const s of sessions.values())if(s.market)ensureFeed(s.market);
      console.log("[paper-worker] connected to PUBLIC market feed");
    });
    ws.addEventListener("message",event=>onMessage(event.data));
    ws.addEventListener("error",()=>logError("public WebSocket error",{}));
    ws.addEventListener("close",event=>{
      clearInterval(heartbeatTimer);
      if(stopped)return;
      console.warn("[paper-worker] public feed closed code="+String(event.code)+" clean="+String(event.wasClean)+" uptimeMs="+String(Date.now()-lastConnected));
      subscribed.clear();
      marketTicks.clear();
      for(const s of sessions.values()) {s.owned=false;s.prices=[];}
      clearTimeout(reconnectTimer);
      reconnectTimer=setTimeout(connectFeed,reconnectMs);
      reconnectMs=Math.min(reconnectMs*2,30_000);
    });
  }catch(error){
    logError("could not connect public feed",error);
    reconnectTimer=setTimeout(connectFeed,reconnectMs);
    reconnectMs=Math.min(reconnectMs*2,30_000);
  }
}
async function shutdown(){
  stopped=true;
  clearTimeout(reconnectTimer);
  clearInterval(pollTimer);
  clearInterval(heartbeatTimer);
  try{socket?.close();}catch{}
  // Lease expires within 20s. No new paper entries can pass SQL after expiry.
}
process.on("SIGTERM",()=>{void shutdown();});
process.on("SIGINT",()=>{void shutdown();});
console.log("[paper-worker] booting PUBLIC-TICKS PAPER-ONLY worker");
connectFeed();
await poll();
pollTimer=setInterval(()=>{void poll();},POLL_MS);
