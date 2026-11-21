"use client";
import {useCallback,useEffect,useState} from "react";
import styles from "./fifteen.module.css";
type Snapshot={
 ok:boolean;controlsEnabled?:boolean;brokerBuyingEnabled?:boolean;code?:string;
 run?:{
  desiredState:string;workerConnected:boolean;version:number;
  selectedBotId:string|null;targetTrades:number|null;stakeAmount:number|null;
  restartCooldownSeconds?:number;
  progress?:{tradesAttempted:number;pending:number;completed:number;wins:number;losses:number;netVirtualProfit:number}|null;
 }|null;
};
const API="/api/deriv/demo/bots/control";
export default function FifteenDemoIndividualControl({botId,botName}:{botId:string;botName:string}){
 const [status,setStatus]=useState<Snapshot|null>(null);
 const [stake,setStake]=useState("1000");
 const [trades,setTrades]=useState("10");
 const [approved,setApproved]=useState(false);
 const [pending,setPending]=useState(false);
 const [note,setNote]=useState("Your chosen strategy can trade genuine Deriv virtual USD Demo contracts.");
 const refresh=useCallback(async()=>{
  try{
   const res=await fetch(API,{credentials:"same-origin",cache:"no-store"});
   const data:Snapshot=await res.json();
   setStatus(data);
   // Show the stake/count truly authorized on the server, not the form's
   // default when another run was started previously or in another tab.
   if(data.ok&&data.run?.desiredState==="running"){
    if(Number.isFinite(data.run.stakeAmount)&&Number(data.run.stakeAmount)>0)
     setStake(String(data.run.stakeAmount));
    if(data.run.targetTrades)setTrades(String(data.run.targetTrades));
   }
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
 const restartWait=Math.max(0,status?.run?.restartCooldownSeconds??0);
 const canStart=!!status?.ok&&!!status.controlsEnabled&&!running&&restartWait===0&&stakeOk&&countOk&&approved&&!pending;
 // Always give the admin control to STOP the currently running session,
 // even if a different strategy card is being viewed.
 const canStop=!!status?.ok&&running&&!pending;
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
   const code=String(answer.code||answer.error||"DEMO_CONTROL_REJECTED");
   const safeError=code==="EMERGENCY_STOP_COOLDOWN"?
    "A recent Emergency Stop requires a short safety cooldown. The countdown below shows when another run can start.":
    code==="VERSION_MISMATCH"||code==="STALE_CONTROL_VERSION"?
    "The session changed in another tab. Status is refreshing; check before starting again.":
    code==="UNRESOLVED_ORDER_ACROSS_BOTS"?
    "A previous broker contract is still open or uncertain. New buys are blocked until reconciled.":
    "Demo broker control rejected the request: "+code;
   setNote(!res.ok?safeError:
    action==="stop"?"Stop confirmed. Any already-submitted contract cannot be undone.":
    "Broker Demo run accepted. Waiting for the worker to attach and verify fresh market ticks.");
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
  running?selectedActive?
    status?.run?.workerConnected?"Connected to the actual Deriv Demo broker worker. The bot is scanning or purchasing contracts.":"Start accepted. The broker worker is connecting; this is not paper trading.":
   "Another Demo run is active. Stop the active run before starting this strategy.":
  restartWait>0?"Emergency Stop safety cooldown: "+restartWait+" seconds remaining before restart.":
  !stakeOk?"Enter a positive Demo stake in USD, e.g. 1000.":
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
  <p>Stake defaults to $1,000 virtual USD but can be changed before Start. The broker may
   reject stakes that exceed the Demo account balance or contract limits.</p>
  <p>Maximum planned virtual stake exposure: <strong>{stakeOk&&countOk?("$"+(Number(stake)*total).toFixed(2)):"—"}</strong>.
   This is a worst-case planned virtual loss if every contract loses, not a prediction.</p>
  <label style={{display:"flex",gap:8,alignItems:"flex-start",margin:"12px 0"}}>
   <input type="checkbox" checked={approved} disabled={pending||running}
    onChange={e=>setApproved(e.target.checked)}/>
   <span>I authorize this selected bot to purchase <strong>Deriv virtual Demo contracts only</strong>
    at my chosen stake, for no more than my selected trade count. Real-money trading is disabled.</span>
  </label>
  <p role="status" className={selectedActive&&status?.run?.workerConnected?styles.ok:canStart?styles.ok:styles.notice} style={{margin:"12px 0"}}>
   <strong>{selectedActive?(status?.run?.workerConnected?"BROKER DEMO RUNNING":"BROKER WORKER CONNECTING"):(canStart?"READY TO START":running?"OTHER BOT ACTIVE":"START CHECK")}</strong> — {blockReason}
   {status?.code==="ADMIN_DEMO_LOGIN_REQUIRED"&&<>
    {" "}<a href="/login">Sign in to the admin account</a>.
   </>}
  </p>
  <div className={styles.controls}>
   <button className={styles.startButton} disabled={!canStart} onClick={()=>void command("start_one")}>
    Start Selected Demo Bot
   </button>
   <button className={styles.stopButton} disabled={!canStop} onClick={()=>void command("stop")}>
    Stop Active Demo Bot
   </button>
   <button disabled={pending} onClick={()=>void refresh()}>Refresh broker results</button>
  </div>
  {showResults&&<>
   <div className={styles.resultGrid} style={{marginTop:12}}>
    <div><small>BROKER WORKER</small><b>{running?(status?.run?.workerConnected?"LIVE / VERIFIED":"CONNECTING"):"STOPPED"}</b></div>
    <div><small>SETTLED CONTRACTS</small><b>{progress?.completed??0} / {status?.run?.targetTrades??0}</b></div>
    <div><small>OPEN / RECONCILING</small><b>{progress?.pending??0}</b></div>
    <div><small>ACTUAL DEMO STAKE</small><b>{"$"+Number(status?.run?.stakeAmount??0).toFixed(2)}</b></div>
    <div><small>SETTLED WINS / LOSSES</small><b>{progress?.wins??0} / {progress?.losses??0}</b></div>
    <div><small>DERIV VIRTUAL NET P/L</small><b>{"$"+(progress?.netVirtualProfit??0).toFixed(2)}</b></div>
   </div>
   {selectedActive&&status?.run?.workerConnected&&
    <p role="status" className={styles.ok}>Actual Deriv virtual-money Demo worker is active.
     {progress?.pending?" Broker contract in progress.":
      (progress?.completed??0)>0?" Waiting for the next eligible broker trade after the safety cooldown.":
       " Collecting fresh ticks and waiting for the first eligible broker signal."}
     {" "}Results refresh automatically every 8 seconds.</p>}
  </>}
  {alreadyActiveOther&&<p role="status" className={styles.notice}>A different bot is running on the connected Demo account. Use
   <strong> Stop Active Demo Bot </strong> to stop new purchases before choosing another.</p>}
  <p role="status" className={styles.notice}>{note}</p>
  <p className={styles.finePrint}>Starting does not guarantee a purchase, win or profit.
   Any unknown purchase or safety fault stops further orders. The browser may close while the worker executes.</p>
 </section>;
}