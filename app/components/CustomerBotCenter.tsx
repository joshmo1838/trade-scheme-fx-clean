"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Bot = { id: string; name: string; market: string; description: string; risk_level: string };
type Selection = { id: string; bot_id: string; control_status: "selected" | "paused" | "stopped" };
type Config = { stake_amount: number; daily_loss_limit: number | null };

export default function CustomerBotCenter() {
  const [bots,setBots]=useState<Bot[]>([]);
  const [selections,setSelections]=useState<Selection[]>([]);
  const [configs,setConfigs]=useState<Record<string,Config>>({});
  const [tab,setTab]=useState<"marketplace"|"mybots"|"performance">("marketplace");
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState<string|null>(null);
  const [message,setMessage]=useState("");
  const supabase=useMemo(()=>createClient(),[]);

  const load=useCallback(async()=>{
    setLoading(true); setMessage("");
    const {data:{user},error:userError}=await supabase.auth.getUser();
    if(userError||!user){window.location.href="/login";return;}
    const [b,s,c]=await Promise.all([
      supabase.from("bots").select("id,name,market,description,risk_level").eq("is_published",true).order("name"),
      supabase.from("customer_bots").select("id,bot_id,control_status").eq("customer_id",user.id).eq("trading_mode","demo"),
      supabase.from("customer_bot_configurations").select("bot_id,stake_amount,daily_loss_limit").eq("customer_id",user.id).eq("trading_mode","demo")
    ]);
    const err=b.error||s.error||c.error;
    if(err){setMessage("Could not load your Bot Center: "+err.message);setLoading(false);return;}
    const botRows=(b.data||[]) as Bot[], selectionRows=(s.data||[]) as Selection[];
    const configRows=c.data||[];
    const next:Record<string,Config>={};
    botRows.forEach(bot=>{
      const saved=configRows.find(row=>row.bot_id===bot.id);
      next[bot.id]=saved?{stake_amount:Number(saved.stake_amount),daily_loss_limit:saved.daily_loss_limit===null?null:Number(saved.daily_loss_limit)}:{stake_amount:10,daily_loss_limit:20};
    });
    setBots(botRows);setSelections(selectionRows);setConfigs(next);setLoading(false);
  },[supabase]);

  useEffect(()=>{void load();},[load]);

  async function addBot(bot:Bot){
    if(busy)return;setBusy(bot.id);setMessage("");
    const {data:{user}}=await supabase.auth.getUser();
    if(!user){window.location.href="/login";return;}
    const {error}=await supabase.from("customer_bots").upsert({customer_id:user.id,bot_id:bot.id,trading_mode:"demo",selected:true,control_status:"selected"},{onConflict:"customer_id,bot_id,trading_mode"});
    if(error)setMessage("Could not add bot: "+error.message);else{setMessage(bot.name+" added to My Bots in paper configuration mode.");await load();}
    setBusy(null);
  }

  async function changeStatus(bot:Bot,next:Selection["control_status"]){
    if(busy)return;setBusy(bot.id);setMessage("");
    const {data:{user}}=await supabase.auth.getUser();
    if(!user){window.location.href="/login";return;}
    const existing=selections.find(s=>s.bot_id===bot.id);
    const payload={customer_id:user.id,bot_id:bot.id,trading_mode:"demo",selected:next==="selected",control_status:next};
    const result=existing
      ? await supabase.from("customer_bots").update({selected:payload.selected,control_status:next}).eq("id",existing.id).eq("customer_id",user.id)
      : await supabase.from("customer_bots").upsert(payload,{onConflict:"customer_id,bot_id,trading_mode"});
    if(result.error)setMessage("Could not update bot preference: "+result.error.message);else{setMessage(bot.name+" preference updated to "+next+". This does not start or stop a trading process.");await load();}
    setBusy(null);
  }

  async function saveConfig(bot:Bot){
    const cfg=configs[bot.id];if(!cfg||busy)return;
    if(!Number.isFinite(cfg.stake_amount)||cfg.stake_amount<1||cfg.stake_amount>100){setMessage("Paper stake must be between $1 and $100.");return;}
    if(cfg.daily_loss_limit!==null&&(!Number.isFinite(cfg.daily_loss_limit)||cfg.daily_loss_limit<=0)){setMessage("Daily paper loss limit must be above zero or left blank.");return;}
    setBusy(bot.id);setMessage("");
    const {data:{user}}=await supabase.auth.getUser();
    if(!user){window.location.href="/login";return;}
    const {error}=await supabase.from("customer_bot_configurations").upsert({customer_id:user.id,bot_id:bot.id,trading_mode:"demo",stake_amount:cfg.stake_amount,daily_loss_limit:cfg.daily_loss_limit,updated_at:new Date().toISOString()},{onConflict:"customer_id,bot_id,trading_mode"});
    if(error)setMessage("Could not save configuration: "+error.message);else setMessage(bot.name+" paper configuration saved.");
    setBusy(null);
  }

  const myBots=bots.filter(bot=>selections.some(s=>s.bot_id===bot.id));
  const activeCount=selections.filter(s=>s.control_status==="selected").length;
  const pausedCount=selections.filter(s=>s.control_status==="paused").length;

  return <main className="botCenterShell">
    <header className="botCenterTop"><Link href="/dashboard" className="botCenterBrand">TRADE SCHEME <b>FX</b></Link><nav><Link href="/dashboard">Dashboard</Link><Link href="/builder">Bot Builder</Link><Link href="/intelligence">Market Intelligence</Link></nav></header>
    <section className="botCenterContent">
      <div className="botCenterHero"><div><span className="botCenterEyebrow">SENFX AUTOMATION WORKSPACE</span><h1>Customer <em>Bot Center</em></h1><p>Browse free strategies, organize your bot preferences and prepare paper configurations.</p></div><span className="botCenterSafety">PAPER MODE · NO EXECUTION</span></div>
      <div className="botCenterNotice"><b>Safety first.</b> Adding, pausing or stopping here changes saved preferences only. There is no automated trade engine connected, no orders are sent, and no real or Deriv demo funds are used.</div>
      <div className="botCenterStats"><article><small>AVAILABLE BOTS</small><strong>{bots.length}</strong></article><article><small>MY BOTS</small><strong>{myBots.length}</strong></article><article><small>MARKED SELECTED</small><strong>{activeCount}</strong></article><article><small>PAUSED PREFERENCES</small><strong>{pausedCount}</strong></article></div>
      <div className="botCenterTabs" role="tablist" aria-label="Bot Center sections">
        <button className={tab==="marketplace"?"active":""} onClick={()=>setTab("marketplace")}>Free Marketplace</button>
        <button className={tab==="mybots"?"active":""} onClick={()=>setTab("mybots")}>My Bots ({myBots.length})</button>
        <button className={tab==="performance"?"active":""} onClick={()=>setTab("performance")}>Performance</button>
      </div>
      {message&&<p className="botCenterMessage" role="status">{message}</p>}
      {loading?<div className="botCenterEmpty">Loading your secure Bot Center…</div>:tab==="performance"?<section className="botCenterPerformance"><div><span className="botCenterEyebrow">PAPER PERFORMANCE</span><h2>Performance will appear here</h2><p>No paper trade records are available yet. We will connect this panel to the paper engine after it is built and tested. We will not display invented profit, win-rate or trade statistics.</p></div><div className="botCenterPerfGrid"><article><small>RECORDED PAPER TRADES</small><strong>—</strong></article><article><small>SIMULATED P/L</small><strong>—</strong></article><article><small>WIN RATE</small><strong>—</strong></article></div></section>:<section className="botCenterGrid">{(tab==="marketplace"?bots:myBots).map(bot=>{
        const selection=selections.find(s=>s.bot_id===bot.id);
        const cfg=configs[bot.id]||{stake_amount:10,daily_loss_limit:20};
        return <article className="botCenterCard" key={bot.id}>
          <div className="botCenterCardTop"><span className="botCenterRisk">{bot.risk_level} risk</span><span className="botCenterMarket">{bot.market}</span></div>
          <h2>{bot.name}</h2><p>{bot.description||"No strategy description has been provided."}</p>
          <div className="botCenterStatus"><span>Status preference</span><b>{selection?.control_status||"Not added"}</b></div>
          {tab==="mybots"&&<div className="botCenterConfig">
            <label>Paper stake (USD)<input type="number" min="1" max="100" step="0.01" value={cfg.stake_amount} onChange={e=>setConfigs(v=>({...v,[bot.id]:{...cfg,stake_amount:e.target.value===""?0:Number(e.target.value)}}))}/></label>
            <label>Daily paper loss limit (USD)<input type="number" min="0.01" step="0.01" placeholder="No limit preference" value={cfg.daily_loss_limit??""} onChange={e=>setConfigs(v=>({...v,[bot.id]:{...cfg,daily_loss_limit:e.target.value===""?null:Number(e.target.value)}}))}/></label>
            <button className="botCenterSecondary" disabled={busy!==null} onClick={()=>void saveConfig(bot)}>Save paper settings</button>
            {selection?.control_status==="selected"?<button className="botCenterSecondary" disabled={busy!==null} onClick={()=>void changeStatus(bot,"paused")}>Pause preference</button>:<button className="botCenterSecondary" disabled={busy!==null} onClick={()=>void changeStatus(bot,"selected")}>Mark selected</button>}
            <button className="botCenterDanger" disabled={busy!==null} onClick={()=>void changeStatus(bot,"stopped")}>Mark stopped</button>
          </div>}
          {tab==="marketplace"&&<button className="botCenterPrimary" disabled={busy!==null||!!selection} onClick={()=>void addBot(bot)}>{busy===bot.id?"Saving…":selection?"Already in My Bots":"Add to My Bots"}</button>}
        </article>;
      })}{(tab==="marketplace"?bots:myBots).length===0&&<div className="botCenterEmpty">{tab==="marketplace"?"No published bots are available yet. Check back after the administrator publishes strategies.":"You have not added any bots yet. Visit the Free Marketplace to get started."}</div>}</section>}
      <footer className="botCenterFooter"><Link href="/admin/bots">Admin bot catalogue</Link><span>Trade smarter. Stay in control. · Trading involves risk.</span></footer>
    </section>
  </main>;
}
