"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Bot = { id: string; name: string; market: string; description: string; risk_level: string };
type Selection = { id: string; bot_id: string; control_status: "selected" | "paused" | "stopped" };
type Config = { stake_amount: number; daily_loss_limit: number | null };
type PaperTrade = { id:string; bot_id:string; market_symbol:string; direction:string; entry_price:number; exit_price:number; stake_amount:number; pnl:number; outcome:string; opened_at:string; closed_at:string };

export default function CustomerBotCenter() {
  const [bots,setBots]=useState<Bot[]>([]);
  const [selections,setSelections]=useState<Selection[]>([]);
  const [configs,setConfigs]=useState<Record<string,Config>>({});
  const [tab,setTab]=useState<"marketplace"|"mybots"|"performance">("marketplace");
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState<string|null>(null);
  const [message,setMessage]=useState("");
  const [paperTrades,setPaperTrades]=useState<PaperTrade[]>([]);
  const [engineStatus,setEngineStatus]=useState<Record<string,string>>({});
  const [livePrices,setLivePrices]=useState<Record<string,number>>({});
  const sockets=useMemo(()=>new Map<string,WebSocket>(),[]);
  const runtimes=useMemo(()=>new Map<string,{prices:number[];open:{entry:number;direction:string;stake:number;remaining:number;openedAt:string}|null;running:boolean;loss:number;cooldown:number;trades:number;closing:boolean}>(),[]);
  const supabase=useMemo(()=>createClient(),[]);

  const load=useCallback(async()=>{
    setLoading(true); setMessage("");
    const {data:{user},error:userError}=await supabase.auth.getUser();
    if(userError||!user){window.location.href="/login";return;}
    const [b,s,c,t]=await Promise.all([
      supabase.from("bots").select("id,name,market,description,risk_level").eq("is_published",true).order("name"),
      supabase.from("customer_bots").select("id,bot_id,control_status").eq("customer_id",user.id).eq("trading_mode","demo"),
      supabase.from("customer_bot_configurations").select("bot_id,stake_amount,daily_loss_limit").eq("customer_id",user.id).eq("trading_mode","demo"),
      supabase.from("customer_paper_trades").select("id,bot_id,market_symbol,direction,entry_price,exit_price,stake_amount,pnl,outcome,opened_at,closed_at").eq("customer_id",user.id).order("closed_at",{ascending:false}).limit(100)
    ]);
    const err=b.error||s.error||c.error||t.error;
    if(err){setMessage("Could not load your Bot Center: "+err.message);setLoading(false);return;}
    const botRows=(b.data||[]) as Bot[], selectionRows=(s.data||[]) as Selection[];
    const configRows=c.data||[];
    const next:Record<string,Config>={};
    botRows.forEach(bot=>{
      const saved=configRows.find(row=>row.bot_id===bot.id);
      next[bot.id]=saved?{stake_amount:Number(saved.stake_amount),daily_loss_limit:saved.daily_loss_limit===null?null:Number(saved.daily_loss_limit)}:{stake_amount:10,daily_loss_limit:20};
    });
    setBots(botRows);setSelections(selectionRows);setConfigs(next);setPaperTrades((t.data||[]) as PaperTrade[]);setLoading(false);
  },[supabase]);

  useEffect(()=>{void load();return()=>{sockets.forEach(ws=>ws.close());sockets.clear();runtimes.clear();};},[load,sockets,runtimes]);


  function stopPaper(botId:string,reason="Paper simulation paused."){
    const runtime=runtimes.get(botId);if(runtime)runtime.running=false;
    const ws=sockets.get(botId);if(ws){ws.close();sockets.delete(botId);}
    setEngineStatus(v=>({...v,[botId]:reason}));
  }

  async function startPaper(bot:Bot){
    const selection=selections.find(s=>s.bot_id===bot.id);if(!selection||selection.control_status!=="selected"){setMessage("Mark this bot selected before starting its paper simulation.");return;}
    if(sockets.has(bot.id)){setMessage("This bot's paper feed is already running in this browser tab.");return;}
    const cfg=configs[bot.id]||{stake_amount:10,daily_loss_limit:20};
    if(cfg.stake_amount<10||cfg.stake_amount>100||!Number.isFinite(cfg.stake_amount)){setMessage("Paper stake must be between $10 and $100.");return;}
    const {data:{user}}=await supabase.auth.getUser();if(!user){window.location.href="/login";return;}
    const market=bot.market.toLowerCase().includes("synthetic")?"R_100":bot.market.toLowerCase().includes("forex")?"frxEURUSD":"R_100";
    const dayStart=new Date();dayStart.setHours(0,0,0,0);
    const {data:todayTrades,error:historyError}=await supabase.from("customer_paper_trades").select("pnl").eq("customer_id",user.id).eq("bot_id",bot.id).gte("closed_at",dayStart.toISOString());
    if(historyError){setMessage("Could not verify today's paper loss before starting: "+historyError.message);return;}
    const todayNet=(todayTrades||[]).reduce((sum,row)=>sum+Number(row.pnl||0),0);
    const initialLoss=Math.max(0,-todayNet);
    if(cfg.daily_loss_limit!==null&&initialLoss>=cfg.daily_loss_limit){setEngineStatus(v=>({...v,[bot.id]:"Daily paper loss limit already reached. No new simulation started."}));setMessage("Today's saved paper losses have already reached this bot's daily limit.");return;}
    const runtime={prices:[] as number[],open:null as {entry:number;direction:string;stake:number;remaining:number;openedAt:string}|null,running:true,loss:initialLoss,cooldown:0,trades:0,closing:false};
    runtimes.set(bot.id,runtime);setEngineStatus(v=>({...v,[bot.id]:"Connecting to public market data…"}));
    try{
      const ws=new WebSocket("wss://api.derivws.com/trading/v1/options/ws/public");sockets.set(bot.id,ws);
      ws.onopen=()=>{if(runtime.running){setEngineStatus(v=>({...v,[bot.id]:"Live paper simulation running"}));ws.send(JSON.stringify({ticks:market,subscribe:1}));}};
      ws.onmessage=async(event)=>{
        let msg:any;try{msg=JSON.parse(event.data);}catch{return;}if(msg.error){stopPaper(bot.id,"Feed error: "+msg.error.message);return;}if(msg.msg_type!=="tick"||!msg.tick)return;
        const price=Number(msg.tick.quote);if(!Number.isFinite(price)||!runtime.running||runtime.closing)return;
        setLivePrices(v=>({...v,[bot.id]:price}));runtime.prices=[...runtime.prices,price].slice(-22);
        if(runtime.open){runtime.open.remaining-=1;if(runtime.open.remaining<=0){runtime.closing=true;const completed=runtime.open;runtime.open=null;const won=completed.direction==="CALL"?price>completed.entry:price<completed.entry;const pnl=won?completed.stake:-completed.stake;const closedAt=new Date().toISOString();const trade={customer_id:user.id,bot_id:bot.id,market_symbol:market,direction:completed.direction,entry_price:completed.entry,exit_price:price,stake_amount:completed.stake,pnl,outcome:won?"WIN":"LOSS",opened_at:completed.openedAt,closed_at:closedAt};
          const {error}=await supabase.from("customer_paper_trades").insert(trade);if(error){runtime.closing=false;stopPaper(bot.id,"Could not save paper trade: "+error.message);return;}runtime.loss=Math.max(0,runtime.loss-pnl);runtime.trades+=1;runtime.cooldown=10;setPaperTrades(v=>[{id:crypto.randomUUID(),...trade},...v].slice(0,100));runtime.closing=false;
          if(cfg.daily_loss_limit!==null&&runtime.loss>=cfg.daily_loss_limit){stopPaper(bot.id,"Daily paper loss limit reached. Simulation stopped.");}else if(runtime.trades>=20){stopPaper(bot.id,"20-trade session cap reached. Simulation stopped.");}
        }}else if(runtime.cooldown>0){runtime.cooldown-=1;}else if(runtime.prices.length>=21&&runtime.trades<20){const p=runtime.prices;const ema=(arr:number[])=>arr.reduce((a,b)=>a+b,0)/arr.length;const fast=ema(p.slice(-9)),slow=ema(p.slice(-21));if(Math.abs(fast-slow)>0){runtime.open={entry:price,direction:fast>slow?"CALL":"PUT",stake:cfg.stake_amount,remaining:5,openedAt:new Date().toISOString()};}}
      };
      ws.onerror=()=>stopPaper(bot.id,"Market data connection failed.");ws.onclose=()=>{if(runtime.running){runtime.running=false;setEngineStatus(v=>({...v,[bot.id]:"Feed disconnected. Simulation stopped."}));}sockets.delete(bot.id);};
    }catch{stopPaper(bot.id,"Could not start paper feed.");}
  }

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
    if(!Number.isFinite(cfg.stake_amount)||cfg.stake_amount<10||cfg.stake_amount>100){setMessage("Paper stake must be between $10 and $100.");return;}
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
      <div className="botCenterHero"><div><span className="botCenterEyebrow">SENFX AUTOMATION WORKSPACE</span><h1>Customer <em>Bot Center</em></h1><p>Browse free strategies, configure risk limits and run isolated paper simulations.</p></div><span className="botCenterSafety">PAPER MODE · NO EXECUTION</span></div>
      <div className="botCenterNotice"><b>Safety first.</b> Paper simulations use public market prices and a simple 9/21 moving-average direction rule. They do not send orders, use account tokens, or access real or Deriv demo funds. Keep this page open while a simulation runs.</div>
      <div className="botCenterStats"><article><small>AVAILABLE BOTS</small><strong>{bots.length}</strong></article><article><small>MY BOTS</small><strong>{myBots.length}</strong></article><article><small>MARKED SELECTED</small><strong>{activeCount}</strong></article><article><small>PAUSED PREFERENCES</small><strong>{pausedCount}</strong></article></div>
      <div className="botCenterTabs" role="tablist" aria-label="Bot Center sections">
        <button className={tab==="marketplace"?"active":""} onClick={()=>setTab("marketplace")}>Free Marketplace</button>
        <button className={tab==="mybots"?"active":""} onClick={()=>setTab("mybots")}>My Bots ({myBots.length})</button>
        <button className={tab==="performance"?"active":""} onClick={()=>setTab("performance")}>Performance</button>
      </div>
      {message&&<p className="botCenterMessage" role="status">{message}</p>}
      {loading?<div className="botCenterEmpty">Loading your secure Bot Center…</div>:tab==="performance"?<section className="botCenterPerformance"><div><span className="botCenterEyebrow">PAPER PERFORMANCE</span><h2>Recorded simulation results</h2><p>These figures summarize saved paper simulations only. They are not broker statements, live trading results, or predictions of future performance.</p></div><div className="botCenterPerfGrid"><article><small>RECORDED PAPER TRADES</small><strong>{paperTrades.length}</strong></article><article><small>SIMULATED P/L</small><strong>{paperTrades.reduce((sum,t)=>sum+Number(t.pnl||0),0).toLocaleString("en-US",{style:"currency",currency:"USD"})}</strong></article><article><small>WIN RATE</small><strong>{paperTrades.length?Math.round(paperTrades.filter(t=>t.outcome==="WIN").length/paperTrades.length*100)+"%":"—"}</strong></article></div><div className="botCenterTradeHistory"><h3>Recent paper trades</h3>{paperTrades.length===0?<p>No saved paper trades yet. Start a paper simulation from My Bots.</p>:paperTrades.slice(0,20).map(t=><article key={t.id}><span><b>{t.direction}</b> · {t.market_symbol} · {new Date(t.closed_at).toLocaleString()}</span><strong>{Number(t.pnl).toLocaleString("en-US",{style:"currency",currency:"USD"})}</strong></article>)}</div></section>:<section className="botCenterGrid">{(tab==="marketplace"?bots:myBots).map(bot=>{
        const selection=selections.find(s=>s.bot_id===bot.id);
        const cfg=configs[bot.id]||{stake_amount:10,daily_loss_limit:20};
        return <article className="botCenterCard" key={bot.id}>
          <div className="botCenterCardTop"><span className="botCenterRisk">{bot.risk_level} risk</span><span className="botCenterMarket">{bot.market}</span></div>
          <h2>{bot.name}</h2><p>{bot.description||"No strategy description has been provided."}</p>
          <div className="botCenterStatus"><span>Status preference</span><b>{selection?.control_status||"Not added"}</b></div>
          {tab==="mybots"&&<div className="botCenterConfig">
            <label>Paper stake (USD)<input type="number" min="10" max="100" step="0.01" value={cfg.stake_amount} onChange={e=>setConfigs(v=>({...v,[bot.id]:{...cfg,stake_amount:e.target.value===""?0:Number(e.target.value)}}))}/></label>
            <label>Daily paper loss limit (USD)<input type="number" min="0.01" step="0.01" placeholder="No limit preference" value={cfg.daily_loss_limit??""} onChange={e=>setConfigs(v=>({...v,[bot.id]:{...cfg,daily_loss_limit:e.target.value===""?null:Number(e.target.value)}}))}/></label>
            <button className="botCenterSecondary" disabled={busy!==null} onClick={()=>void saveConfig(bot)}>Save paper settings</button>
            <button className="botCenterPrimary" disabled={busy!==null||!!sockets.has(bot.id)||selection?.control_status!=="selected"} onClick={()=>void startPaper(bot)}>Start paper simulation</button>
            <button className="botCenterSecondary" disabled={!sockets.has(bot.id)} onClick={()=>stopPaper(bot.id)}>Pause simulation</button>
            <small className="botCenterEngineStatus">{engineStatus[bot.id]||"Paper engine stopped"}{livePrices[bot.id]!==undefined?" · Live "+livePrices[bot.id]:""}</small>
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
