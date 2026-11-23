"use client";

import { useEffect, useMemo, useState } from "react";
import { replayPaperTicks, type ReplayInput } from "@/lib/market/market-time-machine";

const EXAMPLE: ReplayInput[] = Array.from({ length: 20 }, (_, i) => ({
  tick: { id: "offline-sample-" + (i + 1), epochMs: (i + 1) * 1000, quote: 100 + ((i * 7) % 13) / 10 },
  receivedAtMs: (i + 1) * 1000,
  score: 75
}));

export default function MarketTimeMachinePage() {
  const [rows, setRows] = useState<ReplayInput[]>([]);
  const [stoppedAt, setStoppedAt] = useState<number | null>(null);
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  useEffect(() => {
    if (!playing || !rows.length || cursor >= rows.length) return;
    const handle = window.setTimeout(() => setCursor(previous => Math.min(rows.length, previous + 1)), 1000 / speed);
    return () => window.clearTimeout(handle);
  }, [playing, rows.length, cursor, speed]);
  useEffect(() => { if (cursor >= rows.length) setPlaying(false); }, [cursor, rows.length]);
  const result = useMemo(() => cursor > 0 ? replayPaperTicks(rows.slice(0, cursor), 1000, stoppedAt !== null && stoppedAt < cursor ? stoppedAt : null) : null, [rows, cursor, stoppedAt]);
  function load() { setPlaying(false); setCursor(0); setStoppedAt(null); setRows(EXAMPLE.map(r => ({ ...r, tick: { ...r.tick } }))); }
  function emergencyStop() { if (rows.length) { setPlaying(false); setStoppedAt(0); setCursor(Math.max(1, cursor)); } }
  return <main style={{ minHeight: "100vh", background: "#081326", color: "#eaf4ff", padding: "clamp(20px,4vw,52px)", fontFamily: "system-ui,sans-serif" }}>
    <div style={{ maxWidth: 1020, margin: "auto" }}>
      <p style={{ color: "#67e8f9", letterSpacing: 2, fontSize: 12 }}>SENFX / AI INTELLIGENCE / OFFLINE RESEARCH</p>
      <h1>Market Time Machine</h1>
      <p style={{ color: "#a8bad2" }}>Deterministic offline replay of illustrative sample ticks. These are synthetic fixtures, not recorded Deriv market prices or trading signals. No network connection, broker credentials, purchases or orders. The 75/100 value is a research-quality threshold, not a win probability.</p>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "24px 0" }}>
        <button type="button" onClick={load} style={{ background: "#155e75", color: "white", border: 0, borderRadius: 9, padding: "12px 18px" }}>Replay 20 sample ticks</button>
        <button type="button" disabled={!rows.length} onClick={emergencyStop} style={{ background: "#b91c1c", color: "white", border: 0, borderRadius: 9, padding: "12px 18px" }}>Emergency Stop (replay from start)</button>
        <button type="button" onClick={() => { setPlaying(false); setCursor(0); setRows([]); setStoppedAt(null); }} style={{ background: "#243b5b", color: "white", border: 0, borderRadius: 9, padding: "12px 18px" }}>Clear local replay</button>
      </div>
      <section aria-label="Replay playback controls" style={{ border: "1px solid #284363", borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <h2>Playback controls</h2>
        <p>Frame {cursor} / {rows.length} · {playing ? "Playing" : "Paused"} · Offline illustrative ticks only</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" disabled={!rows.length || cursor >= rows.length || stoppedAt !== null} onClick={() => setPlaying(value => !value)}>{playing ? "Pause" : "Play"}</button>
          <button type="button" disabled={!rows.length || cursor >= rows.length || stoppedAt !== null} onClick={() => { setPlaying(false); setCursor(value => Math.min(rows.length, value + 1)); }}>Next tick</button>
          <button type="button" disabled={!rows.length} onClick={() => { setPlaying(false); setStoppedAt(null); setCursor(0); }}>Restart</button>
          <label>Speed <select aria-label="Playback speed" value={speed} onChange={event => setSpeed(Number(event.target.value))}><option value={0.5}>0.5×</option><option value={1}>1×</option><option value={2}>2×</option><option value={4}>4×</option></select></label>
        </div>
        <input aria-label="Replay position" type="range" min={0} max={rows.length} value={cursor} disabled={!rows.length || stoppedAt !== null} onChange={event => { setPlaying(false); setCursor(Number(event.target.value)); }} style={{ width: "100%", marginTop: 16 }} />
      </section>
      <section style={{ border: "1px solid #284363", borderRadius: 16, background: "#101f37", padding: 20 }}>
        <h2>Replay summary</h2>
        <p role="status" aria-live="polite">{!result ? "No replay loaded" : result.session.gate.stopped ? "Replay stopped by safety gate" : "Replay complete"}</p>
        <p>Paper observations: {result?.session.observations.length ?? 0} / 10 · Settled: {result?.session.observations.filter(o => o.settlement !== null).length ?? 0} · Hypothetical exposure: {result?.session.gate.exposure ?? 0} / 10 units</p>
      </section>
      <section style={{ marginTop: 24 }}>
        <h2>Reproducible observation ledger</h2>
        {result?.session.observations.length ? <div style={{ overflowX: "auto" }}><table style={{ width: "100%", textAlign: "left", borderSpacing: "0 12px" }}><thead><tr><th>#</th><th>Entry ID</th><th>Settlement ID</th><th>Price direction</th><th>Quality</th></tr></thead><tbody>{result.session.observations.map((o, i) => <tr key={o.entry.id}><td>{i + 1}</td><td>{o.entry.id}</td><td>{o.settlement?.id ?? "Pending"}</td><td>{o.outcome ?? "Pending"}</td><td>{o.researchScore}/100</td></tr>)}</tbody></table></div> : <p>No paper observations.</p>}
      </section>
      <section style={{ marginTop: 24 }}><h2>Replay event audit</h2>{result ? <ol>{result.events.map((e, i) => <li key={i}>{e.tickId || "No tick"} · {e.action} · {e.reason}</li>)}</ol> : <p>No events.</p>}</section>
    </div>
  </main>;
}
