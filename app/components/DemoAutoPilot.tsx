"use client";

import {useCallback,useEffect,useRef,useState} from "react";
import {assessDemoAiCandidate,type DemoAiCandidate,type DemoAiTick} from "@/lib/deriv/demo-ai-signal.mjs";

const WS = "wss://api.derivws.com/trading/v1/options/ws/public";
const API="/api/deriv/demo/orders";
const SYMBOL="R_100";
const SCAN_LIMIT_MS=180_000;
type Phase="idle"|"scanning"|"quoting"|"buying"|"completed"|"stopped";
type Props={
 ready:boolean;reason:string;virtualBalance:number;
 onRefresh:()=>Promise<void>;
};
export default function DemoAutoPilot({ready,reason,virtualBalance,onRefresh}:Props){
 const [phase,setPhase]=useState<Phase>("idle");
 const [feed,setFeed]=useState("Not connected");
 const [sampleCount,setSampleCount]=useState(0);
 const [lastDecision,setLastDecision]=useState("No entry evaluated");
 const [outcome,setOutcome]=useState("");
 const socket=useRef<WebSocket|null>(null);
 const history=useRef<DemoAiTick[]>([]);
 const startAt=useRef(0);
 const lastReceived=useRef(0);
 const stopped=useRef(true);
 const buyStarted=useRef(false);
 const scanTimer=useRef<ReturnType<typeof setInterval>|null>(null);
 const closing=useRef(false);
 const closeFeed=useCallback(()=>{
  if(scanTimer.current){clearInterval(scanTimer.current);scanTimer.current=null;}
  const ws=socket.current;socket.current=null;
  if(ws){ws.onopen=null;ws.onmessage=null;ws.onerror=null;ws.onclose=null;try{ws.close();}catch{}}
 },[]);
 const stop=useCallback((why="Emergency Stop pressed. No new orders will be sent.")=>{
  stopped.current=true;closeFeed();
  setPhase("stopped");
  setOutcome(why+(buyStarted.current?" A prior buy request may already be in flight; check your Demo order history before doing anything else.":""));
 },[closeFeed]);
 useEffect(()=>()=>{stopped.current=true;closeFeed();},[closeFeed]);

 async function request(method:"quote"|"buy",body:Record<string,unknown>){
  const response=await fetch(API,{
   method:"POST",credentials:"same-origin",cache:"no-store",
   headers:{"Content-Type":"application/json"},
   body:JSON.stringify({action:method,...body}),
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data.success!==true)
   throw new Error(String(data.error||data.code||"Demo request could not be verified.").slice(0,250));
  return data;
 }
 async function executeSingleCandidate(signal:DemoAiCandidate){
  if(stopped.current||!signal.eligible||!signal.direction)return;
  closeFeed();setPhase("quoting");
  setOutcome("Verified historical-trend candidate. Requesting fresh Demo broker proposal…");
  try{
   if(Date.now()-signal.latestPublicEpochMs>5_000){
    stop("AI candidate expired before the quote. No purchase was attempted.");return;
   }
   const quote=await request("quote",{marketSymbol:SYMBOL,direction:signal.direction,stake:1});
   if(stopped.current){
    // A cancelled signal may have reserved an unused quote, but never a buy.
    setOutcome("Stopped after quote. No purchase submitted.");return;
   }
   if(!quote.orderId||!quote.quote||Number(quote.quote.askPrice)>1){
    stop("Invalid broker Demo quote. No purchase attempted.");return;
   }
   if(Date.now()-signal.latestPublicEpochMs>20_000){
    stop("Entry signal is too old. No purchase attempted.");return;
   }
   setPhase("buying");
   buyStarted.current=true; // Never re-attempt after an ambiguous network response.
   setOutcome("Submitting one explicitly armed $1 virtual-money purchase. Never retry automatically.");
   const trade=await request("buy",{orderId:quote.orderId,confirmVirtualPurchase:true});
   stopped.current=true;
   setPhase("completed");
   setOutcome("Deriv Demo response verified. Contract "+String(trade.contractId||"pending")+
    ". Automatic pilot stopped after one purchase.");
  }catch(error){
   stopped.current=true;setPhase("stopped");
   setOutcome((error instanceof Error?error.message:"Demo purchase unavailable.")+
    (buyStarted.current?" Do not retry: verify or reconcile the existing purchase first.":" No purchase was sent."));
  }finally{
   closeFeed();
   try{await onRefresh();}catch{}
  }
 }
 function begin(){
  if(!ready||virtualBalance<1||phase==="scanning"||phase==="quoting"||phase==="buying"||buyStarted.current)return;
  closeFeed();
  history.current=[];
  stopped.current=false;
  closing.current=false;
  buyStarted.current=false;
  startAt.current=Date.now();
  lastReceived.current=0;
  setSampleCount(0);setOutcome("");setLastDecision("Collecting verified R_100 ticks");
  setPhase("scanning");setFeed("Connecting to Deriv public market…");
  let ws:WebSocket;
  try{ws=new WebSocket(WS);}catch{stop("Could not open public market feed.");return;}
  socket.current=ws;
  ws.onopen=()=>{
   if(stopped.current)return;
   ws.send(JSON.stringify({ticks:SYMBOL,subscribe:1}));
   setFeed("Public feed connected · waiting for fresh quotes");
  };
  ws.onerror=()=>{if(!stopped.current)stop("Public market data connection failed.");};
  ws.onclose=()=>{if(!stopped.current&&!closing.current)stop("Public market disconnected.");};
  ws.onmessage=event=>{
   if(stopped.current||buyStarted.current)return;
   let msg:Record<string,any>;
   try{msg=JSON.parse(String(event.data));}
   catch{stop("Malformed Deriv data. No order submitted.");return;}
   if(msg?.error){stop("Deriv feed rejected the subscription. No order submitted.");return;}
   if(msg?.msg_type!=="tick")return;
   const raw=msg.tick;
   if(!raw||raw.symbol!==SYMBOL)return;
   const quote=Number(raw.quote),epochMs=Number(raw.epoch)*1000,now=Date.now();
   if(!Number.isFinite(quote)||quote<=0||!Number.isFinite(epochMs)||
      epochMs>now||now-epochMs>5000){
    stop("Stale, future or malformed public tick. No order submitted.");return;
   }
   const prev=history.current.at(-1);
   if(prev&&epochMs<=prev.epochMs)return; // Never score duplicate market seconds.
   const tick:DemoAiTick={
    id:SYMBOL+":"+String(raw.epoch)+":"+String(raw.quote),
    symbol:SYMBOL,epochMs,quote,
   };
   const next=[...history.current,tick].slice(-160);
   history.current=next;
   lastReceived.current=now;
   setSampleCount(next.length);
   setFeed("LIVE public ticks · "+SYMBOL);
   if(next.length<40)return;
   const evaluation=assessDemoAiCandidate(next,now);
   setLastDecision(evaluation.eligible?
    "Research score "+evaluation.researchScore+"/100 · "+evaluation.direction+" candidate":
    evaluation.reason.replaceAll("_"," "));
   if(evaluation.eligible){
    closing.current=true; // Close public socket before server buys.
    void executeSingleCandidate(evaluation);
   }
  };
  scanTimer.current=setInterval(()=>{
   if(stopped.current)return;
   const now=Date.now();
   if(now-startAt.current>SCAN_LIMIT_MS)stop("The 3-minute Demo scan ended without a qualifying entry. No order submitted.");
   else if(lastReceived.current&&now-lastReceived.current>15_000)stop("Public tick feed went stale. No order submitted.");
  },1000);
 }
 const running=phase==="scanning"||phase==="quoting"||phase==="buying";
 const canStart=ready&&virtualBalance>=1&&!running&&!buyStarted.current;
 return <section className="workspacePanel" style={{marginTop:18}}>
  <p className="workspaceEyebrow">SENFX · ONE-SHOT AUTOMATED DEMO BOT</p>
  <h2>Start AI-assisted virtual trading</h2>
  <p className="muted">One click arms a browser-based automatic R_100 Rise/Fall entry.
   It screens fresh public ticks with a deterministic research rule; this is not a
   trained AI model or guaranteed edge. When a candidate qualifies, it requests
   and buys up to one $1 USD Deriv Demo contract, then stops. Your device must
   keep this page open. No real-money trading.</p>
  <p className="muted"><strong>Status:</strong> {phase} · {feed} · {sampleCount} fresh ticks</p>
  <p className="muted"><strong>Entry search:</strong> {lastDecision}</p>
  {outcome&&<p role="status" className="muted">{outcome}</p>}
  {!ready&&<p role="alert" className="muted">Auto mode is not armed: {reason.replaceAll("_"," ")}.
   The server will not buy until its Demo-only one-shot authorization and broker safety checks pass.</p>}
  <div style={{display:"flex",gap:12,flexWrap:"wrap",marginTop:16}}>
   <button type="button" className="workspacePrimaryButton" disabled={!canStart}
    onClick={begin}>Start $1 Demo auto bot</button>
   <button type="button" className="button secondary" disabled={!running}
    onClick={()=>stop()}>Emergency Stop</button>
  </div>
  <p className="muted" style={{marginTop:10}}>Stopping prevents new requests; it cannot reverse a broker purchase already submitted. On ambiguous outcomes the bot never retries automatically.</p>
 </section>;
}
