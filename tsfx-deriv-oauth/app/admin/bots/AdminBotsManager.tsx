"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Bot = {
  id: string;
  name: string;
  market: string;
  description: string;
  risk_level: "Low" | "Medium" | "High";
  is_published: boolean;
  created_at?: string;
};

const emptyForm = { name: "", market: "Synthetic Indices", description: "", risk_level: "Medium" as Bot["risk_level"] };

export default function AdminBotsManager() {
  const [bots, setBots] = useState<Bot[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  async function loadBots() {
    setLoading(true);
    const { data, error } = await supabase.from("bots").select("id,name,market,description,risk_level,is_published,created_at").order("created_at", { ascending: false });
    if (error) setMessage(`Could not load bots: ${error.message}`);
    else setBots((data ?? []) as Bot[]);
    setLoading(false);
  }
  useEffect(() => { void loadBots(); }, []);

  function startEdit(bot: Bot) {
    setEditingId(bot.id);
    setForm({ name: bot.name, market: bot.market, description: bot.description ?? "", risk_level: bot.risk_level });
    setMessage("Editing bot profile. Save your changes when finished.");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function resetForm() { setEditingId(null); setForm(emptyForm); }

  async function saveBot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    const payload = { name: form.name.trim(), market: form.market, description: form.description.trim(), risk_level: form.risk_level };
    const result = editingId
      ? await supabase.from("bots").update(payload).eq("id", editingId)
      : await supabase.from("bots").insert({ ...payload, is_published: false });
    if (result.error) setMessage(`Save failed: ${result.error.message}`);
    else { setMessage(editingId ? "Bot profile updated." : "Bot profile created as unpublished. Review it before publishing."); resetForm(); await loadBots(); }
    setBusy(false);
  }

  async function togglePublish(bot: Bot) {
    const action = bot.is_published ? "unpublish" : "publish";
    if (!window.confirm(`Are you sure you want to ${action} “${bot.name}”? ${bot.is_published ? "Customers will no longer be able to newly select it." : "Customers will be able to see and select it."}`)) return;
    setBusy(true); setMessage("");
    const { error } = await supabase.from("bots").update({ is_published: !bot.is_published }).eq("id", bot.id);
    if (error) setMessage(`Could not ${action} bot: ${error.message}`);
    else { setMessage(`${bot.name} is now ${bot.is_published ? "unpublished" : "published"}. Existing customer selections have not been deleted.`); await loadBots(); }
    setBusy(false);
  }

  const visibleBots = bots.filter(bot => filter === "all" || (filter === "published" ? bot.is_published : !bot.is_published));
  const publishedCount = bots.filter(bot => bot.is_published).length;

  return <main className="appShell">
    <header className="dashNav"><Link className="brand" href="/">TRADE SCHEME <span>FX</span></Link><Link className="button secondary small" href="/admin">Back to admin</Link></header>
    <section className="dashContent">
      <p className="eyebrow">ADMIN CONTROL CENTER</p><h1>Bot publishing & management</h1>
      <div className="notice"><strong>Publishing policy:</strong> New bots start unpublished. You can edit, publish or unpublish them at any time. Unpublishing hides a bot from the customer catalogue without deleting its profile or existing customer selections. These controls do not execute trades.</div>
      <div className="dashGrid">
        <article className="panel"><p className="eyebrow">TOTAL BOT PROFILES</p><h2>{bots.length}</h2><p>All bot profiles in your catalogue.</p></article>
        <article className="panel"><p className="eyebrow">PUBLISHED</p><h2>{publishedCount}</h2><p>Visible to customers for new selections.</p></article>
      </div>
      <form className="panel botForm" onSubmit={saveBot}>
        <p className="eyebrow">{editingId ? "EDIT BOT PROFILE" : "CREATE BOT PROFILE"}</p>
        <label>Bot name<input required maxLength={80} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Synthetic Trend Scout" /></label>
        <label>Market<select value={form.market} onChange={e => setForm({ ...form, market: e.target.value })}><option>Synthetic Indices</option><option>Derived Indices</option><option>Forex</option><option>Commodities</option><option>Other</option></select></label>
        <label>Risk classification<select value={form.risk_level} onChange={e => setForm({ ...form, risk_level: e.target.value as Bot["risk_level"] })}><option>Low</option><option>Medium</option><option>High</option></select></label>
        <label>Description<textarea rows={4} maxLength={1000} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Describe what this bot is designed to do and its limitations." /></label>
        <div className="actions"><button className="button" disabled={busy}>{busy ? "Saving…" : editingId ? "Save changes" : "Create unpublished bot"}</button>{editingId && <button type="button" className="button secondary" onClick={resetForm}>Cancel edit</button>}</div>
      </form>
      {message && <p className="notice" role="status">{message}</p>}
      <div className="adminSectionHead"><div><p className="eyebrow">CATALOGUE</p><h2>Manage bot profiles</h2></div><select aria-label="Filter bots" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">All bots</option><option value="published">Published</option><option value="unpublished">Unpublished</option></select></div>
      {loading ? <p className="muted">Loading bot profiles…</p> : visibleBots.length === 0 ? <div className="panel"><p className="muted">No bots match this filter.</p></div> : <div className="botList">{visibleBots.map(bot => <article className="panel botRow" key={bot.id}>
        <div className="botRowInfo"><strong>{bot.name}</strong><p className="muted">{bot.market} · {bot.risk_level} risk</p><p className="muted">{bot.description || "No description provided."}</p><span className="statusText">{bot.is_published ? "Published to customers" : "Unpublished — admin only"}</span></div>
        <div className="actions botAdminActions"><button className="button secondary small" disabled={busy} onClick={() => startEdit(bot)}>Edit</button><button className="button small" disabled={busy} onClick={() => void togglePublish(bot)}>{bot.is_published ? "Unpublish" : "Publish"}</button></div>
      </article>)}</div>}
      <p className="disclaimer">Unpublishing does not delete bot records or existing customer selections. Existing selected bots will no longer appear in the public catalogue, but this does not remotely stop any live trading. Live Deriv execution is not connected.</p>
    </section>
  </main>;
}
