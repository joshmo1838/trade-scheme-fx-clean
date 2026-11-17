"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

const MARKETS = [
  { symbol: "R_10", label: "Volatility 10" },
  { symbol: "R_25", label: "Volatility 25" },
  { symbol: "R_50", label: "Volatility 50" },
  { symbol: "R_75", label: "Volatility 75" },
  { symbol: "R_100", label: "Volatility 100" },
];

const WS = "wss://api.derivws.com/trading/v1/options/ws/public";

export default function LiveDigitTools() {
  const [market, setMarket] = useState("R_100");
  const [active, setActive] = useState(false);
  const [digits, setDigits] = useState<number[]>([]);
  const [feedStatus, setFeedStatus] = useState("Start the live digit sample to observe real public ticks.");
  const [lastQuote, setLastQuote] = useState("—");
  const socket = useRef<WebSocket | null>(null);
  const sampleCount = digits.length;

  const counts = useMemo(() => {
    const values = Array(10).fill(0) as number[];
    digits.forEach(digit => { values[digit] += 1; });
    return values;
  }, [digits]);

  useEffect(() => {
    return () => {
      const ws = socket.current;
      socket.current = null;
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) ws.close();
    };
  }, []);

  function stop() {
    const ws = socket.current;
    socket.current = null;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) ws.close();
    setActive(false);
    setFeedStatus("Live sample stopped. Data remains visible until reset.");
  }

  function start() {
    stop();
    setDigits([]);
    setLastQuote("—");
    setFeedStatus("Connecting to Deriv public ticks…");
    try {
      const ws = new WebSocket(WS);
      socket.current = ws;
      ws.onopen = () => {
        if (socket.current !== ws) return;
        ws.send(JSON.stringify({ ticks: market, subscribe: 1 }));
        setActive(true);
        setFeedStatus("Observing real public ticks. The most recent 250 digits are counted.");
      };
      ws.onmessage = event => {
        if (socket.current !== ws) return;
        let msg: any;
        try { msg = JSON.parse(String(event.data)); } catch { return; }
        if (msg.error) {
          setFeedStatus("Market feed error: " + String(msg.error.message || msg.error.code || "Unknown error"));
          setActive(false);
          socket.current = null;
          ws.close();
          return;
        }
        if (msg.msg_type !== "tick" || !msg.tick ||
            (msg.tick.symbol && msg.tick.symbol !== market)) return;
        const number = Number(msg.tick.quote);
        const decimals = Number(msg.tick.pip_size);
        if (!Number.isFinite(number) || number <= 0) return;
        const quoted = Number.isInteger(decimals) && decimals >= 0 && decimals <= 12
          ? number.toFixed(decimals)
          : String(msg.tick.quote);
        const chars = quoted.replace(/[^0-9]/g, "");
        if (!chars) return;
        const digit = Number(chars.slice(-1));
        setDigits(previous => [...previous, digit].slice(-250));
        setLastQuote(quoted);
      };
      ws.onerror = () => {
        if (socket.current === ws) setFeedStatus("Public tick feed error. Stop and retry.");
      };
      ws.onclose = () => {
        if (socket.current === ws) {
          socket.current = null;
          setActive(false);
          setFeedStatus(current => current.includes("error") ? current : "Market feed disconnected. Restart to sample again.");
        }
      };
    } catch {
      setActive(false);
      setFeedStatus("Could not open the public market feed.");
    }
  }

  function clear() {
    stop();
    setDigits([]);
    setLastQuote("—");
    setFeedStatus("Sample reset. Start again whenever you are ready.");
  }

  return <main className="appShell">
    <header className="dashNav">
      <Link className="brand" href="/">TRADE SCHEME <span>FX</span></Link>
      <Link className="button secondary small" href="/dashboard">Dashboard</Link>
    </header>
    <section className="dashContent" style={{ maxWidth: 1120 }}>
      <p className="eyebrow">SENFX MARKET DATA · LEARNING TOOLS</p>
      <h1>Live tick <span style={{ color: "#3dd5d6" }}>digit analysis</span></h1>
      <p className="muted">Watch the last digit of public Deriv tick quotations and study the observed frequency. Counts use the quote precision supplied by Deriv when available. The results do not predict future ticks.</p>
      <div className="panel" style={{ marginTop: 22 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end" }}>
          <label className="fieldLabel">Synthetic market
            <select className="fieldInput" value={market} onChange={e => { if (active) stop(); setMarket(e.target.value); setDigits([]); }}
              disabled={active} style={{ display: "block", minWidth: 190 }}>
              {MARKETS.map(item => <option key={item.symbol} value={item.symbol}>{item.label}</option>)}
            </select>
          </label>
          <button className="button" onClick={start} disabled={active}>Start live sample</button>
          <button className="button secondary" onClick={stop} disabled={!active}>Pause</button>
          <button className="button secondary" onClick={clear}>Reset</button>
        </div>
        <p className="muted" role="status">{feedStatus}</p>
        <div className="dashGrid" style={{ marginTop: 16 }}>
          <article className="panel"><span className="eyebrow">TICKS COUNTED</span><h2>{sampleCount}</h2></article>
          <article className="panel"><span className="eyebrow">LAST OBSERVED QUOTE</span><h2>{lastQuote}</h2></article>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(78px,1fr))", gap: 8 }}>
          {counts.map((count, digit) => {
            const percent = sampleCount ? count / sampleCount * 100 : 0;
            return <div key={digit} style={{ border: "1px solid #244869", background: "#081f39", borderRadius: 10, padding: 12, textAlign: "center" }}>
              <strong style={{ fontSize: 22, color: "#f2fbff" }}>{digit}</strong>
              <p style={{ color: "#89b4d3", fontSize: 12, margin: "4px 0" }}>{count} ticks</p>
              <div aria-label={digit + ": " + percent.toFixed(1) + "%"} style={{ height: 48, display: "flex", alignItems: "end", background: "#0a1730", borderRadius: 5, overflow: "hidden" }}>
                <div style={{ width: "100%", height: percent + "%", background: "#18bedd", minHeight: sampleCount && count ? 2 : 0 }} />
              </div>
              <small style={{ color: "#a9d9e9" }}>{percent.toFixed(1)}%</small>
            </div>;
          })}
        </div>
        <h2 style={{ marginTop: 23 }}>Recent digits</h2>
        <p className="muted" style={{ overflowWrap: "anywhere" }}>{digits.length ? digits.slice(-70).join(" ") : "No public ticks observed yet."}</p>
      </div>
      <p className="disclaimer">A digit frequency is a descriptive statistic, not a forecast or a profitable strategy. No trades, Demo contracts or real-money orders are placed by this page.</p>
    </section>
  </main>;
}
