"use client";
import {useEffect,useRef,useState} from "react";
import {
 FIFTEEN_BOTS,startFifteenPaperSession,observeFifteenPaperTick,
 stopFifteenPaperSession,PAPER_MAX_TICK_AGE_MS,
 type FifteenSession,
} from "@/lib/bots/fifteen-paper-bots";
import {DIGIT_MARKETS,parsePublicDigitTick,type DigitSymbol,type ObservedTick} from "@/lib/bots/digit-matrix";
import styles from "./fifteen.module.css";

const PUBLIC_WS="wss://api.derivws.com/trading/v1/options/ws/public";
const SYMBOLS=new Set<string>(FIFTEEN_BOTS.map(b=>b.market));
const MAX_MS=15*60*1000;
const MAX_STALE_MS=20_000;
const money=(n:number)=>Number.isFinite(n)?new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n):"—";

type Phase="idle"|"connecting"|"running"|"stopped"|"completed";
export default function FifteenParallelPaperRunner(){
 const [stake,setStake]=useState(1);
 const [count,setCount]=useState(5);
 const [totalCap,setTotalCap]=useState(75);
 const [phase,setPhase]=useState<Phase>("idle");
 const [status,setStatus]=useState("Ready. Click Start All 15 after reviewing the hypothetical exposure.");
 const [view,setView]=useState<Record<string,FifteenSession>>({});
 const [verifiedSymbols,setVerifiedSymbols]=useState(0);
 const wsRef=useRef<WebSocket|null>(null);
 const timerRef=useRef<ReturnType<typeof setInterval>|null>(null);
 const sessionsRef=useRef(new Map<string,FifteenSession>());
 const historyRef=useRef(new Map<DigitSymbol,ObservedTick[]>());
 const begunAt=useRef(0);
 const latestAt=useRef(0);
 const activeRef=useRef(false);
 const readyRef=useRef(false);

 const planned=stake*count*FIFTEEN_BOTS.length;
 const valid=Number.isFinite(stake)&&stake>=1&&stake<=25&&
   Number.isInteger(count)&&count>=1&&count<=10&&
   Number.isFinite(totalCap)&&totalCap>=planned&&totalCap<=10000;
 const activeCount=Object.values(view).filter(s=>s.state==="running").length;
 const completedCount=Object.values(view).filter(s=>s.state==="completed").length;
 const observed=Object.values(view).reduce((total,s)=>total+s.observations.length,0);
 const hits=Object.values(view).reduce((total,s)=>total+s.observations.filter(o=>o.hit).length,0);

 const cleanConnection=()=>{
  const ws=wsRef.current;wsRef.current=null;
  if(ws){ws.onopen=null;ws.onmessage=null;ws.onerror=null;ws.onclose=null;try{ws.close();}catch{}}
  if(timerRef.current){clearInterval(timerRef.current);timerRef.current=null;}
 };
 const end=(reason:string,mode:"stopped"|"completed"="stopped")=>{
  if(!activeRef.current)return;
  activeRef.current=false;readyRef.current=false;cleanConnection();
  if(mode==="stopped"){
   for(const [id,session] of sessionsRef.current)
    if(session.state==="running")sessionsRef.current.set(id,stopFifteenPaperSession(session,reason));
  }
  setView(Object.fromEntries(sessionsRef.current));
  setStatus(reason);setPhase(mode);
 };
 useEffect(()=>()=>{
  activeRef.current=false;readyRef.current=false;
  const ws=wsRef.current;wsRef.current=null;
  if(ws){ws.onopen=null;ws.onmessage=null;ws.onerror=null;ws.onclose=null;try{ws.close();}catch{}}
  if(timerRef.current)clearInterval(timerRef.current);
 },[]);

 const start=()=>{
  if(activeRef.current||!valid)return;
  cleanConnection();
  sessionsRef.current=new Map();
  historyRef.current=new Map();
  activeRef.current=true;readyRef.current=false;
  begunAt.current=Date.now();latestAt.current=Date.now();
  setView({});setVerifiedSymbols(0);setPhase("connecting");
  setStatus("Verifying all 10 Deriv public synthetic markets. No broker purchases.");
  let socket:WebSocket;
  try{socket=new WebSocket(PUBLIC_WS);}
  catch{end("Public market feed could not connect. All 15 remain stopped.");return;}
  wsRef.current=socket;
  const subscribed=new Set<string>();
  socket.onopen=()=>{
   if(!activeRef.current)return;
   try{socket.send(JSON.stringify({active_symbols:"brief",req_id:45001}));}
   catch{end("Market verification failed. No simulated observations recorded.");}
  };
  socket.onmessage=event=>{
   if(!activeRef.current)return;
   let msg:Record<string,unknown>;
   try{msg=JSON.parse(String(event.data));}
   catch{end("Malformed public feed message. Stopped for safety.");return;}
   if(msg.error){end("Deriv public feed rejected a request. Check its availability.");return;}
   if(msg.msg_type==="active_symbols"){
    if(!Array.isArray(msg.active_symbols)){end("No verified market directory returned.");return;}
    const offered=new Set<string>();
    for(const item of msg.active_symbols){
     if(!item||typeof item!=="object")continue;
     const d=item as Record<string,unknown>;
     const symbol=d.underlying_symbol??d.symbol;
     if(typeof symbol==="string")offered.add(symbol);
    }
    const required=DIGIT_MARKETS.map(x=>x.symbol).filter(symbol=>SYMBOLS.has(symbol));
    const available=required.filter(symbol=>offered.has(symbol));
    setVerifiedSymbols(available.length);
    if(available.length!==required.length){
     end("Not all 10 required public markets are available. All 15 stopped without fabricated results.");return;
    }
    for(const [index,symbol] of available.entries()){
     subscribed.add(symbol);
     try{socket.send(JSON.stringify({ticks:symbol,subscribe:1,req_id:46000+index}));}
     catch{end("Tick subscriptions failed. All 15 stopped.");return;}
    }
    readyRef.current=true;setPhase("running");
    setStatus("Scanning all 15 strategies using 10 verified public market feeds. Waiting for genuine future ticks.");
    return;
   }
   if(msg.msg_type!=="tick"||!readyRef.current)return;
   const now=Date.now(),tick=parsePublicDigitTick(msg,now);
   if(!tick||!subscribed.has(tick.symbol))return;
   const prev=historyRef.current.get(tick.symbol)||[];
   if(prev.length&&tick.epoch<=prev[prev.length-1].epoch)return;
   const age=now-tick.epoch*1000;
   if(age<0||age>PAPER_MAX_TICK_AGE_MS){
    end("Stale or future market tick. All 15 simulations stopped; no result invented.");return;
   }
   latestAt.current=now;
   for(const bot of FIFTEEN_BOTS){
    if(bot.market!==tick.symbol)continue;
    const prior=sessionsRef.current.get(bot.id);
    if(prior?.state==="running"){
     const next=observeFifteenPaperTick(prior,tick,prev,now);
     sessionsRef.current.set(bot.id,next);
    }
   }
   const nextHistory=[...prev,tick].slice(-160);
   historyRef.current.set(tick.symbol,nextHistory);
   for(const bot of FIFTEEN_BOTS){
    if(bot.market!==tick.symbol||sessionsRef.current.has(bot.id))continue;
    const armed=startFifteenPaperSession({
     botId:bot.id,history:nextHistory,stake,count,cap:stake*count,nowMs:now
    });
    if(armed.ok)sessionsRef.current.set(bot.id,armed.session);
   }
   if(sessionsRef.current.size===FIFTEEN_BOTS.length&&
      [...sessionsRef.current.values()].every(s=>s.state==="completed")){
    end("All 15 paper studies completed using future public ticks. No Deriv broker trades.", "completed");
   }else if([...sessionsRef.current.values()].some(s=>s.state==="stopped")){
    end("A paper bot stopped because its data could not be verified; stopped all 15."); 
   }
  };
  socket.onerror=()=>end("Public WebSocket error. All 15 stopped.");
  socket.onclose=()=>end("Public market feed closed. All 15 stopped; missed ticks are not backfilled.");
  timerRef.current=setInterval(()=>{
   if(!activeRef.current)return;
   const now=Date.now();
   if(now-begunAt.current>MAX_MS){end("15-minute research session ended. No new entries.");return;}
   if(now-latestAt.current>MAX_STALE_MS){end("No fresh market data for 20 seconds. Stopped all 15.");return;}
   setView(Object.fromEntries(sessionsRef.current));
  },1000);
 };

 return <section className={styles.panel} style={{marginTop:20,marginBottom:20}}>
  <p className={styles.kicker}>AUTOMATED PARALLEL RESEARCH · PAPER ONLY</p>
  <h2>Start all 15 SENFX bots</h2>
  <p>One click starts 15 independent, automatic next-tick strategy studies on live Deriv public ticks.
   Every bot evaluates its own market and stops after the chosen number of observations.
   This runs only while this browser tab remains open. No virtual broker orders, real trades, returns or payouts are claimed.</p>
  <p className={styles.warning}>An observed Hit/Miss is NOT a winning or losing Deriv contract.
   Unlimited stakes and broker execution are NOT enabled here.</p>
  <div className={styles.inputs}>
   <label>Paper stake per observation (hypothetical USD)
    <input type="number" min="1" max="25" step=".01" value={stake}
     disabled={activeRef.current} onChange={e=>setStake(Number(e.target.value))}/></label>
   <label>Future observations per bot (1–10)
    <input type="number" min="1" max="10" step="1" value={count}
     disabled={activeRef.current} onChange={e=>setCount(Number(e.target.value))}/></label>
   <label>Combined hypothetical exposure cap (USD)
    <input type="number" min="1" max="10000" step=".01" value={totalCap}
     disabled={activeRef.current} onChange={e=>setTotalCap(Number(e.target.value))}/></label>
  </div>
  <div className={styles.exposure}>
   <small>COMBINED PLANNED PAPER EXPOSURE · NEVER DEBITED</small>
   <strong>{money(planned)}</strong>
  </div>
  <div className={styles.controls}>
   <button className={styles.startButton} disabled={!valid||phase==="connecting"||phase==="running"}
    onClick={start}>Start All 15 Paper Bots</button>
   <button className={styles.stopButton} disabled={phase!=="connecting"&&phase!=="running"}
    onClick={()=>end("Emergency Stop: all 15 paper bot entries disabled.")}>Emergency Stop All</button>
  </div>
  <p role="status" className={styles.notice}>{status}</p>
  <div className={styles.resultGrid}>
   <div><small>VERIFIED MARKETS</small><b>{verifiedSymbols}/10</b></div>
   <div><small>BOTS RUNNING</small><b>{activeCount}</b></div>
   <div><small>BOTS COMPLETED</small><b>{completedCount}/15</b></div>
   <div><small>FUTURE TICKS TESTED</small><b>{observed}</b></div>
   <div><small>HITS / MISSES</small><b>{hits} / {observed-hits}</b></div>
  </div>
  <div className={styles.scrollTable}>
   <table>
    <thead><tr><th>Strategy</th><th>Market</th><th>State</th><th>Observed</th><th>Hits</th><th>Misses</th></tr></thead>
    <tbody>{FIFTEEN_BOTS.map(bot=>{
     const s=view[bot.id],n=s?.observations.length||0,h=s?.observations.filter(o=>o.hit).length||0;
     return <tr key={bot.id}>
      <td>{bot.name}</td><td>{bot.market}</td>
      <td>{s?.state??(phase==="running"?"Sampling":"Not started")}</td>
      <td>{n}/{count}</td><td>{h}</td><td>{n-h}</td>
     </tr>;
    })}</tbody>
   </table>
  </div>
  <p className={styles.finePrint}>No automated broker calls are present in this runner.
   No historical tick replay or invented profit/loss. On missing markets, stale data, feed loss or
   emergency stop, the study stops rather than guessing. AI Demo auto purchases remain separately gated.</p>
 </section>;
}
