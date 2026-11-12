"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Settings = { trading_mode: "demo" | "real"; stake_amount: number; daily_loss_limit: number | null };

export default function BotSettingsPage() {
  const [settings, setSettings] = useState<Settings>({ trading_mode: "demo", stake_amount: 10, daily_loss_limit: 20 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/login"; return; }
      const { data, error } = await supabase.from("customer_bot_settings").select("trading_mode,stake_amount,daily_loss_limit").eq("customer_id", user.id).maybeSingle();
      if (data) setSettings({ trading_mode: data.trading_mode, stake_amount: Number(data.stake_amount), daily_loss_limit: data.daily_loss_limit === null ? null : Number(data.daily_loss_limit) });
      if (error && !error.message.toLowerCase().includes("0 rows")) setMessage(error.message);
      setLoading(false);
    })();
  }, []);

  const min = 10;
  const max = settings.trading_mode === "demo" ? 100 : Number.POSITIVE_INFINITY;
  const validStake = Number.isFinite(settings.stake_amount) && settings.stake_amount >= min && settings.stake_amount <= max;

  async function save() {
    setMessage("");
    if (!validStake) { setMessage(settings.trading_mode === "demo" ? "Demo stake must be between $10 and $100." : "Real-account stake must be at least $10."); return; }
    if (settings.daily_loss_limit !== null && (!Number.isFinite(settings.daily_loss_limit) || settings.daily_loss_limit <= 0)) { setMessage("Daily loss limit must be greater than $0 or left blank."); return; }
    setSaving(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.location.href = "/login"; return; }
    const { error } = await supabase.from("customer_bot_settings").upsert({ customer_id: user.id, trading_mode: settings.trading_mode, stake_amount: settings.stake_amount, daily_loss_limit: settings.daily_loss_limit }, { onConflict: "customer_id" });
    setMessage(error ? error.message : "Your preferences have been saved.");
    setSaving(false);
  }

  return <main className="appShell"><header className="dashNav"><Link className="brand" href="/">TRADE SCHEME <span>FX</span></Link><Link className="button secondary small" href="/dashboard">Customer dashboard</Link></header>
    <section className="dashContent"><p className="eyebrow">CUSTOMER PREFERENCES</p><h1>Bot settings</h1>
      <div className="notice"><strong>Settings only:</strong> These preferences are saved to your profile but do not place trades. Live Deriv execution is not connected yet.</div>
      {loading ? <div className="panel">Loading your settings…</div> : <div className="panel" style={{maxWidth:680}}>
        <label className="fieldLabel" htmlFor="trading-mode">Trading mode</label>
        <select id="trading-mode" className="fieldInput" value={settings.trading_mode} onChange={e => setSettings(s => ({...s, trading_mode: e.target.value as "demo" | "real", stake_amount: e.target.value === "demo" ? Math.min(100, Math.max(10, s.stake_amount)) : Math.max(10, s.stake_amount)}))}>
          <option value="demo">Demo — virtual funds</option><option value="real">Real — your Deriv funds</option>
        </select>
        {settings.trading_mode === "demo" && <p className="muted">Demo starting balance: $100 virtual. It is not withdrawable and is not a real Deriv balance.</p>}
        <label className="fieldLabel" htmlFor="stake">Stake per trade (USD)</label>
        <input id="stake" className="fieldInput" type="number" min="10" max={settings.trading_mode === "demo" ? 100 : undefined} step="0.01" value={settings.stake_amount} onChange={e => setSettings(s => ({...s, stake_amount: Number(e.target.value)}))}/>
        <p className="muted">{settings.trading_mode === "demo" ? "Demo stake range: $10–$100." : "Real stake minimum: $10. No additional platform maximum; Deriv contract rules and available balance still apply."}</p>
        <label className="fieldLabel" htmlFor="loss-limit">Daily loss limit (USD, optional)</label>
        <input id="loss-limit" className="fieldInput" type="number" min="0.01" step="0.01" placeholder="Leave blank for no preference" value={settings.daily_loss_limit ?? ""} onChange={e => setSettings(s => ({...s, daily_loss_limit: e.target.value === "" ? null : Number(e.target.value)}))}/>
        <p className="muted">This is a saved preference only. It will become an enforced stop condition only after the trading engine is built and tested.</p>
        <button className="button" disabled={saving || !validStake} onClick={save}>{saving ? "Saving…" : "Save settings"}</button>
        {message && <p className="notice" role="status">{message}</p>}
      </div>}
      <p className="disclaimer">Trading involves risk, including the possible loss of capital. Never stake money you cannot afford to lose.</p>
    </section></main>;
}
