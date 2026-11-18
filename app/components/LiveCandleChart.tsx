"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { summarizeTickSession, type TickSample, MAX_SESSION_TICKS } from "@/lib/market/tick-session-analytics";

type Candle = {
  bucket: number;
  open: number;
  high: number;
  low: number;
  close: number;
};
type Market = { symbol: string; label: string };

const MARKETS: Market[] = [
  { symbol: "R_10", label: "Volatility 10 Index" },
  { symbol: "R_25", label: "Volatility 25 Index" },
  { symbol: "R_50", label: "Volatility 50 Index" },
  { symbol: "R_75", label: "Volatility 75 Index" },
  { symbol: "R_100", label: "Volatility 100 Index" },
];
const WS = "wss://api.derivws.com/trading/v1/options/ws/public";
const LIMIT = 60;
const AXIS_WIDTH = 54;
const PLOT_WIDTH = 906;
const PLOT_HEIGHT = 308;
const Y_TOP = 25;
const format = (value: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(value);

/**
 * Candles are built ONLY from public Deriv ticks actually received by this tab.
 * There is no synthetic price history, prediction or order submission.
 */
export default function LiveCandleChart({ embedded = false }: { embedded?: boolean }) {
  const [symbol, setSymbol] = useState("R_100");
  const [frame, setFrame] = useState(15);
  const [retry, setRetry] = useState(0);
  const [bars, setBars] = useState<Candle[]>([]);
  const [lastPrice, setLastPrice] = useState<number | null>(null);
  const [status, setStatus] = useState("Connecting to Deriv public market data…");
  const [connected, setConnected] = useState(false);
  const [ticksReceived, setTicksReceived] = useState(0);
  const [sessionTicks, setSessionTicks] = useState<TickSample[]>([]);

  useEffect(() => {
    let active = true;
    let opened = false;
    let lastValidTickAt = 0;
    const freshnessTimer = window.setInterval(() => {
      if (!active || !opened) return;
      if (lastValidTickAt && Date.now() - lastValidTickAt > 15_000) {
        setConnected(false);
        setStatus("Public market feed is stale. Use Retry connection.");
      }
    }, 5_000);
    setBars([]);
    setLastPrice(null);
    setConnected(false);
    setTicksReceived(0);
    setSessionTicks([]);
    setStatus("Connecting to Deriv public market data…");

    const ws = new WebSocket(WS);
    const connectionTimeout = window.setTimeout(() => {
      if (active && !opened) {
        setStatus("Market feed timed out. Use Retry connection.");
        ws.close();
      }
    }, 12000);

    ws.onopen = () => {
      if (!active) return;
      opened = true;
      window.clearTimeout(connectionTimeout);
      ws.send(JSON.stringify({ ticks: symbol, subscribe: 1 }));
      setConnected(false);
      setStatus("Connected to public feed; waiting for first valid tick…");
    };
    ws.onmessage = event => {
      if (!active) return;
      let message: any;
      try { message = JSON.parse(String(event.data)); } catch { return; }
      if (message.error) {
        setStatus("Market feed error: " + String(message.error.message || message.error.code || "Unknown error"));
        setConnected(false);
        ws.close();
        return;
      }
      if (message.msg_type !== "tick" || !message.tick ||
          (message.tick.symbol && message.tick.symbol !== symbol)) return;

      const price = Number(message.tick.quote);
      const epoch = Number(message.tick.epoch);
      if (!Number.isFinite(price) || price <= 0 ||
          !Number.isFinite(epoch) || epoch <= 0) return;

      const bucket = Math.floor(epoch / frame) * frame;
      lastValidTickAt = Date.now();
      setConnected(true);
      setStatus("Live public ticks received");
      setLastPrice(price);
      setTicksReceived(v => v + 1);
      setSessionTicks(previous => [...previous, { epoch, price }].slice(-MAX_SESSION_TICKS));
      setBars(previous => {
        if (!previous.length || bucket > previous[previous.length - 1].bucket) {
          return [...previous, { bucket, open: price, high: price, low: price, close: price }].slice(-LIMIT);
        }
        if (bucket < previous[previous.length - 1].bucket) return previous;
        const last = previous[previous.length - 1];
        return [...previous.slice(0, -1), {
          ...last,
          high: Math.max(last.high, price),
          low: Math.min(last.low, price),
          close: price,
        }];
      });
    };
    ws.onerror = () => {
      if (active) {
        setConnected(false);
        setStatus("Public market connection error. Use Retry connection.");
      }
    };
    ws.onclose = () => {
      if (!active) return;
      setConnected(false);
      setStatus(previous => previous.includes("error") || previous.includes("timed out")
        ? previous : "Market feed disconnected. Use Retry connection.");
    };

    return () => {
      active = false;
      window.clearTimeout(connectionTimeout);
      window.clearInterval(freshnessTimer);
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close();
    };
  }, [symbol, frame, retry]);

  const render = useMemo(() => {
    if (!bars.length) return null;
    let low = Math.min(...bars.map(bar => bar.low));
    let high = Math.max(...bars.map(bar => bar.high));
    const pad = Math.max((high - low) * .15, Math.abs(high) * .000015, .0001);
    low -= pad;
    high += pad;
    const priceToY = (v: number) => Y_TOP + (high - v) * PLOT_HEIGHT / (high - low);
    const gap = Math.min(22, PLOT_WIDTH / Math.max(1, bars.length));
    return { low, high, priceToY, gap };
  }, [bars]);


  const session = useMemo(() => summarizeTickSession(sessionTicks), [sessionTicks]);
  const priceTrace = useMemo(() => {
    if (!session || session.trend.length < 2) return null;
    const width = 560;
    const height = 126;
    const min = session.low;
    const spread = session.high - min || Math.max(Math.abs(min) * 0.00001, 0.0001);
    const y = (price: number) => 150 - 14 - (price - min) / spread * height;
    const x = (index: number) => 34 + index * width / (session.trend.length - 1);
    const points = session.trend.map((tick, index) =>
      String(x(index)) + "," + String(y(tick.price))
    ).join(" ");
    const averagePoints = session.trend
      .map((tick, index) => tick.average10 === null ? null :
        String(x(index)) + "," + String(y(tick.average10)))
      .filter((point): point is string => point !== null)
      .join(" ");
    return { points, averagePoints };
  }, [session]);
  const maxActivity = Math.max(1, ...(session?.activity.map(item => item.count) || []));

  const RootElement = embedded ? "div" : "main";
  return (
    <RootElement className={embedded ? "senfxEmbeddedChart" : "appShell"}>
      {!embedded && <header className="dashNav">
        <Link className="brand" href="/">TRADE SCHEME <span>FX</span></Link>
        <div style={{ display: "flex", gap: 12 }}>
          <Link className="button secondary small" href="/intelligence">Market intelligence</Link>
          <Link className="button secondary small" href="/dashboard">Dashboard</Link>
        </div>
      </header>}
      <section className={embedded ? "senfxEmbeddedChartContent" : "dashContent"} style={{ maxWidth: 1200 }}>
        {embedded ? (
          <div className="senfxEmbeddedChartHeading">
            <div>
              <p className="eyebrow">PUBLIC DERIV TICKS · CHART RESEARCH</p>
              <h3>Live candlestick workspace</h3>
              <p>Real candles are built from ticks received in this session. Historical bars are not fabricated.</p>
            </div>
            <Link href="/charts">Full chart ↗</Link>
          </div>
        ) : (
          <>
            <p className="eyebrow">SENFX WORKSPACE · PUBLIC MARKET DATA</p>
            <h1>Live <span style={{ color: "#3dd5d6" }}>candlestick</span> charts</h1>
            <p className="muted">Real-time OHLC candles are calculated from verified public Deriv ticks received in this browser session. No imaginary historical candles, trading signals, or orders.</p>
          </>
        )}
        <div className="panel" style={{ marginTop: 25 }}>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 20, alignItems: "end" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
              <label className="fieldLabel">Market
                <select className="fieldInput" value={symbol} onChange={e => setSymbol(e.target.value)} style={{ minWidth: 195, display: "block" }}>
                  {MARKETS.map(m => <option key={m.symbol} value={m.symbol}>{m.label}</option>)}
                </select>
              </label>
              <label className="fieldLabel">Candle interval
                <select className="fieldInput" value={frame} onChange={e => setFrame(Number(e.target.value))} style={{ display: "block" }}>
                  <option value={15}>15 seconds</option>
                  <option value={60}>1 minute</option>
                  <option value={300}>5 minutes</option>
                </select>
              </label>
              <button className="button secondary small" style={{ alignSelf: "end" }} onClick={() => setRetry(x => x + 1)}>Retry connection</button>
            </div>
            <div style={{ textAlign: "right" }}>
              <small style={{ color: connected ? "#43e0b2" : "#f6c375", display: "block" }}>{connected ? "● LIVE PUBLIC TICKS" : "○ FEED OFFLINE"}</small>
              <strong style={{ color: "#f5ffff", fontSize: 26 }}>{lastPrice === null ? "—" : format(lastPrice)}</strong>
              {lastPrice !== null && !connected && <small className="muted" style={{ display: "block" }}>Last observed · not live</small>}
            </div>
          </div>
          <p role="status" className="muted" style={{ marginTop: 14, fontSize: 12 }}>{status}</p>
          <div role="img" aria-label={"Candlestick chart for " + symbol + ", built from actual ticks received since connecting"}
            style={{ overflow: "hidden", borderRadius: 12, marginTop: 14, background: "linear-gradient(125deg,#06152c,#050b21)", border: "1px solid #1d426b" }}>
            <svg viewBox="0 0 1000 370" style={{ display: "block", width: "100%", minHeight: 230 }} preserveAspectRatio="xMidYMid meet">
              {[0, 1, 2, 3, 4].map(i => (
                <g key={i}>
                  <line x1={AXIS_WIDTH} x2={AXIS_WIDTH + PLOT_WIDTH} y1={Y_TOP + i * PLOT_HEIGHT / 4} y2={Y_TOP + i * PLOT_HEIGHT / 4}
                    stroke="#274563" strokeWidth={.8} strokeDasharray="4 6" />
                  {render && <text x="4" y={Y_TOP + i * PLOT_HEIGHT / 4 - 5} fill="#8ba8c6" fontSize="11">{format(render.high - (render.high - render.low) * i / 4)}</text>}
                </g>
              ))}
              {render && bars.map((bar, i) => {
                const x = AXIS_WIDTH + PLOT_WIDTH - render.gap * (bars.length - i) + render.gap / 2;
                const rise = bar.close >= bar.open;
                const color = rise ? "#1dd69b" : "#f04d84";
                const openY = render.priceToY(bar.open);
                const closeY = render.priceToY(bar.close);
                return <g key={bar.bucket}>
                  <line x1={x} x2={x} y1={render.priceToY(bar.high)} y2={render.priceToY(bar.low)} stroke={color} strokeWidth="1.5" />
                  <rect x={x - Math.max(2.5, render.gap * .28)} y={Math.min(openY, closeY)}
                    width={Math.max(5, render.gap * .56)} height={Math.max(1.8, Math.abs(closeY - openY))}
                    fill={color} rx="1"/>
                  {(i === bars.length - 1 || i % Math.max(1, Math.floor(130 / render.gap)) === 0) &&
                    <text x={x - 19} y="352" fill="#789bbb" fontSize="10">
                      {new Date(bar.bucket * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: frame < 60 ? "2-digit" : undefined })}
                    </text>}
                </g>;
              })}
              {render && lastPrice !== null && <line x1={AXIS_WIDTH} x2="960" y1={render.priceToY(lastPrice)} y2={render.priceToY(lastPrice)} stroke="#31d8dd" strokeDasharray="5 4" opacity=".45" />}
            </svg>
            {!bars.length && <p className="muted" style={{ textAlign: "center", margin: "0 10px 22px" }}>Awaiting the first real tick. No historical prices are fabricated.</p>}
          </div>
          <div style={{ display: "flex", gap: 15, flexWrap: "wrap", marginTop: 15, color: "#bad0e7", fontSize: 12 }}>
            <span>Real candles: <strong>{bars.length}</strong></span>
            <span>Ticks observed: <strong>{ticksReceived}</strong></span>
            <span>Source: <strong>Deriv public data WebSocket</strong></span>
          </div>
        </div>

        <section aria-label="Public tick session analytics"
          style={{ marginTop: 18, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,320px),1fr))", gap: 16 }}>
          <article className="panel" style={{ minWidth: 0 }}>
            <p className="eyebrow">ACTUAL OBSERVED TICKS · SESSION ONLY</p>
            <h3 style={{ marginTop: 8 }}>Price trend & moving average</h3>
            <p className="muted">Latest {session?.samples || 0} observed ticks. Horizontal spacing represents tick order, not elapsed time.</p>
            <div style={{ overflow: "hidden", borderRadius: 10, background: "#06152c", marginTop: 12 }}>
              {priceTrace ? (
                <svg viewBox="0 0 640 180" role="img"
                  aria-label="Observed public tick prices, and ten-tick moving average after at least ten ticks"
                  style={{ display: "block", width: "100%", minHeight: 140 }}>
                  {[0, 1, 2, 3].map(index => <line key={index}
                    x1="34" x2="595" y1={20 + index * 42} y2={20 + index * 42}
                    stroke="#274563" strokeDasharray="3 7" />)}
                  <polyline points={priceTrace.points} fill="none" stroke="#25e6d2"
                    strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
                  {session && session.trend.length >= 10 && (
                    <polyline points={priceTrace.averagePoints} fill="none"
                      stroke="#f6c375" strokeWidth="2" strokeLinejoin="round" />
                  )}
                  <text x="34" y="172" fill="#a5bfd8" fontSize="12">
                    Earlier observed ticks
                  </text>
                  <text x="486" y="172" fill="#a5bfd8" fontSize="12">Latest</text>
                </svg>
              ) : (
                <p className="muted" style={{ padding: 22 }}>Waiting for at least two real ticks to draw this graph.</p>
              )}
            </div>
            <p style={{ color: "#bcd1eb", fontSize: 12, marginTop: 10 }}>
              <span style={{ color: "#25e6d2" }}>●</span> Observed price
              {" · "}
              <span style={{ color: "#f6c375" }}>●</span> 10-tick rolling average
            </p>
            <p className="muted" style={{ fontSize: 12 }}>
              {session ? "Observed range: " + format(session.low) + " – " + format(session.high) +
                " · Change: " + session.changePercent.toFixed(3) + "%" :
                "No public market ticks received in this browser session yet."}
            </p>
          </article>
          <article className="panel" style={{ minWidth: 0 }}>
            <p className="eyebrow">PUBLIC TICK ARRIVALS · SESSION ONLY</p>
            <h3 style={{ marginTop: 8 }}>Live market activity</h3>
            <p className="muted">Received tick count in each observed 15-second window, including quiet windows.</p>
            <div style={{ overflow: "hidden", borderRadius: 10, background: "#06152c", marginTop: 12 }}>
              {session ? (
                <svg viewBox="0 0 640 180" role="img" aria-label="Bar graph of observed public ticks per fifteen-second window"
                  style={{ display: "block", width: "100%", minHeight: 140 }}>
                  {[0, 1, 2, 3].map(index => <line key={index} x1="30" x2="603"
                    y1={25 + index * 40} y2={25 + index * 40}
                    stroke="#274563" strokeDasharray="3 7" />)}
                  {session.activity.map((window, index) => {
                    const barWidth = 560 / session.activity.length;
                    const barHeight = window.count / maxActivity * 122;
                    return <rect key={window.epoch}
                      x={35 + index * barWidth + 2}
                      y={149 - barHeight}
                      width={Math.max(2, barWidth - 4)}
                      height={Math.max(0, barHeight)}
                      fill="#52aaff" rx="2" />;
                  })}
                  <text x="35" y="171" fill="#a5bfd8" fontSize="12">Earlier windows</text>
                  <text x="508" y="171" fill="#a5bfd8" fontSize="12">Latest</text>
                </svg>
              ) : (
                <p className="muted" style={{ padding: 22 }}>Waiting for public market ticks. No sample activity is fabricated.</p>
              )}
            </div>
            <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
              Recent graph covers up to sixteen 15-second windows and only ticks actually captured by this tab.
              A bar is not an order, volume, liquidity measure, or prediction.
            </p>
          </article>
        </section>
        <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
          Session analytics reset when the market, candle interval, or connection changes.
          No historical broker data or guaranteed trading signals are shown.
        </p>
        <p className="disclaimer">Research and charting only. This live chart never initiates a Deriv trade and does not display executable contract quotes. Indicators and candles are not forecasts.</p>
      </section>
    </RootElement>
  );
}
