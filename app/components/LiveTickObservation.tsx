"use client";

import { useEffect, useMemo, useState } from "react";

type Tick = { epoch: number; quote: number; signature: string };
const MAX_TICKS = 300;
const ENDPOINT = "wss://api.derivws.com/trading/v1/options/ws/public";
const SYMBOLS = [{ id: "R_10", label: "Volatility 10" }, { id: "R_25", label: "Volatility 25" }, { id: "R_50", label: "Volatility 50" }, { id: "R_75", label: "Volatility 75" }, { id: "R_100", label: "Volatility 100" }];

export default function LiveTickObservation() {
  const [symbol, setSymbol] = useState("R_100");
  const [restart, setRestart] = useState(0);
  const [ticks, setTicks] = useState<Tick[]>([]);
  const [connection, setConnection] = useState("Connecting");
  const [lastReceivedAt, setLastReceivedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [rejected, setRejected] = useState(0);
  useEffect(() => {
    let active = true;
    let socket: WebSocket | null = null;
    let latestEpoch = 0;
    let lastSignature = "";
    setTicks([]);
    setRejected(0);
    setLastReceivedAt(null);
    setConnection("Connecting");
    try {
      socket = new WebSocket(ENDPOINT);
      socket.onopen = () => {
        if (!active) return;
        setConnection("Waiting for public ticks");
        socket?.send(JSON.stringify({ ticks: symbol, subscribe: 1 }));
      };
      socket.onmessage = event => {
        if (!active) return;
        let data: any;
        try { data = JSON.parse(String(event.data)); } catch { return; }
        if (data.error) {
          setConnection("Feed error: " + String(data.error.code || "unknown"));
          socket?.close();
          return;
        }
        if (data.msg_type !== "tick" || !data.tick || (data.tick.symbol && data.tick.symbol !== symbol)) return;
        const epoch = Number(data.tick.epoch);
        const quote = Number(data.tick.quote);
        if (!Number.isFinite(epoch) || epoch <= 0 || !Number.isFinite(quote) || quote <= 0) { setRejected(n => n + 1); return; }
        const signature = String(epoch) + ":" + String(data.tick.quote);
        if (epoch < latestEpoch || signature === lastSignature) { setRejected(n => n + 1); return; }
        latestEpoch = epoch;
        lastSignature = signature;
        setTicks(old => [...old, { epoch, quote, signature }].slice(-MAX_TICKS));
        setLastReceivedAt(Date.now());
        setConnection("Receiving public ticks");
      };
      socket.onerror = () => { if (active) setConnection("Connection error"); };
      socket.onclose = () => { if (active) setConnection(old => old.startsWith("Feed error") ? old : "Disconnected"); };
    } catch { setConnection("WebSocket unavailable"); }
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { active = false; window.clearInterval(clock); socket?.close(); };
  }, [symbol, restart]);
  const stale = lastReceivedAt === null || now - lastReceivedAt > 15000;
  const stats = useMemo(() => {
    if (!ticks.length) return null;
    const quotes = ticks.map(t => t.quote);
    const first = quotes[0];
    const last = quotes[quotes.length - 1];
    const high = Math.max(...quotes);
    const low = Math.min(...quotes);
    const range = high - low || Math.max(Math.abs(last) * .000001, .000001);
    const points = quotes.map((q, i) => String(8 + (i / Math.max(1, quotes.length - 1)) * 584) + "," + String(126 - (q - low) / range * 112)).join(" ");
    return { first, last, high, low, change: (last - first) / first * 100, points };
  }, [ticks]);
  return <section className="rounded-2xl border border-slate-700 bg-slate-950 p-5 text-slate-100 md:p-7" aria-label="Live 300 tick observation">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-xs font-bold uppercase tracking-widest text-cyan-300">Deriv public feed · observation only</p><h2 className="mt-2 text-xl font-bold">Live 300-tick market monitor</h2><p className="mt-2 text-sm text-slate-400">A rolling window of observed ticks, not predicted prices or executable quotes.</p></div>
      <div className="flex flex-wrap gap-2">
        <label className="text-xs text-slate-300">Market <select aria-label="Tick monitor market" className="ml-2 rounded bg-slate-800 p-2 text-white" value={symbol} onChange={e => setSymbol(e.target.value)}>{SYMBOLS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
        <button type="button" className="rounded border border-slate-600 px-3 py-2 text-xs hover:border-cyan-400" onClick={() => setRestart(x => x + 1)}>Reconnect</button>
      </div>
    </div>
    <div className="mt-4 flex flex-wrap gap-3 text-xs">
      <span role="status" className={stale ? "text-amber-300" : "text-emerald-300"}>{stale ? "● Not verified live" : "● Live public ticks"} · {connection}</span>
      <span className="text-slate-400">{ticks.length} / {MAX_TICKS} observations</span>
      <span className="text-slate-400">Rejected duplicates/out-of-order/invalid: {rejected}</span>
    </div>
    <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
      {[["Last observed", stats?.last.toFixed(4) ?? "—"], ["Session change", stats ? stats.change.toFixed(3) + "%" : "—"], ["Observed high", stats?.high.toFixed(4) ?? "—"], ["Observed low", stats?.low.toFixed(4) ?? "—"]].map(([label, value]) => <div key={label} className="rounded-lg border border-slate-800 bg-slate-900 p-3"><div className="text-xs text-slate-400">{label}</div><strong className="mt-2 block text-lg">{value}</strong></div>)}
    </div>
    <div className="mt-4 overflow-hidden rounded-lg border border-slate-800 bg-[#07152b]">
      <svg viewBox="0 0 600 136" className="w-full" role="img" aria-label="Line trace of observed public Deriv tick prices">
        {[20, 60, 100].map(y => <line key={y} x1="0" y1={y} x2="600" y2={y} stroke="#26405e" strokeDasharray="4 6" />)}
        {stats && <polyline points={stats.points} fill="none" stroke="#35d9dc" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
      </svg>
      {!stats && <p className="px-4 pb-4 text-center text-xs text-slate-400">Waiting for actual market observations; no demo data is fabricated.</p>}
    </div>
    <p className="mt-3 text-xs text-slate-400">The monitor runs in this browser tab only. It does not send data to 15 bots, evaluate Golden Rule entries, or place Deriv orders. A network-online indicator alone is not proof of a live feed.</p>
  </section>;
}
