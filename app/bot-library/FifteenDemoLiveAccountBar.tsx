"use client";
import {useEffect,useRef,useState} from "react";
import styles from "./fifteen.module.css";

type BalanceResponse={
 ok:boolean;code?:string;accountLabel?:string;
 currency?:string;balance?:number;asOf?:string;
};
type BrokerSnapshot={
 ok:boolean;code?:string;run?:{
  desiredState:string;workerConnected:boolean;selectedBotId:string|null;
  targetTrades:number|null;
  progress?:{completed:number;pending:number;wins:number;losses:number;
   netVirtualProfit:number}|null;
 }|null;
};
const usd=(value:number)=>new Intl.NumberFormat("en-US",{
 style:"currency",currency:"USD",minimumFractionDigits:2,maximumFractionDigits:2
}).format(value);

/** True connected Deriv Demo balance + broker-settled wins and losses. */
export default function FifteenDemoLiveAccountBar(){
 const [balance,setBalance]=useState<BalanceResponse|null>(null);
 const [broker,setBroker]=useState<BrokerSnapshot|null>(null);
 const [balanceError,setBalanceError]=useState("");
 const [brokerError,setBrokerError]=useState("");
 const [refreshRequest,setRefreshRequest]=useState(0);
 const [updatedAt,setUpdatedAt]=useState("");
 const baseline=useRef<{label:string;balance:number}|null>(null);
 useEffect(()=>{
  let mounted=true,inFlight=false;
  const update=async()=>{
   if(inFlight)return;
   inFlight=true;
   try{
    const [balanceResult,runResult]=await Promise.allSettled([
     fetch("/api/deriv/demo/account-balance",{
      credentials:"same-origin",cache:"no-store"
     }).then(async response=>({response,payload:await response.json() as BalanceResponse})),
     fetch("/api/deriv/demo/bots/control",{
      credentials:"same-origin",cache:"no-store"
     }).then(async response=>({response,payload:await response.json() as BrokerSnapshot}))
    ]);
    if(!mounted)return;
    if(balanceResult.status==="fulfilled"&&balanceResult.value.response.ok&&
       balanceResult.value.payload.ok&&
       typeof balanceResult.value.payload.balance==="number"&&
       Number.isFinite(balanceResult.value.payload.balance)){
     const next=balanceResult.value.payload;
     if(!baseline.current||baseline.current.label!==next.accountLabel)
      baseline.current={label:next.accountLabel??"Deriv virtual Demo",balance:next.balance!};
     setBalance(next);setBalanceError("");
     setUpdatedAt(next.asOf??"");
    }else{
     const code=balanceResult.status==="fulfilled"?
      balanceResult.value.payload.code:"NETWORK_UNAVAILABLE";
     setBalanceError(code==="AUTH_REQUIRED"||code==="ADMIN_DEMO_LOGIN_REQUIRED"?
      "Sign in to the SENFX admin Demo account.":"Deriv account balance is unavailable; retrying.");
    }
    if(runResult.status==="fulfilled"&&runResult.value.response.ok&&runResult.value.payload.ok){
     setBroker(runResult.value.payload);
     setBrokerError("");
    }else{
     setBrokerError("Broker win/loss results temporarily unavailable.");
    }
   }finally{inFlight=false;}
  };
  void update();
  const timer=setInterval(()=>void update(),6000);
  return()=>{mounted=false;clearInterval(timer);};
 },[refreshRequest]);
 const currentBalance=balance?.balance;
 const diff=currentBalance!==undefined&&baseline.current?
  currentBalance-baseline.current.balance:null;
 const progress=broker?.run?.progress;
 const live=broker?.run?.desiredState==="running"&&broker.run.workerConnected;
 const session=broker?.run?.desiredState==="running"?"Active broker session":"Last selected broker session";
 return <section className={styles.balanceBar} aria-label="Live Deriv virtual Demo account overview">
  <div className={styles.balanceBarTop}>
   <div>
    <p className={styles.kicker}>DERIV BROKER · VIRTUAL DEMO ACCOUNT</p>
    <strong>{balance?.accountLabel??"Connected Deriv Demo account"}</strong>
    <span className={styles.balanceRefreshStatus}>
     {balanceError||"Live Deriv account balance • refreshes every 6 seconds"}
     {updatedAt?" · updated "+new Date(updatedAt).toLocaleTimeString():""}
    </span>
   </div>
   <div className={styles.balanceStatusActions}>
    <span className={live?styles.balanceLive:styles.balanceIdle}>
     {live?"Broker trading active":broker?.run?.desiredState==="running"?
      "Waiting for worker":"Demo trading stopped"}
    </span>
    <button type="button" onClick={()=>setRefreshRequest(x=>x+1)}>Refresh now</button>
   </div>
  </div>
  <div className={styles.balanceMetricGrid} aria-live="polite">
   <div className={styles.balanceMetricPrimary}>
    <span>ACTUAL DERIV DEMO BALANCE</span>
    <strong>{currentBalance===undefined?"—":usd(currentBalance)}</strong>
    {diff!==null&&<small className={diff>0?styles.balancePositive:diff<0?styles.balanceNegative:styles.balanceNeutral}>
     {diff>0?"▲ +":diff<0?"▼ ":""}{usd(diff)} since this page opened
    </small>}
   </div>
   <div className={styles.balanceMetricHit}>
    <span>HITS / WINS</span>
    <strong>{progress?progress.wins:"—"}</strong>
    <small>Deriv-settled winning contracts</small>
   </div>
   <div className={styles.balanceMetricLoss}>
    <span>LOSSES</span>
    <strong>{progress?progress.losses:"—"}</strong>
    <small>Deriv-settled losing contracts</small>
   </div>
   <div className={styles.balanceMetricProfit}>
    <span>SETTLED DEMO PROFIT / LOSS</span>
    <strong>{progress?usd(progress.netVirtualProfit):"—"}</strong>
    <small>{progress?String(progress.completed)+" settled • "+String(progress.pending??0)+" open/reconciling":
     "Awaiting verified contract results"}</small>
   </div>
  </div>
  <p className={styles.balanceDisclaimer}>
   {session} · Wins and losses are for the selected bot run, not hypothetical predictions.
   The balance comes from Deriv and may update after contract settlement.
   {brokerError?" "+brokerError:""} Real-money accounts are not supported.
  </p>
 </section>;
}
