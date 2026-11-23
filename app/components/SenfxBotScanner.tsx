"use client";
import { useEffect, useMemo, useState } from "react";
type Bot={id:string;name:string;market:string};
type Props={bots:Bot[];prices:Record<string,number>};
type Event={id:string;botId:string;digit:number;quote:number;time:string};
export default function SenfxBotScanner({bots,prices}:Props){
 const [selected,setSelected]=useState("");
 const [running,setRunning]=useState(false);
 const [stopped,setStopped]=useState(false);
 const [depth,setDepth]=useState(300);
 const [events,setEvents]=useState<Event[]>([]);
 const [previous,setPrevious]=useState<Record<string,number>>({});
 const available=useMemo(()=>bots.slice(0,15),[bots]);
 const active=available.find(b=>b.id===selected)||available[0];
 useEffect(()=>{
  if(!running||stopped)return;
  const next={...previous};const additions:Event[]=[];
  for(const bot of available){
   const quote=prices[bot.id];
   if(!Number.isFinite(quote)||quote<=0||quote===next[bot.id])continue;
   next[bot.id]=quote;
   const digit=Number(String(quote).replace(/\D/g,"").slice(-1));
   if(!Number.isInteger(digit))continue;
   additions.push({id:bot.id+":"+Date.now()+":"+quote,botId:bot.id,digit,quote,time:new Date().toLocaleTimeString()});
  }
  if(additions.length){setPrevious(next);setEvents(old=>[...additions,...old].slice(0,300));}
 },[available,prices,running,stopped,previous]);
 const recent=events.filter(e=>e.botId===active?.id).slice(0,depth);
 const counts=Array.from({length:10},(_,d)=>recent.filter(e=>e.digit===d).length);
 return <section aria-label="SENFX bot research scanner" style={{background:"#101827",color:"#fff",border:"1px solid #475569",borderRadius:16,padding:18,margin:"16px 0"}}>
 <h2>AI Entry Scanner · Existing Bot Research</h2>
 <p>Read-only research for up to 15 published bots. Their strategies and order execution are unchanged. No broker orders are placed by this panel.</p>
 <label>Bot <select value={active?.id||""} onChange={e=>setSelected(e.target.value)}>{available.map(b=><option key={b.id} value={b.id}>{b.name} · {b.market}</option>)}</select></label>{" "}
 <label>Scan depth <select value={depth} onChange={e=>setDepth(Number(e.target.value))}><option value={100}>100</option><option value={200}>200</option><option value={300}>300</option></select></label>
 <div style={{display:"flex",gap:8,flexWrap:"wrap",margin:"12px 0"}}>
 <button type="button" onClick={()=>{setStopped(false);setRunning(true);}}>Start research</button>
 <button type="button" onClick={()=>setRunning(false)}>Pause</button>
 <button type="button" onClick={()=>{setStopped(true);setRunning(false);}}>Emergency stop research</button>
 </div>
 <p role="status">{stopped?"STOPPED":running?"RESEARCH ACTIVE":"PAUSED"} · {available.length} bots available · {recent.length}/{depth} observed quote changes</p>
 <p>Current quote: {active&&Number.isFinite(prices[active.id])?prices[active.id]:"Waiting for data"}</p>
 <h3>Last-digit distribution (observed quotes)</h3>
 <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>{counts.map((n,d)=><span key={d} style={{border:"1px solid #64748b",padding:8,borderRadius:6}}>{d}: {n}</span>)}</div>
 <h3>Recent observations</h3><div style={{maxHeight:240,overflow:"auto"}}><table style={{width:"100%"}}><thead><tr><th>Time</th><th>Quote</th><th>Digit</th><th>Decision</th></tr></thead><tbody>{recent.slice(0,20).map(e=><tr key={e.id}><td>{e.time}</td><td>{e.quote}</td><td>{e.digit}</td><td>WAIT · unverified signal</td></tr>)}</tbody></table></div>
 <small>Quote changes are not verified individual Deriv ticks. No 75/100 research score, entry probability, Over/Under recovery, or Martingale is asserted without validated tick history and testing.</small>
 </section>;
}