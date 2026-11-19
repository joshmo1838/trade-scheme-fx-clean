"use client";

import { useState } from "react";
import { beginSmartEntry, smartEntryStep, SMART_ENTRY_DEFAULTS, type EntryState, type Tick } from "@/lib/market/smart-entry-paper";

export default function SmartEntryResearchPage() {
  const [state, setState] = useState<EntryState | null>(null);
  const [score, setScore] = useState(75);
  const [quote, setQuote] = useState("100");
  const [status, setStatus] = useState("Idle — no paper observations");
  const [history, setHistory] = useState<string[]>([]);
  const [lastTickId, setLastTickId] = useState(0);
  function begin() {
    setState(beginSmartEntry(Date.now()));
    setHistory([]);
    setLastTickId(0);
    setStatus("Waiting for manually supplied research ticks; no broker connection");
  }
  function step() {
    if (!state) return;
    const now = Date.now();
    const value = Number(quote);
    const id = lastTickId + 1;
    const tick: Tick = { id: `manual-${id}`, epochMs: now, quote: value };
    const result = smartEntryStep(state, SMART_ENTRY_DEFAULTS, now, tick, score);
    setState(result.state);
    setLastTickId(id);
    setStatus(result.reason);
    setHistory(prev => [`${new Date(now).toLocaleTimeString()}: ${result.action} — ${result.reason}`, ...prev].slice(0, 30));
  }
  function stop() {
    if (!state) return;
    const result = smartEntryStep(state, SMART_ENTRY_DEFAULTS, Date.now(), null, null, true);
    setState(result.state);
    setStatus("Emergency Stop — no further observations");
  }
  return (
    <main style={{ minHeight: "100vh", background: "#081326", color: "#eaf4ff", padding: "clamp(20px,4vw,52px)", fontFamily: "system-ui,sans-serif" }}>
      <div style={{ maxWidth: 1050, margin: "0 auto" }}>
        <p style={{ color: "#67e8f9", letterSpacing: 2, fontSize: 12 }}>SENFX / AI INTELLIGENCE / RESEARCH</p>
        <h1 style={{ fontSize: "clamp(28px,4vw,46px)", marginBottom: 8 }}>Smart Entry Engine</h1>
        <p style={{ color: "#a8bad2", maxWidth: 740 }}>Manual research-input prototype. Hypothetical observations only. Scores are not estimated win probabilities. No live market feed or Deriv orders.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 14, margin: "28px 0" }}>
          {[
            ["Observations", `${state?.completed ?? 0} / 10`],
            ["Research threshold", "75 / 100"],
            ["Signal timeout", "60 seconds"],
            ["Hypothetical exposure", `${state?.exposure ?? 0} / 10 units`]
          ].map(([label,value]) => <section key={label} style={{ border: "1px solid #243b5b", background: "#101f37", borderRadius: 14, padding: 20 }}>
            <div style={{ color: "#91a7c6", fontSize: 13 }}>{label}</div><strong style={{ display: "block", marginTop: 8, fontSize: 25 }}>{value}</strong>
          </section>)}
        </div>
        <section style={{ border: "1px solid #284363", borderRadius: 16, padding: 24, background: "#101f37" }}>
          <h2 style={{ fontSize: 21, marginTop: 0 }}>Manual signal research</h2>
          <p style={{ color: "#a8bad2" }}>Enter illustrative values to exercise the paper-only gate. This is not a real market signal or validated scoring model.</p>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
            <label>Research score (0–100)<input aria-label="Research score" type="number" min="0" max="100" value={score} onChange={e => setScore(Number(e.target.value))} style={{ display: "block", padding: 12, marginTop: 7, background: "#07152a", color: "white", border: "1px solid #446080", borderRadius: 8 }} /></label>
            <label>Illustrative tick quote<input aria-label="Illustrative tick quote" type="number" min="0.00001" step="any" value={quote} onChange={e => setQuote(e.target.value)} style={{ display: "block", padding: 12, marginTop: 7, background: "#07152a", color: "white", border: "1px solid #446080", borderRadius: 8 }} /></label>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button onClick={begin} style={{ padding: "12px 20px", borderRadius: 8, background: "#155e75", color: "white", border: 0 }}>Start new paper batch</button>
            <button onClick={step} disabled={!state || state.stopped} style={{ padding: "12px 20px", borderRadius: 8, background: "#0d9488", color: "white", border: 0, opacity: !state || state.stopped ? 0.45 : 1 }}>Evaluate manual tick</button>
            <button onClick={stop} disabled={!state || state.stopped} style={{ padding: "12px 20px", borderRadius: 8, background: "#b91c1c", color: "white", border: 0, opacity: !state || state.stopped ? 0.45 : 1 }}>Emergency Stop</button>
          </div>
          <p role="status" aria-live="polite" style={{ color: "#67e8f9", marginTop: 20 }}>Status: {status}</p>
        </section>
        <section style={{ marginTop: 24 }}><h2>Local observation log</h2>
          {history.length === 0 ? <p style={{ color: "#91a7c6" }}>No observations yet.</p> : <ol>{history.map((entry, i) => <li key={i} style={{ marginBottom: 10 }}>{entry}</li>)}</ol>}
        </section>
      </div>
    </main>
  );
}
