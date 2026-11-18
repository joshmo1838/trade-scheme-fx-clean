"use client";
import Link from "next/link";
import {useEffect,useRef,useState} from "react";
import {
  RESEARCH_PROFILES,compareResearchSignals,evaluateResearchProfile,
  type ResearchProfileName,
} from "@/lib/bots/strategy-lab";
import styles from "./lab.module.css";

const FEED="wss://api.derivws.com/trading/v1/options/ws/public";
const SYMBOLS=new Set<string>(RESEARCH_PROFILES.map(p=>p.symbol));
const MAX_TICKS=250;
type Track={prices:number[];updatedAt:number;lastEpoch:number};
type Snapshot={prices:readonly number[];updatedAt:number};
type Tracks=Partial<Record<ResearchProfileName,Snapshot>>;
const short=(v:number|null)=>v===null?"—":String(Math.round(v*100)/100);
export default function StrategyLab(){
 const [enabled,setEnabled]=useState(true);
 const [generation,setGeneration]=useState(0);
 const [feedStatus,setFeedStatus]=useState("Connecting to public markets…");
 const [snapshots,setSnapshots]=useState<Tracks>({});
 const data=useRef(new Map<ResearchProfileName,Track>());

 useEffect(()=>{
  if(!enabled){setFeedStatus("Paused; no active subscriptions.");return;}
  let mounted=true,socket:WebSocket|null=null,retry=0;
  let retryTimer:ReturnType<typeof setTimeout>|undefined;
  let connectionTimer:ReturnType<typeof setTimeout>|undefined;
  let directoryAt=0;
  data.current=new Map();setSnapshots({});
  const refresh=()=>{
   if(!mounted)return;
   const next:Tracks={};
   for(const p of RESEARCH_PROFILES){
    const item=data.current.get(p.name);
    if(item)next[p.name]={prices:[...item.prices],updatedAt:item.updatedAt};
   }
   setSnapshots(next);
   if(socket?.readyState===WebSocket.OPEN && directoryAt>0&&
      data.current.size && [...data.current.values()].every(x=>Date.now()-x.updatedAt>20_000)){
     setFeedStatus("Stale feed. Reconnecting; no fabricated observations.");
     socket.close();
   }
  };
  const heartbeat=setInterval(refresh,2000);
  const connect=()=>{
   if(!mounted)return;
   setFeedStatus("Connecting to Deriv public market feed…");
   try{socket=new WebSocket(FEED);}
   catch{
    setFeedStatus("Public feed unavailable. Retrying.");
    retryTimer=setTimeout(connect,5000);return;
   }
   const ws=socket;
   connectionTimer=setTimeout(()=>{
    if(mounted&&ws.readyState!==WebSocket.OPEN)ws.close();
   },12000);
   ws.onopen=()=>{
    clearTimeout(connectionTimer);
    ws.send(JSON.stringify({active_symbols:"brief",req_id:910}));
    setFeedStatus("Verifying which markets are currently available…");
   };
   ws.onmessage=event=>{
    if(!mounted)return;
    let message:unknown;
    try{message=JSON.parse(String(event.data));}catch{return;}
    if(!message||typeof message!=="object")return;
    const msg=message as Record<string,unknown>;
    if(msg.error){setFeedStatus("Market feed rejected a request; reconnect if needed.");return;}
    if(msg.msg_type==="active_symbols"){
     if(!Array.isArray(msg.active_symbols)){ws.close();return;}
     const available=new Set(msg.active_symbols.map((value:unknown)=>{
      if(!value||typeof value!=="object")return null;
      const entry=value as Record<string,unknown>;
      return entry.underlying_symbol??entry.symbol;
     }).filter((x:unknown):x is string=>typeof x==="string"));
     let count=0;
     for(const p of RESEARCH_PROFILES){
      if(!available.has(p.symbol))continue;
      ws.send(JSON.stringify({ticks:p.symbol,subscribe:1,req_id:911+count}));
      count++;
     }
     directoryAt=Date.now();
     setFeedStatus(count? "Listening to "+count+" verified public markets…":
       "No supported markets available from the public feed.");
     retry=0;return;
    }
    if(msg.msg_type!=="tick"||!msg.tick||typeof msg.tick!=="object")return;
    const tick=msg.tick as Record<string,unknown>;
    if(typeof tick.symbol!=="string"||!SYMBOLS.has(tick.symbol))return;
    const price=tick.quote,epoch=tick.epoch;
    if(typeof price!=="number"||!Number.isFinite(price)||price<=0||
       typeof epoch!=="number"||!Number.isSafeInteger(epoch)||
       epoch*1000>Date.now()+5000||Date.now()-epoch*1000>30_000)return;
    const profile=RESEARCH_PROFILES.find(p=>p.symbol===tick.symbol);
    if(!profile)return;
    const old=data.current.get(profile.name);
    if(old && epoch<=old.lastEpoch)return;
    data.current.set(profile.name,{
     prices:[...(old?.prices||[]),price].slice(-MAX_TICKS),
     lastEpoch:epoch,updatedAt:Date.now(),
    });
    setFeedStatus("Live public ticks received · research only.");
   };
   ws.onclose=()=>{
    if(!mounted)return;
    setFeedStatus("Disconnected. Retrying research feed…");
    retryTimer=setTimeout(connect,Math.min(30000,1200*2**Math.min(retry++,5)));
   };
   ws.onerror=()=>{if(mounted)setFeedStatus("Market feed connection error.");};
  };
  connect();
  return()=>{mounted=false;clearTimeout(retryTimer);clearTimeout(connectionTimer);
   clearInterval(heartbeat);try{socket?.close();}catch{};};
 },[enabled,generation]);

 return <main className={styles.shell}>
  <div className={styles.container}>
   <nav className={styles.nav}>
    <Link href="/dashboard"><b>TRADE SCHEME FX</b></Link>
    <span><Link href="/bot-center">Bot Center</Link> · <Link href="/digit-matrix">Digit Matrix</Link></span>
   </nav>
   <header className={styles.hero}>
    <div><p className={styles.eyebrow}>SENFX RESEARCH LAB · THREE BOT UPGRADES</p>
     <h1>Make the bots better. <em>Prove it first.</em></h1>
     <p>Compare today's existing moving-average paper rules against new, independent
       signal filters—using only public market ticks received by this browser.</p>
     <p className={styles.disclaimer}>These are unvalidated research candidates.
       Fewer signals do NOT mean higher profitability. This page places no Deriv
       Demo or Real contracts, starts no hosted workers and does not change the
       original bots.</p>
    </div>
    <div className={styles.actions}>
     <span>{feedStatus}</span>
     <button onClick={()=>setEnabled(x=>!x)}>{enabled?"Stop research feed":"Resume research feed"}</button>
     <button disabled={!enabled} onClick={()=>setGeneration(v=>v+1)}>Reconnect</button>
    </div>
   </header>
   <div className={styles.cards}>
    {RESEARCH_PROFILES.map(profile=>{
      const snapshot=snapshots[profile.name];
      const prices=snapshot?.prices||[];
      const current=evaluateResearchProfile(profile.name,prices);
      const compare=compareResearchSignals(profile.name,prices);
      const fresh=snapshot?.updatedAt!==undefined&&Date.now()-snapshot.updatedAt<15000;
      return <section className={styles.card} key={profile.name}>
       <div className={styles.cardHeader}>
        <span className={styles.symbol}>{profile.symbol}</span>
        <span className={fresh?styles.live:styles.off}>{fresh?"LIVE PUBLIC":"WAIT / STALE"}</span>
       </div>
       <h2>{profile.name}</h2><p className={styles.tag}>{profile.tag}</p>
       <p>{profile.description}</p>
       <div className={styles.metrics}>
        <div><small>OBSERVED TICKS</small><b>{prices.length}</b></div>
        <div><small>WINDOWS COMPARED</small><b>{compare.processedWindows}</b></div>
        <div><small>BASELINE DECISIONS</small><b>{compare.baselineSignals}</b></div>
        <div><small>CANDIDATE DECISIONS</small><b>{compare.candidateSignals}</b></div>
       </div>
       <div className={styles.current}>
        <span>Legacy paper rule</span>
        <strong>{fresh?(current.baseSignal||"No signal"):"Feed unavailable"}</strong>
       </div>
       <div className={styles.current}>
        <span>Research candidate</span>
        <strong>{fresh?(current.candidateSignal||"Filtered / no signal"):"Feed unavailable"}</strong>
       </div>
       <p className={styles.details}>
        Status: <b>{current.reason.replaceAll("-"," ")}</b> ·
        Directional efficiency: {short(current.efficiency)} ·
        Last jump ratio: {short(current.latestShockRatio)}
       </p>
       <p className={styles.note}>
        {compare.filteredSignals} candidate signal(s) filtered in this short local
        observation session. This is not a backtest, verified win rate, broker
        execution, or proof of an improved financial outcome.</p>
      </section>;
    })}
   </div>
   <footer className={styles.footer}>
    Research requires forward evaluation, risk review, and out-of-sample testing
    before any change to the hosted paper worker or customer bot catalog.
    <Link href="/bot-center">Return to existing published bots</Link>
   </footer>
  </div>
 </main>;
}
