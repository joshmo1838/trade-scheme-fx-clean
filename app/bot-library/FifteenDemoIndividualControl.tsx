"use client";
import {useCallback,useEffect,useState} from "react";
import styles from "./fifteen.module.css";
type Snapshot={
 ok:boolean;controlsEnabled?:boolean;brokerBuyingEnabled?:boolean;code?:string;
 run?:{
  desiredState:string;workerConnected:boolean;version:number;
  selectedBotId:string|null;targetTrades:number|null;stakeAmount:number|null;
  progress?:{tradesAttempted:number;completed:number;wins:number;losses:number;netVirtualProfit:number}|null;
 }|null;
};
const API="/api/deriv/demo/bots/control";
export default function FifteenDemoIndividualControl({botId,botName}:{botId:string;botName:string}){
 const [status,setStatus]=useState<Snapshot|null>(null);
 const [stake,setStake]=useState("5");
 const [trades,setTrades]=useState("10");
 const [approved,setApproved]=useState(false);
 const [pending,setPending]=useState(false);
 const [note,setNote]=useState("Your chosen strategy can trade genuine Deriv virtual USD Demo contracts.");
 const refresh=useCallback(async()=>{
  try{
   const res=await fetch(API,{credentials:"same-origin",cache:"no-store"});
   const data:Snapshot=await res.json();
   setStatus(data);
   if(!res.ok)setNote(data.code||"Demo broker authorization unavailable");
  }catch{setStatus(null);setNote("Could not read the current Deriv Demo broker status.");}
 },[]);
 useEffect(()=>{
  void refresh();
  const timer=setInterval(()=>void refresh(),8000);
  return ()=>clearInterval(timer);
 },[refresh]);
 const running=status?.run?.desiredState==="running";
 const selectedActive=running&&status?.run?.selectedBotId===botId;
 const stakeOk=/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,2})?$/.test(stake)&&Number.isFinite(Number(stake))&&Number(stake)>0&&Number.isSafeInteger(Math.round(Number(stake)*100));
 const total=Number(trades);
 const countOk=/^[1-9][0-9]*$/.test(trades)&&Number.isSafeInteger(total)&&total<=200;
 const canStart=!!status?.ok&&!!status.controlsEnabled&&!running&&stakeOk&&countOk&&approved&&!pending;
 const canStop=!!status?.ok&&selectedActive&&!pending;
 const command=async(action:"start_one"|"stop")=>{
  if(pending||(!canStart&&action==="start_one")||(!canStop&&action==="stop"))return;
  setPending(true);
  try{
   const res=await fetch(API,{
    method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
     action,botId,targetTrades:total,stakeAmount:stake,expectedVersion:status?.run?.version??0,
     confirmVirtualDemoAutomation:action==="start_one"&&approved
    })
   });
   const answer=await res.json().catch(()=>({code:"INVALID_SERVER_RESPONSE"}));
   setNote(!res.ok?String(answer.code||answer.error||"Demo broker rejected the request"):
    action==="stop"?"Stop confirmed. Any previously submitted contract cannot be undone.":
    "Selected Demo bot Start accepted. The worker must claim a lease before placing broker orders.");
   if(res.ok&&action==="start_one")setApproved(false);
   await refresh();
  }catch{setNote("Could not confirm the command. Check broker history before retrying.");}
  finally{setPending(false);}
 };
 const showResults=status?.run?.selectedBotId===botId;
 const progress=showResults?status?.run?.progress:null;
 const alreadyActiveOther=running&&!selectedActive;
 const blockReason=pending?"Sending your broker control request…":
  !status?"Checking admin Demo access…":
  !status.ok?
   status.code==="ADMIN_DEMO_LOGIN_REQUIRED"?
    "Sign into your verified SENFX admin account. This browser session is not authorized for broker control.":
    "The broker control API is unavailable: "+(status.code||"SERVER_UNAVAILABLE"):
  !status.controlsEnabled?"Broker Demo execution is not enabled in this site's server configuration.":
  running?selectedActive?"This bot has an active Demo session. Check its broker results below.":
   "Another Demo run is active. Use Stop All before starting this bot.":
  !stakeOk?"Enter a positive Demo stake in USD, e.g. 5.":
  !countOk?"Enter a whole number of Demo contracts from 1 to 200.":
  !approved?"Check the virtual-money Demo authorization box to enable Start.":
  "Ready: click Start Selected Demo Bot to activate real Deriv virtual-money Demo orders.";
 return <section className={styles.panel} style={{margin:"16px 0"}}>
  <p className={styles.kicker}>INDIVIDUAL BOT · ACTUAL DERIV BROKER · VIRTUAL DEMO ONLY</p>
  <h2>{botName} — Broker Demo</h2>
  <p>Start this strategy independently. Broker-confirmed results replace hypothetical hits.
   Orders share your Demo account and execute one unsettled contract at a time.</p>
  <div className={styles.inputs}>
   <label>Stake per contract (virtual USD)
    <input type="number" min="0.01" step="0.01" value={stake} disabled={pending||running}
     onChange={e=>setStake(e.target.value)}/></label>
   <label>Deriv Demo trades to attempt (1–200)
    <input type="number" min="1" max="200" step="1" value={trades} disabled={pending||running}
     onChange={e=>setTrades(e.target.value)}/></label>
  </div>
  <p>Maximum planned virtual stake exposure: <strong>{stakeOk&&countOk?("$"+(Number(stake)*total).toFixed(2)):"—"}</strong>.
   This is a worst-case planned virtual loss if every contract loses, not a prediction.</p>
  <label style={{display:"flex",gap:8,alignItems:"flex-start",margin:"12px 0"}}>
   <input type="checkbox" checked={approved} disabled={pending||running}
    onChange={e=>setApproved(e.target.checked)}/>
   <span>I authorize this selected bot to purchase <strong>Deriv virtual Demo contracts only</strong>
    at my chosen stake, for no more than my selected trade count. Real-money trading is disabled.</span>
  </label>
  <p role="status" className={canStart?styles.ok:styles.notice} style={{margin:"12px 0"}}>
   <strong>{canStart?"READY TO START":"START CHECK"}</strong> — {blockReason}
   {status?.code==="ADMIN_DEMO_LOGIN_REQUIRED"&&<>
    {" "}<a href="/login">Sign in to the admin account</a>.
   </>}
  </p>
  <div className={styles.controls}>
   <button className={styles.startButton} disabled={!canStart} onClick={()=>void command("start_one")}>
    Start Selected Demo Bot
   </button>
   <button className={styles.stopButton} disabled={!canStop} onClick={()=>void command("stop")}>
    Stop Selected Demo Bot
   </button>
   <button disabled={pending} onClick={()=>void refresh()}>Refresh broker results</button>
  </div>
  {showResults&&<div className={styles.resultGrid} style={{marginTop:12}}>
   <div><small>WORKER</small><b>{status?.run?.workerConnected?"CONNECTED":"CONNECTING"}</b></div>
   <div><small>BROKER TRADES</small><b>{progress?.completed??0}/{status?.run?.targetTrades??0}</b></div>
   <div><small>WINS / LOSSES</small><b>{progress?.wins??0} / {progress?.losses??0}</b></div>
   <div><small>VIRTUAL NET P/L</small><b>{"$"+(progress?.netVirtualProfit??0).toFixed(2)}</b></div>
  </div>}
  {alreadyActiveOther&&<p role="status">Another bot or Start All owns the shared Demo worker.
   Stop it before starting {botName}.</p>}
  <p role="status" className={styles.notice}>{note}</p>
  <p className={styles.finePrint}>Starting does not guarantee a purchase, win or profit.
   Any unknown purchase or safety fault stops further orders. The browser may close while the worker executes.</p>
 </section>;
}