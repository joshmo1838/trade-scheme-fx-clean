"use client";
import Link from "next/link";
import {useEffect,useMemo,useRef,useState} from "react";
import {FIFTEEN_BOTS} from "@/lib/bots/fifteen-paper-bots";
import {DIGIT_MARKETS,parsePublicDigitTick} from "@/lib/bots/digit-matrix";
import {
 createGoldenPaperState,applyGoldenPublicTick,resetGoldenPaperFeed,
 goldenCandidateSignal,type GoldenPaperState
} from "@/lib/bots/senfx-golden-rule-research";
import {
 evaluateGoldenRule,GOLDEN_RULE_MIN_FORWARD_SAMPLES,
 GOLDEN_RULE_MAX_DEMO_BALANCE_RISK
} from "@/lib/bots/senfx-golden-rule.mjs";
import {deriveDemoProposal} from "@/lib/deriv/demo-bot-contracts.mjs";
import {
 buildGoldenBotTickDeliveries,GOLDEN_TICK_MONITOR_WINDOW,
 GOLDEN_TICK_MONITOR_DELIVERY_MS,type GoldenBotTickDelivery
} from "@/lib/bots/senfx-golden-tick-monitor";
import styles from "../fifteen.module.css";

const PUBLIC_WS="wss://api.derivws.com/trading/v1/options/ws/public";
type Balance={ok:boolean;mode?:string;balance?:number;asOf?:string;accountLabel?:string;code?:string};
type BrokerQuote={
 botId:string;symbol:string;contractType:string;barrier:string|null;
 stake:number;askPrice:number;payout:number;netWinProfit:number;
 returnOnStakePercent:number;breakEvenWinRatePercent:number
};
type QuoteSnapshot={ok:boolean;code?:string;asOf?:string;quotes?:BrokerQuote[];
 skipped?:{botId:string;code:string}[];brokerOrdersPlaced?:number};
const pct=(p:number|null)=>
 p===null?"—":(p*100).toFixed(2)+"%";
const money=(n:number)=>new Intl.NumberFormat("en-US",{
 style:"currency",currency:"USD",maximumFractionDigits:2
}).format(n);
const time=(ms:number)=>new Date(ms).toLocaleTimeString();

