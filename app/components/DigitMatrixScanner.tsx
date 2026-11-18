"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
 DIGIT_MARKETS,DIGIT_WINDOW,parsePublicDigitTick,plannedExposure,summarizeDigits,
 type DigitSymbol,type DigitSummary
} from "@/lib/bots/digit-matrix";
import styles from "@/app/digit-matrix/digit-matrix.module.css";
import {
 armDigitPaperBatch, observeDigitPaperTick, stopDigitPaperBatch,
 paperBatchSummary, type DigitPaperBatch, type PaperParitySide,
} from "@/lib/bots/digit-bulk-paper";

const ENDPOINT="wss://api.derivws.com/trading/v1/options/ws/public";
type Observed={quote:string;updated:number;digits:number[];received:number;lastKey:string;epoch:number};
type View={quote:string;updated:number;received:number;stats:DigitSummary|null};
const dollars=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n);

/** PUBLIC market-data research, not a broker order or authenticated trading bot. */
export default function DigitMatrixScanner(){
 const [running,setRunning]=useState(true);
 const [reset,setReset]=useState(0);
 const [status,setStatus]=useState("Connecting to public market data…");
 const [error,setError]=useState("");
 const [activeMarkets,setActiveMarkets]=useState<string[]>([]);
 const [selected,setSelected]=useState<DigitSymbol>("R_100");
 const [view,setView]=useState<Partial<Record<DigitSymbol,View>>>({});
 const [stake,setStake]=useState(10);
 const [bulk,setBulk]=useState(1);
 const [cap,setCap]=useState(20);
 const [side,setSide]=useState<PaperParitySide>("EVEN");
 const [batch,setBatch]=useState<DigitPaperBatch|null>(null);
 const [bulkNotice,setBulkNotice]=useState("Choose a market and wait for a fresh tick before starting a paper batch.");
 const batchRef=useRef<DigitPaperBatch|null>(null);
 const buffer=useRef(new Map<DigitSymbol,Observed>());
 const plan=useMemo(()=>plannedExposure(stake,bulk,cap),[stake,bulk,cap]);
 const current=view[selected];
 const stats=current?.stats;
 const fresh=!!current&&Date.now()-current.updated<15_000;
 const confirmed=activeMarkets.includes(selected);
 const batchInfo=batch?paperBatchSummary(batch):null;
 const stopBatch=(reason="Emergency Stop requested. No further paper observations will be recorded.")=>{
  const old=batchRef.current;
  if(!old||old.state!=="running")return;
  const next=stopDigitPaperBatch(old,reason);
  batchRef.current=next;setBatch(next);
  setBulkNotice(reason);
 };
 const selectMarket=(symbol:DigitSymbol)=>{
  if(symbol!==selected)stopBatch("Market changed. Previous paper batch stopped.");
  setSelected(symbol);
 };
 const startPaperBatch=()=>{
  if(batchRef.current?.state==="running"){
   setBulkNotice("Finish or stop the current batch before starting another.");return;
  }
  if(!running||!confirmed){
   setBulkNotice("Public market feed is not verified online. No paper batch started.");return;
  }
  const last=buffer.current.get(selected);
  const now=Date.now();
  const result=armDigitPaperBatch({
   symbol:selected,side,stake,count:bulk,dailyCap:cap,
   lastObservedEpoch:last?.epoch||0,lastObservedAtMs:last?.updated||0,nowMs:now,
  });
  if(!result.ok){setBulkNotice(result.reason);return;}
  batchRef.current=result.batch;setBatch(result.batch);
  setBulkNotice("PAPER batch armed. Each new, distinct future tick records one parity observation. No order or payout.");
 };

 useEffect(()=>{
  if(!running){
   const active=batchRef.current;
   if(active?.state==="running"){
    const stopped=stopDigitPaperBatch(active,"Scanner stopped. Paper batch automatically stopped.");
    batchRef.current=stopped;setBatch(stopped);
   }
   setStatus("Stopped — no market subscriptions active.");return;
  }
  let mounted=true,ws:WebSocket|null=null,attempt=0;
  let connectedAt=0, lastObservedAt=0, directoryReceived=false;
  let retryTimer:ReturnType<typeof setTimeout>|undefined;
  let connectionTimer:ReturnType<typeof setTimeout>|undefined;
  let subscribed=new Set<string>();
  buffer.current=new Map();setView({});setActiveMarkets([]);setError("");
  const update=()=>{
   if(!mounted)return;
   // Fail closed if all market data have become stale during an active batch.
   const activeBatch=batchRef.current;
   if(activeBatch?.state==="running"){
    const market=buffer.current.get(activeBatch.symbol);
    if(!market || Date.now()-market.updated>18_000){
     const stopped=stopDigitPaperBatch(activeBatch,"Public feed stale. Paper batch stopped automatically.");
     batchRef.current=stopped;setBatch(stopped);
    }
   }
   // A socket can be OPEN but fail to deliver a usable directory or ticks.
   // Close stale connections so the backoff loop can recover autonomously.
   if(ws?.readyState===WebSocket.OPEN && connectedAt && !directoryReceived &&
      Date.now()-connectedAt>15_000){
     setStatus("Market directory timed out. Reconnecting…");
     ws.close();return;
   }
   if(ws?.readyState===WebSocket.OPEN && directoryReceived &&
      subscribed.size>0 && Date.now()-Math.max(connectedAt,lastObservedAt)>30_000){
     setStatus("Public quotes stale. Reconnecting with bounded backoff…");
     ws.close();return;
   }
   const latest:Partial<Record<DigitSymbol,View>>={};
   for(const market of DIGIT_MARKETS){
    const item=buffer.current.get(market.symbol);
    if(item)latest[market.symbol]={
     quote:item.quote,updated:item.updated,received:item.received,
     stats:summarizeDigits(item.digits),
    };
   }
   setView(latest);
   if([...buffer.current.values()].length>0 &&
      [...buffer.current.values()].every(item=>Date.now()-item.updated>18_000)){
    setStatus("STALE — no recent public quotes. No invented digits.");
   }
  };
  const renderTimer=window.setInterval(update,900);
  const connect=()=>{
   if(!mounted)return;
   setStatus("Checking available Deriv public markets…");
   subscribed=new Set();directoryReceived=false;connectedAt=0;lastObservedAt=0;
   try{ws=new WebSocket(ENDPOINT);}
   catch{setStatus("Cannot create public data connection; retrying.");retryTimer=setTimeout(connect,5000);return;}
   const socket=ws;
   connectionTimer=setTimeout(()=>{
    if(mounted&&socket.readyState!==WebSocket.OPEN)socket.close();
   },12000);
   socket.onopen=()=>{
    if(!mounted)return;
    clearTimeout(connectionTimer);connectedAt=Date.now();
    socket.send(JSON.stringify({active_symbols:"brief",req_id:1001}));
    setStatus("Connected. Checking active symbols and waiting for ticks…");
   };
   socket.onmessage=event=>{
    if(!mounted)return;
    let message:unknown;
    try{message=JSON.parse(String(event.data));}catch{return;}
    if(!message||typeof message!=="object")return;
    const data=message as Record<string,unknown>;
    if(data.error){
     const err=data.error as Record<string,unknown>;
     setError(typeof err.message==="string"?err.message.slice(0,160):"Market-data request rejected.");
     if(data.msg_type==="active_symbols"){setStatus("Market directory unavailable.");socket.close();}
     return;
    }
    if(data.msg_type==="active_symbols"){
     if(!Array.isArray(data.active_symbols)){
      setStatus("Market list invalid. No unverified subscriptions.");socket.close();return;
     }
     const offered=new Set<string>(data.active_symbols
      .map((item:unknown)=>{
       if(!item||typeof item!=="object")return null;
       const m=item as {underlying_symbol?:unknown;symbol?:unknown};
       return m.underlying_symbol??m.symbol;
      }).filter((x:unknown):x is string=>typeof x==="string"));
     directoryReceived=true;
     const choices=DIGIT_MARKETS.filter(x=>offered.has(x.symbol));
     subscribed=new Set(choices.map(x=>x.symbol));
     setActiveMarkets(choices.map(x=>x.symbol));
     if(!choices.length){setStatus("No supported volatility markets available.");return;}
     choices.forEach((market,index)=>{
      if(socket.readyState===WebSocket.OPEN){
       socket.send(JSON.stringify({ticks:market.symbol,subscribe:1,req_id:1100+index}));
      }
     });
     setStatus("Listening for fresh public quotes on "+choices.length+" markets.");
     attempt=0;return;
    }
    if(data.msg_type!=="tick")return;
    const tick=parsePublicDigitTick(message,Date.now());
    if(!tick||!subscribed.has(tick.symbol))return;
    const previous=buffer.current.get(tick.symbol);
    const key=tick.tickId||String(tick.epoch)+":"+tick.quoteText;
    if(previous?.lastKey===key)return;
    lastObservedAt=Date.now();
    buffer.current.set(tick.symbol,{
     quote:tick.quoteText,updated:Date.now(),epoch:tick.epoch,received:(previous?.received||0)+1,
     digits:[...(previous?.digits||[]),tick.digit].slice(-DIGIT_WINDOW),lastKey:key,
    });
    const activeBatch=batchRef.current;
    if(activeBatch?.state==="running"){
     const nextBatch=observeDigitPaperTick(activeBatch,tick,Date.now());
     if(nextBatch!==activeBatch){
      batchRef.current=nextBatch;setBatch(nextBatch);
      if(nextBatch.state==="completed"){
       setBulkNotice("PAPER batch completed using only observed future ticks. No contracts or broker payouts.");
      } else if(nextBatch.state==="stopped"){
       setBulkNotice(nextBatch.stopReason||"Paper batch stopped.");
      }
     }
    }
    setStatus(previous=>previous.startsWith("LIVE")?previous:
      "LIVE · authentic Deriv public ticks ("+subscribed.size+" markets)");
   };
   socket.onerror=()=>{if(mounted)setStatus("Feed error. Reconnecting…");};
   socket.onclose=()=>{
    if(!mounted)return;
    const activeBatch=batchRef.current;
    if(activeBatch?.state==="running"){
     const stopped=stopDigitPaperBatch(activeBatch,"Feed disconnected. Paper batch stopped automatically.");
     batchRef.current=stopped;setBatch(stopped);
    }
    subscribed.clear();setActiveMarkets([]);
    setStatus("Disconnected. Retrying public market subscriptions…");
    retryTimer=setTimeout(connect,Math.min(30000,1500*2**Math.min(attempt++,4)));
   };
  };
  connect();
  return()=>{
   mounted=false;clearInterval(renderTimer);clearTimeout(retryTimer);
   clearTimeout(connectionTimer);try{ws?.close();}catch{}
  };
 },[running,reset]);

 return <main className={styles.shell}><div className={styles.inner}>
  <header className={styles.topbar}>
   <Link className={styles.brand} href="/dashboard">TRADE SCHEME <b>FX</b></Link>
   <nav className={styles.nav}>
    <Link href="/dashboard">Workspace</Link><Link href="/charts">Charts</Link>
    <Link href="/bot-center">Bot Center</Link>
   </nav>
  </header>
  <section className={styles.hero}>
   <div><p className={styles.kicker}>SENFX LABS · PUBLIC DERIV MARKET DATA</p>
    <h1>SENFX <span>Digit Matrix</span></h1>
    <p>Monitor ten synthetic markets, inspect observed last-digit patterns and
     assess hypothetical batch exposure. No broker purchases or unverified
     &quot;AI win&quot; predictions.</p>
   </div>
   <div className={styles.actions}>
    <span className={running?styles.liveBadge:styles.offBadge}>
     {running?"● SCANNER ON":"● SCANNER OFF"}
    </span>
    <button className={styles.primary} onClick={()=>{if(running)stopBatch("Scanner stopped. Paper batch stopped.");setRunning(x=>!x);}}>
     {running?"Stop scanner":"Start scanner"}
    </button>
    <button className={styles.secondary} disabled={!running} onClick={()=>{stopBatch("Market connection reset. Paper batch stopped.");setReset(x=>x+1);}}>
     Reconnect
    </button>
   </div>
  </section>
  <section className={styles.statusStrip} aria-live="polite">
   <div><small>FEED STATUS</small><b>{status}</b></div>
   <div><small>CONFIRMED MARKETS</small><b>{activeMarkets.length} / 10</b></div>
   <div><small>OBSERVED TICKS · THIS SESSION</small>
    <b>{Object.values(view).reduce((n,item)=>n+(item?.received||0),0)}</b>
   </div>
  </section>
  {error&&<p className={styles.feedWarning} role="alert">Market notice: {error}</p>}
  <div className={styles.layout}>
   <div className={styles.mainCol}>
    <div className={styles.sectionHead}><div>
     <p className={styles.kicker}>10-MARKET DIGIT RADAR</p><h2>Live scanner matrix</h2>
    </div><small>Rolling {DIGIT_WINDOW} ticks per market</small></div>
    <div className={styles.marketGrid}>{DIGIT_MARKETS.map(market=>{
     const row=view[market.symbol], sample=row?.stats;
     const live=!!row&&Date.now()-row.updated<15000;
     const active=activeMarkets.includes(market.symbol);
     return <button key={market.symbol}
      className={[styles.marketTile,selected===market.symbol?styles.picked:""].join(" ")}
      aria-pressed={selected===market.symbol}
      onClick={()=>selectMarket(market.symbol)}>
      <span className={styles.tileHeader}><b>{market.symbol}</b>
       <em className={live?styles.green:styles.dim}>{live?"LIVE":active?"WAIT":"OFF"}</em>
      </span>
      <strong>{market.label}</strong>
      <span className={styles.digitRow}>LAST DIGIT <b>{sample?.lastDigit??"—"}</b></span>
      <span className={styles.tileFooter}>{row?.quote||"Waiting for quote"}
       <small>{sample?.samples||0}/{DIGIT_WINDOW}</small>
      </span>
     </button>;
    })}</div>
    <section className={styles.panel}>
     <div className={styles.sectionHead}><div><p className={styles.kicker}>
      OBSERVED DIGITS · {selected}</p><h2>Digit frequency distribution</h2>
     </div><small>{stats?.samples||0} valid ticks</small></div>
     <p className={styles.muted}>
      Frequencies are observations, not forecasts. Dashed baseline shows
      10% per digit under a simple uniform model.
     </p>
     <div className={styles.bars}>
      {Array.from({length:10},(_,digit)=>{
       const percent=stats?.percentages[digit]||0;
       return <div className={styles.barItem} key={digit}>
        <small>{stats?percent.toFixed(1)+"%":"—"}</small>
        <div className={styles.barTrack}><div className={styles.bar}
         style={{height:Math.min(100,percent/35*100)+"%"}}></div>
         <div className={styles.baseline}></div></div>
        <strong>{digit}</strong>
       </div>;
      })}
     </div>
     <div className={styles.metrics}>
      <article><small>LAST QUOTE</small><b>{current?.quote||"—"}</b></article>
      <article><small>EVEN / ODD</small><b>{stats?stats.evenPercent.toFixed(1)+" / "+stats.oddPercent.toFixed(1)+"%":"—"}</b></article>
      <article><small>CURRENT DIGIT STREAK</small><b>{stats?.streak??"—"}</b></article>
      <article><small>SHANNON ENTROPY</small><b>{stats?stats.entropyBits.toFixed(2)+" bits":"—"}</b></article>
     </div>
     <p className={styles.notice} aria-live="polite">
      {!confirmed?"Market not confirmed active. No fabricated data is shown.":
       !fresh?"Market data stale or not yet received; no trading signal.":
       !stats?.ready?"Gathering valid digits (minimum 80 before interpreting samples).":
       "Research sample ready. Digit streaks, deviations and entropy do not prove a next-tick advantage."}
     </p>
    </section>
   </div>
   <aside className={styles.sidebar}>
    <section className={styles.panel}>
     <p className={styles.kicker}>HYPOTHETICAL PAPER-ONLY CONTROLS</p>
     <h2>Batch risk planner</h2>
     <p className={styles.muted}>
      The video shows a large stake and bulk trades. We do not copy its
      potentially dangerous exposure or execute any bulk contracts.
     </p>
     <div className={styles.fields}>
      <label>Stake per hypothetical trade (USD)
       <input type="number" min="10" max="100" step="1" value={stake}
        onChange={event=>setStake(Number(event.target.value))}/>
      </label>
      <label>Number of hypothetical trades (1–10)
       <input type="number" min="1" max="10" step="1" value={bulk}
        onChange={event=>setBulk(Number(event.target.value))}/>
      </label>
      <label>Daily hypothetical loss cap (USD)
       <input type="number" min="1" step="1" value={cap}
        onChange={event=>setCap(Number(event.target.value))}/>
      </label>
     </div>
     <div className={styles.total}><small>FULL STAKE EXPOSURE</small>
      <strong>{plan.valid?dollars(plan.total):"—"}</strong></div>
     <p className={plan.withinCap?styles.safe:styles.blocked}>{plan.reason}</p>
     <small className={styles.muted}>Calculator only. No contracts, payouts or customer balances.</small>
    </section>
    <section className={styles.panel} aria-label="Bulk paper trader controls">
     <p className={styles.kicker}>AUTOMATED BULK PAPER SIMULATION</p>
     <h2>SENFX Bulk Trader</h2>
     <p className={styles.muted}>One Start prepares up to 10 sequential, one-tick
       EVEN/ODD paper experiments on the selected market. Results use ONLY
       incoming public Deriv quotes. No purchases, no implied profits, and no
       browser-independent execution.</p>
     <div className={styles.fields}>
      <label>Paper parity hypothesis
       <select value={side} disabled={batch?.state==="running"}
        onChange={event=>setSide(event.target.value as PaperParitySide)}>
        <option value="EVEN">EVEN (last digit 0, 2, 4, 6, 8)</option>
        <option value="ODD">ODD (last digit 1, 3, 5, 7, 9)</option>
       </select>
      </label>
     </div>
     <p className={styles.muted}>
       Market: <b>{selected}</b> · {bulk} experiments ·
       Maximum illustrative stake: {plan.valid?dollars(plan.total):"Invalid"}
     </p>
     <div className={styles.bulkActions}>
      <button className={styles.primary}
       disabled={batch?.state==="running"||!running||!confirmed||!fresh||!plan.withinCap}
       onClick={startPaperBatch}>Start paper batch</button>
      <button className={styles.stopAction}
       disabled={batch?.state!=="running"}
       onClick={()=>stopBatch()}>Emergency Stop</button>
     </div>
     <p className={styles.notice} aria-live="polite">{bulkNotice}</p>
     {batch&&batchInfo&&<div className={styles.batchSummary}>
      <p><b>State: {batch.state.toUpperCase()}</b> ·
        {batch.symbol} · {batch.side} · {batch.requested} planned</p>
      <p><b>Observed: {batchInfo.completed}</b> ·
        parity hits: {batchInfo.hits} · misses: {batchInfo.misses} ·
        remaining: {batchInfo.remaining}</p>
      <p className={styles.muted}>Observed hypothetical stake:
        {dollars(batchInfo.observedStake)} (not a debit) ·
        budgeted maximum: {dollars(batchInfo.maximumBudgetedStake)}</p>
      {batch.entries.length>0&&<div className={styles.paperResults}>
       <table><thead><tr><th>#</th><th>Observed quote</th><th>Digit</th><th>Parity</th></tr></thead>
        <tbody>{batch.entries.map(item=><tr key={item.index}>
         <td>{item.index}</td><td>{item.observedQuote}</td>
         <td>{item.observedDigit}</td><td>{item.matchingParity?"Hit":"Miss"}</td>
        </tr>)}</tbody>
       </table>
      </div>}
      <small className={styles.muted}>These are simulated parity results,
       NOT broker settlements, contract payouts, realized P&amp;L or evidence
       of a profitable strategy. Leaving this page ends monitoring.</small>
     </div>}
    </section>
    <section className={styles.panel}>
     <p className={styles.kicker}>INTEGRITY BY DESIGN</p><h2>What we improved</h2>
     <ul className={styles.features}>
      <li>Real public ticks, with active-symbol verification</li>
      <li>Correct last digit using Deriv quote precision</li>
      <li>Clear stale-feed and missing-sample warnings</li>
      <li>Bounded market memory and zero invented history</li>
      <li>No guaranteed wins, Martingale, or automatic bulk buys</li>
      <li>No broker secrets, OAuth token or trading endpoints</li>
     </ul>
     <Link className={styles.link} href="/bot-center">Browse the SENFX bot catalog</Link>
    </section>
   </aside>
  </div>
  <footer className={styles.footer}>
   SENFX Digit Matrix is currently a <b>scanner-only research bot</b>.
   The Bulk Trader performs local paper-only parity experiments; it does not activate Digit Matches, Differs, Even/Odd
   or other Deriv orders. Those would require separately tested customer
   authorization, prices, contract settlement and risk protection.
  </footer>
 </div></main>;
}
