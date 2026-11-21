"use client";
import {useState} from "react";
import styles from "./fifteen.module.css";

type Candidate={botId:string;prediction:string;barrier?:number};
type QuoteRow={
 botId:string;symbol:string;contractType:string;barrier:string|null;
 stake:number;askPrice:number;payout:number;netWinProfit:number;
 returnOnStakePercent:number;breakEvenWinRatePercent:number;
};
type QuoteResult={
 ok:boolean;code?:string;error?:string;asOf?:string;
 requested?:number;quoted?:number;quotes?:QuoteRow[];
 skipped?:{botId:string;code:string}[];
 brokerOrdersPlaced?:number;realMoneySupported?:boolean;
};
const money=(n:number)=>new Intl.NumberFormat("en-US",{
 style:"currency",currency:"USD",minimumFractionDigits:2,maximumFractionDigits:2
}).format(n);
const names=new Map<string,string>([
 ["digit-over-4","SENFX Digit Over"],["digit-under-5","SENFX Digit Under"],
 ["parity-even","SENFX Parity EVEN"],["parity-odd","SENFX Parity ODD"],
 ["digit-matches","SENFX Digit Matches"],["digit-differs","SENFX Digit Differs"],
 ["trend-rise-fall","SENFX Rise/Fall Trend"],
 ["breakout-higher-lower","SENFX Breakout Rise/Fall"],
 ["recovery-audit","SENFX Recovery Risk Audit"],
 ["stepwise-audit","SENFX Stepwise Risk Audit"],
 ["adaptive-over","SENFX Adaptive Digit Radar"],
 ["entropy-parity","SENFX Even/Odd Analyzer"],
 ["pattern-differs","SENFX Matches/Differs Radar"],
 ["momentum-rise-fall","SENFX Momentum Rise/Fall"],
 ["volatility-scalper","SENFX Volatility Scalper"]
]);
export default function FifteenDemoPayoutComparison({candidates}:{
 candidates:Candidate[];
}){
 const [stake,setStake]=useState("25");
 const [pending,setPending]=useState(false);
 const [snapshot,setSnapshot]=useState<QuoteResult|null>(null);
 const [message,setMessage]=useState("Run an on-demand read-only comparison. No broker purchase will be made.");
 const stakeOk=/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,2})?$/.test(stake)&&
  Number.isFinite(Number(stake))&&Number(stake)>0&&
  Number.isSafeInteger(Math.round(Number(stake)*100));
 const compare=async()=>{
  if(pending||!stakeOk||candidates.length===0)return;
  setPending(true);setSnapshot(null);
  try{
   const res=await fetch("/api/deriv/demo/bots/payout-preview",{
    method:"POST",credentials:"same-origin",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
     stakeAmount:stake,candidates:candidates.slice(0,15)
    }),cache:"no-store"
   });
   const body:QuoteResult=await res.json();
   if(!res.ok||!body.ok){
    setMessage(body.code==="AUTH_REQUIRED"||body.code==="ADMIN_DEMO_LOGIN_REQUIRED"?
     "Sign in with your authorized SENFX Demo admin account to compare live broker quotes.":
     "Could not retrieve Deriv Demo quotes: "+(body.code||"UNAVAILABLE"));
    return;
   }
   setSnapshot(body);
   setMessage("Live Deriv virtual Demo proposals retrieved. These prices may expire quickly. No orders were submitted.");
  }catch{setMessage("Broker price comparison unavailable. Your active trading session was not changed.");}
  finally{setPending(false);}
 };
 return <section className={styles.panel} aria-label="Read-only Deriv payout comparison">
  <p className={styles.kicker}>READ-ONLY · EXISTING SENFX STRATEGIES UNCHANGED</p>
  <h2>Compare actual Deriv Demo payouts</h2>
  <p>This compares the original broker contracts for currently eligible signals
   across your 15 bots. The winning amount is <strong>not</strong> a prediction.
   Higher payouts usually require lower win probabilities; we do not automatically switch contracts.</p>
  <div className={styles.inputs}>
   <label>Equal virtual Demo stake for comparison (USD)
    <input type="number" min="0.01" step="0.01" value={stake}
     onChange={e=>setStake(e.target.value)} disabled={pending}/></label>
  </div>
  <p>{candidates.length} of 15 strategies currently have a signal based on the
   public market samples. Missing signals will not be guessed or quoted.</p>
  <div className={styles.controls}>
   <button type="button" className={styles.startButton}
    onClick={()=>void compare()} disabled={pending||!stakeOk||candidates.length===0}>
    {pending?"Checking live Demo quotes…":"Compare current payouts"}
   </button>
  </div>
  <p role="status" className={styles.notice}>{message}</p>
  {snapshot?.ok&&<>
   <p><strong>{snapshot.quoted??0}/{snapshot.requested??0} broker quotes received</strong>
    {snapshot.asOf?" · "+new Date(snapshot.asOf).toLocaleTimeString():""}.
    Highest return shown first; not a recommendation to buy.</p>
   {(snapshot.quotes||[]).length>0&&<div className={styles.scrollTable}>
    <table>
     <thead><tr><th>Existing SENFX bot</th><th>Contract / market</th>
      <th>Stake</th><th>Winning payout</th><th>Net win</th>
      <th>Return on stake</th><th>Break-even wins</th></tr></thead>
     <tbody>{(snapshot.quotes||[]).map(x=><tr key={x.botId}>
      <td>{names.get(x.botId)||x.botId}</td>
      <td>{x.contractType}{x.barrier!==null?" "+x.barrier:""} · {x.symbol}</td>
      <td>{money(x.askPrice)}</td>
      <td>{money(x.payout)}</td>
      <td>{money(x.netWinProfit)}</td>
      <td>{x.returnOnStakePercent.toFixed(2)}%</td>
      <td>{x.breakEvenWinRatePercent.toFixed(2)}%</td>
     </tr>)}</tbody>
    </table>
   </div>}
   {!!snapshot.skipped?.length&&<p>
    {snapshot.skipped.length} proposals were not available from the broker.
    No assumed payouts were substituted.</p>}
  </>}
  <p className={styles.finePrint}>Break-even win rate = contract purchase price ÷
   total winning payout. This is not a forecast of the bot's actual win rate.
   Quotes use the selected Deriv virtual USD Demo account and do not buy,
   modify, pause, or restart any bot. Real-money trading stays disabled.</p>
 </section>;
}
