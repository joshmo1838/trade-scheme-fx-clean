"use client";
import {useCallback,useEffect,useState} from "react";
import styles from "./fifteen.module.css";

type Status={
 ok:boolean;mode?:string;botCount?:number;controlsEnabled?:boolean;
 brokerBuyingEnabled?:boolean;realMoneySupported?:boolean;
 message?:string;code?:string;
 run?:{
  desiredState:string;observedState:string;workerConnected:boolean;
  version:number;accountId:string;stakeAmount:number|null;appDailyLossCap:null;appDailyTradeCountCap:null;
 };
};
const API="/api/deriv/demo/bots/control";

export default function FifteenDemoBotControlPanel(){
 const [status,setStatus]=useState<Status|null>(null);
 const [busy,setBusy]=useState(false);
 const [consent,setConsent]=useState(false);
 const [stakeText,setStakeText]=useState("");
 const validStake=/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,2})?$/.test(stakeText)&&
  stakeText.length<=50&&Number.isFinite(Number(stakeText))&&Number(stakeText)>0&&
  Number.isSafeInteger(Math.round(Number(stakeText)*100));
 const [notice,setNotice]=useState("Checking verified virtual Demo bot control readiness.");
 const refresh=useCallback(async()=>{
  try{
   const response=await fetch(API,{cache:"no-store",credentials:"same-origin"});
   const json:Status=await response.json();
   setStatus(json);
   if(!response.ok)setNotice(json.code||"15-bot execution controls have not been released.");
  }catch{
   setStatus(null);setNotice("Demo bot server unavailable. New purchases are not enabled.");
  }
 },[]);
 useEffect(()=>{
  void refresh();
  const timer=setInterval(()=>void refresh(),8_000);
  return ()=>clearInterval(timer);
 },[refresh]);
 const command=async(action:"start"|"stop")=>{
  if(busy)return;
  if(action==="start"&&(!status?.controlsEnabled||!consent))return;
  setBusy(true);
  try{
   const response=await fetch(API,{
    method:"POST",credentials:"same-origin",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
     action,
     confirmVirtualDemoAutomation:action==="start"&&consent,
     stakeAmount:stakeText,
     expectedVersion:status?.run?.version??0
    })
   });
   const body=await response.json().catch(()=>({code:"INVALID_SERVER_RESPONSE"}));
   if(!response.ok){
    setNotice(String(body.code||body.error||"Could not confirm Demo bot control."));
   }else{
    setNotice(action==="stop"
     ?"Stop All confirmed by server. Previously submitted broker contracts cannot be undone."
     :"Start requested. Wait for a verified worker heartbeat and broker orders before calling bots live.");
    if(action==="start")setConsent(false);
   }
   await refresh();
  }catch{
   setNotice("Could not confirm control at the server. Treat all bots as not verified and check broker history.");
  }finally{setBusy(false);}
 };
 const running=status?.run?.workerConnected===true;
 const armed=status?.run?.desiredState==="running";
 const canStart=status?.ok&&status.controlsEnabled&&!armed&&consent&&validStake&&!busy;
 const canStop=status?.ok&&!busy&&armed;
 return <section className={styles.panel} style={{margin:"20px 0"}}>
  <p className={styles.kicker}>DERIV DEMO BROKER · ALL 15 · CONTROLLED AUTOMATION</p>
  <h2>Start All 15 / Stop All</h2>
  <p>These are genuine Deriv Demo-account controls, not paper-hit simulations.
   An automatic buy requires a verified worker lease, a fresh real broker quote, account-wide virtual risk approval and broker settlement reconciliation. The controls do not support Real accounts.</p>
  <div className={styles.resultGrid}>
   <div><small>DEMO EXECUTION</small><b>{status?.controlsEnabled?"CONFIGURED":"NOT RELEASED"}</b></div>
   <div><small>DESIRED STATE</small><b>{status?.run?.desiredState||"STOPPED"}</b></div>
   <div><small>VERIFIED WORKER</small><b>{running?"CONNECTED":"NOT CONNECTED"}</b></div>
   <div><small>ACTIVE BROKER MODE</small><b>{running&&status?.brokerBuyingEnabled?"DEMO":"NOT VERIFIED"}</b></div>
   <div><small>SELECTED VIRTUAL STAKE</small><b>{status?.run?.stakeAmount===null?"Not configured":String(status?.run?.stakeAmount??"Not configured")+" USD"}</b></div>
   <div><small>APP DAILY LOSS / TRADE CAPS</small><b>NONE</b></div>
  </div>
  <label style={{display:"block",marginTop:14,marginBottom:12}}>
   Virtual Demo stake per contract (USD)
   <input type="number" inputMode="decimal" min="0.01" step="0.01"
     placeholder="Enter your Demo stake"
     value={stakeText} disabled={busy||armed}
     onChange={e=>setStakeText(e.target.value)}/>
   <small>The stake must be a finite positive amount with up to two decimals.
    SENFX sets no financial maximum; Deriv's contract limits and your available Demo balance apply.</small>
  </label>
  <label style={{display:"flex",alignItems:"flex-start",gap:10,marginTop:14,marginBottom:12}}>
   <input type="checkbox" checked={consent} disabled={busy}
    onChange={e=>setConsent(e.target.checked)}/>
   <span>I authorize automatic purchases on my <strong>Deriv virtual Demo USD account only</strong>
    at the stake amount I selected. SENFX will impose no daily virtual-loss ceiling
    or total daily trade-count cap. Trades may use up the entire Demo balance.
    Only one unresolved broker contract is allowed at a time; Stop All and duplicate-buy
    protection remain active. <strong>Real-money trading stays disabled.</strong></span>
  </label>
  <div className={styles.controls}>
   <button className={styles.startButton} disabled={!canStart}
    onClick={()=>void command("start")}>Start All 15 Demo Bots</button>
   <button className={styles.stopButton} disabled={!canStop}
    onClick={()=>void command("stop")}>Emergency Stop All Demo Bots</button>
   <button disabled={busy} onClick={()=>void refresh()}>Refresh verification</button>
  </div>
  <p role="status" className={styles.notice}>{notice}</p>
  <p className={styles.finePrint}>A Start request alone is not evidence that trading is occurring.
   The worker must have a current lease and actual Deriv Demo buy/settlement records.
   Stop All blocks new attempts but does not reverse contracts already submitted.
   An uncertain buy is never automatically retried.</p>
 </section>;
}
