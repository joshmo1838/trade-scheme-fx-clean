"use client";
import { useEffect, useRef, useState } from "react";
type Draft={market?:string;contract?:string;duration?:string;stake?:string;tp?:string;sl?:string;martingale?:boolean;triggerInterval?:string;blocks?:{id:string;title:string;kind:string}[];conditionRules?:Record<string,{indicator:string;operator:string;value:string}>;sellRules?:Record<string,{exitType:string;operator:string;value:string}>;riskRules?:Record<string,{maxStake:string;maxSessionLoss:string;maxTrades:string;stopAtProfit:boolean}>};
type Trade={id:number;entry:number;exit?:number;direction:"CALL"|"PUT";stake:number;remaining:number;status:"OPEN"|"WIN"|"LOSS";pnl?:number;time:string};
const KEY="trade-scheme-fx-visual-builder-v1",APP_ID="34SBwLGAx9IL6eEDUQ39T";
const compare=(a:number,op:string,b:number)=>op==="gt"?a>b:op==="lt"?a<b:op==="eq"?a===b:op==="gte"?a>=b:a<=b;
const lastDigit=(p:number)=>Number(p.toFixed(2).replace(".","").slice(-1));
export default function DemoPaperSimulator(){
 const [draft,setDraft]=useState<Draft|null>(null),[running,setRunning]=useState(false),[status,setStatus]=useState("Load your saved strategy draft to begin."),[price,setPrice]=useState<number|null>(null),[ticks,setTicks]=useState(0),[trades,setTrades]=useState<Trade[]>([]),[pnl,setPnl]=useState(0),[feed,setFeed]=useState("OFFLINE"),[openTrade,setOpenTrade]=useState<Trade|null>(null);
 const socket=useRef<WebSocket|null>(null),state=useRef({running:false,open:null as Trade|null,trades:[] as Trade[],pnl:0,ticks:0,draft:null as Draft|null}),nextId=useRef(0);
 const stop=(message:string)=>{state.current.running=false;setRunning(false);setStatus(message);if(socket.current){socket.current.close();socket.current=null;}setFeed("OFFLINE");};
 const load=()=>{try{const raw=localStorage.getItem(KEY);if(!raw){setStatus("No saved draft found. Save your strategy in the builder first.");return;}setDraft(JSON.parse(raw));setStatus("Saved strategy loaded. Ready for paper simulation.");}catch{setStatus("Could not read your saved strategy.");}};
 useEffect(()=>{load();return()=>{state.current.running=false;if(socket.current)socket.current.close();};},[]);
 const start=()=>{
  let d=draft;try{const raw=localStorage.getItem(KEY);if(raw)d=JSON.parse(raw);}catch{}
  if(!d){setStatus("Save a strategy draft before starting.");return;}
  if(d.contract!=="CALL"&&d.contract!=="PUT"){setStatus("This first simulator supports Rise/Call and Fall/Put only. Digit contracts are not simulated.");return;}
  if(d.martingale){setStatus("Turn Martingale off first. Stake escalation is not supported.");return;}
  const rb=d.blocks?.find(b=>b.kind==="risk"),risk=rb?d.riskRules?.[rb.id]:undefined,stake=Number(d.stake||1),maxStake=Number(risk?.maxStake||2),maxLoss=Number(risk?.maxSessionLoss||10),maxTrades=Number(risk?.maxTrades||10),duration=Number(d.duration||5);
  if(!Number.isFinite(stake)||stake<0.35||stake>maxStake||!Number.isInteger(duration)||duration<1||duration>100||maxLoss<=0||!Number.isInteger(maxTrades)||maxTrades<1){setStatus("Safety check failed. Review stake, duration and Risk Limits.");return;}
  const cb=d.blocks?.find(b=>b.title==="Purchase condition"),rule=cb?d.conditionRules?.[cb.id]:undefined,value=Number(rule?.value??5);
  if(!cb||!Number.isInteger(value)||value<0||value>9){setStatus("Add a valid Purchase condition using a digit from 0 to 9.");return;}
  state.current={running:true,open:null,trades:[],pnl:0,ticks:0,draft:d};setTrades([]);setPnl(0);setTicks(0);setPrice(null);setOpenTrade(null);setRunning(true);setStatus("Connecting to Deriv public tick feed. Paper mode only.");setFeed("CONNECTING");
  try{const ws=new WebSocket("wss://ws.derivws.com/websockets/v3?app_id="+APP_ID);socket.current=ws;
   ws.onopen=()=>{setFeed("CONNECTED");setStatus("Connected. Waiting for the first market tick.");ws.send(JSON.stringify({ticks:d.market||"R_100",subscribe:1}));};
   ws.onmessage=(event)=>{let m:any;try{m=JSON.parse(event.data);}catch{return;}if(m.error){stop("Market feed error: "+m.error.message);return;}if(m.msg_type!=="tick"||!m.tick)return;const px=Number(m.tick.quote);if(!Number.isFinite(px))return;setPrice(px);
    const s=state.current,config=s.draft;if(!s.running||!config)return;s.ticks++;setTicks(s.ticks);const direction=config.contract==="PUT"?"PUT":"CALL",dur=Number(config.duration||5);
    if(s.open){const rem=s.open.remaining-1;if(rem<=0){const won=direction==="CALL"?px>s.open.entry:px<s.open.entry,profit=won?s.open.stake:-s.open.stake,closed:Trade={...s.open,exit:px,remaining:0,status:won?"WIN":"LOSS",pnl:profit};s.open=null;setOpenTrade(null);s.trades=[closed,...s.trades].slice(0,50);s.pnl=Number((s.pnl+profit).toFixed(2));setTrades([...s.trades]);setPnl(s.pnl);
      const riskBlock=config.blocks?.find(b=>b.kind==="risk"),riskNow=riskBlock?config.riskRules?.[riskBlock.id]:undefined,sellBlock=config.blocks?.find(b=>b.title==="Sell condition"),sell=sellBlock?config.sellRules?.[sellBlock.id]:undefined,maxLossNow=Number(riskNow?.maxSessionLoss||10),maxCount=Number(riskNow?.maxTrades||10),tp=Number(config.tp||0),sl=Number(config.sl||0),sellTarget=Number(sell?.value||0);
      if(s.pnl<=-maxLossNow||(sl>0&&s.pnl<=-sl)||s.trades.length>=maxCount||(tp>0&&s.pnl>=tp)||(sell?.exitType==="profit_target"&&s.pnl>=sellTarget)||(sell?.exitType==="loss_limit"&&s.pnl<=-sellTarget)){stop("A session guardrail was reached. Paper simulation stopped.");return;}
     }else{s.open={...s.open,remaining:rem};setOpenTrade(s.open);}
    }else{const interval=Math.max(1,Number(config.triggerInterval||1)),cond=config.blocks?.find(b=>b.title==="Purchase condition"),r=cond?config.conditionRules?.[cond.id]:undefined;if(s.ticks%interval===0&&compare(lastDigit(px),r?.operator||"gt",Number(r?.value??5))){const riskBlock=config.blocks?.find(b=>b.kind==="risk"),riskNow=riskBlock?config.riskRules?.[riskBlock.id]:undefined,amount=Number(config.stake||1);if(amount<=Number(riskNow?.maxStake||2)){s.open={id:++nextId.current,entry:px,direction,stake:amount,remaining:dur,status:"OPEN",time:new Date().toLocaleTimeString()};setOpenTrade(s.open);}}}
   };
   ws.onerror=()=>{if(state.current.running)stop("Market feed connection failed. Try again later.");};
   ws.onclose=()=>{if(state.current.running){state.current.running=false;setRunning(false);setFeed("OFFLINE");setStatus("Market feed disconnected. Simulation paused.");}};
  }catch{stop("Could not open the market feed.");}
 };
 const reset=()=>{if(state.current.running)stop("Session reset.");state.current={running:false,open:null,trades:[],pnl:0,ticks:0,draft:null};setTrades([]);setPnl(0);setTicks(0);setPrice(null);setOpenTrade(null);setDraft(null);setStatus("Session reset. Load your saved draft to start again.");};
 
 return <section className="paperSim panel"><div className="paperSimHead"><div><span className="builderTinyLabel">DEMO LAB / PAPER TRADING</span><h2>Strategy simulator</h2><p>Tests your saved Rise/Fall strategy against live public market ticks.</p></div><span className={"paperSimStatus "+(running?"online":"")}>● {feed}</span></div>
 <div className="paperSimWarning"><strong>Paper simulation only:</strong> This is not a Deriv demo contract. It uses an illustrative 1:1 win/loss assumption (win = +stake; loss = −stake), not Deriv payouts. No account token, account balance, demo funds or real funds are used.</div>
 <div className="paperSimMetrics"><div><small>MARKET</small><strong>{draft?.market||"R_100"}</strong></div><div><small>LIVE TICK</small><strong>{price===null?"—":price.toLocaleString("en-US",{maximumFractionDigits:4})}</strong></div><div><small>SESSION P/L*</small><strong className={pnl>=0?"positive":"negative"}>{pnl>=0?"+":""}${pnl.toFixed(2)}</strong></div><div><small>TICKS RECEIVED</small><strong>{ticks}</strong></div></div>
 <div className="paperSimActions"><button className="button secondary small" onClick={load} disabled={running}>Load saved draft</button>{running?<button className="button secondary small" onClick={()=>stop("Simulation paused by you.")}>Pause</button>:<button className="button small" onClick={start}>Start paper simulation</button>}<button className="button secondary small" onClick={reset}>Reset session</button></div>
 <p className="paperSimStatusText" role="status">{status}</p><div className="paperSimTradeHead"><strong>Paper trade history</strong><span>{trades.length} settled</span></div>
 {openTrade&&<div className="paperOpenTrade"><strong>OPEN · {openTrade.direction}</strong><span>Entry {openTrade.entry} · {openTrade.remaining} ticks remaining · ${openTrade.stake.toFixed(2)} stake</span></div>}
 {trades.length===0?<p className="muted">No simulated trades yet. Start the simulator to watch qualifying signals.</p>:<div className="paperTradeList">{trades.map(t=><div className="paperTradeRow" key={t.id}><span><strong>{t.status} · {t.direction}</strong><small>{t.time} · {t.entry} → {t.exit}</small></span><b className={t.pnl!==undefined&&t.pnl>=0?"positive":"negative"}>{t.pnl!==undefined?(t.pnl>=0?"+":"−")+"$"+Math.abs(t.pnl).toFixed(2):"—"}</b></div>)}</div>}
 <small className="paperSimFoot">*Illustrative paper P/L only. Risk stops apply only inside this simulator. Digit contracts, early sale and Martingale are not supported.</small></section>;
}