export default function GoldenRuleLab(){
 const research=useRef<GoldenPaperState>(createGoldenPaperState());
 const lastTickAt=useRef(new Map<string,number>());
 const [view,setView]=useState<GoldenPaperState>(research.current);
 const [clock,setClock]=useState(0);
 const [marketState,setMarketState]=useState("Connecting to Deriv public market feed…");
 const [connected,setConnected]=useState(false);
 const [liveMarkets,setLiveMarkets]=useState(0);
 const [balance,setBalance]=useState<Balance|null>(null);
 const [balanceMessage,setBalanceMessage]=useState("Checking authorized Deriv virtual USD account…");
 const [stake,setStake]=useState("5");
 const [quoting,setQuoting]=useState(false);
 const [quotes,setQuotes]=useState<QuoteSnapshot|null>(null);
 const [quoteMessage,setQuoteMessage]=useState("Quotes are read-only and expire in 15 seconds.");
 const [tickDeliveries,setTickDeliveries]=useState<GoldenBotTickDelivery[]>([]);
 const [lastTickDispatchAt,setLastTickDispatchAt]=useState(0);
 const amount=Number(stake);
 const stakeValid=/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(stake)&&
  Number.isFinite(amount)&&amount>0&&Number.isSafeInteger(Math.round(amount*100));
 const balanceAsOf=balance?.ok&&balance.asOf?Date.parse(balance.asOf):NaN;
 const quoteAsOf=quotes?.ok&&quotes.asOf?Date.parse(quotes.asOf):NaN;
 const currentNow=clock||0;

 useEffect(()=>{
  let mounted=true;
  async function loadBalance(){
   try{
    const r=await fetch("/api/deriv/demo/account-balance",{
     method:"GET",credentials:"same-origin",cache:"no-store"
    });
    const body:Balance=await r.json();
    if(!mounted)return;
    if(r.ok&&body.ok&&body.mode==="virtual-deriv-demo-only"&&
       typeof body.balance==="number"&&Number.isFinite(body.balance)){
     setBalance(body);setBalanceMessage("Verified read-only Deriv virtual Demo balance.");
    }else{
     setBalance(null);setBalanceMessage("Demo account unavailable: "+
      (body.code||"Sign in as your SENFX admin."));
    }
   }catch{
    if(mounted){setBalance(null);setBalanceMessage("Virtual Demo balance unavailable.");}
   }
  }
  void loadBalance();
  const id=setInterval(()=>void loadBalance(),30_000);
  return()=>{mounted=false;clearInterval(id);};
 },[]);
 useEffect(()=>{
  let mounted=true,ws:WebSocket|null=null,retry:ReturnType<typeof setTimeout>|null=null;
  let attempts=0;
  function connect(){
   if(!mounted)return;
   setConnected(false);setLiveMarkets(0);
   setMarketState("Connecting to public Deriv synthetic markets…");
   ws=new WebSocket(PUBLIC_WS);
   const socket=ws;
   const subscribed=new Set<string>();
   let verifiedDirectory=false;
   socket.onopen=()=>{
    if(mounted)socket.send(JSON.stringify({active_symbols:"brief",req_id:991}));
   };
   socket.onmessage=event=>{
    if(!mounted)return;
    let msg:Record<string,unknown>;
    try{msg=JSON.parse(String(event.data)) as Record<string,unknown>;}
    catch{return;}
    if(msg.error){setMarketState("Broker public feed returned an error.");socket.close();return;}
    if(msg.msg_type==="active_symbols"){
     const list=msg.active_symbols;
     if(!Array.isArray(list)){socket.close();return;}
     const available=new Set(list.map(x=>x?.underlying_symbol??x?.symbol));
     if(DIGIT_MARKETS.some(x=>!available.has(x.symbol))){
      setMarketState("Required markets unavailable; research blocked.");
      socket.close();return;
     }
     verifiedDirectory=true;
     for(const [i,m] of DIGIT_MARKETS.entries()){
      subscribed.add(m.symbol);
      socket.send(JSON.stringify({ticks:m.symbol,subscribe:1,req_id:1000+i}));
     }
     attempts=0;setConnected(true);setLiveMarkets(subscribed.size);
     setMarketState("10 Deriv public markets connected · prospective observation only");
     return;
    }
    if(msg.msg_type!=="tick"||!verifiedDirectory)return;
    const now=Date.now(),tick=parsePublicDigitTick(msg,now);
    if(!tick||!subscribed.has(tick.symbol))return;
    const before=research.current;
    const after=applyGoldenPublicTick(before,tick,now);
    if(after!==before){
     research.current=after;
     lastTickAt.current.set(tick.symbol,now);
    }
   };
   const closed=()=>{
    if(!mounted)return;
    setConnected(false);setLiveMarkets(0);
    research.current=resetGoldenPaperFeed(research.current);
    lastTickAt.current.clear();
    setMarketState("Public feed disconnected · pending hypotheses voided · reconnecting");
    attempts++;
    retry=setTimeout(connect,Math.min(15_000,2000*Math.pow(2,Math.min(3,attempts))));
   };
   socket.onclose=closed;
   socket.onerror=()=>{try{socket.close();}catch{/* closing already */}};
  }
  connect();
  const refresh=setInterval(()=>{
   if(!mounted)return;
   setView(research.current);
   setClock(Date.now());
  },1800);
  return()=>{
   mounted=false;clearInterval(refresh);
   if(retry)clearTimeout(retry);
   if(ws){ws.onclose=null;ws.onerror=null;ws.onmessage=null;
    try{ws.close();}catch{/* already closed */}}
  };
 },[]);

 // Deliver one validated, symbol-specific 300-tick analysis snapshot to each
 // of the 15 original research analyzers every 30 seconds. No trade path.
 useEffect(()=>{
  const dispatch=()=>{
   const at=Date.now();
   setTickDeliveries(buildGoldenBotTickDeliveries(research.current,at,connected));
   setLastTickDispatchAt(at);
  };
  dispatch();
  const interval=setInterval(dispatch,GOLDEN_TICK_MONITOR_DELIVERY_MS);
  return ()=>clearInterval(interval);
 },[connected]);

 const candidateRequests=useMemo(()=>{
  if(!connected||!stakeValid)return[];
  return FIFTEEN_BOTS.flatMap(bot=>{
   if(currentNow-(lastTickAt.current.get(bot.market)||0)>10_000)return[];
   const signal=goldenCandidateSignal(view,bot);
   return signal?[{botId:bot.id,prediction:signal.prediction,
    ...(signal.barrier===undefined?{}:{barrier:signal.barrier})}]:[];
  });
 },[view,connected,stakeValid,currentNow]);

 async function readOnlyQuotes(){
  if(quoting||!stakeValid||candidateRequests.length===0)return;
  setQuoting(true);setQuotes(null);
  try{
   const res=await fetch("/api/deriv/demo/bots/payout-preview",{
    method:"POST",credentials:"same-origin",cache:"no-store",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({stakeAmount:stake,candidates:candidateRequests})
   });
   const body:QuoteSnapshot=await res.json();
   if(res.ok&&body.ok&&body.brokerOrdersPlaced===0){
    setQuotes(body);
    setQuoteMessage("Live Deriv Demo price proposals received. These are not purchases or forecasts.");
   }else{
    setQuoteMessage("Could not retrieve virtual Demo quotes: "+(body.code||"Unavailable"));
   }
  }catch{setQuoteMessage("Broker quote connection unavailable. No orders were placed.");}
  finally{setQuoting(false);}
 }
 const rows=FIFTEEN_BOTS.map(bot=>{
  const record=view.bots[bot.id];
  const signal=goldenCandidateSignal(view,bot);
  const q=quotes?.quotes?.find(x=>x.botId===bot.id);
  const expected=signal&&stakeValid?
   deriveDemoProposal(bot.id,signal.prediction,signal.barrier,amount):null;
  const termsMatch=!!q&&!!expected&&
   q.symbol===expected.underlying_symbol&&
   q.contractType===expected.contract_type&&
   q.barrier===(expected.barrier===undefined?null:String(expected.barrier))&&
   q.stake===amount;
  const feedFresh=connected&&
   currentNow-(lastTickAt.current.get(bot.market)||0)<=10_000;
  const verdict=evaluateGoldenRule({
   observations:record.observations,wins:record.wins,
   quote:q?{askPrice:q.askPrice,payout:q.payout}:null,
   quoteAsOfMs:quoteAsOf,nowMs:currentNow,
   demoBalance:balance?.ok?balance.balance:undefined,
   demoBalanceAsOfMs:balanceAsOf,stake:amount,
   termsMatch,brokerAligned:bot.category!=="Direction",
   feedFresh
  });
  return {bot,record,verdict,q};
 });
 const total=FIFTEEN_BOTS.reduce((n,x)=>n+view.bots[x.id].observations,0);
 const candidates=rows.filter(x=>x.verdict.researchCandidate).length;
 const deliveredBots=connected?tickDeliveries.filter(x=>x.status==="DELIVERED").length:0;
 const fullTickMarkets=DIGIT_MARKETS.filter(x=>
  (view.history[x.symbol]?.length||0)===GOLDEN_TICK_MONITOR_WINDOW).length;
 const freshQuotes=Number.isFinite(quoteAsOf)&&currentNow-quoteAsOf>=0&&
  currentNow-quoteAsOf<=15_000;
 return <main className={styles.shell}><div className={styles.content}>
  <header className={styles.topbar}>
   <Link href="/bot-library" className={styles.brand}>TRADE SCHEME <b>FX</b></Link>
   <nav><Link href="/bot-library">Back to 15 Bots</Link>
    <Link href="/dashboard">Dashboard</Link></nav>
  </header>
  <section className={styles.hero}>
   <p className={styles.kicker}>SENFX · GOLDEN RULE · PAPER-ONLY RESEARCH</p>
   <h1>Trade only with <span>credible evidence</span></h1>
   <p>This independent lab observes the exact 15 original strategies prospectively.
    It never starts, stops, changes or buys a Deriv contract. All results are
    hypothetical next-tick or five-minute public-market observations—not broker profit.</p>
   <p className={styles.warning}>No strategy is guaranteed profitable. For every bot we
    require 1,000 prospective samples, a conservative multiple-test-adjusted winning-rate
    bound exceeding the current broker break-even rate by 2 percentage points,
    and a stake no greater than 0.5% of verified virtual Demo balance.
    Directional five-minute observations are exploratory and cannot qualify as
    broker-aligned evidence yet.</p>
  </section>
  <section className={styles.panel} style={{margin:"16px 0"}}>
   <h2>Live forward research · all 15 bots</h2>
   <p role="status">{marketState}</p>
   <div className={styles.resultGrid}>
    <div><small>CONNECTED MARKETS</small><b>{connected?liveMarkets:0}/10</b></div>
    <div><small>FORWARD PAPER OBSERVATIONS / 15,000</small><b>{total.toLocaleString()} / 15,000</b></div>
    <div><small>GOLDEN RULE PAPER CANDIDATES</small><b>{candidates}/15</b></div>
    <div><small>REAL DERIV ORDERS PLACED HERE</small><b>0</b></div>
   </div>
   <p className={styles.finePrint}>Research accumulates only while this tab is open; it resets on reload.
    After a feed disconnect, unfinished observations are discarded while
    previously completed observations in this session remain counted.
    Each bot's first 1,000 settled forward observations form one fixed-size
    paper experiment; results freeze at 1,000 to avoid optional peeking.
    Short tests are not evidence of profitability.</p>
  </section>
  <section className={styles.panel} style={{margin:"16px 0"}}>
   <h2>300 live ticks · 30-second delivery to all 15 research bots</h2>
   <p>Each original bot receives a separate read-only analysis of the latest
    300 contiguous public Deriv ticks for its own existing market every 30 seconds.
    Shared markets are monitored once, not mixed or duplicated. A bot receives no
    analysis if its window is incomplete, stale, disconnected or has missing ticks.</p>
   <div className={styles.resultGrid}>
    <div><small>MARKETS WITH 300-TICK WINDOWS</small><b>{fullTickMarkets}/10</b></div>
    <div><small>BOTS ANALYZED IN LAST DISPATCH</small><b>{deliveredBots}/15</b></div>
    <div><small>ANALYSIS INTERVAL</small><b>30 sec</b></div>
    <div><small>LAST DISPATCH CHECK</small><b>{lastTickDispatchAt?time(lastTickDispatchAt):"—"}</b></div>
   </div>
   <div className={styles.scrollTable}>
    <table>
     <thead><tr><th>Existing bot</th><th>Market</th><th>Live tick window</th>
      <th>Last 30s dispatch</th><th>Read-only analysis</th></tr></thead>
     <tbody>{FIFTEEN_BOTS.map(bot=>{
      const result=tickDeliveries.find(x=>x.botId===bot.id);
      return <tr key={bot.id}>
       <td>{bot.name}</td><td>{bot.market}</td>
       <td>{view.history[bot.market]?.length||0}/{GOLDEN_TICK_MONITOR_WINDOW}</td>
       <td>{!connected?"DISCONNECTED":result?.status||"WARMING"}</td>
       <td>{connected&&result?.status==="DELIVERED"?
        (result.analysis?result.analysis.prediction+" hypothesis":"No qualifying hypothesis"):
        "Blocked until 300 fresh contiguous ticks"}</td>
      </tr>;
     })}</tbody>
    </table>
   </div>
   <p className={styles.finePrint}>This browser-only monitor accumulates ticks while
    the page is open. Reaching 300 ticks takes real market time; 30 seconds is
    the delivery interval, not a claim of 300 new market ticks in that period.
    Reloads clear the monitor. Snapshots never enter broker purchase workers.
    The separate 1,000-per-bot forward-study requirement is unchanged.</p>
  </section>
  <section className={styles.panel} style={{margin:"16px 0"}}>
   <h2>Deriv virtual Demo broker pricing · read only</h2>
   <p>{balanceMessage}</p>
   <p>Virtual balance: <strong>{typeof balance?.balance==="number"?
     money(balance.balance):"Unavailable"}</strong> · Maximum 0.5% per hypothetical
    stake: <strong>{typeof balance?.balance==="number"?
      money(balance.balance*GOLDEN_RULE_MAX_DEMO_BALANCE_RISK):"Unavailable"}</strong></p>
   <div className={styles.inputs}>
    <label>Equal virtual USD stake used to compare contract quotes
     <input type="number" value={stake} min="0.01" step="0.01"
      onChange={e=>{setStake(e.target.value);setQuotes(null);}}
      aria-label="Golden Rule research stake"/></label>
   </div>
   <p>{candidateRequests.length} of 15 strategies currently produce a
    public-market hypothesis. A quote is not a trade recommendation.</p>
   <div className={styles.controls}>
    <button type="button" className={styles.startButton}
     onClick={()=>void readOnlyQuotes()} disabled={quoting||!stakeValid||!candidateRequests.length}>
     {quoting?"Reading virtual broker quotes…":"Refresh live Demo payout quotes"}
    </button>
   </div>
   <p role="status" className={styles.notice}>{quoteMessage}</p>
   <p>{freshQuotes?
    "Fresh quotes available; expire automatically 15 seconds after receipt.":
    "No fresh quote available. Broker break-even and EV tests remain blocked."}</p>
  </section>
  <section className={styles.panel} style={{margin:"16px 0"}}>
   <h2>Golden Rule evidence board · 15 original bots</h2>
   <p>All entries start BLOCKED. A high hypothetical hit rate alone never
    authorizes a trade, and multiple-testing can make apparent winning streaks misleading.</p>
   <div className={styles.scrollTable}>
    <table>
     <thead><tr>
      <th>Existing SENFX bot</th><th>Forward samples</th><th>Observed hits</th>
      <th>Conservative lower win rate</th><th>Current broker break-even</th>
      <th>Conservative net EV / stake</th><th>Paper research verdict</th>
     </tr></thead>
     <tbody>{rows.map(({bot,record,verdict})=><tr key={bot.id}>
      <td>{bot.name}<div><small>{bot.market} · {bot.category==="Direction"?
       "Five-minute observational only":"One-tick digit study"}</small></div></td>
      <td>{record.observations.toLocaleString()}/{GOLDEN_RULE_MIN_FORWARD_SAMPLES.toLocaleString()}
       <div><small>{record.voids} voided / missed</small></div></td>
      <td>{record.wins.toLocaleString()} / {record.losses.toLocaleString()}
       <div><small>{pct(verdict.empiricalHitRate)}</small></div></td>
      <td>{pct(verdict.conservativeLower)}</td>
      <td>{pct(verdict.brokerBreakEven)}</td>
      <td>{verdict.conservativeNetEdgePerStake===null?"—":
       (verdict.conservativeNetEdgePerStake>=0?"+":"")+
       (verdict.conservativeNetEdgePerStake*100).toFixed(2)+"%"}</td>
      <td><strong className={verdict.researchCandidate?styles.ok:styles.blocked}>
       {verdict.researchCandidate?"RESEARCH CANDIDATE":"BLOCKED"}</strong>
       <div><small>{verdict.blocked[0]||"Paper-only; no broker buy permission"}</small></div>
      </td>
     </tr>)}</tbody>
    </table>
   </div>
   <p className={styles.finePrint}>One-sided Wilson lower bounds use a Bonferroni
    correction for 15 simultaneous strategy checks; nominal family-wise 95% confidence
    under the method's assumptions. These observations are not independent guaranteed
    broker settlements. Five-minute directional proxies are explicitly blocked
    from an execution-eligibility conclusion. All research stays on this page.</p>
  </section>
  <footer className={styles.footer}>
   SENFX Golden Rule is observation-only. No new signals, payout overrides,
   risk mutations or real-money functionality were added. The existing
   broker's separate 10X checks and post-loss stop protections remain unchanged.
   This page is NOT connected to the broker buy path.
   {currentNow>0?" · Last local update "+time(currentNow):""}
  </footer>
 </div></main>;
}
