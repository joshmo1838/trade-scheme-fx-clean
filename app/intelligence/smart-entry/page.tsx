"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import "./smart-entry-visuals.css";
import { SMART_ENTRY_DEFAULTS } from "@/lib/market/smart-entry-paper";
import { beginPaperSession, paperNextTickStep, type PaperSession } from "@/lib/market/smart-entry-next-tick";
import { parsePublicDerivTick } from "@/lib/market/public-tick-adapter";

const WS = "wss://api.derivws.com/trading/v1/options/ws/public";
const SYMBOLS = ["R_10", "R_25", "R_50", "R_75", "R_100"] as const;
type EventRow = { id: number; text: string };
export default function SmartEntryResearchPage() {
  const [symbol, setSymbol] = useState<string>("R_100");
  const [score, setScore] = useState(75);
  const [session, setSession] = useState<PaperSession | null>(null);
  const [feed, setFeed] = useState("Not connected");
  const [status, setStatus] = useState("Idle — start a paper batch to connect");
  const [events, setEvents] = useState<EventRow[]>([]);
  const socket = useRef<WebSocket | null>(null);
  const current = useRef<PaperSession | null>(null);
  const scoreRef = useRef(score);
  const generation = useRef(0);
  const lastReceived = useRef(0);
  const sequence = useRef(0);
  useEffect(() => { scoreRef.current = score; }, [score]);
  const log = useCallback((text: string) => {
    sequence.current += 1;
    setEvents(rows => [{ id: sequence.current, text: new Date().toLocaleTimeString() + " · " + text }, ...rows].slice(0, 35));
  }, []);
  const disconnect = useCallback(() => {
    generation.current += 1;
    const ws = socket.current;
    socket.current = null;
    if (ws) { ws.onopen = null; ws.onmessage = null; ws.onerror = null; ws.onclose = null; ws.close(); }
  }, []);
  const stop = useCallback((reason = "Emergency Stop") => {
    if (current.current && !current.current.gate.stopped) {
      const update = paperNextTickStep(current.current, SMART_ENTRY_DEFAULTS, Date.now(), null, null, true);
      current.current = update.session;
      setSession(update.session);
    }
    disconnect();
    setFeed("Disconnected");
    setStatus(reason + " — paper observations halted");
    log(reason);
  }, [disconnect, log]);
  useEffect(() => () => { disconnect(); }, [disconnect]);
  useEffect(() => {
    if (!session || session.gate.stopped) return;
    const timer = window.setInterval(() => {
      if (current.current?.gate.stopped) return;
      const now = Date.now();
      if (lastReceived.current && now - lastReceived.current > 15000) {
        stop("Public feed stale for 15 seconds");
      } else if (now - (current.current?.gate.signalStartedAtMs ?? now) >= SMART_ENTRY_DEFAULTS.waitMs) {
        stop("60-second signal deadline reached");
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [session?.gate.stopped, stop]);
  function begin() {
    disconnect();
    const next = beginPaperSession(Date.now());
    current.current = next;
    setSession(next);
    setEvents([]);
    setStatus("Waiting for verified public ticks");
    setFeed("Connecting");
    lastReceived.current = 0;
    const token = generation.current;
    let ws: WebSocket;
    try { ws = new WebSocket(WS); } catch { stop("Public feed unavailable"); return; }
    socket.current = ws;
    const connectTimer = window.setTimeout(() => {
      if (generation.current === token && ws.readyState !== WebSocket.OPEN) stop("Public feed connection timed out");
    }, 12000);
    ws.onopen = () => {
      if (generation.current !== token) return;
      window.clearTimeout(connectTimer);
      ws.send(JSON.stringify({ ticks: symbol, subscribe: 1 }));
      setFeed("Connected · awaiting first tick");
    };
    ws.onmessage = event => {
      if (generation.current !== token || !current.current || current.current.gate.stopped) return;
      let message: unknown;
      try { message = JSON.parse(String(event.data)); } catch { stop("Malformed public feed message"); return; }
      const now = Date.now();
      const parsed = parsePublicDerivTick(message, symbol, now);
      if (!parsed.ok) {
        if (parsed.reason === "feed-error" || parsed.reason === "stale-or-future-tick" || parsed.reason === "invalid-symbol-or-quote" || parsed.reason === "invalid-feed-message") {
          stop("Public feed validation failed: " + parsed.reason);
        }
        return;
      }
      lastReceived.current = now;
      setFeed("Live public ticks · " + symbol);
      const update = paperNextTickStep(current.current, SMART_ENTRY_DEFAULTS, now, parsed.tick, scoreRef.current);
      current.current = update.session;
      setSession(update.session);
      if (update.action !== "wait") {
        setStatus(update.reason);
        log(update.action + " · " + update.reason + " · " + parsed.tick.quote);
      }
      if (update.action === "stop") stop("Paper batch stopped: " + update.reason);
      else if (update.action === "settle" && update.session.gate.completed >= SMART_ENTRY_DEFAULTS.maxRuns) stop("10 observations completed");
    };
    ws.onerror = () => { if (generation.current === token) stop("Public feed connection error"); };
    ws.onclose = () => { if (generation.current === token) stop("Public feed disconnected"); };
  }
  const observations = session?.observations ?? [];
  return <main className="senfx-smart-entry" style={{ minHeight: "100vh", background: "#081326", color: "#eaf4ff", padding: "clamp(20px,4vw,52px)", fontFamily: "system-ui,sans-serif" }}>
    <div style={{ maxWidth: 1050, margin: "0 auto" }}>
      <p style={{ color: "#67e8f9", letterSpacing: 2, fontSize: 12 }}>SENFX / AI INTELLIGENCE / PUBLIC TICK RESEARCH</p>
      <h1>Smart Entry Engine</h1>
      <p style={{ color: "#a8bad2" }}>Browser-local next-public-tick research. The research-quality score is manually supplied and is NOT a win probability or verified signal. No real/demo broker orders, purchases or credentials.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 14, margin: "24px 0" }}>
        {([["Paper observations", observations.length + " / 10"], ["Settled", observations.filter(o => o.settlement).length.toString()], ["Research threshold", "75 / 100"], ["Signal deadline", "60 seconds"], ["Illustrative exposure", String(session?.gate.exposure ?? 0) + " / 10 units"]] as const).map(([label, value]) =>
          <section key={label} style={{ padding: 18, background: "#101f37", border: "1px solid #284363", borderRadius: 14 }}><small>{label}</small><strong style={{ display: "block", fontSize: 24 }}>{value}</strong></section>)}
      </div>
      <section style={{ padding: 24, background: "#101f37", border: "1px solid #284363", borderRadius: 16 }}>
        <h2>Public tick paper research</h2>
        <p>Each observation uses one verified tick and settles on the next distinct valid tick. Outcomes describe price direction only, not financial profit.</p>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <label>Public market<select value={symbol} disabled={!!session && !session.gate.stopped} onChange={e => setSymbol(e.target.value)} style={{ display: "block", padding: 10, marginTop: 6 }}>{SYMBOLS.map(s => <option key={s} value={s}>{s}</option>)}</select></label>
          <label>Manual research-quality score<input type="number" min={0} max={100} value={score} onChange={e => setScore(Number(e.target.value))} style={{ display: "block", padding: 10, marginTop: 6, width: 130 }} /></label>
        </div>
        <div style={{ display: "flex", gap: 12, marginTop: 20, flexWrap: "wrap" }}>
          <button type="button" onClick={begin} style={{ padding: "12px 18px", background: "#155e75", color: "white", border: 0, borderRadius: 8 }}>Start new paper batch</button>
          <button type="button" onClick={() => stop()} disabled={!session || session.gate.stopped} style={{ padding: "12px 18px", background: "#b91c1c", color: "white", border: 0, borderRadius: 8 }}>Emergency Stop</button>
        </div>
        <p role="status" aria-live="polite" style={{ color: "#67e8f9" }}>Feed: {feed}. Status: {status}</p>
      </section>
      <section style={{ marginTop: 24 }}><h2>Reproducible paper observations</h2>
        {observations.length === 0 ? <p>No observations yet.</p> : <div style={{ overflowX: "auto" }}><table style={{ width: "100%", textAlign: "left", borderSpacing: "0 12px" }}><thead><tr><th>#</th><th>Entry tick</th><th>Settlement tick</th><th>Outcome</th><th>Quality</th></tr></thead><tbody>{observations.map((o, i) => <tr key={o.entry.id}><td>{i + 1}</td><td>{o.entry.id} · {o.entry.quote}</td><td>{o.settlement ? o.settlement.id + " · " + o.settlement.quote : "Awaiting next tick"}</td><td>{o.outcome ?? "Pending"}</td><td>{o.researchScore}/100</td></tr>)}</tbody></table></div>}
      </section>
      <section><h2>Local event log</h2>{events.length === 0 ? <p>No events yet.</p> : <ol>{events.map(e => <li key={e.id}>{e.text}</li>)}</ol>}</section>
    </div>
  </main>;
}
