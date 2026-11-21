"use client";
import {useState} from "react";
import Link from "next/link";
import {FIFTEEN_BOTS} from "@/lib/bots/fifteen-paper-bots";
import styles from "./fifteen.module.css";

type BatchBotCheck={
 id:string;market:string;typeCheckCompleted:boolean;
 contractTypeSupported:boolean;requiredTypes:string[];supportedTypes:string[];
 durationAndStakeVerified:boolean;proxyMapping:boolean;
};
type BatchCapabilities={
 ok:boolean;checkedMarkets?:number;verifiedMarkets?:number;checkedBots?:number;
 compatibleBotTypes?:number;bots?:BatchBotCheck[];code?:string;error?:string;
};
type Capability={
 broker?:string;accountType?:string;botId?:string;market?:string;
 supported?:boolean;supportedTypes?:string[];requiredTypes?:string[];
 code?:string;error?:string;purchaseEnabled?:boolean;
};
export default function FifteenDemoBrokerReadiness() {
 const [botId,setBotId]=useState(FIFTEEN_BOTS[0].id);
 const [checking,setChecking]=useState(false);
 const [result,setResult]=useState<Capability|null>(null);
 const [allChecking,setAllChecking]=useState(false);
 const [allResults,setAllResults]=useState<BatchCapabilities|null>(null);
 const [message,setMessage]=useState("Sign into your SENFX admin account to verify each bot's real Deriv Demo contract availability.");
 const selected=FIFTEEN_BOTS.find(x=>x.id===botId)??FIFTEEN_BOTS[0];
 const checkAll=async()=>{
  if(checking||allChecking)return;
  setAllChecking(true);setAllResults(null);
  setMessage("Checking ten real Deriv Demo markets for all fifteen bot contract types. No purchases will be sent.");
  try{
   const response=await fetch("/api/deriv/demo/bots/capabilities/all",{
    credentials:"same-origin",cache:"no-store"
   });
   const data:BatchCapabilities=await response.json().catch(()=>({ok:false,code:"INVALID_SERVER_RESPONSE"}));
   if(!response.ok||!data.ok||!Array.isArray(data.bots)){
    setMessage(data.error||data.code||"Could not validate the live Deriv Demo contract types.");
    return;
   }
   setAllResults(data);
   setMessage(`Deriv Demo checked ${data.verifiedMarkets}/10 markets and found ${data.compatibleBotTypes}/15 bot contract types compatible. Duration and stake still require separate real broker proposal checks. Start and Stop are controlled by the individual Demo broker panel.`);
  }catch{
   setMessage("Deriv Demo market verification was unavailable. No broker trade was attempted.");
  }finally{
   setAllChecking(false);
  }
 };
 const check=async()=>{
  if(checking||allChecking)return;
  setChecking(true);setResult(null);
  setMessage("Checking the selected bot against your authenticated Deriv Demo broker account…");
  try{
   const response=await fetch("/api/deriv/demo/bots/capabilities?botId="+encodeURIComponent(botId),{
    credentials:"same-origin",cache:"no-store",
   });
   const data:Capability=await response.json().catch(()=>({code:"INVALID_SERVER_RESPONSE"}));
   setResult(data);
   if(!response.ok||!data.supported){
    setMessage(data.error||data.code||"This broker contract is not confirmed. No purchases enabled.");
   }else{
    setMessage("Deriv Demo confirms the contract types for this bot. This verification does not start a purchase; use Start Selected Demo Bot separately when authorized.");
   }
  }catch{
   setMessage("Could not verify Deriv Demo contract support. No order was attempted.");
  }finally{setChecking(false);}
 };
 return <section className={styles.panel} style={{margin:"20px 0"}}>
  <p className={styles.kicker}>ACTUAL DERIV DEMO CONTRACT INTEGRATION · READ-ONLY</p>
  <h2>Verify 15 bots against the Deriv Demo broker</h2>
  <p>Select an original SENFX strategy, then ask Deriv if its corresponding contract types are available for your authenticated Demo account and market. This is not a paper hit test and does not place a broker contract.</p>
  <div className={styles.inputs}>
   <label>Strategy
    <select value={botId} disabled={checking} onChange={e=>{setBotId(e.target.value);setResult(null);setMessage("Choose Verify selected bot to check the actual Deriv Demo broker.");}}>
     {FIFTEEN_BOTS.map(bot=><option key={bot.id} value={bot.id}>{bot.name} · {bot.market}</option>)}
    </select>
   </label>
   <div>
    <button className={styles.startButton} disabled={checking||allChecking} onClick={()=>void check()}>
     {checking?"Checking Deriv Demo…":"Verify selected Demo bot"}
    </button>
   </div>
  </div>
  <div className={styles.controls}>
   <button className={styles.startButton} disabled={checking||allChecking}
    onClick={()=>void checkAll()}>
    {allChecking?"Checking all 15 Demo bots…":"Verify All 15 Against Deriv Demo"}
   </button>
  </div>
  <p role="status" className={styles.notice}>{message}</p>
  {allResults?.bots&&<div className={styles.scrollTable}>
   <table>
    <thead><tr><th>Bot</th><th>Market</th><th>Contract types</th><th>Deriv Demo result</th></tr></thead>
    <tbody>{allResults.bots.map(bot=><tr key={bot.id}>
     <td>{FIFTEEN_BOTS.find(x=>x.id===bot.id)?.name||bot.id}</td>
     <td>{bot.market}</td>
     <td>{bot.requiredTypes.join(", ")}</td>
     <td>{bot.contractTypeSupported
      ?bot.proxyMapping?"TYPE SUPPORTED · DIFFERENT STRATEGY PROXY":"TYPE SUPPORTED · QUOTE NOT YET VERIFIED"
      :bot.typeCheckCompleted?"UNSUPPORTED CONTRACT TYPE":"NO BROKER RESPONSE"}</td>
    </tr>)}</tbody>
   </table>
  </div>}
  {result&&<div className={styles.resultGrid}>
   <div><small>SELECTED</small><b>{selected.name}</b></div>
   <div><small>DERIV ACCOUNT</small><b>{result.accountType==="demo"?"DEMO / VIRTUAL":"NOT VERIFIED"}</b></div>
   <div><small>MARKET</small><b>{result.market||selected.market}</b></div>
   <div><small>CONTRACT TYPES</small><b>{result.supportedTypes?.join(", ")||"NONE VERIFIED"}</b></div>
   <div><small>DEMO BROKER CAPABILITY</small><b>{result.supported?"SUPPORTED":"NOT VERIFIED"}</b></div>
   <div><small>THIS VERIFICATION</small><b>READ ONLY</b></div>
  </div>}
  <p className={styles.finePrint}>Real Deriv broker compatibility is a prerequisite—not proof that automated order execution, position reconciliation, or risk limits are ready. This verification sends no broker purchase; the separately authorized Demo broker Start control is independent. <Link href="/demo-trading">Open Deriv Demo workspace</Link>.</p>
 </section>;
}
