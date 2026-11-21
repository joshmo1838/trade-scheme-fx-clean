"use client";
import Link from "next/link";
import {useEffect,useMemo,useRef,useState} from "react";
import {FIFTEEN_BOTS,BOT_COUNT,findFifteenBot,predictFifteenBot,PAPER_MAX_TICK_AGE_MS}
 from "@/lib/bots/fifteen-paper-bots";
import {DIGIT_MARKETS,parsePublicDigitTick,type DigitSymbol,type ObservedTick}
 from "@/lib/bots/digit-matrix";
import styles from "./fifteen.module.css";
import FifteenDemoBrokerReadiness from "./FifteenDemoBrokerReadiness";
import FifteenDemoBotControlPanel from "./FifteenDemoBotControlPanel";
import FifteenDemoIndividualControl from "./FifteenDemoIndividualControl";

const PUBLIC_FEED="wss://api.derivws.com/trading/v1/options/ws/public";
const TRACKED_MARKETS=new Set<string>(FIFTEEN_BOTS.map(x=>x.market));
const MAX_TICKS=160;
type MarketSnapshot={quotes:readonly ObservedTick[];lastAt:number};
type MarketSnapshots=Partial<Record<DigitSymbol,MarketSnapshot>>;

/**
 * The public feed below is only a visual market monitor. Actual Deriv virtual
 * Demo contract purchases are made exclusively by the separately authorized,
 * leased server-side Demo broker worker, never by the browser.
 */
