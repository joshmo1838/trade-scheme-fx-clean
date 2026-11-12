"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Bot = { id:string; name:string; market:string; description:string; risk_level:string; is_published:boolean };

export default function AdminBotsPage() {
  const [bots,setBots] = useState<Bot[]>([]);
  const [name,setName] = useState("");
  const [market,setMarket] = useState("Synthetic Indices");
  const [description,setDescription] = useState("");
  const [risk,setRisk] = useState("High");
  const [message,setMessage] = useState("");
  const [busy,setBusy] = useState(false);

  async function load() {
    const supabase=createClient();
    const {data,error}=await supabase.from("bots").select("*").order("created_at",{ascending:false});
    if(error) setMessage(error.message); else setBots((data||[]) as Bot[]);
  }
  useEffect(()=>{load();},[]);

  async function addBot(e:React.FormEvent) {
    e.preventDefault();setBusy(true);setMessage("");
    const supabase=createClient();
    const {error}=await supabase.from("bots").insert({name,market,description,risk_level:risk,is_published:false});
    if(error) setMessage(error.message);
    else {setName("");setDescription("");setMessage("Bot profile created as unpublished. Review it before publishing.");await load();}
    setBusy(false);
  }
  async function publish(bot:Bot) {
    const supabase=createClient();
    const {error}=await supabase.from("bots").update({is_published:!bot.is_published}).eq("id",bot.id);
    if(error) setMessage(error.message); else await load();
  }

  return <main className="appShell"><header className="dashNav"><Link className="brand" href="/">TRADE SCHEME <span>FX</span></Link><Link className="button secondary small" href="/admin">Back to admin</Link></header>
    <section className="dashContent"><p className="eyebrow">ADMIN CONTROL CENTER</p><h1>Trading bot management</h1>
      <div className="notice"><strong>Important:</strong> These controls manage the bot catalogue and customer selections only. They do not connect to Deriv or place trades.</div>
      <form className="panel botForm" onSubmit={addBot}><p className="eyebrow">ADD A BOT PROFILE</p>
        <label>Bot name<input required value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Synthetic Trend Scout"/></label>
        <label>Market<select value={market} onChange={e=>setMarket(e.target.value)}><option>Synthetic Indices</option><option>Forex</option><option>Derived Indices</option></select></label>
        <label>Risk level<select value={risk} onChange={e=>setRisk(e.target.value)}><option>Low</option><option>Medium</option><option>High</option></select></label>
        <label>Description<textarea rows={3} value={description} onChange={e=>setDescription(e.target.value)} placeholder="Describe the strategy and its limitations."/></label>
        <button className="button" disabled={busy}>{busy?"Saving...":"Add bot profile"}</button>
      </form>
      {message && <p className="notice">{message}</p>}
      <h2>Bot catalogue</h2><div className="botList">{bots.map(bot=><article className="panel botRow" key={bot.id}><div><strong>{bot.name}</strong><p className="muted">{bot.market} · {bot.risk_level} risk</p><p className="muted">{bot.description}</p><span className="statusText">{bot.is_published?"Published to customers":"Unpublished"}</span></div><button className="button small" onClick={()=>publish(bot)}>{bot.is_published?"Unpublish":"Publish"}</button></article>)}</div>
    </section></main>;
}
