"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Bot={id:string;name:string;market:string;description:string;risk_level:string};
type Selection={id:string;bot_id:string;control_status:"stopped"|"paused"|"selected"};

export default function CustomerBotsPage(){
  const [bots,setBots]=useState<Bot[]>([]);
  const [selections,setSelections]=useState<Selection[]>([]);
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState<string|null>(null);

  async function load(){
    const supabase=createClient();
    const {data:{user}}=await supabase.auth.getUser();
    if(!user){window.location.href="/login";return;}
    const [{data:b,error:be},{data:s,error:se}]=await Promise.all([
      supabase.from("bots").select("id,name,market,description,risk_level").eq("is_published",true),
      supabase.from("customer_bots").select("id,bot_id,control_status").eq("customer_id",user.id)
    ]);
    if(be||se){setMessage(be?.message||se?.message||"Unable to load bots.");return;}
    setBots((b||[]) as Bot[]);setSelections((s||[]) as Selection[]);
  }
  useEffect(()=>{load();},[]);

  async function choose(bot:Bot){
    setBusy(bot.id);setMessage("");
    const supabase=createClient();const {data:{user}}=await supabase.auth.getUser();
    if(!user){window.location.href="/login";return;}
    const existing=selections.find(s=>s.bot_id===bot.id);
    let error;
    if(!existing){
      ({error}=await supabase.from("customer_bots").insert({customer_id:user.id,bot_id:bot.id,selected:true,control_status:"selected"}));
    }else{
      const next=existing.control_status==="selected"?"paused":existing.control_status==="paused"?"stopped":"selected";
      ({error}=await supabase.from("customer_bots").update({selected:next==="selected",control_status:next}).eq("id",existing.id));
    }
    if(error)setMessage(error.message);else await load();
    setBusy(null);
  }

  return <main className="appShell"><header className="dashNav"><Link className="brand" href="/">TRADE SCHEME <span>FX</span></Link><Link className="button secondary small" href="/dashboard">Customer dashboard</Link></header>
    <section className="dashContent"><p className="eyebrow">YOUR BOT WORKSPACE</p><h1>Trading bots</h1>
      <div className="notice"><strong>Demo controls only:</strong> Selecting, pausing, or stopping a bot here does not start or stop live trades. Deriv authorization and a tested execution service must be added first.</div>
      {message&&<p className="notice">{message}</p>}
      {bots.length===0?<div className="panel"><p className="muted">No bots are published yet. Check back when the platform administrator publishes a bot.</p></div>:
      <div className="botList">{bots.map(bot=>{const selected=selections.find(s=>s.bot_id===bot.id);const status=selected?.control_status||"not selected";return <article className="panel botRow" key={bot.id}><div><strong>{bot.name}</strong><p className="muted">{bot.market} · {bot.risk_level} risk</p><p className="muted">{bot.description}</p><span className="statusText">Your setting: {status}</span></div><button className="button small" disabled={busy===bot.id} onClick={()=>choose(bot)}>{busy===bot.id?"Saving...":!selected?"Select bot":status==="selected"?"Pause bot":status==="paused"?"Stop bot":"Select again"}</button></article>})}</div>}
    </section></main>;
}
