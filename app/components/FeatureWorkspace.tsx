"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type Props = { title: string; eyebrow: string; description: string; mode: "builder"|"bulk"|"manual"|"copy"|"digits"|"charts"|"scanner"|"history" };
const modules = [
  ["Free Bots","/bots"],["Bot Builder","/builder"],["Bulk Trader","/bulk-trader"],["Manual Trader","/manual-trader"],
  ["Copy Trading","/copy-trading"],["Digit Tools","/digit-tools"],["Charts","/charts"],["AI Scanner","/ai-scanner"],["Trading History","/history"]
];

export default function FeatureWorkspace({title,eyebrow,description,mode}:Props) {
  const [blocks,setBlocks]=useState<string[]>(["When a new tick arrives","Check market condition","Set trade parameters"]);
  const [stake,setStake]=useState("10");
  const [count,setCount]=useState("5");
  const [digits,setDigits]=useState("");
  const [notice,setNotice]=useState("");
  const digitSummary=useMemo(()=>digits.replace(/[^0-9]/g,"").split("").reduce((a,d)=>{if(d)a[d]=(a[d]||0)+1;return a;},{} as Record<string,number>),[digits]);
  const demoOnly="This is a workspace prototype. It does not connect to Deriv, send orders, copy trades, or provide live market signals.";
  return <main className="appShell">
    <header className="dashNav"><Link className="brand" href="/">TRADE SCHEME <span>FX</span></Link><Link className="button secondary small" href="/dashboard">Dashboard</Link></header>
    <section className="dashContent">
      <p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="muted">{description}</p>
      <div className="notice"><strong>Preview mode:</strong> {demoOnly}</div>
      <div className="actions" style={{flexWrap:"wrap"}}>{modules.map(([label,href])=><Link key={href} className="button secondary small" href={href}>{label}</Link>)}</div>
      {mode==="builder" && <div className="panel"><h2>Visual strategy builder</h2><p className="muted">Assemble a strategy from editable blocks. This prototype does not execute the strategy.</p>
        {blocks.map((b,i)=><div key={i} className="customerRow"><strong>{i+1}. {b}</strong><button className="button secondary small" onClick={()=>setBlocks(v=>v.filter((_,n)=>n!==i))}>Remove</button></div>)}
        <div className="actions"><button className="button" onClick={()=>setBlocks(v=>[...v,"New strategy condition"])}>Add condition block</button><button className="button secondary" onClick={()=>setNotice("Strategy draft is shown in this session only; server-side saving is not configured.")}>Save draft</button></div>
      </div>}
      {mode==="bulk" && <div className="panel"><h2>Bulk trade planner</h2><label className="fieldLabel">Stake per contract (USD)</label><input className="fieldInput" type="number" min="10" max="100" value={stake} onChange={e=>setStake(e.target.value)}/><label className="fieldLabel">Number of contracts</label><input className="fieldInput" type="number" min="1" max="20" value={count} onChange={e=>setCount(e.target.value)}/><p className="muted">Estimated planned exposure: ${Math.max(0,Number(stake)||0)*Math.max(0,Number(count)||0)} (illustrative only).</p><button className="button" onClick={()=>setNotice("Preview generated only. No contracts were sent.")}>Preview batch</button></div>}
      {mode==="manual" && <div className="panel"><h2>Manual trade ticket</h2><label className="fieldLabel">Market</label><select className="fieldInput"><option>Volatility 100 Index</option><option>Volatility 75 Index</option><option>Volatility 50 Index</option></select><label className="fieldLabel">Stake (USD)</label><input className="fieldInput" type="number" min="10" value={stake} onChange={e=>setStake(e.target.value)}/><div className="actions"><button className="button" disabled>Rise — Deriv connection pending</button><button className="button secondary" disabled>Fall — Deriv connection pending</button></div></div>}
      {mode==="copy" && <div className="panel"><h2>Copy trading</h2><p className="muted">No providers are connected. Provider discovery, consent, per-trade caps and emergency stop must be implemented before copying trades.</p><button className="button" disabled>Connect a provider — coming later</button></div>}
      {mode==="digits" && <div className="panel"><h2>Digit analysis tool</h2><p className="muted">Paste recent digits (0–9) to count their frequency. This is descriptive only, not a prediction.</p><label className="fieldLabel">Recent digits</label><input className="fieldInput" value={digits} onChange={e=>setDigits(e.target.value.replace(/[^0-9]/g,""))} placeholder="Example: 1234509876"/><div className="dashGrid">{Array.from({length:10},(_,i)=><article className="panel" key={i}><strong>Digit {i}</strong><h2>{digitSummary[String(i)]||0}</h2></article>)}</div></div>}
      {mode==="charts" && <div className="panel"><h2>Market charts</h2><p className="muted">Live chart feed is not connected yet. A market data provider and licensed chart integration must be configured.</p><div style={{height:180,display:"grid",placeItems:"center",border:"1px dashed var(--border, #64748b)",borderRadius:12}}>Live chart connection pending</div></div>}
      {mode==="scanner" && <div className="panel"><h2>AI market scanner</h2><p className="muted">The scanner requires a verified live market-data feed and a tested analysis model. No live signals are currently generated.</p><button className="button" disabled>Run live scan — setup pending</button></div>}
      {mode==="history" && <div className="panel"><h2>Trading history</h2><p className="muted">No verified Deriv trade history is connected. Once authorization and read-only transaction retrieval are implemented, your real records will appear here.</p><p className="eyebrow">NO CONNECTED TRADE RECORDS</p></div>}
      {notice&&<p className="notice" role="status">{notice}</p>}
      <p className="disclaimer">Trading involves risk, including the possible loss of capital. No strategy or tool guarantees profits.</p>
    </section>
  </main>;
}
