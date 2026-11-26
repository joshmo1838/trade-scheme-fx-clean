'use client';
import {useCallback,useEffect,useMemo,useState} from 'react';
import {createBrowserClient} from '@supabase/ssr';
import QuantumDemoRunControl from './QuantumDemoRunControl';
import styles from './premium-bot-workspace.module.css';

type Strategy={id:string;name:string;model:string;color:string;rule:string};
type SignalRow={bot:string;decision:string;reason?:string};
type ResearchPayload={feedFresh?:boolean;workerStopped?:boolean;bots?:SignalRow[]};
type MarketSnapshot={updated_at:string;payload:ResearchPayload};
type DemoStatus={ok?:boolean;controlsEnabled?:boolean;run?:{desiredState:string;observedState:string;version:number;botId:string;stake:number;sessionStopLoss:number;sessionTakeProfit:number;workerConnected:boolean;lastError:string|null;progress:{tradesAttempted:number;pending:number;completed:number;wins:number;losses:number;netVirtualProfit:number;latestContractId:string|null}|null;restartCooldownSeconds:number}|null};

const MARKETS=['R_10','R_25','R_50','R_75','R_100'];
const CONTROL_API='/api/deriv/demo/v4/bots/control';

export default function PremiumBotWorkspace({strategy,onBack}:{strategy:Strategy;onBack:()=>void}){
  const [scannerOn,setScannerOn]=useState(false);
  const [scanAll,setScanAll]=useState(true);
  const [market,setMarket]=useState('R_100');
  const [snapshots,setSnapshots]=useState<Record<string,MarketSnapshot>>({});
  const [scanState,setScanState]=useState('Scanner stopped · no broker orders are placed by research.');
  const [busy,setBusy]=useState(false);
  const [clock,setClock]=useState(Date.now());
  const [status,setStatus]=useState<DemoStatus|null>(null);
  const [railTab,setRailTab]=useState<'Summary'|'Transactions'|'Journal'>('Summary');

  const visibleMarkets=useMemo(()=>scanAll?MARKETS:[market],[scanAll,market]);
  const refreshResearch=useCallback(async()=>{
    const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if(!url||!key){setScanState('Research feed is not configured.');return;}
    setBusy(true);
    try{
      const db=createBrowserClient(url,key);
      const {data,error}=await db.from('quantum_ai_latest').select('symbol,updated_at,payload').in('symbol',visibleMarkets);
      if(error)throw error;
      const next:Record<string,MarketSnapshot>={};
      for(const item of data||[]){
        if(typeof item.symbol==='string'&&typeof item.updated_at==='string'&&item.payload&&typeof item.payload==='object'){
          next[item.symbol]={updated_at:item.updated_at,payload:item.payload as ResearchPayload};
        }
      }
      setSnapshots(next);
      setClock(Date.now());
      setScanState(Object.keys(next).length?'Research snapshot refreshed · read-only scan.':'Awaiting a fresh 300-tick research snapshot.');
    }catch{
      setScanState('Research feed unavailable · no signal shown.');
    }finally{setBusy(false);}
  },[visibleMarkets]);

  useEffect(()=>{
    if(!scannerOn)return;
    void refreshResearch();
    const timer=setInterval(()=>void refreshResearch(),30000);
    return()=>clearInterval(timer);
  },[scannerOn,refreshResearch]);

  const refreshStatus=useCallback(async()=>{
    try{
      const response=await fetch(CONTROL_API,{credentials:'same-origin',cache:'no-store'});
      const data:DemoStatus=await response.json();
      setStatus(data);
    }catch{setStatus(null);}
  },[]);
  useEffect(()=>{
    void refreshStatus();
    const timer=setInterval(()=>void refreshStatus(),4000);
    return()=>clearInterval(timer);
  },[refreshStatus]);

  const activeRun=status?.run?.desiredState==='running';
  const currentRun=activeRun&&status?.run?.botId===strategy.id;
  const progress=currentRun?status?.run?.progress:null;
  const sourceFor=(symbol:string)=>{
    const snapshot=snapshots[symbol];
    if(!scannerOn)return {label:'PAUSED',detail:'Start the scanner to refresh research.',fresh:false,decision:''};
    if(!snapshot)return {label:'WAITING',detail:'No saved 300-tick research snapshot.',fresh:false,decision:''};
    const age=clock-Date.parse(snapshot.updated_at);
    const fresh=snapshot.payload.feedFresh===true&&snapshot.payload.workerStopped!==true&&age>=0&&age<90000;
    if(!fresh)return {label:'STALE',detail:'Feed is stale or its worker is stopped.',fresh:false,decision:''};
    const found=snapshot.payload.bots?.find(row=>row.bot===strategy.name);
    if(!found)return {label:'NO STRATEGY ROW',detail:'This snapshot does not include this strategy.',fresh:true,decision:''};
    const decision=String(found.decision||'').toUpperCase();
    if(!decision||decision==='SKIP'||decision==='NO ENTRY')return {label:'NO ENTRY',detail:found.reason||'The existing strategy rule did not produce an entry.',fresh:true,decision};
    return {label:'RESEARCH · '+decision,detail:found.reason||'Research result only; not a verified trade signal.',fresh:true,decision};
  };

  return <section className={styles.root} aria-label={strategy.name+' premium bot workspace'}>
    <header className={styles.topBar}>
      <div className={styles.titleGroup}>
        <button type="button" className={styles.backButton} onClick={onBack}>‹ Strategies</button>
        <div><small>TRADE SCHEME FX · PREMIUM AI BOT · 4.0</small><h2>{strategy.name}</h2></div>
      </div>
      <span className={styles.modeTag}>RESEARCH RULE PRESERVED</span>
    </header>

    <div className={styles.columns}>
      <section className={styles.setup} aria-label="Scanner and strategy setup">
        <div className={styles.panelHeading}><span>◉</span><div><h3>Scanner setup</h3><small>Configuration confirmation</small></div></div>
        <button type="button" className={scannerOn?styles.stopScan:styles.startScan} onClick={()=>setScannerOn(value=>!value)}>{scannerOn?'■ STOP AI SCANNER':'▶ START AI SCANNER'}</button>

        <div className={styles.ruleBlock}>
          <label>ENTRY &amp; RECOVERY CONDITIONS</label>
          <strong>{strategy.name} · {strategy.model.replaceAll('_',' ')}</strong>
          <p>{strategy.rule}</p>
          <small>Existing 4.0 rule is read-only here. No strategy or recovery rule has been substituted.</small>
        </div>

        <label className={styles.marketToggle}>
          <span><strong>Scan all supported markets</strong><small>Read the latest shared research snapshot</small></span>
          <input type="checkbox" checked={scanAll} onChange={event=>setScanAll(event.target.checked)}/>
        </label>
        {!scanAll&&<label className={styles.marketSelect}>Market<select value={market} onChange={event=>setMarket(event.target.value)}>{MARKETS.map(symbol=><option key={symbol} value={symbol}>Volatility {symbol.slice(2)}</option>)}</select></label>}

        <div className={styles.contractNote}><strong>Contract duration</strong><span>1 tick · server-validated for Demo</span></div>
        <div className={styles.demoHeading}><span>DERIV DEMO CONTROLS</span><small>Virtual USD only</small></div>
        <QuantumDemoRunControl botId={strategy.id} botName={strategy.name}/>
      </section>

      <section className={styles.scanner} aria-label="Live market scan">
        <div className={styles.panelHeading}><span>⌁</span><div><h3>Live market scan</h3><small>{scannerOn?'Read-only research snapshots · refresh every 30 seconds':'Start the scanner to monitor supported markets'}</small></div><b className={scannerOn?styles.readyTag:styles.waitTag}>{scannerOn?'4.0 RULE':'IDLE'}</b></div>
        <div className={styles.scanStatus} role="status" aria-live="polite">{busy?'Refreshing market research…':scanState}</div>
        <div className={styles.marketRows}>
          {visibleMarkets.map(symbol=>{
            const result=sourceFor(symbol);
            const snapshot=snapshots[symbol];
            return <article key={symbol} className={styles.marketRow}>
              <span className={result.fresh?styles.liveDot:styles.waitDot}/>
              <div className={styles.marketInfo}><strong>Volatility {symbol.slice(2)} Index</strong><small>{snapshot?new Date(snapshot.updated_at).toLocaleTimeString():'Awaiting snapshot'}</small></div>
              <div className={styles.signalValue}>{result.fresh?result.decision||'—':'—'}</div>
              <div className={styles.signalState}><strong>{result.label}</strong><small>{result.detail}</small></div>
            </article>;
          })}
        </div>
        <footer className={styles.scanFooter}><span>Research source: shared 4.0 feed</span><button type="button" disabled={busy} onClick={()=>void refreshResearch()}>Refresh scan</button></footer>
      </section>

      <aside className={styles.ledger} aria-label="Demo activity">
        <nav className={styles.ledgerTabs}>
          {(['Summary','Transactions','Journal'] as const).map(item=><button key={item} type="button" aria-pressed={railTab===item} onClick={()=>setRailTab(item)}>{item}</button>)}
        </nav>
        {railTab==='Summary'&&<div className={styles.ledgerContent}>
          <h3>Demo summary</h3>
          <p className={styles.ledgerState}>{currentRun?(status?.run?.workerConnected?'Worker verified':'Run requested'):'No active run for this bot'}</p>
          {progress?<><dl><div><dt>Attempted</dt><dd>{progress.tradesAttempted}</dd></div><div><dt>Settled</dt><dd>{progress.completed}</dd></div><div><dt>Wins / losses</dt><dd>{progress.wins} / {progress.losses}</dd></div><div><dt>Virtual P/L</dt><dd>{'$'+Number(progress.netVirtualProfit).toFixed(2)}</dd></div></dl><p>Open or reconciling: {progress.pending}</p></>:<p>Run totals appear after this strategy has a Demo session.</p>}
        </div>}
        {railTab==='Transactions'&&<div className={styles.ledgerContent}>
          <h3>Transactions</h3>
          {progress?.latestContractId?<div className={styles.contractCard}><small>Latest Deriv contract ID</small><strong>{progress.latestContractId}</strong><span>Settlement is recorded by the server Demo ledger.</span></div>:<p>No settled Demo contracts for this run yet.</p>}
          {progress&&<p>{progress.completed} settled · {progress.pending} open or reconciling</p>}
        </div>}
        {railTab==='Journal'&&<div className={styles.ledgerContent}>
          <h3>Run journal</h3>
          <p>{currentRun?(status?.run?.workerConnected?'Verified worker lease is active.':'Run is waiting for a worker lease.'):'No active run for this bot.'}</p>
          {status?.run?.lastError&&currentRun&&<p className={styles.error}>{status.run.lastError}</p>}
          <small>Research scan and broker Demo run are separate controls. A research scan never submits an order.</small>
        </div>}
        <div className={styles.ledgerFooter}><small>Real-money execution disabled</small></div>
      </aside>
    </div>
  </section>;
}