export default function FifteenPaperBotLibrary(){
 const [enabled,setEnabled]=useState(true);
 const [reconnect,setReconnect]=useState(0);
 const [feedStatus,setFeedStatus]=useState("Connecting to Deriv public market ticks…");
 const [marketStatus,setMarketStatus]=useState<string[]>([]);
 const [snapshots,setSnapshots]=useState<MarketSnapshots>({});
 const [selectedId,setSelectedId]=useState(FIFTEEN_BOTS[0].id);
 const history=useRef(new Map<DigitSymbol,ObservedTick[]>());
 const lastReceived=useRef(new Map<DigitSymbol,number>());
 const selected=useMemo(()=>findFifteenBot(selectedId)||FIFTEEN_BOTS[0],[selectedId]);
 const sample=snapshots[selected.market]?.quotes||[];
 const lastAt=snapshots[selected.market]?.lastAt||0;
 const marketFresh=enabled&&marketStatus.includes(selected.market)&&
  Date.now()-lastAt<15_000;
 const previewSignal=useMemo(()=>predictFifteenBot(selected,sample),[selected,sample]);
 const changeBot=(id:string)=>setSelectedId(id);

 useEffect(()=>{
  if(!enabled){
   setFeedStatus("Public market preview paused. Broker worker is independent.");
   return;
  }
  let mounted=true;
  let ws:WebSocket|null=null;
  let retry=0;
  let retryTimer:ReturnType<typeof setTimeout>|undefined;
  let connectTimeout:ReturnType<typeof setTimeout>|undefined;
  let openAt=0,lastObservedAt=0,receivedDirectory=false;
  let subscribed=new Set<string>();
  history.current=new Map();lastReceived.current=new Map();
  setSnapshots({});setMarketStatus([]);

  const snapshot=()=>{
   if(!mounted)return;
   const now=Date.now();
   if(ws?.readyState===WebSocket.OPEN&&!receivedDirectory&&openAt&&now-openAt>16000){
    setFeedStatus("Public market directory timed out. Reconnecting preview…");
    ws.close();return;
   }
   if(ws?.readyState===WebSocket.OPEN&&subscribed.size>0&&
      now-Math.max(openAt,lastObservedAt)>30000){
    setFeedStatus("Public market preview stale. Reconnecting…");
    ws.close();return;
   }
   const next:MarketSnapshots={};
   for(const market of DIGIT_MARKETS){
    const quotes=history.current.get(market.symbol);
    if(quotes?.length)next[market.symbol]={
     quotes:[...quotes],lastAt:lastReceived.current.get(market.symbol)||0
    };
   }
   setSnapshots(next);
  };
  const interval=setInterval(snapshot,1100);
  const connect=()=>{
   if(!mounted)return;
   subscribed=new Set();receivedDirectory=false;openAt=0;lastObservedAt=0;
   setFeedStatus("Connecting to Deriv public synthetic markets…");
   try{ws=new WebSocket(PUBLIC_FEED);}
   catch{setFeedStatus("Public feed unavailable. Reconnecting…");
    retryTimer=setTimeout(connect,5000);return;}
   const socket=ws;
   connectTimeout=setTimeout(()=>{
    if(mounted&&socket.readyState!==WebSocket.OPEN)socket.close();
   },12000);
   socket.onopen=()=>{
    if(!mounted)return;
    clearTimeout(connectTimeout);openAt=Date.now();
    socket.send(JSON.stringify({active_symbols:"brief",req_id:3401}));
    setFeedStatus("Connected. Verifying public synthetic market directory…");
   };
   socket.onmessage=event=>{
    if(!mounted)return;
    let raw:unknown;
    try{raw=JSON.parse(String(event.data));}catch{return;}
    if(!raw||typeof raw!=="object")return;
    const msg=raw as Record<string,unknown>;
    if(msg.error){
     const error=msg.error as Record<string,unknown>;
     setFeedStatus("Public market notice: "+String(error.message||"Data unavailable").slice(0,110));
     if(msg.msg_type==="active_symbols")socket.close();
     return;
    }
    if(msg.msg_type==="active_symbols"){
     if(!Array.isArray(msg.active_symbols)){socket.close();return;}
     const offered=new Set<string>(msg.active_symbols.map((item:unknown)=>{
      if(!item||typeof item!=="object")return null;
      const entry=item as Record<string,unknown>;
      return entry.underlying_symbol??entry.symbol;
     }).filter((x:unknown):x is string=>typeof x==="string"));
     const symbols=DIGIT_MARKETS.map(x=>x.symbol)
      .filter(s=>TRACKED_MARKETS.has(s)&&offered.has(s));
     subscribed=new Set(symbols);receivedDirectory=true;
     setMarketStatus(symbols);
     symbols.forEach((symbol,i)=>{
      if(socket.readyState===WebSocket.OPEN)
       socket.send(JSON.stringify({ticks:symbol,subscribe:1,req_id:3500+i}));
     });
     retry=0;
     setFeedStatus(symbols.length?
      "Connected · "+symbols.length+" public synthetic markets verified":
      "No supported public markets detected");
     return;
    }
    if(msg.msg_type!=="tick")return;
    const receivedAt=Date.now();
    const tick=parsePublicDigitTick(raw,receivedAt);
    if(!tick||!subscribed.has(tick.symbol))return;
    const ageMs=receivedAt-tick.epoch*1000;
    const fresh=ageMs>=0&&ageMs<=PAPER_MAX_TICK_AGE_MS;
    const prev=history.current.get(tick.symbol)||[];
    if(prev.length&&tick.epoch<=prev[prev.length-1].epoch)return;
    if(!fresh){
     setFeedStatus("Delayed public-market tick ignored. Broker worker is independent.");
     return;
    }
    history.current.set(tick.symbol,[...prev,tick].slice(-MAX_TICKS));
    lastReceived.current.set(tick.symbol,receivedAt);
    lastObservedAt=receivedAt;
    setFeedStatus("LIVE public market feed · broker order status is shown separately");
   };
   socket.onerror=()=>{
    if(mounted)setFeedStatus("Public preview feed error. Waiting to reconnect…");
   };
   socket.onclose=()=>{
    if(!mounted)return;
    subscribed.clear();setMarketStatus([]);
    history.current=new Map();lastReceived.current=new Map();
    setSnapshots({});
    setFeedStatus("Public preview disconnected. Reconnecting safely…");
    retryTimer=setTimeout(connect,Math.min(30_000,1500*2**Math.min(retry++,4)));
   };
  };
  connect();
  return()=>{
   mounted=false;clearTimeout(retryTimer);clearTimeout(connectTimeout);
   clearInterval(interval);try{ws?.close();}catch{}
  };
 },[enabled,reconnect]);

 return <main className={styles.shell}><div className={styles.content}>
  <header className={styles.topbar}>
   <Link href="/dashboard" className={styles.brand}>TRADE SCHEME <b>FX</b></Link>
   <nav><Link href="/bot-center">Bot Center</Link>
    <Link href="/digit-matrix">Digit Matrix</Link>
    <Link href="/bot-research">Research Lab</Link>
    <Link href="/strategy-lab">Forward Test</Link></nav>
  </header>
  <section className={styles.hero}>
   <p className={styles.kicker}>SENFX · GENUINE DERIV BROKER · VIRTUAL DEMO ONLY</p>
   <h1>{BOT_COUNT} original SENFX <span>Deriv Demo bots</span></h1>
   <p>Choose one of your 15 strategies and authorize actual Deriv broker contracts
    using virtual-money Demo funds. The individual <strong>Start Selected Demo Bot</strong>
    control is beside the selected strategy. No paper-trading Start button appears on this page.</p>
   <p className={styles.warning}>Only authenticated, explicitly authorized Deriv virtual-money
    Demo orders can be purchased. Real-money trading is disabled. The public market preview
    does not place orders and does not guarantee a profit.</p>
   <div className={styles.feedActions}>
    <span role="status">{feedStatus}</span>
    <button onClick={()=>setEnabled(x=>!x)}>
     {enabled?"Pause public market preview":"Resume public market preview"}</button>
    <button disabled={!enabled} onClick={()=>setReconnect(x=>x+1)}>Reconnect public preview</button>
   </div>
  </section>

  <section className={styles.panel} id="senfx-individual-demo" style={{margin:"18px 0"}}>
   <p className={styles.kicker}>STEP 1 · SELECT BOT · STEP 2 · AUTHORIZE BROKER DEMO</p>
   <h2>Actual Deriv broker execution with virtual Demo funds</h2>
   <label style={{display:"block",margin:"12px 0"}}>Choose your strategy
    <select aria-label="Choose individual Deriv Demo bot" value={selectedId}
     style={{display:"block",width:"100%",padding:12,marginTop:6}}
     onChange={e=>changeBot(e.target.value)}>
     {FIFTEEN_BOTS.map(bot=><option key={bot.id} value={bot.id}>
      {bot.name} — {bot.market}</option>)}
    </select>
   </label>
   <p>Selected: <strong>{selected.name}</strong> · {selected.market}</p>
   <a href="#senfx-demo-broker-controls"
    style={{display:"inline-block",padding:"12px 16px",borderRadius:10,
     background:"#087c74",color:"white",fontWeight:800,textDecoration:"none"}}>
    Open Start Selected Demo Bot
   </a>
  </section>

  <details className={styles.panel} style={{margin:"12px 0"}}>
   <summary style={{cursor:"pointer",fontWeight:800}}>Advanced · Start All 15 Demo Bots</summary>
   <FifteenDemoBotControlPanel/>
  </details>
  <details className={styles.panel} style={{margin:"12px 0"}}>
   <summary style={{cursor:"pointer",fontWeight:800}}>Advanced · Verify Deriv Demo contract types</summary>
   <FifteenDemoBrokerReadiness/>
  </details>
  <div className={styles.topMetrics}>
   <div><small>SELECTABLE DEMO BOTS</small><b>{BOT_COUNT}</b></div>
   <div><small>PUBLIC MARKETS</small><b>{marketStatus.length} / 10</b></div>
   <div><small>PUBLIC TICKS PREVIEW</small>
    <b>{Object.values(snapshots).reduce((a,x)=>a+(x?.quotes.length||0),0)}</b></div>
   <div><small>BROKER TYPE</small><b>VIRTUAL DEMO USD</b></div>
  </div>
  <div className={styles.columns}>
   <section className={styles.library}>
    <div className={styles.sectionTitle}><div>
     <p className={styles.kicker}>ALL FIFTEEN</p><h2>Strategy library</h2></div>
     <p>Select any card to open its genuine Deriv Demo broker controls on the right.</p>
    </div>
    <div className={styles.botGrid}>
     {FIFTEEN_BOTS.map((bot,index)=>{
      const ticks=snapshots[bot.market]?.quotes||[];
      const ready=!!predictFifteenBot(bot,ticks);
      const fresh=enabled&&marketStatus.includes(bot.market)&&
       Date.now()-(snapshots[bot.market]?.lastAt||0)<15_000;
      return <button key={bot.id} onClick={()=>changeBot(bot.id)}
       aria-pressed={selectedId===bot.id}
       className={[styles.botCard,selectedId===bot.id?styles.activeCard:""].join(" ")}>
       <div className={styles.botMeta}>
        <span>BOT {String(index+1).padStart(2,"0")}</span>
        <strong>{bot.market}</strong></div>
       <h3>{bot.name}</h3>
       <p className={styles.botCategory}>{bot.category}</p>
       <p>{bot.description}</p>
       <div className={styles.botFooter}>
        <span>{fresh?(ready?"PUBLIC SIGNAL":"COLLECTING TICKS"):"WAITING FOR FEED"}</span>
        <span>{ticks.length}/{bot.minTicks} ticks</span>
       </div>
      </button>;
     })}
    </div>
   </section>
   <aside className={styles.sidebar}>
    <section className={styles.panel}>
     <p className={styles.kicker}>SELECTED DERIV DEMO BROKER STRATEGY</p>
     <h2>{selected.name}</h2>
     <p>{selected.description}</p>
     <p className={styles.details}><b>Market:</b> {selected.market}
      <b>Category:</b> {selected.category}
      <b>Enhancement:</b> {selected.difference}</p>
     <div className={styles.marketState}>
      <span>Public feed <b>{marketFresh?"LIVE":"WAITING / STALE"}</b></span>
      <span>Public samples <b>{sample.length}</b></span>
      <span>Public signal <b>{marketFresh?(previewSignal?
       previewSignal.prediction+
       (previewSignal.barrier===undefined?"":" "+previewSignal.barrier):
       "NO SIGNAL"):"UNAVAILABLE"}</b></span>
      <span>Last public quote <b>{sample.at(-1)?.quoteText||"—"}</b></span>
     </div>
    </section>
    <div id="senfx-demo-broker-controls">
     <FifteenDemoIndividualControl botId={selected.id} botName={selected.name}/>
    </div>
   </aside>
  </div>
  <footer className={styles.footer}>
   SENFX bots send genuine broker orders only on the connected, owner-authorized
   Deriv virtual Demo USD account. Real-money trading stays disabled.
   Broker quotes and settlements must be verified; returns are not guaranteed.
  </footer>
 </div></main>;
}
