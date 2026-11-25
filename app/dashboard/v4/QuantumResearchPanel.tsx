'use client';
import {useEffect,useState} from 'react';
import {connectQuantumFeed} from '../../../lib/quantum/market-feed';
import {researchDecisions} from '../../../lib/quantum/decision-controller';
export default function QuantumResearchPanel(){
 const [symbol,setSymbol]=useState('R_100'),[active,setActive]=useState(false),[status,setStatus]=useState('Stopped'),[count,setCount]=useState(0),[rows,setRows]=useState<ReturnType<typeof researchDecisions>>([]);
 useEffect(()=>{setRows([]);setCount(0);if(!active){setStatus('Stopped');return;}return connectQuantumFeed(symbol,a=>{setCount(a.sampleSize);setRows(researchDecisions(symbol));},s=>{setStatus(s);if(s!=='Live research data')setRows([]);});},[symbol,active]);
 return <section style={{padding:20,background:'#101c30',color:'#e2e8f0',borderRadius:16}}><h2>Quantum research — no broker execution</h2><select value={symbol} onChange={e=>setSymbol(e.target.value)}>{['R_10','R_25','R_50','R_75','R_100'].map(s=><option key={s}>{s}</option>)}</select><button onClick={()=>setActive(v=>!v)}>{active?'Stop research':'Start research'}</button><p>{status} · {count}/300 observations</p><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:8}}>{rows.map(r=><article key={r.signal.bot} style={{padding:12,border:'1px solid #475569',borderRadius:8}}><strong>{r.signal.bot}</strong><p>Hypothesis: {r.signal.kind} {r.signal.barrier??''}</p><p>Gates: {r.gate.passed}/20 · {r.gate.decision}</p><details><summary>Validation details</summary>{r.gate.results.map(g=><div key={g.gate}>{g.gate}: {g.status}</div>)}</details></article>)}</div></section>;
}
