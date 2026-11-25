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
// Derived from the customer's example: $422.51 profit for a $500 winning stake.
// This is only a reference payout, NEVER a forecast or an execution threshold.
const exampleNetReturnPercent=422.51/500*100;
const contractGroup=(type:string)=>{
 if(type==="DIGITOVER"||type==="DIGITUNDER")return "Over / Under";
 if(type==="DIGITEVEN"||type==="DIGITODD")return "Even / Odd";
 if(type==="DIGITMATCH"||type==="DIGITDIFF")return "Matches / Differs";
 if(type==="CALL"||type==="PUT")return "Rise / Fall";
 return "Other";
};
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
export default function FifteenDemoPayoutComparison({candidates,illustrative=false}:{
 candidates:Candidate[];illustrative?:boolean;
}){
 const [stake,setStake]=useState("500");
 const [pending,setPending]=useState(false);
 const [snapshot,setSnapshot]=useState<QuoteResult|null>(null);
 const [message,setMessage]=useState("Run an on-demand read-only comparison. No broker purchase will be made.");
 const quoted=snapshot?.quotes||[];
 const highestByFamily=[...new Set(quoted.map(row=>contractGroup(row.contractType)))]
  .map(family=>({family,best:quoted.filter(row=>contractGroup(row.contractType)===family)
   .reduce<QuoteRow|null>((best,row)=>!best||row.netWinProfit>best.netWinProfit?row:best,null)}))
  .filter((row):row is {family:string;best:QuoteRow}=>row.best!==null);
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
  <p>Compare actual Deriv broker payouts for the original eligible signals across all
   15 strategies, without replacing Over/Under, Matches/Differs or Rise/Fall
   with Even/Odd. Broker quotes are the source of truth, not a promised profit.
   Higher payouts usually require lower win probabilities; we do not automatically switch contracts.</p>
  <p className={styles.finePrint}>Your example: a $500 stake returned $422.51 net on a win
   (84.50%). Use this as a comparison benchmark, not a guarantee.
   A losing $500 contract can lose the full stake.</p>
  <div className={styles.inputs}>
   <label>Equal virtual Demo stake for comparison (USD)
    <input type="number" min="0.01" step="0.01" value={stake}
     onChange={e=>setStake(e.target.value)} disabled={pending}/></label>
  </div>
  {illustrative?
   <p><strong>15 original contract mappings, illustrative price requests only.</strong>
    Static RISE and EVEN choices and the dynamic Differs barrier 7 are examples
    for quote comparison—not actual current bot signals or instructions to buy.
    Broker rejection or unavailable quotes will be reported, not substituted.</p>:
   <p>{candidates.length} of 15 strategies currently have a signal based on the
    public market samples. Missing signals will not be guessed or quoted.</p>}
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
    Ranked by winning payout only; NOT by expected profit, likelihood of winning, or a recommendation to buy.</p>
   {highestByFamily.length>0&&<section aria-label="Highest quoted winning payout by existing contract family">
    <h3>Highest verified winning payout in each existing contract family</h3>
    <ul>{highestByFamily.map(({family,best})=><li key={family}>
     <strong>{family}:</strong> {names.get(best.botId)||best.botId} ·
     {money(best.netWinProfit)} net per winning {money(best.askPrice)} stake
     ({best.returnOnStakePercent.toFixed(2)}%).
    </li>)}</ul>
    <p className={styles.finePrint}>Different bots have different signals, markets and win
     conditions. The highest-paying contract in one family must not be copied
     to another bot without validating and testing the changed strategy.</p>
   </section>}
   {(snapshot.quotes||[]).length>0&&<div className={styles.scrollTable}>
    <table>
     <thead><tr><th>Existing SENFX bot</th><th>Contract / market</th>
      <th>Stake</th><th>Winning payout</th><th>Net win</th>
      <th>Return on stake</th><th>Break-even wins</th>
      <th>Vs. example payout</th></tr></thead>
     <tbody>{(snapshot.quotes||[]).map(x=><tr key={x.botId}>
      <td>{names.get(x.botId)||x.botId}</td>
      <td>{x.contractType}{x.barrier!==null?" "+x.barrier:""} · {x.symbol}</td>
      <td>{money(x.askPrice)}</td>
      <td>{money(x.payout)}</td>
      <td>{money(x.netWinProfit)}</td>
      <td>{x.returnOnStakePercent.toFixed(2)}%</td>
      <td>{x.breakEvenWinRatePercent.toFixed(2)}%</td>
      <td>{x.returnOnStakePercent>=exampleNetReturnPercent?"Meets or exceeds":"Below"} 84.50%</td>
     </tr>)}</tbody>
    </table>
   </div>}
   {!!snapshot.skipped?.length&&<p>
    {snapshot.skipped.length} proposals were not available from the broker.
    No assumed payouts were substituted.</p>}
  </>}
  <p className={styles.finePrint}>These are informational payout comparisons. No original
   bot strategy, contract duration, market, barrier, broker purchase setting,
   or active Demo run is altered by this scan. A top quoted payout does not
   prove positive expected value.</p>
  <p className={styles.finePrint}>Break-even win rate = contract purchase price ÷
   total winning payout. This is not a forecast of the bot's actual win rate.
   Quotes use the selected Deriv virtual USD Demo account and do not buy,
   modify, pause, or restart any bot. Real-money trading stays disabled.</p>
 </section>;
}
