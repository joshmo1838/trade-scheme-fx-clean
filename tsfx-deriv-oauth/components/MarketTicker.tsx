"use client";
import { useEffect, useState } from "react";
type Quote={symbol:string;price:number|null;change:number|null;source:string};
const fallback:Quote[]=["EUR/USD","GBP/USD","USD/JPY","AUD/USD","XAU/USD","XAG/USD"].map(symbol=>({symbol,price:null,change:null,source:"Awaiting feed"}));
function price(q:Quote){return q.price===null?"CONNECT DATA":q.price.toLocaleString("en-US",{maximumFractionDigits:q.symbol.includes("JPY")?3:5});}
export default function MarketTicker(){
 const [quotes,setQuotes]=useState<Quote[]>(fallback); const [live,setLive]=useState(false);
 useEffect(()=>{let active=true;const load=async()=>{try{const r=await fetch("/api/markets",{cache:"no-store"});const d=await r.json();if(active&&Array.isArray(d.quotes)){setQuotes(d.quotes);setLive(Boolean(d.live));}}catch{if(active)setLive(false);}};load();const t=window.setInterval(load,60000);return()=>{active=false;window.clearInterval(t);};},[]);
 return <div className="marketTicker" aria-label="Market prices ticker"><div className="tickerHead"><span className="tickerDot"/> MARKET WATCH</div><div className="tickerViewport"><div className="tickerTrack">{[...quotes,...quotes].map((q,i)=><div className="tickerItem" key={q.symbol+i}><strong>{q.symbol}</strong><span className="tickerPrice">{price(q)}</span><span className={q.change===null?"tickerChange neutral":q.change>=0?"tickerChange up":"tickerChange down"}>{q.change===null?(live?"—":"FEED OFF"):`${q.change>=0?"+":""}${q.change.toFixed(2)}%`}</span></div>)}</div></div><a className="tickerMore" href="/markets">MARKETS ↗</a></div>;
}
