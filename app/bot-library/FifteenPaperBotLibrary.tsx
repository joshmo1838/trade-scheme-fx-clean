"use client";
import Link from "next/link";
import {useEffect,useMemo,useRef,useState} from "react";
import {
 FIFTEEN_BOTS,BOT_COUNT,findFifteenBot,predictFifteenBot,
 startFifteenPaperSession,observeFifteenPaperTick,stopFifteenPaperSession,
 type FifteenSession,
} from "@/lib/bots/fifteen-paper-bots";
import {
 DIGIT_MARKETS,parsePublicDigitTick,type DigitSymbol,type ObservedTick,
} from "@/lib/bots/digit-matrix";
import styles from "./fifteen.module.css";

const PUBLIC_FEED="wss://api.derivws.com/trading/v1/options/ws/public";
const TRACKED_MARKETS=new Set<string>(FIFTEEN_BOTS.map(x=>x.market));
const MAX_TICKS=160;
type MarketSnapshot={quotes:readonly ObservedTick[];lastAt:number};
type MarketSnapshots=Partial<Record<DigitSymbol,MarketSnapshot>>;
const usd=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n);

/**
 * One WebSocket for all markets; one explicitly user-started, browser-local
 * paper batch at a time. No cloud worker, broker trading or private keys.
 */
