"use client";
import Link from "next/link";
import {useEffect,useMemo,useRef,useState} from "react";
import {
 FIFTEEN_BOTS,BOT_COUNT,findFifteenBot,predictFifteenBot,
 startFifteenPaperSession,observeFifteenPaperTick,stopFifteenPaperSession,
 PAPER_MAX_TICK_AGE_MS,
 type FifteenSession,
} from "@/lib/bots/fifteen-paper-bots";
import {
 DIGIT_MARKETS,parsePublicDigitTick,type DigitSymbol,type ObservedTick,
} from "@/lib/bots/digit-matrix";
import {
 beginPaperStudy,stopPaperStudy,recordPaperStudySnapshot,paperStudyHits,
 STUDY_BOT_ID,STUDY_BATCH_SIZE,STUDY_BATCHES,STUDY_TARGET,STUDY_STAKE,STUDY_BATCH_CAP,
 type PaperStudy,
} from "@/lib/bots/paper-200-study";
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
 const [study,setStudy]=useState<PaperStudy|null>(null);
 const [studyQueued,setStudyQueued]=useState(false);
 const [notice,setNotice]=useState("Select an original SENFX strategy and gather fresh public-market ticks.");
 const history=useRef(new Map<DigitSymbol,ObservedTick[]>());
 const lastReceived=useRef(new Map<DigitSymbol,number>());
 const sessionRef=useRef<FifteenSession|null>(null);
 const studyRef=useRef<PaperStudy|null>(null);
 const awaitingNextBatch=useRef(false);
 const studyQueuedRef=useRef(false);
 const verifiedMarketsRef=useRef(new Set<string>());

 const selected=useMemo(()=>findFifteenBot(selectedId)||FIFTEEN_BOTS[0],[selectedId]);
 const sample=snapshots[selected.market]?.quotes||[];
 const lastAt=snapshots[selected.market]?.lastAt||0;
 const marketFresh=enabled&&marketStatus.includes(selected.market)&&
   Date.now()-lastAt<15_000;
 const nextResearchSignal=useMemo(()=>predictFifteenBot(selected,sample),[selected,sample]);
 const studyBot=findFifteenBot(STUDY_BOT_ID);
 const studySamples=studyBot?(snapshots[studyBot.market]?.quotes.length||0):0;
 const studyVerified=!!studyBot&&marketStatus.includes(studyBot.market);
 const studyFeedFresh=!!studyBot&&enabled&&studyVerified&&
  Date.now()-(snapshots[studyBot.market]?.lastAt||0)<15_000;
 const exposure=Number.isFinite(stake)&&Number.isFinite(count)?Math.round(stake*count*100)/100:0;
 const budgetOk=stake>=1&&stake<=25&&Number.isFinite(stake)&&
   Number.isInteger(count)&&count>=1&&count<=10&&Number.isFinite(cap)&&cap>=exposure;
 const sessionHits=session?.observations.filter(x=>x.hit).length||0;

 const stopPaperBatch=(reason="Emergency Stop pressed. No further paper observations.")=>{
  const old=sessionRef.current;
  if(old?.state==="running"){
   const next=stopFifteenPaperSession(old,reason);
   sessionRef.current=next;setSession(next);
  }
  const activeStudy=studyRef.current;
  const wasQueued=studyQueuedRef.current;
  if(wasQueued){studyQueuedRef.current=false;setStudyQueued(false);}
  if(activeStudy?.status==="running"){
   // Preserve partial outcomes already counted before the interruption.
   const stopped=stopPaperStudy(activeStudy,reason);
   studyRef.current=stopped;setStudy(stopped);
   awaitingNextBatch.current=false;
  }
  if(old?.state==="running"||activeStudy?.status==="running"||wasQueued)setNotice(reason);
 };
 const changeBot=(id:string)=>{
  if(id!==selectedId||sessionRef.current?.state==="running"||studyQueuedRef.current)
   stopPaperBatch("Changed strategy. Previous paper batch stopped.");
  setSelectedId(id);
  setSession(null);sessionRef.current=null;
  studyRef.current=null;setStudy(null);awaitingNextBatch.current=false;
  studyQueuedRef.current=false;setStudyQueued(false);
  setNotice("Strategy selected. Wait for fresh market samples, then start a paper batch.");
 };
 const start=()=>{
  if(studyQueuedRef.current){
   setNotice("200-observation study is queued. Cancel it before starting a manual batch.");return;
  }
  if(studyRef.current?.status==="running"){
   setNotice("A 200-observation study is running. Use Emergency Stop first.");return;
  }
  if(sessionRef.current?.state==="running"){
   setNotice("A paper batch is already in progress. Press Emergency Stop first.");return;
  }
  if(!enabled||!marketFresh){setNotice("Fresh, verified public market feed required.");return;}
  const result=startFifteenPaperSession({
   botId:selected.id,history:history.current.get(selected.market)||[],
   stake,count,cap,nowMs:Date.now(),
  });
  if(!result.ok){setNotice(result.reason);return;}
  studyRef.current=null;setStudy(null);awaitingNextBatch.current=false;
  sessionRef.current=result.session;setSession(result.session);
  setNotice("PAPER ONLY: strategy armed. One future public tick tests the prior hypothesis.");
 };
 // Explicit user tap queues the study; market verification still gates its start.
 const tryArm200Study=(nowMs:number)=>{
  const bot=findFifteenBot(STUDY_BOT_ID);
  if(!studyQueuedRef.current||!bot||!verifiedMarketsRef.current.has(bot.market)||
     sessionRef.current?.state==="running"||studyRef.current?.status==="running")
   return false;
  const initial=startFifteenPaperSession({
   botId:STUDY_BOT_ID,history:history.current.get(bot.market)||[],
   stake:STUDY_STAKE,count:STUDY_BATCH_SIZE,cap:STUDY_BATCH_CAP,nowMs,
  });
  if(!initial.ok)return false;
  studyQueuedRef.current=false;setStudyQueued(false);
  const freshStudy=beginPaperStudy();
  studyRef.current=freshStudy;setStudy(freshStudy);awaitingNextBatch.current=false;
  sessionRef.current=initial.session;setSession(initial.session);
  setNotice("200-study running: Matches/Differs Radar, 20 × 10 paper observations. No broker orders.");
  return true;
 };
 const start200Study=()=>{
  if(sessionRef.current?.state==="running"||studyRef.current?.status==="running"||
     studyQueuedRef.current){
   setNotice("Stop the current paper session before starting another.");return;
  }
  if(!findFifteenBot(STUDY_BOT_ID)){
   setNotice("Matches/Differs Radar is unavailable. Study not started.");return;
  }
  setSelectedId(STUDY_BOT_ID);
  studyQueuedRef.current=true;setStudyQueued(true);
  if(!enabled)setEnabled(true);
  if(enabled&&tryArm200Study(Date.now()))return;
  setNotice("200-study queued for Matches/Differs Radar. Waiting for 40 verified public ticks and a fresh quote.");
 };

 useEffect(()=>{
  if(!enabled){
   stopPaperBatch("Public feed manually paused. Paper study stopped.");
   setFeedStatus("Public data feed paused.");
   return;
  }
  let mounted=true,ws:WebSocket|null=null,retry=0;
  let retryTimer:ReturnType<typeof setTimeout>|undefined;
  let connectTimeout:ReturnType<typeof setTimeout>|undefined;
  let openAt=0,lastObservedAt=0,receivedDirectory=false;
  let subscribed=new Set<string>();
  history.current=new Map();lastReceived.current=new Map();
  verifiedMarketsRef.current=new Set();
  setSnapshots({});setMarketStatus([]);
  const stopForFeed=(reason:string)=>{stopPaperBatch(reason);};
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
   const liveStudy=studyRef.current?.status==="running";
   if(active?.state==="running"||(liveStudy&&awaitingNextBatch.current)){
    const symbol=active?.symbol||findFifteenBot(STUDY_BOT_ID)?.market;
    const last=symbol?lastReceived.current.get(symbol)||0:0;
    if(now-last>16000)stopForFeed("Selected market feed stale. Paper study stopped.");
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
     verifiedMarketsRef.current=new Set(symbols);
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
    const receivedAt=Date.now();
    const tick=parsePublicDigitTick(raw,receivedAt);
    if(!tick||!subscribed.has(tick.symbol))return;
    const ageMs=receivedAt-tick.epoch*1000;
    const tickFresh=ageMs>=0&&ageMs<=PAPER_MAX_TICK_AGE_MS;
    const prev=history.current.get(tick.symbol)||[];
    if(prev.length&&tick.epoch<=prev[prev.length-1].epoch)return;
    const current=sessionRef.current;
    if(current?.state==="running"&&current.symbol===tick.symbol){
     const next=observeFifteenPaperTick(current,tick,prev,receivedAt);
     if(next!==current){
      sessionRef.current=next;setSession(next);
      const ongoing=studyRef.current;
      if(ongoing?.status==="running"&&ongoing.botId===current.botId){
       const updated=recordPaperStudySnapshot(ongoing,next);
       studyRef.current=updated;setStudy(updated);
       if(updated.status==="completed"){
        awaitingNextBatch.current=false;
        setNotice("200 genuine paper observations complete. No broker trades.");
       }else if(updated.status==="stopped"){
        awaitingNextBatch.current=false;setNotice(updated.message);
       }else if(next.state==="completed"){
        awaitingNextBatch.current=true;
        setNotice("Batch "+updated.completedBatches+"/"+STUDY_BATCHES+
         " complete. Waiting for a new fresh tick to arm the next batch.");
       }else if(next.message!==current.message)setNotice(next.message);
      }else if(next.state==="completed")setNotice("Paper batch complete. No broker trades or payouts.");
      else if(next.state==="stopped"||next.message!==current.message)setNotice(next.message);
     }
    }else if(current?.state==="completed"&&awaitingNextBatch.current&&
       studyRef.current?.status==="running"&&current.symbol===tick.symbol&&tickFresh){
     // Boundary tick only arms the NEXT batch; it never settles a prior hypothesis.
     const armed=startFifteenPaperSession({
      botId:STUDY_BOT_ID,history:[...prev,tick].slice(-MAX_TICKS),
      stake:STUDY_STAKE,count:STUDY_BATCH_SIZE,cap:STUDY_BATCH_CAP,nowMs:receivedAt,
     });
     if(!armed.ok)stopPaperBatch("Next paper batch could not arm safely: "+armed.reason);
     else{
      awaitingNextBatch.current=false;
      sessionRef.current=armed.session;setSession(armed.session);
      setNotice("Paper batch "+((studyRef.current?.completedBatches||0)+1)+
       "/"+STUDY_BATCHES+" armed; waiting for its next genuine tick.");
     }
    }
    history.current.set(tick.symbol,[...prev,tick].slice(-MAX_TICKS));
    // A buffered/delayed packet does not satisfy feed freshness.
    if(tickFresh){
     lastReceived.current.set(tick.symbol,receivedAt);
     lastObservedAt=receivedAt;
     setFeedStatus("LIVE: genuine Deriv public quotes received · no broker orders.");
     if(studyQueuedRef.current&&tick.symbol===findFifteenBot(STUDY_BOT_ID)?.market)
      tryArm200Study(receivedAt); // Arming tick never scores a result.
    }else{
     setFeedStatus("Delayed Deriv tick detected. Paper results paused until fresh ticks arrive.");
    }
   };
   socket.onerror=()=>{if(mounted)setFeedStatus("Public feed error. Waiting for reconnect.");};
   socket.onclose=()=>{
    if(!mounted)return;
    stopForFeed("Public feed disconnected. Paper batch stopped.");
    subscribed.clear();setMarketStatus([]);
    verifiedMarketsRef.current=new Set();
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
        disabled={session?.state==="running"||study?.status==="running"}
        onChange={e=>setStake(Number(e.target.value))}/></label>
      <label>Future observations (1–10)
       <input type="number" min="1" max="10" step="1" value={count}
        disabled={session?.state==="running"||study?.status==="running"}
        onChange={e=>setCount(Number(e.target.value))}/></label>
      <label>Per-batch hypothetical exposure cap (USD)
       <input type="number" min="1" step=".01" value={cap}
        disabled={session?.state==="running"||study?.status==="running"}
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
       disabled={!budgetOk||!marketFresh||!nextResearchSignal||session?.state==="running"||study?.status==="running"||studyQueued}
       onClick={start}>Start paper bot</button>
      <button className={styles.stopButton} disabled={session?.state!=="running"&&study?.status!=="running"&&!studyQueued}
       onClick={()=>stopPaperBatch()}>Emergency Stop</button>
     </div>
     <p className={styles.notice} role="status">{notice}</p>
    </section>
    <section className={styles.panel}>
     <p className={styles.kicker}>OPTIONAL LONG-RUN PAPER EVALUATION</p>
     <h2>Matches/Differs Radar · 200 observations</h2>
     <p>One tap selects your Matches/Differs Radar (Bot 13) and requests
      20 sequential batches of 10. You can tap before the feed is ready:
      SENFX waits for 40 verified fresh public ticks without counting
      historical observations. Fixed $1 hypothetical stake, $10 cap
      per batch, $200 maximum total. Safety stops remain active.
      No Deriv Demo or Real contract purchases.</p>
     <p className={styles.notice} role="status">
      Radar market: {studyBot?.market||"UNAVAILABLE"} ·
      {studyVerified?" Verified":" Awaiting verification"} ·
      {studyFeedFresh?" Fresh feed":" Waiting for fresh feed"} ·
      Samples {studySamples}/{studyBot?.minTicks||40}
      {studyQueued?" · Study queued — gathering data":""}
     </p>
     <div className={styles.controls}>
      <button className={styles.startButton}
       disabled={session?.state==="running"||study?.status==="running"||studyQueued}
       onClick={start200Study}>{studyQueued?"Waiting for fresh ticks…":"Start 200 paper observations"}</button>
      <button className={styles.stopButton}
       disabled={study?.status!=="running"&&!studyQueued}
       onClick={()=>stopPaperBatch("Emergency Stop: 200-study cancelled or stopped by user.")}>
       Cancel / Stop 200-study</button>
     </div>
     {study&&<>
      <p className={styles.notice} role="status">
       Study {study.status.toUpperCase()} · {study.completedBatches}/{STUDY_BATCHES} batches completed.
       {study.status==="stopped"?" "+study.message:""}
      </p>
      <div className={styles.resultGrid}>
       <div><small>OBSERVED / TARGET</small><b>{study.observations.length} / {STUDY_TARGET}</b></div>
       <div><small>CONDITION HITS</small><b>{paperStudyHits(study)}</b></div>
       <div><small>MISSES</small><b>{study.observations.length-paperStudyHits(study)}</b></div>
       <div><small>HYPOTHETICAL STAKE TESTED</small><b>{usd(study.observations.length*STUDY_STAKE)}</b></div>
       <div><small>DELAYED TICKS SKIPPED</small><b>{study.skippedStaleTicks}</b></div>
      </div>
     </>}
     <p className={styles.finePrint}>Keep this page open and your device awake.
      Closing or refreshing loses the browser-local study. This tests digit conditions,
      not Deriv contract wins, financial returns or profitability.</p>
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
      <div><small>DELAYED TICKS SKIPPED</small><b>{session?.skippedStaleTicks||0}</b></div>
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
