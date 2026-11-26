"use client";

import {useEffect, useState} from "react";

type TradeDraft = {
  stake: string;
  stopLoss: string;
  takeProfit: string;
};

const EMPTY: TradeDraft = {stake: "", stopLoss: "", takeProfit: ""};
const fields: {key: keyof TradeDraft; label: string; hint: string; min: number}[] = [
  {key: "stake", label: "Stake per trade (USD)", hint: "A draft stake, not an order amount.", min: 0.35},
  {key: "stopLoss", label: "Session stop loss (USD)", hint: "Draft session loss threshold; not an enforced stop.", min: 0.01},
  {key: "takeProfit", label: "Session take profit (USD)", hint: "Draft session profit target; not an enforced exit.", min: 0.01},
];

function validAmount(value: string, min: number) {
  const number = Number(value);
  return value.trim() !== "" && Number.isFinite(number) && number >= min && number <= 100000000;
}

export default function NativeDerivTradeSettings({botId}: {botId: string | null}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<TradeDraft>(EMPTY);
  const [status, setStatus] = useState("");

  useEffect(() => {
    setDraft({...EMPTY});
    setStatus("");
    if (!botId) return;
    try {
      const stored = window.localStorage.getItem(`tsfx-dbot-trade-draft-v1:${botId}`);
      if (!stored) return;
      const parsed: unknown = JSON.parse(stored);
      if (!parsed || typeof parsed !== "object") return;
      const record = parsed as Partial<TradeDraft>;
      setDraft({
        stake: typeof record.stake === "string" ? record.stake : "",
        stopLoss: typeof record.stopLoss === "string" ? record.stopLoss : "",
        takeProfit: typeof record.takeProfit === "string" ? record.takeProfit : "",
      });
      setStatus("Saved draft loaded on this device. Not applied to any broker.");
    } catch {
      setStatus("Could not read the saved draft from this browser.");
    }
  }, [botId]);

  function saveDraft() {
    if (!botId) {
      setStatus("Open a specific bot from the bot catalog first.");
      return;
    }
    const invalid = fields.find(field => !validAmount(draft[field.key], field.min));
    if (invalid) {
      setStatus(`Enter a valid ${invalid.label.toLowerCase()} before saving.`);
      return;
    }
    try {
      window.localStorage.setItem(`tsfx-dbot-trade-draft-v1:${botId}`, JSON.stringify(draft));
      setStatus("Draft saved for this bot on this device. No trades or risk orders were changed.");
    } catch {
      setStatus("This browser could not save the draft. No trading settings were changed.");
    }
  }

  return <div style={{position:"fixed", zIndex:20, right:12, bottom:12, fontFamily:"Arial, sans-serif", color:"#eaf7ff"}}>
    {open && <section id="native-dbot-trade-settings" aria-label="Bot trade settings" style={{
      width:"min(350px, calc(100vw - 24px))", maxHeight:"min(70dvh, 580px)", overflowY:"auto",
      padding:16, marginBottom:10, borderRadius:14, background:"#101b30",
      border:"1px solid #22d3ee", boxShadow:"0 12px 45px #0009", boxSizing:"border-box"
    }}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"start", gap:8}}>
        <div><strong style={{fontSize:18}}>Stake · Stop Loss · Take Profit</strong>
          <p style={{fontSize:12, color:"#a9c3d3", margin:"6px 0 12px"}}>
            {botId ? `Bot: ${botId}` : "Select a bot from the catalog to save individual settings."}
          </p>
        </div>
        <button type="button" onClick={()=>setOpen(false)} aria-label="Close trade settings"
          style={{background:"transparent", color:"#eaf7ff", border:0, fontSize:22, cursor:"pointer"}}>×</button>
      </div>
      {fields.map(field=><div key={field.key} style={{marginBottom:12}}>
        <label htmlFor={`native-dbot-${field.key}`} style={{display:"block", fontWeight:700, marginBottom:5, fontSize:13}}>
          {field.label}
        </label>
        <input id={`native-dbot-${field.key}`} type="number" inputMode="decimal"
          min={field.min} step="0.01" value={draft[field.key]} placeholder="Enter amount"
          onChange={e=>{setDraft(current=>({...current,[field.key]:e.target.value}));setStatus("Unsaved changes");}}
          disabled={!botId}
          style={{boxSizing:"border-box", width:"100%", padding:"10px 12px", borderRadius:7,
            border:"1px solid #59738d", color:"#0c1527", background:"white", fontSize:16}}/>
        <small style={{display:"block", color:"#adc3d6", marginTop:4}}>{field.hint}</small>
      </div>)}
      <button type="button" onClick={saveDraft} disabled={!botId}
        style={{width:"100%", padding:11, borderRadius:8, border:0, cursor:botId?"pointer":"not-allowed",
          background:botId?"#22d3ee":"#6c7b89", color:"#09202c", fontWeight:700}}>Save draft for this bot</button>
      <p role="status" style={{fontSize:12, color:"#a9f2f3", minHeight:16}}>{status}</p>
      <p style={{fontSize:12, color:"#ffd7a3", lineHeight:1.5, marginBottom:0}}>
        Research configuration only. These values stay in this browser and are NOT connected to Deriv,
        monitored, or enforced. No purchases or live trading are enabled. Existing strategy rules remain unchanged.
      </p>
    </section>}
    <button type="button" onClick={()=>setOpen(value=>!value)}
      aria-expanded={open} aria-controls="native-dbot-trade-settings"
      style={{maxWidth:"calc(100vw - 24px)", padding:"12px 16px", borderRadius:30,
        border:"1px solid #56e6f5", background:"#0f2339", color:"#eaf7ff", fontWeight:700,
        boxShadow:"0 5px 20px #0006", cursor:"pointer", fontSize:13}}>
      {open ? "Close trade settings" : "Trade settings: Stake · Stop Loss · Profit"}
    </button>
  </div>;
}