export default function FifteenPaperBotLibrary(){
 const [enabled,setEnabled]=useState(true);
 const [reconnect,setReconnect]=useState(0);
 const [feedStatus,setFeedStatus]=useState("Connecting to Deriv public ticks…");
 const [marketStatus,setMarketStatus]=useState<string[]>([]);
 const [snapshots,setSnapshots]=useState<MarketSnapshots>({});
 const [selectedId,setSelectedId]=useState(FIFTEEN_BOTS[0].id);
 const [stake,setStake]=useState(1);
 const [count,setCount]=useState(5);
 const [cap,setCap]=useState(5);
 const [session,setSession]=useState<FifteenSession|null>(null);
 const [notice,setNotice]=useState("Select an original SENFX strategy and gather fresh public-market ticks.");
 const history=useRef(new Map<DigitSymbol,ObservedTick[]>());
 const lastReceived=useRef(new Map<DigitSymbol,number>());
 const sessionRef=useRef<FifteenSession|null>(null);

 const selected=useMemo(()=>findFifteenBot(selectedId)||FIFTEEN_BOTS[0],[selectedId]);
 const sample=snapshots[selected.market]?.quotes||[];
 const lastAt=snapshots[selected.market]?.lastAt||0;
 const marketFresh=enabled&&marketStatus.includes(selected.market)&&
   Date.now()-lastAt<15_000;
 const nextResearchSignal=useMemo(()=>predictFifteenBot(selected,sample),[selected,sample]);
 const exposure=Number.isFinite(stake)&&Number.isFinite(count)?Math.round(stake*count*100)/100:0;
 const budgetOk=stake>=1&&stake<=25&&Number.isFinite(stake)&&
   Number.isInteger(count)&&count>=1&&count<=10&&Number.isFinite(cap)&&cap>=exposure;
 const sessionHits=session?.observations.filter(x=>x.hit).length||0;

 const stopPaperBatch=(reason="Emergency Stop pressed. No further paper observations.")=>{
  const old=sessionRef.current;
  if(!old||old.state!=="running")return;
  const next=stopFifteenPaperSession(old,reason);
  sessionRef.current=next;setSession(next);setNotice(reason);
 };
 const changeBot=(id:string)=>{
  if(id!==selectedId)stopPaperBatch("Changed strategy. Previous paper batch stopped.");
  setSelectedId(id);
  setSession(null);sessionRef.current=null;
  setNotice("Strategy selected. Wait for fresh market samples, then start a paper batch.");
 };
 const start=()=>{
  if(sessionRef.current?.state==="running"){
   setNotice("A paper batch is already in progress. Press Emergency Stop first.");return;
  }
  if(!enabled||!marketFresh){setNotice("Fresh, verified public market feed required.");return;}
  const result=startFifteenPaperSession({
   botId:selected.id,history:history.current.get(selected.market)||[],
   stake,count,cap,nowMs:Date.now(),
  });
  if(!result.ok){setNotice(result.reason);return;}
  sessionRef.current=result.session;setSession(result.session);
  setNotice("PAPER ONLY: strategy armed. One future public tick tests the prior hypothesis.");
 };

 useEffect(()=>{
  if(!enabled){
   const current=sessionRef.current;
   if(current?.state==="running"){
    const stopped=stopFifteenPaperSession(current,"Public feed manually paused. Paper batch stopped.");
    sessionRef.current=stopped;setSession(stopped);
   }
   setFeedStatus("Public data feed paused.");
   return;
  }
  let mounted=true,ws:WebSocket|null=null,retry=0;
  let retryTimer:ReturnType<typeof setTimeout>|undefined;
  let connectTimeout:ReturnType<typeof setTimeout>|undefined;
  let openAt=0,lastObservedAt=0,receivedDirectory=false;
  let subscribed=new Set<string>();
  history.current=new Map();lastReceived.current=new Map();
  setSnapshots({});setMarketStatus([]);
  const stopForFeed=(reason:string)=>{
   const current=sessionRef.current;
   if(current?.state!=="running")return;
   const stopped=stopFifteenPaperSession(current,reason);
   sessionRef.current=stopped;setSession(stopped);setNotice(reason);
  };
  const snapshot=()=>{
   if(!mounted)return;
   const now=Date.now();
   if(ws?.readyState===WebSocket.OPEN&&!receivedDirectory&&openAt&&now-openAt>16000){
    setFeedStatus("Market directory timed out. Reconnecting…");ws.close();return;
   }
   if(ws?.readyState===WebSocket.OPEN&&subscribed.size>0&&
      now-Math.max(openAt,lastObservedAt)>30000){
    setFeedStatus("Feed stale. Reconnecting, with all paper batches stopped.");
    stopForFeed("Live ticks stopped arriving. Paper batch stopped automatically.");
    ws.close();return;
   }
   const active=sessionRef.current;
   if(active?.state==="running"){
    const last=lastReceived.current.get(active.symbol)||0;
    if(now-last>16000)stopForFeed("Selected market feed stale. Paper batch stopped.");
   }
   const next:MarketSnapshots={};
   for(const market of DIGIT_MARKETS){
    const quotes=history.current.get(market.symbol);
    if(quotes?.length)next[market.symbol]={
     quotes:[...quotes],lastAt:lastReceived.current.get(market.symbol)||0,
    };
   }
   setSnapshots(next);
  };
  const snapshotInterval=setInterval(snapshot,1100);
  const connect=()=>{
   if(!mounted)return;
   subscribed=new Set();receivedDirectory=false;openAt=0;lastObservedAt=0;
   setFeedStatus("Connecting to verified Deriv public market symbols…");
   try{ws=new WebSocket(PUBLIC_FEED);}
   catch{
    setFeedStatus("Public WebSocket unavailable. Retrying.");
    retryTimer=setTimeout(connect,5000);return;
   }
   const socket=ws;
   connectTimeout=setTimeout(()=>{
    if(mounted&&socket.readyState!==WebSocket.OPEN)socket.close();
   },12000);
   socket.onopen=()=>{
    if(!mounted)return;
    clearTimeout(connectTimeout);openAt=Date.now();
    socket.send(JSON.stringify({active_symbols:"brief",req_id:3401}));
    setFeedStatus("Connected. Verifying symbol directory…");
   };
   socket.onmessage=event=>{
    if(!mounted)return;
    let raw:unknown;
    try{raw=JSON.parse(String(event.data));}catch{return;}
    if(!raw||typeof raw!=="object")return;
    const msg=raw as Record<string,unknown>;
    if(msg.error){
     const error=msg.error as Record<string,unknown>;
     setFeedStatus("Feed notice: "+String(error.message||"Public data unavailable.").slice(0,120));
     if(msg.msg_type==="active_symbols")socket.close();
     return;
    }
    if(msg.msg_type==="active_symbols"){
     if(!Array.isArray(msg.active_symbols)){socket.close();return;}
     const offered=new Set<string>(msg.active_symbols.map((item:unknown)=>{
      if(!item||typeof item!=="object")return null;
      const a=item as Record<string,unknown>;
      return a.underlying_symbol??a.symbol;
     }).filter((x:unknown):x is string=>typeof x==="string"));
     const symbols=DIGIT_MARKETS.map(x=>x.symbol).filter(s=>TRACKED_MARKETS.has(s)&&offered.has(s));
     subscribed=new Set(symbols);receivedDirectory=true;
     setMarketStatus(symbols);
     symbols.forEach((symbol,i)=>{
      if(socket.readyState===WebSocket.OPEN){
       socket.send(JSON.stringify({ticks:symbol,subscribe:1,req_id:3500+i}));
      }
     });
     retry=0;
     setFeedStatus(symbols.length?
      "Connected · "+symbols.length+" public synthetic markets verified.":
      "No supported active markets. No fabricated quotes.");
     return;
    }
    if(msg.msg_type!=="tick")return;
    const tick=parsePublicDigitTick(raw,Date.now());
    if(!tick||!subscribed.has(tick.symbol))return;
    const prev=history.current.get(tick.symbol)||[];
    if(prev.length&&tick.epoch<=prev[prev.length-1].epoch)return;
    const current=sessionRef.current;
    if(current?.state==="running"&&current.symbol===tick.symbol){
     const next=observeFifteenPaperTick(current,tick,prev,Date.now());
     if(next!==current){
      sessionRef.current=next;setSession(next);
      if(next.state==="completed")setNotice("Paper batch complete. No broker trades or payouts.");
      else if(next.state==="stopped")setNotice(next.message);
     }
    }
    history.current.set(tick.symbol,[...prev,tick].slice(-MAX_TICKS));
    lastReceived.current.set(tick.symbol,Date.now());
    lastObservedAt=Date.now();
    setFeedStatus("LIVE: genuine Deriv public quotes received · no broker orders.");
   };
   socket.onerror=()=>{if(mounted)setFeedStatus("Public feed error. Waiting for reconnect.");};
   socket.onclose=()=>{
    if(!mounted)return;
    stopForFeed("Public feed disconnected. Paper batch stopped.");
    subscribed.clear();setMarketStatus([]);
    history.current=new Map();lastReceived.current=new Map();
    setSnapshots({});
    setFeedStatus("Feed disconnected. Retrying safely…");
    retryTimer=setTimeout(connect,Math.min(30000,1500*2**Math.min(retry++,4)));
   };
  };
  connect();
  return()=>{
   mounted=false;clearTimeout(retryTimer);clearTimeout(connectTimeout);
   clearInterval(snapshotInterval);try{ws?.close();}catch{}
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
   <p className={styles.kicker}>SENFX LABS · DERIV PUBLIC MARKET DATA · PAPER ONLY</p>
   <h1>{BOT_COUNT} original SENFX <span>trading research bots</span></h1>
   <p>Bulk Bots are paper-only research strategies. Explore Digit Over/Under, Matches/Differs, Even/Odd, direction,
    volatility, momentum and fixed-stake risk studies. Each candidate has a
    real next-tick paper evaluator, live data safeguards and an emergency Stop.</p>
   <p className={styles.warning}>No bots on this page place Deriv Demo or Real contracts.
    Paper hits are not payouts, verified win rates or financial returns.
    Recovery-style studies intentionally do NOT increase stakes after a loss.</p>
   <div className={styles.feedActions}>
    <span role="status">{feedStatus}</span>
    <button onClick={()=>{
      if(enabled)stopPaperBatch("Scanner stopped; paper batch stopped.");
      setEnabled(x=>!x);
    }}>{enabled?"Stop market scanner":"Start market scanner"}</button>
    <button disabled={!enabled} onClick={()=>{
      stopPaperBatch("Manual reconnect; paper batch stopped.");
      setReconnect(x=>x+1);
    }}>Reconnect feed</button>
   </div>
  </section>
  <div className={styles.topMetrics}>
   <div><small>RESEARCH BOTS</small><b>{BOT_COUNT}</b></div>
   <div><small>VERIFIED SYMBOLS</small><b>{marketStatus.length} / 10</b></div>
   <div><small>PUBLIC TICKS THIS SESSION</small><b>{Object.values(snapshots).reduce((a,x)=>a+(x?.quotes.length||0),0)}</b></div>
   <div><small>PAPER SESSION</small><b>{session?.state.toUpperCase()||"NOT STARTED"}</b></div>
  </div>
  <div className={styles.columns}>
   <section className={styles.library}>
    <div className={styles.sectionTitle}><div>
     <p className={styles.kicker}>ALL FIFTEEN</p><h2>Strategy library</h2></div>
     <p>Choose any card to study its hypothesis using genuine future ticks.</p>
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
       <div className={styles.botMeta}><span>BOT {String(index+1).padStart(2,"0")}</span>
        <strong>{bot.market}</strong></div>
       <h3>{bot.name}</h3>
       <p className={styles.botCategory}>{bot.category}</p>
       <p>{bot.description}</p>
       <div className={styles.botFooter}>
        <span>{fresh?(ready?"PAPER READY":"SAMPLING"):"WAITING FOR FEED"}</span>
        <span>{ticks.length}/{bot.minTicks} ticks</span>
       </div>
      </button>;
     })}
    </div>
   </section>
   <aside className={styles.sidebar}>
    <section className={styles.panel}>
     <p className={styles.kicker}>SELECTED ORIGINAL SENFX STRATEGY</p>
     <h2>{selected.name}</h2>
     <p>{selected.description}</p>
     <p className={styles.details}><b>Market:</b> {selected.market}
       <b>Category:</b> {selected.category}
       <b>Enhancement:</b> {selected.difference}</p>
     <div className={styles.marketState}>
      <span>Feed <b>{marketFresh?"LIVE":"WAITING / STALE"}</b></span>
      <span>Real samples <b>{sample.length}</b></span>
      <span>Pre-tick hypothesis <b>{marketFresh?(nextResearchSignal?
       nextResearchSignal.prediction+
       (nextResearchSignal.barrier===undefined?"":" "+nextResearchSignal.barrier):
       "NO SIGNAL"):"UNAVAILABLE"}</b></span>
      <span>Last real quote <b>{sample.at(-1)?.quoteText||"—"}</b></span>
     </div>
    </section>
    <section className={styles.panel}>
     <p className={styles.kicker}>REAL NEXT-TICK PAPER SIMULATOR</p>
     <h2>Run a controlled batch</h2>
     <p>Start one browser-local paper batch. One pre-committed hypothesis
      is checked against a later genuine quote. No past backfill or purchase.</p>
     <div className={styles.inputs}>
      <label>Hypothetical stake per trial (USD)
       <input type="number" min="1" max="25" step=".01" value={stake}
        disabled={session?.state==="running"}
        onChange={e=>setStake(Number(e.target.value))}/></label>
      <label>Future observations (1–10)
       <input type="number" min="1" max="10" step="1" value={count}
        disabled={session?.state==="running"}
        onChange={e=>setCount(Number(e.target.value))}/></label>
      <label>Per-batch hypothetical exposure cap (USD)
       <input type="number" min="1" step=".01" value={cap}
        disabled={session?.state==="running"}
        onChange={e=>setCap(Number(e.target.value))}/></label>
     </div>
     <div className={styles.exposure}>
      <small>FULL PLANNED EXPOSURE (NOT A DEBIT)</small>
      <strong>{Number.isFinite(exposure)?usd(exposure):"—"}</strong>
     </div>
     <p className={budgetOk?styles.ok:styles.blocked}>
      {budgetOk?"Within per-batch illustrative paper cap.":"Exposure outside risk cap or invalid values."}
     </p>
     <div className={styles.controls}>
      <button className={styles.startButton}
       disabled={!budgetOk||!marketFresh||!nextResearchSignal||session?.state==="running"}
       onClick={start}>Start paper bot</button>
      <button className={styles.stopButton} disabled={session?.state!=="running"}
       onClick={()=>stopPaperBatch()}>Emergency Stop</button>
     </div>
     <p className={styles.notice} role="status">{notice}</p>
    </section>
    <section className={styles.panel}>
     <p className={styles.kicker}>OBSERVED RESULTS · THIS BROWSER SESSION</p>
     <h2>{session?"Paper "+session.state:"Not started"}</h2>
     {session?.state==="stopped"&&<p className={styles.notice} role="status" aria-live="polite"><strong>Safety stop:</strong> {session.message}</p>}
     <div className={styles.resultGrid}>
      <div><small>OBSERVED</small><b>{session?.observations.length||0} / {session?.count||count}</b></div>
      <div><small>CONDITION HITS</small><b>{sessionHits}</b></div>
      <div><small>MISSES</small><b>{(session?.observations.length||0)-sessionHits}</b></div>
      <div><small>STAKE TESTED</small><b>{usd((session?.observations.length||0)*(session?.stake||0))}</b></div>
     </div>
     {!!session?.observations.length&&<div className={styles.scrollTable}>
      <table><thead><tr><th>#</th><th>Quote</th><th>Hypothesis</th><th>Condition</th></tr></thead>
       <tbody>{session.observations.map(result=><tr key={result.sequence}>
        <td>{result.sequence}</td><td>{result.quote}</td>
        <td>{result.signal.prediction}{result.signal.barrier===undefined?"":" "+result.signal.barrier}</td>
        <td>{result.hit?"Hit":"Miss"}</td>
       </tr>)}</tbody></table>
     </div>}
     <p className={styles.finePrint}>Paper conditions are educational observations.
      Not broker settlements, not realized profit/loss and not evidence
      of a market edge. Closing this browser page ends the session.
      The exposure cap is per batch, not a persistent account daily-loss control.</p>
    </section>
   </aside>
  </div>
  <footer className={styles.footer}>SENFX strategy names and logic are original research implementations.
   No external proprietary Deriv Bot XML was copied. Execution on Deriv Demo or Real
   would require independently reviewed contract semantics, price quotes, authenticated
   orders, customer consent and persistent risk limits.</footer>
 </div></main>;
}
